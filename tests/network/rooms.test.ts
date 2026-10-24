import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RoomStore } from '../../src/server/rooms';
import { createDoctrine } from '../../src/client/game/doctrine';
import { scenarios } from '../../src/client/game/scenarios';
import type { RoomView } from '../../src/client/game/network';

async function fixture(t: TestContext, password = '', engine?: ConstructorParameters<typeof RoomStore>[1]) {
  const dir = await mkdtemp(join(tmpdir(), 'sovereign-rooms-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'rooms.json'), store = new RoomStore(path, engine);
  const players = await Promise.all(Array.from({ length: 6 }, (_, i) => store.guest(`Player ${i}`)));
  const first = await store.create(players[0].token, { name: 'Test room', scenario: scenarios[0].id, password, doctrine: createDoctrine() });
  const get = (i = 0) => store.get(players[i].token, first.code) as Promise<RoomView>;
  const action = (i: number, action: string, body = {}) => store.action(players[i].token, first.code, action, body) as Promise<RoomView>;
  const joinPlayer = (i: number) => action(i, 'join', { password, doctrine: createDoctrine() });
  const start = async () => { for (let i = 1; i < 5; i++) await joinPlayer(i); return action(0, 'start'); };
  const submit = async (i: number, changes = {}, confirm = true) => { const r = await get(i); return action(i, confirm ? 'confirm' : 'plan', { turn: r.session.state.turn, draftRevision: r.draftRevision, plan: { ...r.session.plans[i], ...changes } }); };
  return { store, path, players, first, get, action, joinPlayer, start, submit };
}

test('guest sessions are unique, hashed on disk, persistent and individually revoked', async t => {
  const f = await fixture(t);
  assert.equal(new Set(f.players.map(p => p.player.id)).size, 6);
  const raw = await readFile(f.path, 'utf8');
  assert.ok(f.players.every(p => !raw.includes(p.token)));
  const restored = new RoomStore(f.path);
  assert.deepEqual(await restored.me(f.players[1].token), f.players[1].player);
  await assert.rejects(restored.me('forged'), /Session expired/);
  await restored.logout(f.players[0].token);
  await assert.rejects(restored.me(f.players[0].token), /Session expired/);
  assert.equal((await restored.me(f.players[1].token)).name, 'Player 1');
});

test('private rooms enforce passwords, atomic occupancy and host-only start', async t => {
  const f = await fixture(t, 'secret');
  assert.equal((await f.store.list(f.players[1].token)).length, 0);
  await assert.rejects(f.action(1, 'join', { password: 'bad', doctrine: createDoctrine() }), /Incorrect/);
  await assert.rejects(f.get(1), /not in/);
  await assert.rejects(f.action(0, 'start'), /Five players/);
  const joined = await Promise.allSettled([1, 2, 3, 4, 5].map(f.joinPlayer));
  assert.equal(joined.filter(v => v.status === 'fulfilled').length, 4);
  assert.equal((await f.get()).count, 5);
  await assert.rejects(f.action(1, 'start'), /Only the host/);
  await assert.rejects(f.action(1, 'seat', { nation: 0 }), /occupied/);
  await f.action(0, 'start');
  await assert.rejects(f.action(0, 'seat', { nation: 1 }), /locked/);
});

test('players see only their draft; forged armies and stale revisions are rejected', async t => {
  const f = await fixture(t); await f.start();
  await f.submit(1, { strategy: 'Secret defense', orders: [{ kind: 'invest', field: 'industry', amount: 20 }] }, false);
  const publicView = await f.get();
  assert.equal(publicView.session.plans[1].strategy, ''); assert.deepEqual(publicView.session.plans[1].orders, []);
  assert.equal((await f.get(1)).session.plans[1].strategy, 'Secret defense');
  await assert.rejects(f.action(1, 'confirm', { turn: 1, draftRevision: 0, plan: publicView.session.plans[1] }), /draft changed/);
  const enemy = publicView.session.state.regions.find(r => r.owner !== 1)!;
  await assert.rejects(f.submit(1, { orders: [{ kind: 'hold', from: enemy.id }] }), /own|ownership|source|region/i);
  assert.equal((await f.get(1)).session.plans[1].strategy, 'Secret defense');
});

test('treaty parties and signatures are server-owned, agreement changes withdraw confirmations', async t => {
  const f = await fixture(t); await f.start(); await f.submit(1);
  const r = await f.action(0, 'treaty', { turn: 1, operation: 'propose', treaty: { id: 999, from: 4, to: 1, kind: 'nonaggression', give: 'treasury', receive: 'food', amount: 10, duration: 3, signatures: [0, 1, 4], status: 'active' } });
  const treaty = r.session.state.treaties[0];
  assert.equal(treaty.from, 0); assert.deepEqual(treaty.signatures, [0]); assert.equal(treaty.status, 'pending');
  assert.equal(r.session.plans[1].submitted, false);
  await assert.rejects(f.action(2, 'treaty', { turn: 1, operation: 'accept', id: treaty.id }), /Only treaty parties/);
  const accepted = await f.action(1, 'treaty', { turn: 1, operation: 'accept', id: treaty.id });
  assert.deepEqual(accepted.session.state.treaties[0].signatures, [0, 1]);
});

test('five confirmations resolve once under concurrent requests and survive restart', async t => {
  const f = await fixture(t); await f.start();
  await assert.rejects(f.action(0, 'resolve', { turn: 1 }), /five confirmations/);
  for (let i = 0; i < 5; i++) await f.submit(i);
  await assert.rejects(f.action(1, 'resolve', { turn: 1 }), /Only the host/);
  const results = await Promise.allSettled([f.action(0, 'resolve', { turn: 1 }), f.action(0, 'resolve', { turn: 1 })]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const r = await f.get(); assert.equal(r.session.state.turn, 2); assert.equal(r.session.history.length, 1);
  assert.ok(r.session.plans.every(p => !p.submitted && !p.orders.length));
  const restored = await new RoomStore(f.path).get(f.players[0].token, f.first.code);
  assert.deepEqual(restored, r);
  assert.equal(r.reviewReady,null,'Peaceful turns need no battle-review barrier');
  const final=await f.action(4,'continue',{turn:2});assert.equal(final.reviewReady,null);
  await f.submit(0);
  await assert.rejects(f.action(4,'continue',{turn:1}),/turn changed/);
});

test('failed settlement leaves the persisted room unchanged', async t => {
  const f = await fixture(t, '', async (state, _plans, mode) => { if (mode === 'resolve') throw new Error('Engine unavailable'); return state; });
  await f.start(); for (let i = 0; i < 5; i++) await f.submit(i);
  const before = await readFile(f.path, 'utf8');
  await assert.rejects(f.action(0, 'resolve', { turn: 1 }), /Engine unavailable/);
  assert.equal(await readFile(f.path, 'utf8'), before);
});

test('leaving transfers host; verified account re-login recovers its existing seat', async t => {
  const f = await fixture(t); await f.joinPlayer(1); await f.action(0, 'leave');
  assert.equal((await f.get(1)).host, true);
  const identity = { id: 'verified-user', name: 'Email player', kind: 'email' as const, email: 'player@example.test' };
  const a = await f.store.login(identity);
  const seat = await f.store.action(a.token, f.first.code, 'join', { password: '', doctrine: createDoctrine() }) as RoomView;
  await f.store.logout(a.token); const b = await f.store.login(identity);
  const recovered = await f.store.action(b.token, f.first.code, 'join', {}) as RoomView;
  assert.equal(recovered.nation, seat.nation); assert.equal(recovered.count, seat.count);
});


test('ocean migration preserves drafts/history, withdraws stale confirmations and leaves finished matches untouched', async t => {
  const f=await fixture(t);await f.start();await f.submit(0,{orders:[{kind:'hold',from:0}]});
  const raw=JSON.parse(await readFile(f.path,'utf8')),room=raw.rooms[0],oldRevision=room.revision;
  delete room.session.state.ocean;room.session.state.nations.forEach((n:{navalReserve?:number})=>delete n.navalReserve);
  room.session.history=[structuredClone(room.session.state)];
  const finished=structuredClone(room);finished.code='FINISHED';finished.session.ended=true;raw.rooms.push(finished);
  await writeFile(f.path,JSON.stringify(raw));
  const restored=new RoomStore(f.path),view=await restored.get(f.players[0].token,f.first.code) as RoomView;
  assert.equal(view.session.state.ocean!.length,6);assert.equal(view.revision,oldRevision+1);assert.equal(view.session.plans[0].submitted,false);assert.deepEqual(view.session.plans[0].orders,[{kind:'hold',from:0}]);assert.equal(view.session.history[0].ocean,undefined);
  const end=await restored.get(f.players[0].token,'FINISHED') as RoomView;assert.equal(end.session.state.ocean,undefined);assert.equal(end.revision,oldRevision);
  await restored.guest('Persist migration');const again=await new RoomStore(f.path).get(f.players[0].token,f.first.code) as RoomView;assert.equal(again.revision,view.revision);assert.equal(again.session.state.nations[1].navalReserve,8);
});


test('only each engagement’s combatants receive its report; all combatants gate the next turn',async t=>{
 const f=await fixture(t);const start=await f.start(),state=start.session.state;
 const attack=(a:number,b:number)=>{const from=state.regions.find(r=>r.owner===a&&r.neighbors.some(id=>state.regions[id].owner===b))!;return {kind:'attack',from:from.id,to:from.neighbors.find(id=>state.regions[id].owner===b)!,amount:5};};
 for(let i=0;i<5;i++)await f.submit(i,{orders:i===0?[attack(0,3)]:i===2?[attack(2,4)]:[]});
 await f.action(0,'resolve',{turn:1});
 for(let i=0;i<5;i++){
  const view=await f.get(i);assert.equal(view.session.state.report!.battles.length,i===1?0:1);
  assert.ok(view.session.state.report!.battles.every(b=>b.forces.some(force=>force.nation===i)));
  assert.deepEqual(view.reviewReady,[false,true,false,false,false]);
 }
 await assert.rejects(f.submit(1),/turn review/);
 for(const i of [0,2,3])await f.action(i,'continue',{turn:2});
 assert.deepEqual((await f.get(1)).reviewReady,[true,true,true,true,false]);
 await assert.rejects(f.submit(0),/turn review/);
 const reloaded=new RoomStore(f.path);assert.deepEqual((await reloaded.get(f.players[4].token,f.first.code))!.reviewReady,[true,true,true,true,false]);
 await f.action(4,'continue',{turn:2});assert.equal((await f.get(1)).reviewReady,null);
 for(let i=0;i<5;i++)await f.submit(i,{orders:[]});await f.action(0,'resolve',{turn:2});
 for(let i=0;i<5;i++){
  const view=await f.get(i);assert.equal(view.session.history[1].report!.battles.length,i===1?0:1);
  assert.ok(view.session.history[1].report!.battles.every(b=>b.forces.some(force=>force.nation===i)));
 }
});

test('three-way combat includes all actual participants, not only attacker and defender',async t=>{
 const f=await fixture(t),r=await f.start(),regions=r.session.state.regions;
 const target=regions.find(r=>r.owner===4&&[2,3].every(n=>r.neighbors.some(id=>regions[id].owner===n)))!;
 assert.ok(target);
 for(let i=0;i<5;i++)await f.submit(i,{orders:[2,3].includes(i)?[{kind:'attack',from:target.neighbors.find(id=>regions[id].owner===i),to:target.id,amount:3}]:[]});
 await f.action(0,'resolve',{turn:1});
 assert.deepEqual((await f.get()).reviewReady,[true,true,false,false,false]);
 for(let i=0;i<5;i++)assert.equal((await f.get(i)).session.state.report!.battles.length,i<2?0:1);
});
