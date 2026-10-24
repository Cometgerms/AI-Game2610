import {forecastPlan} from './forecast';
import { createClient } from '@supabase/supabase-js';
import { resolve } from 'node:path';
import { networkInterfaces } from 'node:os';
import type { IncomingMessage } from 'node:http';
import type { Plugin } from 'vite';
import { HttpError, RoomStore } from './rooms';
import { Interpreter, type AIConfig } from './ai';
import { randomUUID } from 'node:crypto';
import {PracticeStore} from './practice';

type Config = { supabaseUrl?: string; publishableKey?: string; dataPath?: string; ai?: Omit<AIConfig, 'logPath'> };
const rates = new Map<string, { count: number; until: number }>();
function throttle(key: string, limit: number, duration: number) {
  const now = Date.now();
  for (const [k, value] of rates) if (value.until < now) rates.delete(k);
  const value = rates.get(key) ?? { count: 0, until: now + duration };
  if (++value.count > limit || rates.size > 10000) throw new HttpError(429, 'Too many requests. Please wait and retry.');
  rates.set(key, value);
}
async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > 100000) throw new HttpError(413, 'Request too large'); chunks.push(chunk); }
  try { const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error(); return body; }
  catch { throw new HttpError(400, 'Invalid JSON body'); }
}
/** @requires A single local/LAN server process and a private storage path. @ensures Clients submit intents, never authoritative world state or another seat's signature. */
export function sandboxBridge(config: Config = {}): Plugin {
  const store = new RoomStore(config.dataPath || resolve('.data/rooms.json'));
  const practice = new PracticeStore();
  const interpreter = new Interpreter({ ...config.ai, logPath: (config.dataPath || resolve('.data/rooms.json')) + '.ai.jsonl' });
  const emailEnabled = !!(config.supabaseUrl && config.publishableKey);
  const auth = () => {
    if (!emailEnabled) throw new HttpError(503, 'Email login needs SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in .env. Guest play is ready.');
    return createClient(config.supabaseUrl!, config.publishableKey!, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(12000) }) } });
  };
  return { name: 'sovereign-rooms', configureServer(server) {
    server.middlewares.use('/api', (request, response) => {
      response.setHeader('X-Request-Id',randomUUID());
      response.setHeader('Content-Type', 'application/json'); response.setHeader('Cache-Control', 'no-store');
      const send = (status: number, result: unknown) => { if (!response.writableEnded) { response.statusCode = status; response.end(JSON.stringify(result)); } };
      void (async () => {
        try {
          if (request.headers.origin && new URL(request.headers.origin).host !== request.headers.host) throw new HttpError(403, 'Same-origin requests only');
          if (request.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'Cross-site requests refused');
          const url = new URL(request.url ?? '/', 'http://local'), path = url.pathname;
          const token = request.headers.authorization?.replace(/^Bearer /, '') ?? '';
          const ip = request.socket.remoteAddress ?? 'unknown';
          if (request.method === 'GET') {
            if (path === '/config') return send(200, { emailEnabled, aiEnabled: interpreter.enabled, lan: Object.values(networkInterfaces()).flatMap(values => values ?? []).filter(n => n.family === 'IPv4' && !n.internal).map(n => `http://${n.address}:5173`) });
            if (path === '/me') return send(200, await store.me(token));
            if (path === '/rooms') return send(200, await store.list(token));
            const match = /^\/rooms\/([A-F0-9]{8})$/.exec(path);
            if (match) return send(200, await store.get(token, match[1], url.searchParams.has('revision') ? Number(url.searchParams.get('revision')) : undefined));
            throw new HttpError(404, 'Unknown endpoint');
          }
          if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed');
          throttle(`write:${ip}`, 240, 60000);
          const body = await readBody(request);
          if(path==='/practice/start'||path==='/practice/advance'||path==='/practice/interpret'||path==='/practice/forecast') {
            const player=await store.me(token);throttle(`practice:${player.id}`,30,60000);
            if(path.endsWith('/forecast'))return send(200,await practice.forecast(player.id,body.stage,body.plan));
            if(path.endsWith('/interpret')){throttle(`ai:${ip}`,8,60000);return send(200,await practice.interpret(player.id,body.stage,body.text,body.selected,body.target,body.plan,body.language==='zh'?'zh':'en',interpreter));}
            return send(200,path.endsWith('/start')?practice.start(player.id):await practice.advance(player.id,body.stage,body.plan));
          }
          if (path === '/auth/guest') { throttle(`guest:${ip}`, 30, 60000); return send(200, await store.guest(body.name)); }
          if (path === '/auth/logout') return send(200, await store.logout(token));
          if (path === '/auth/email' || path === '/auth/verify') {
            const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
            if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address');
            if (path === '/auth/email') {
              throttle(`email:${email}`, 1, 60000); throttle(`mail-ip:${ip}`, 5, 3600000);
              const { error } = await auth().auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
              if (error) throw new HttpError(400, 'Email could not be sent. Check the project email/SMTP configuration or retry later.');
              return send(200, { ok: true });
            }
            throttle(`verify:${ip}:${email}`, 10, 60000);
            if (typeof body.code !== 'string' || !/^\d{6,10}$/.test(body.code)) throw new HttpError(400, 'Enter the code from your email');
            const { data, error } = await auth().auth.verifyOtp({ email, token: body.code, type: 'email' });
            if (error || !data.user?.email_confirmed_at || !data.session) throw new HttpError(401, 'Code is invalid or expired');
            const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 30) : 'Commander';
            return send(200, await store.login({ id: data.user.id, name, kind: 'email', email: data.user.email }));
          }
          if (path === '/rooms') return send(200, await store.create(token, body));
          const forecast = /^\/rooms\/([A-F0-9]{8})\/forecast$/.exec(path);
          if(forecast){
            const room=await store.get(token,forecast[1]);
            if(!room||!room.started||room.session.ended||room.reviewReady||body.turn!==room.session.state.turn)throw new HttpError(409,'The turn changed or is not open for planning.');
            throttle(`forecast:${ip}`,20,60000);
            const result=await forecastPlan(room.session.state,room.nation,body.plan);
            const latest=await store.get(token,forecast[1]);
            if(!latest||latest.session.state.turn!==room.session.state.turn||JSON.stringify(latest.session.state)!==JSON.stringify(room.session.state))throw new HttpError(409,'The world changed. Preview again.');
            return send(200,result);
          }
          const interpretation = /^\/rooms\/([A-F0-9]{8})\/interpret$/.exec(path);
          if (interpretation) {
            const room = await store.get(token, interpretation[1]);
            if (!room || !room.started || room.session.ended || room.reviewReady || body.turn !== room.session.state.turn) throw new HttpError(409, 'The turn changed or match is not active.');
            throttle(`ai:${ip}`, 8, 60000);
            if (body.mode !== 'orders' && body.mode !== 'treaty') throw new HttpError(400, 'Invalid interpretation mode');
            const result=await interpreter.interpret(room, body.text as string, body.mode, Number(body.partner), Number(body.duration) || 3, body.language === 'zh' ? 'zh' : 'en');
            const forecast=body.mode==='orders'&&!result.unsupported.length?await forecastPlan(room.session.state,room.nation,{...room.session.plans[room.nation],orders:result.orders}):undefined;
            return send(200,{...result,forecast});
          }
          const match = /^\/rooms\/([A-F0-9]{8})\/(join|leave|seat|start|plan|confirm|treaty|resolve|continue|end)$/.exec(path);
          if (match) return send(200, await store.action(token, match[1], match[2], body));
          throw new HttpError(404, 'Unknown endpoint');
        } catch (error) {
          send(error instanceof HttpError ? error.status : 422, { error: error instanceof Error ? error.message : 'Request failed', ...(error instanceof HttpError && error.code ? {code:error.code} : {}) });
        }
      })();
    });
  } };
}
