import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer as httpServer, type Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import { sandboxBridge } from '../../src/server/bridge';

async function listen(server: Server) {
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}
const close = (server: Server) => new Promise<void>(done => { server.closeAllConnections(); server.close(() => done()); });

test('HTTP auth uses Supabase OTP verification, rejects bad codes and protects API boundaries', async t => {
  const requests: { path: string; body: Record<string, string> }[] = [];
  const provider = httpServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw || '{}'); requests.push({ path: req.url!, body });
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/auth/v1/otp') { res.end('{}'); return; }
    if (body.token !== '123456') { res.statusCode = 403; res.end(JSON.stringify({ msg: 'Expired', error_code: 'otp_expired' })); return; }
    res.end(JSON.stringify({ access_token: 'mock-provider-token', refresh_token: 'mock-refresh', token_type: 'bearer', expires_in: 3600, user: { id: 'verified-account', email: body.email, email_confirmed_at: new Date().toISOString(), aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } }));
  });
  const url = await listen(provider), dir = await mkdtemp(join(tmpdir(), 'sovereign-http-'));
  const vite = await createServer({ configFile: false, logLevel: 'silent', server: { middlewareMode: true }, plugins: [sandboxBridge({ supabaseUrl: url, publishableKey: 'test-public-key', dataPath: join(dir, 'rooms.json') })] });
  const server = httpServer(vite.middlewares), base = await listen(server);
  t.after(async () => { await close(server); await vite.close(); await close(provider); await rm(dir, { recursive: true, force: true }); });
  const post = (path: string, body: unknown, headers = {}) => fetch(base + '/api' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  assert.equal((await fetch(base + '/api/me')).status, 401);
  assert.equal((await post('/auth/guest', { name: 'Guest' }, { Origin: 'https://evil.test' })).status, 403);
  assert.equal((await post('/auth/guest', { name: 'x'.repeat(100001) })).status, 413);
  assert.equal((await post('/auth/email', { email: 'bad' })).status, 400);
  assert.equal((await post('/auth/email', { email: 'User@example.test' })).status, 200);
  assert.equal(requests[0].path, '/auth/v1/otp'); assert.equal(requests[0].body.email, 'user@example.test');
  assert.equal((await post('/auth/email', { email: 'user@example.test' })).status, 429);
  assert.equal((await post('/auth/verify', { email: 'user@example.test', code: '999999' })).status, 401);
  const result = await post('/auth/verify', { email: 'user@example.test', code: '123456', name: 'Email player' });
  assert.equal(result.status, 200);
  const login = await result.json(); assert.equal(login.player.id, 'verified-account'); assert.equal(login.player.kind, 'email');
  assert.notEqual(login.token, 'mock-provider-token'); assert.equal(login.access_token, undefined);
  const me = await fetch(base + '/api/me', { headers: { Authorization: `Bearer ${login.token}` } });
  assert.equal((await me.json()).email, 'user@example.test');
  assert.equal((await post('/sandbox', {})).status, 404, 'untrusted client world-state endpoint removed');
});
