import {battleReadiness,restrictBattleReport} from './battleVisibility';
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createDoctrine, isDoctrine } from '../client/game/doctrine';
import { createSession, isStoredPlan, type Plan, type Session, type Treaty } from '../client/game/sandbox';
import {oceanGeography} from '../client/game/ocean';
import {scenarioWorld} from '../client/game/scenarioWorld';
import { scenarios } from '../client/game/scenarios';
import type { Player, RoomView } from '../client/game/network';
import { nativeSimulation } from './native';
import { validClauses } from '../client/game/diplomacy';

type AuthSession = { hash: string; player: Player; expires: number };
type Seat = { player: string; name: string } | null;
type Room = { reviewReady?:boolean[]|null; code: string; name: string; scenario: string; password: string; host: string; seats: Seat[]; session: Session; started: boolean; revision: number; drafts: number[]; updated: number };
type Data = { version: 1; auth: AuthSession[]; rooms: Room[] };
type Body = Record<string, unknown>;
export class HttpError extends Error { constructor(public status: number, message: string, public code?: string) { super(message); } }
function check(value: unknown, message: string, status = 400): asserts value { if (!value) throw new HttpError(status, message); }
function text(value: unknown, maximum: number): string { check(typeof value === 'string' && value.length <= maximum, 'Invalid text'); return value.trim(); }
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const emptyPlan = (): Plan => ({ strategy: '', doctrine: createDoctrine(), orders: [], submitted: false });
function passwordHash(password: string, salt = randomBytes(16).toString('hex')) { return `${salt}:${scryptSync(password, salt, 32).toString('hex')}`; }
function matches(password: string, stored: string) { return !stored || timingSafeEqual(Buffer.from(passwordHash(password, stored.split(':')[0])), Buffer.from(stored)); }

