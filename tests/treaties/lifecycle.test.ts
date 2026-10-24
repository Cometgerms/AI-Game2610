import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RoomStore } from '../../src/server/rooms';
import { nativeSimulation } from '../../src/server/native';
import { createDoctrine } from '../../src/client/game/doctrine';
import { createSession } from '../../src/client/game/sandbox';
import { scenarios } from '../../src/client/game/scenarios';
import type { RoomView } from '../../src/client/game/network';

test('rejection and withdrawal retain identity, author and turn across settlement and restart', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'sovereign-treaties-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'rooms.json'), store = new RoomStore(path);
  const players = await Promise.all(Array.from({ length: 5 }, (_, i) => store.guest(`Player ${i}`)));
  const first = await store.create(players[0].token, { name: 'Treaties', scenario: scenarios[0].id, password: '', doctrine: createDoctrine() });
  const action = (i: number, name: string, body = {}) => store.action(players[i].token, first.code, name, body) as Promise<RoomView>;
  for (let i = 1; i < 5; i++) await action(i, 'join', { password: '', doctrine: createDoctrine() });
  await action(0, 'start');
  const terms = { to: 1, kind: 'trade', give: 'treasury', receive: 'food', amount: 10, duration: 3 };
  for (const [actor, status] of [[1, 'rejected'], [0, 'withdrawn']] as const) {
    const proposed = await action(0, 'treaty', { turn: 1, operation: 'propose', treaty: terms });
    const id = proposed.session.state.treaties.at(-1)!.id;
    await assert.rejects(action(2, 'treaty', { turn: 1, operation: 'reject', id }), /Only treaty parties/);
    await action(1, 'treaty', { turn: 1, operation: 'accept', id });
    for (let i = 0; i < 2; i++) {
      const r = await store.get(players[i].token, first.code);
      assert.ok(r);
      await action(i, 'confirm', { turn: 1, draftRevision: r.draftRevision, plan: r.session.plans[i] });
    }
    const closed = await action(actor, 'treaty', { turn: 1, operation: 'reject', id });
    const treaty = closed.session.state.treaties.find(x => x.id === id)!;
    assert.equal(treaty.status, status); assert.equal(treaty.closedBy, actor); assert.equal(treaty.closedTurn, 1);
    assert.deepEqual(treaty.signatures, [0, 1]); assert.equal(treaty.remaining, 0);
    assert.equal(closed.session.plans[0].submitted, false); assert.equal(closed.session.plans[1].submitted, false);
    await assert.rejects(action(1, 'treaty', { turn: 1, operation: 'accept', id }), /no longer pending/);
    await assert.rejects(action(actor, 'treaty', { turn: 1, operation: 'reject', id }), /no longer pending/);
  }
  for (let i = 0; i < 5; i++) {
    const r = await store.get(players[i].token, first.code);
    assert.ok(r);
    await action(i, 'confirm', { turn: 1, draftRevision: r.draftRevision, plan: r.session.plans[i] });
  }
  const resolved = await action(0, 'resolve', { turn: 1 });
  assert.deepEqual(resolved.session.state.treaties.map(x => x.status), ['rejected', 'withdrawn']);
  assert.ok(!resolved.session.state.report!.events.some(x => x.code.startsWith('treaty-')));
  const restored = await new RoomStore(path).get(players[1].token, first.code);
  assert.ok(restored);
  assert.deepEqual(restored.session.state.treaties, resolved.session.state.treaties);
});

test('closed signed agreements neither transfer resources nor block attacks', async () => {
  const s = createSession(scenarios[0], createDoctrine());
  s.plans.forEach(p => p.submitted = true);
  const from = s.state.regions.find(r => r.neighbors.some(id => s.state.regions[id].owner !== r.owner))!;
  const to = s.state.regions[from.neighbors.find(id => s.state.regions[id].owner !== from.owner)!];
  s.plans[from.owner].orders = [{ kind: 'attack', from: from.id, to: to.id, amount: 1 }];
  const baseline = await nativeSimulation(s.state, s.plans, 'resolve');
  for (const status of ['rejected', 'withdrawn'] as const) {
    s.state.treaties = ['trade', 'nonaggression'].map((kind, id) => ({ id, from: from.owner, to: to.owner, kind: kind as 'trade' | 'nonaggression', give: 'treasury', receive: 'food', amount: 10, duration: 3, remaining: 0, signatures: [from.owner, to.owner], status, closedBy: status === 'rejected' ? to.owner : from.owner, closedTurn: 1 }));
    const resolved = await nativeSimulation(s.state, s.plans, 'resolve');
    assert.deepEqual({ ...resolved, treaties: [] }, baseline);
    s.state.treaties[0].closedBy = status === 'rejected' ? from.owner : to.owner;
    await assert.rejects(nativeSimulation(s.state, s.plans, 'validate'), /closing party/);
  }
});
