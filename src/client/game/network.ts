import type { Plan, Session } from './sandbox';

export type Player = { id: string; name: string; kind: 'guest' | 'email'; email?: string };
export type RoomSummary = { code: string; name: string; scenario: string; private: boolean; count: number; started: boolean };
export type RoomView = RoomSummary & { reviewReady?:boolean[]|null; host: boolean; nation: number; revision: number; draftRevision: number; seats: ({ name: string; mine: boolean } | null)[]; session: Session };
const TOKEN_KEY = 'sovereign.player.v1';
let token = '';
const tabChannel = typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('sovereign-tab-identity') : null;
let claimed = '';
function fingerprint(value: string) {
  let a = 2166136261, b = 5381;
  for (const char of value) { a = Math.imul(a ^ char.charCodeAt(0), 16777619); b = Math.imul(b, 33) ^ char.charCodeAt(0); }
  return `${a}:${b}`;
}
tabChannel?.addEventListener('message', event => {
  if (event.data?.kind === 'probe' && claimed && event.data.fingerprint === claimed) tabChannel.postMessage({ kind: 'occupied', fingerprint: claimed, request: event.data.request });
});

export type Diagnostic = { at:string; operation:string; message:string; status:number; requestId:string };
export class ApiError extends Error { constructor(message: string, public status: number, public requestId='', public code='') { super(message); } }
/** @requires A same-origin server. @ensures Tokens stay out of URLs and cross-tab localStorage. */
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const method=body===undefined?'GET':'POST';let received=false,requestId='';
  try {
    const response = await fetch(`/api${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(path.endsWith('/interpret') ? 65000 : 20000) });
    received=true;requestId=response.headers.get('X-Request-Id')??'';
    const data = await response.json().catch(()=>{throw new ApiError('The server returned an unreadable response. Please retry.',response.status,requestId);});
    if (!response.ok) throw new ApiError(data.error ?? 'Request failed', response.status,requestId,typeof data.code==='string'?data.code:'');
    return data as T;
  } catch(error) {
    const failure=error instanceof ApiError?error:new ApiError(error instanceof Error&&error.name==='TimeoutError'?'Request timed out. Your saved game has not been discarded.':'Cannot reach the game server. Check the host and your connection.',0,requestId);
    if(typeof window!=='undefined' && !(path==='/me'&&failure.status===401) && !(path==='/practice/interpret'&&failure.status===400&&failure.code==='practice-command')) window.dispatchEvent(new CustomEvent<Diagnostic>('strat:error',{detail:{at:new Date().toISOString(),operation:`${method} /api${path.split('?')[0]}`,message:failure.message,status:failure.status,requestId}}));
    throw failure;
  } finally {if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('strat:connection',{detail:{connected:received}}));}
}
export function rememberSession(value: string) { token = value; claimed = value ? fingerprint(value) : ''; if (value) sessionStorage.setItem(TOKEN_KEY, value); else sessionStorage.removeItem(TOKEN_KEY); }
let restoration: Promise<string> | undefined;
/** @requires Tab-scoped storage. @ensures A duplicated tab does not silently inherit a live guest's seat. */
export function restoreSession(): Promise<string> {
  return restoration ??= (async () => {
    const stored = sessionStorage.getItem(TOKEN_KEY) ?? '';
    if (!stored) return '';
    if (tabChannel) {
      const request = Math.random().toString(36).slice(2); let occupied = false;
      const listener = (event: MessageEvent) => { if (event.data?.kind === 'occupied' && event.data.request === request) occupied = true; };
      tabChannel.addEventListener('message', listener);
      tabChannel.postMessage({ kind: 'probe', fingerprint: fingerprint(stored), request });
      await new Promise(done => setTimeout(done, 150)); tabChannel.removeEventListener('message', listener);
      if (occupied) { rememberSession(''); sessionStorage.removeItem('sovereign.room'); return ''; }
    }
    rememberSession(stored); return stored;
  })();
}
export const roomAction = (code: string, action: string, data: unknown = {}) => api<RoomView>(`/rooms/${code}/${action}`, data);
export type DraftPayload = { turn: number; draftRevision: number; plan: Plan };