/** @requires A private writable path. @ensures Serialized atomic transactions persist before exposing a new revision. */
export class RoomStore {
  private data: Data = { version: 1, auth: [], rooms: [] };
  private ready: Promise<void>;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private path: string, private engine = nativeSimulation) {
    this.ready = readFile(path, 'utf8').then(raw => { const data = JSON.parse(raw); check(data.version === 1 && Array.isArray(data.auth) && Array.isArray(data.rooms), 'Unsupported room store'); for(const room of data.rooms as Room[]){if(room.reviewReady)room.reviewReady=battleReadiness(room.session.state,room.reviewReady);if(!room.session.state.ocean&&!room.session.ended){const scenario=scenarios.find(s=>s.id===room.scenario);if(scenario){room.session.state.ocean=structuredClone(oceanGeography(scenarioWorld(scenario)).zones);room.session.state.nations.forEach((n,i)=>{n.navalReserve=room.session.state.ocean!.some(z=>z.ports.some(id=>room.session.state.regions[id].owner===i))?[4,8,4,5,2][i]:0;});room.revision++;room.session.plans.forEach(p=>p.submitted=false);room.drafts=room.drafts.map(n=>n+1);}}}this.data = data; }).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
  }
  private transaction<T>(work: (draft: Data) => T | Promise<T>): Promise<T> {
    const result = this.queue.then(async () => {
      await this.ready;
      const draft = structuredClone(this.data), result = await work(draft);
      await mkdir(dirname(this.path), { recursive: true });
      const temporary = `${this.path}.tmp`;
      await writeFile(temporary, JSON.stringify(draft), { mode: 0o600 }); await rename(temporary, this.path);
      this.data = draft; return result;
    });
    this.queue = result.catch(() => {}); return result;
  }
  private player(data: Data, token: string): Player {
    const session = data.auth.find(s => s.hash === hash(token) && s.expires > Date.now());
    check(session, 'Session expired. Sign in again.', 401); return session.player;
  }
  async me(token: string) { await this.ready; return this.player(this.data, token); }
  async login(player: Player) {
    const token = randomBytes(32).toString('hex');
    return this.transaction(data => {
      data.auth = data.auth.filter(s => s.expires > Date.now()); check(data.auth.length < 1000, 'Server session limit reached', 429);
      data.auth.push({ hash: hash(token), player, expires: Date.now() + (player.kind === 'guest' ? 7 : 1) * 86400000 }); return { token, player };
    });
  }
  async guest(name: unknown) { const display = text(name, 30); check(display.length > 0, 'Choose a player name'); return this.login({ id: randomUUID(), name: display, kind: 'guest' }); }
  async logout(token: string) { return this.transaction(data => { data.auth = data.auth.filter(s => s.hash !== hash(token)); return { ok: true }; }); }
  async list(token: string) {
    await this.ready; const player = this.player(this.data, token);
    return this.data.rooms.filter(r => !r.password || r.seats.some(s => s?.player === player.id)).map(r => this.summary(r));
  }
  private summary(r: Room) { return { code: r.code, name: r.name, scenario: r.scenario, private: !!r.password, count: r.seats.filter(Boolean).length, started: r.started }; }
  private view(r: Room, player: Player): RoomView {
    const nation = r.seats.findIndex(s => s?.player === player.id); check(nation >= 0, 'You are not in this room', 403);
    const session = structuredClone(r.session);
    restrictBattleReport(session.state,nation);session.history.forEach(state=>restrictBattleReport(state,nation));
    session.plans = session.plans.map((p, i) => i === nation ? p : { ...emptyPlan(), submitted: p.submitted });
    // History contains public settled state only; opponents' text and queued orders never leave the server.
    return { ...this.summary(r), reviewReady:r.reviewReady??null, host: r.host === player.id, nation, revision: r.revision, draftRevision: r.drafts[nation], seats: r.seats.map(s => s ? { name: s.name, mine: s.player === player.id } : null), session };
  }
  async get(token: string, code: string, revision?: number) {
    await this.ready; const player = this.player(this.data, token), room = this.data.rooms.find(r => r.code === code);
    check(room, 'Room not found', 404); check(room.seats.some(s => s?.player === player.id), 'You are not in this room', 403);
    return room.revision === revision ? null : this.view(room, player);
  }
  async create(token: string, body: Body) {
    return this.transaction(data => {
      const player = this.player(data, token), scenario = scenarios.find(s => s.id === body.scenario);
      check(scenario, 'Unknown world'); check(data.rooms.length < 100, 'Room limit reached', 429);
      const password = text(body.password ?? '', 64), name = text(body.name, 40); check(name, 'Room name required');
      check(isDoctrine(body.doctrine), 'Invalid doctrine');
      let code: string; do { code = randomBytes(4).toString('hex').toUpperCase(); } while (data.rooms.some(r => r.code === code));
      const room: Room = { code, name, scenario: scenario.id, password: password ? passwordHash(password) : '', host: player.id, seats: [{ player: player.id, name: player.name }, null, null, null, null], session: createSession(scenario, createDoctrine()), started: false, revision: 1, drafts: [0, 0, 0, 0, 0], updated: Date.now() };
      room.session.plans[0].doctrine = body.doctrine; data.rooms.push(room); return this.view(room, player);
    });
  }
  async action(token: string, code: string, action: string, body: Body): Promise<RoomView | { ok: true }> {
    return this.transaction(async data => {
      const player = this.player(data, token), room = data.rooms.find(r => r.code === code);
      check(room, 'Room not found', 404);
      let nation = room.seats.findIndex(s => s?.player === player.id);
      if (action === 'join') {
        if (nation < 0) {
          check(!room.started, 'The match has already started', 409);
          check(matches(text(body.password ?? '', 64), room.password), 'Incorrect room password', 403);
          nation = room.seats.indexOf(null); check(nation >= 0, 'Room is full', 409); check(isDoctrine(body.doctrine), 'Invalid doctrine');
          room.seats[nation] = { player: player.id, name: player.name }; room.session.plans[nation].doctrine = body.doctrine;
        }
      } else {
        check(nation >= 0, 'You are not in this room', 403);
        const host = room.host === player.id;
        if (action === 'leave') {
          check(!room.started, 'A running match keeps your seat. Return later to reconnect.', 409);
          room.seats[nation] = null; room.session.plans[nation] = emptyPlan(); room.drafts[nation]++;
          if (!room.seats.some(Boolean)) data.rooms = data.rooms.filter(r => r !== room);
          else { if (host) room.host = room.seats.find(Boolean)!.player; room.revision++; }
          return { ok: true };
        } else if (action === 'seat') {
          check(!room.started, 'Countries are locked after the match starts', 409);
          const target = body.nation; check(Number.isInteger(target) && Number(target) >= 0 && Number(target) < 5, 'Invalid seat');
          const next = Number(target); check(next === nation || room.seats[next] === null, 'Country already occupied', 409);
          if (next !== nation) {
            room.seats[next] = room.seats[nation]; room.seats[nation] = null;
            room.session.plans[next] = room.session.plans[nation]; room.session.plans[nation] = emptyPlan(); room.drafts[next]++; room.drafts[nation]++; nation = next;
          }
        } else if (action === 'start') {
          check(host, 'Only the host can start', 403); check(!room.started && room.seats.every(Boolean), 'Five players must join before starting', 409); room.started = true;
        } else {
          check(room.started && !room.session.ended, 'Match is not accepting actions', 409);
          check(body.turn === room.session.state.turn, 'The turn changed. Refresh before submitting.', 409);
          const plans = room.session.plans, own = plans[nation];
          if(action==='continue'){
            check(room.session.state.report?.turn===room.session.state.turn-1,'No settled turn to acknowledge',409);
            if(room.reviewReady){room.reviewReady[nation]=true;if(room.reviewReady.every(Boolean))room.reviewReady=null;}
          }else {
          check(!room.reviewReady||action==='end','Waiting for combatants to finish the turn review',409);
          if (action === 'plan' || action === 'confirm') {
            check(body.draftRevision === room.drafts[nation], 'Your draft changed in another tab. Refresh before editing.', 409);
            check(isStoredPlan(body.plan), 'Invalid plan'); const plan = structuredClone(body.plan); plan.submitted = false;
            if (action === 'confirm') {
              const proposed = plans.map((p, i) => i === nation ? { ...plan, submitted: true } : p.submitted ? p : { ...p, orders: [] });
              await this.engine(room.session.state, proposed, 'validate'); plan.submitted = true;
            }
            plans[nation] = plan; room.drafts[nation]++;
          } else if (action === 'treaty') {
            const treaties = room.session.state.treaties;
            if (body.operation === 'propose' || body.operation === 'counter') {
              const input = body.treaty as Treaty;
              check(input && Number.isInteger(input.to) && input.to >= 0 && input.to < 5 && input.to !== nation, 'Invalid partner');
              check(['trade', 'nonaggression', 'ceasefire', 'compact'].includes(input.kind), 'Invalid agreement');
              check(['treasury', 'food', 'energy'].includes(input.give) && ['treasury', 'food', 'energy'].includes(input.receive), 'Invalid trade resources');
              check(input.kind !== 'trade' || input.give !== input.receive, 'Trade needs different resources');
              check(Number.isInteger(input.amount) && input.amount >= 1 && input.amount <= 100 && Number.isInteger(input.duration) && input.duration >= 1 && input.duration <= 5, 'Invalid agreement terms');
              check(treaties.length < 100, 'Treaty limit reached');
              check(input.kind !== 'compact' || validClauses(input.clauses, nation, input.to, input.duration), 'Invalid executable clauses');
              check(input.text === undefined || (typeof input.text === 'string' && input.text.length <= 4000), 'Treaty text too long');
              let supersedes: number | undefined;
              if (body.operation === 'counter') {
                const previous = treaties.find(t => t.id === body.id);
                check(previous && previous.status === 'pending', 'Proposal is no longer pending', 409);
                check(previous.to === nation && previous.from === input.to, 'Only the recipient can counter this proposal', 403);
                previous.status = 'superseded'; previous.closedBy = nation; previous.closedTurn = room.session.state.turn; previous.remaining = 0; supersedes = previous.id;
              }
              treaties.push({ id: Math.max(0, ...treaties.map(t => t.id)) + 1, from: nation, to: input.to, kind: input.kind, give: input.give, receive: input.receive, amount: input.amount, duration: input.duration, remaining: 0, signatures: [nation], status: 'pending', ...(input.kind === 'compact' ? { clauses: structuredClone(input.clauses), text: input.text ?? '' } : {}), ...(supersedes === undefined ? {} : { supersedes }) });
              plans[input.to].submitted = false; room.drafts[input.to]++;
            } else {
              const treaty = treaties.find(t => t.id === body.id); check(treaty && treaty.status === (body.operation === 'break' ? 'active' : 'pending'), 'Proposal is no longer pending or agreement is not active', 409);
              check(treaty.from === nation || treaty.to === nation, 'Only treaty parties may respond', 403);
              if (body.operation === 'break') {
                treaty.status = 'broken'; treaty.closedBy = nation; treaty.closedTurn = room.session.state.turn; treaty.remaining = 0;
                room.session.state.nations[nation].trust = Math.max(0, room.session.state.nations[nation].trust - 15);
              } else if (body.operation === 'accept') { if (!treaty.signatures.includes(nation)) treaty.signatures.push(nation); }
              else {
                check(body.operation === 'reject', 'Unknown treaty action');
                treaty.status = nation === treaty.from ? 'withdrawn' : 'rejected';
                treaty.closedBy = nation; treaty.closedTurn = room.session.state.turn; treaty.remaining = 0;
              }
              for (const party of [treaty.from, treaty.to]) { plans[party].submitted = false; room.drafts[party]++; }
            }
            own.submitted = false; room.drafts[nation]++;
          } else if (action === 'resolve') {
            check(host, 'Only the host can resolve the turn', 403); check(plans.every(p => p.submitted), 'Waiting for all five confirmations', 409);
            const next = await this.engine(room.session.state, plans, 'resolve');
            room.reviewReady=battleReadiness(next);
            room.session.history = [...room.session.history, room.session.state].slice(-100); room.session.state = next;
            room.session.plans = plans.map(p => ({ ...p, orders: [], strategy: '', submitted: false })); room.drafts = room.drafts.map(v => v + 1);
          } else if (action === 'end') {
            check(host, 'Only the host can end the match', 403); check(room.session.state.turn > 1 && plans.every(p => !p.submitted && p.orders.length === 0), 'Finish a settled turn before ending', 409); room.session.ended = true;
          } else throw new HttpError(404, 'Unknown room action');
          }
        }
      }
      room.revision++; room.updated = Date.now(); return this.view(room, player);
    });
  }
}
