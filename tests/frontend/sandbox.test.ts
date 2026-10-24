import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createDoctrine, migrateDoctrine } from '../../src/client/game/doctrine';
import { createSession, isStoredPlan, type Session, type Treaty, type GameState } from '../../src/client/game/sandbox';
import { scenarios } from '../../src/client/game/scenarios';

function fresh() { const s = createSession(scenarios[0], createDoctrine()); s.plans.forEach(p => p.submitted = true); return s; }
function run(s: Session, mode = 'resolve'): { ok: boolean; state: GameState; error?: string } {
  const result = spawnSync(resolve('build', process.platform === 'win32' ? 'sovereign_sandbox.exe' : 'sovereign_sandbox'), { input: JSON.stringify({ state: s.state, plans: s.plans, mode }), encoding: 'utf8', timeout: 10000 });
  if (result.error) throw result.error;
  assert.ok(result.stdout, `Native executable failed: ${result.status} ${result.stderr}`);
  return JSON.parse(result.stdout);
}
function next(s: Session): Session { const result = run(s); assert.equal(result.ok, true, result.error); return { ...s, state: result.state, plans: s.plans.map(p => ({ ...p, orders: [], submitted: true })) }; }
function border(s: Session) {
  for (const r of s.state.regions) for (const id of r.neighbors) if (s.state.regions[id].owner !== r.owner) return [r.id, id];
  throw new Error('No border');
}
function treaty(s: Session, from = 0, to = 2, kind: Treaty['kind'] = 'nonaggression'): Treaty {
  return { id: s.state.treaties.length + 1, from, to, kind, give: 'treasury', receive: 'food', amount: 10, duration: 3, remaining: 0, signatures: [from, to], status: 'pending' };
}

test('all five fixed maps have connected reciprocal links, legal states and conserved armies', () => {
  for (const scenario of scenarios) {
    const s = createSession(scenario, createDoctrine());
    const visited = new Set([0]), queue = [0];
    while (queue.length) { const r = s.state.regions[queue.shift()!]; for (const id of [...r.neighbors, ...r.sea]) if (!visited.has(id)) { visited.add(id); queue.push(id); } }
    assert.equal(visited.size, 25, scenario.id);
    scenario.nations.forEach((n, i) => assert.equal(s.state.regions.filter(r => r.owner === i).reduce((sum, r) => sum + r.army, 0), n.resources.army));
    assert.equal(run(s, 'validate').ok, true);
    s.plans[0].doctrine.en.economy = 'Modified'; assert.notEqual(s.plans[1].doctrine.en.economy, 'Modified');
  }
});
test('native resolver enforces five confirmations and rejects overspend atomically', () => {
  const s = fresh(); s.plans[3].submitted = false; assert.equal(run(s).ok, false);
  s.plans[3].submitted = true;
  s.plans[0].orders = [{ kind: 'invest', field: 'industry', amount: 1000 }];
  const before = JSON.stringify(s.state); assert.match(run(s).error!, /insufficient/); assert.equal(JSON.stringify(s.state), before);
  s.plans[0].orders = [{ kind: 'invest', field: 'industry', amount: -1 }]; assert.equal(run(s).ok, false);
});
test('accounting uses opening industry and preserves development across turns', () => {
  const s = fresh(); s.plans[0].orders = [{ kind: 'invest', field: 'industry', amount: 20 }];
  const a = next(s); const r = a.state.report!.ledger[0];
  assert.equal(a.state.nations[0].resources.industry, 65);
  assert.equal(r.income.treasury, Math.floor((60 / 2 + 9 * 3) * 120 / 150));
  assert.equal(r.spending.treasury, 20);
  assert.equal(r.after.treasury, r.before.treasury - 20 + r.income.treasury - r.upkeep.treasury);
  const b = next(a); assert.equal(b.state.report!.ledger[0].income.treasury, Math.floor((Math.floor(65 / 2) + 27) * 122 / 150));
});
test('technology begins next turn; three levels cap and costs are enforced', () => {
  const s = fresh(); s.state.nations[0].resources.research = 300;
  s.plans[0].orders = [{ kind: 'research', field: 'production' }]; const a = next(s);
  assert.equal(a.state.nations[0].tech.production, 1); assert.equal(a.state.report!.ledger[0].income.food, 72);
  const b = next(a); assert.equal(b.state.report!.ledger[0].income.food, 77);
  b.state.nations[0].tech.production = 3; b.plans[0].orders = s.plans[0].orders; assert.match(run(b).error!, /completed/);
});
test('six edicts expire after three settlements; cancellation stops effects', () => {
  let s = fresh(); s.plans[0].orders = [{ kind: 'edict', field: 'economy' }];
  s = next(s); assert.equal(s.state.nations[0].resources.industry, 66); assert.equal(s.state.nations[0].edicts[0].remaining, 2);
  s = next(s); s = next(s); assert.equal(s.state.nations[0].resources.industry, 78); assert.equal(s.state.nations[0].edicts.length, 0);
  s = next(s); assert.equal(s.state.nations[0].resources.industry, 78);
  const c = fresh(); c.plans[0].orders = [{ kind: 'edict', field: 'society' }]; const d = next(c); d.plans[0].orders = [{ kind: 'cancel', field: 'society' }]; assert.equal(next(d).state.nations[0].edicts.length, 0);
});
test('army orders require owned sources, opening strength and adjacency; recruitment conserves costs', () => {
  const s = fresh(); const r = s.state.regions[0];
  s.plans[0].orders = [{ kind: 'recruit', from: 0, amount: 5 }]; const a = next(s);
  assert.equal(a.state.regions[0].army, r.army + 5); assert.equal(a.state.nations[0].resources.population, 84);
  assert.equal(a.state.report!.ledger[0].spending.treasury, 10);
  s.plans[0].orders.push({ kind: 'hold', from: 0 }); assert.match(run(s).error!, /One army order/);
  s.plans[0].orders = [{ kind: 'hold', from: 24 }]; assert.equal(run(s).ok, false);
  const to = s.state.regions.find(x => x.id !== 0 && !r.neighbors.includes(x.id) && !r.sea.includes(x.id))!.id;
  s.plans[0].orders = [{ kind: 'move', from: 0, to, amount: 1 }]; assert.match(run(s).error!, /border/);
});
test('simultaneous combat is deterministic, applies terrain, records casualties and occupation', () => {
  const s = fresh(), [from, to] = border(s); const attacker = s.state.regions[from].owner, defender = s.state.regions[to].owner;
  s.state.regions[from].army = 60; s.state.regions[to].army = 10; s.state.regions[to].terrain = 'mountain';
  s.plans[attacker].orders = [{ kind: 'attack', from, to, amount: 50 }]; s.plans[defender].orders = [{ kind: 'hold', from: to }];
  const a = run(s); assert.equal(a.ok, true, a.error); assert.deepEqual(a, run(s));
  assert.equal(a.state.regions[to].owner, attacker); assert.equal(a.state.regions[from].army, 10);
  const fight = a.state.report!.battles[0]; assert.equal(fight.forces.find(f => f.nation === defender)!.power, 16.1);
  assert.ok(fight.survivors < 50); assert.equal(a.state.nations[attacker].fatigue, 12);
});
test('signed treaties block attacks in their activation turn; unsigned proposals do not', () => {
  const s = fresh(), [from, to] = border(s), a = s.state.regions[from].owner, b = s.state.regions[to].owner;
  s.state.treaties = [treaty(s, a, b)]; s.plans[a].orders = [{ kind: 'attack', from, to, amount: 1 }];
  assert.match(run(s).error!, /peace treaty/);
  s.state.treaties[0].signatures = [a]; assert.equal(run(s).ok, true);
});
test('trade transfers actual stocks, expires, and duplicate partners cannot farm diplomacy scores', () => {
  let s = fresh(); s.state.treaties = [treaty(s, 0, 2, 'trade')]; s = next(s);
  assert.equal(s.state.treaties[0].remaining, 2); assert.equal(s.state.nations[0].score.diplomacy, 32);
  const duplicate = { ...s.state.treaties[0], id: 2 }; s.state.treaties.push(duplicate); const a = next(s);
  assert.equal(a.state.nations[0].score.diplomacy, 32);
  const b = next(a); assert.equal(b.state.treaties[0].status, 'expired'); const c = next(b); assert.equal(c.state.nations[0].score.diplomacy, 20);
});
test('shortages cause attrition and stability loss; eliminated countries cannot act or score', () => {
  const s = fresh(); s.state.nations[0].resources.food = 0; s.state.nations[0].resources.population = 1000;
  const a = next(s); assert.equal(a.state.nations[0].stability, 58); assert.ok(a.state.nations[0].resources.army < 120);
  const b = fresh(); b.state.regions.forEach(r => { if (r.owner === 4) r.owner = 3; }); const c = next(b); assert.equal(Object.values(c.state.nations[4].score).reduce((sum, v) => sum + v), 0);
  b.plans[4].orders = [{ kind: 'invest', field: 'industry', amount: 20 }]; assert.match(run(b).error!, /Eliminated/);
});
test('old five-module doctrine upgrades without discarding user text', () => {
  const full = createDoctrine(); const legacy = Object.fromEntries(['en', 'zh'].map(lang => [lang, Object.fromEntries(['ideology', 'economy', 'diplomacy', 'military', 'notes'].map(key => [key, `${lang}-${key}`]))]));
  const result = migrateDoctrine(legacy)!; assert.equal(result.en.economy, 'en-economy'); assert.equal(result.zh.technology, full.zh.technology);
});

test('simultaneous swaps use opening ownership and keep total troop count', () => {
  const s = fresh(); const a = s.state.regions[0], b = s.state.regions[a.neighbors.find(id => s.state.regions[id].owner === a.owner)!];
  s.plans[0].orders = [{ kind: 'move', from: a.id, to: b.id, amount: 5 }, { kind: 'retreat', from: b.id, to: a.id, amount: 3 }];
  const result = next(s); assert.equal(result.state.regions[a.id].army, a.army - 2); assert.equal(result.state.regions[b.id].army, b.army + 2); assert.equal(result.state.nations[0].resources.army, 120);
});
test('opposed attacks can exchange undefended regions without inventing a mid-border battle', () => {
  const s = fresh(), [a, b] = border(s), ra = s.state.regions[a], rb = s.state.regions[b];
  s.plans[ra.owner].orders = [{ kind: 'attack', from: a, to: b, amount: ra.army }];
  s.plans[rb.owner].orders = [{ kind: 'attack', from: b, to: a, amount: rb.army }];
  const result = next(s); assert.equal(result.state.regions[a].owner, rb.owner); assert.equal(result.state.regions[b].owner, ra.owner); assert.equal(result.state.report!.battles.length, 0);
});
test('fixed sea crossings apply amphibious penalty and no arbitrary island teleport is allowed', () => {
  const s = fresh(); const a = s.state.regions.find(r => r.sea.length > 0)!, b = s.state.regions[a.sea[0]];
  s.plans[a.owner].orders = [{ kind: 'attack', from: a.id, to: b.id, amount: 5 }];
  const result = next(s), fight = result.state.report!.battles[0];
  assert.equal(fight.forces.find(f => f.nation === a.owner)!.power, 4);
});
test('new government policy affects future revenue; same-turn spending and upkeep remain explicit', () => {
  const s = fresh(); s.plans[0].orders = [{ kind: 'edict', field: 'political' }];
  const a = next(s); assert.equal(a.state.nations[0].stability, 78); assert.equal(a.state.report!.ledger[0].upkeep.treasury, 43);
  const b = next(a); assert.equal(b.state.report!.ledger[0].income.treasury, Math.floor(57 * 128 / 150));
});
test('saved drafts reject malformed orders and native state rejects corrupted reports', () => {
  const s = fresh(); assert.equal(isStoredPlan(s.plans[0]), true);
  assert.equal(isStoredPlan({ ...s.plans[0], orders: [null] }), false);
  assert.equal(isStoredPlan({ ...s.plans[0], orders: [{ kind: 'attack', from: 0, to: 99, amount: 1 }] }), false);
  const a = next(s); a.state.report!.battles = [{ region: 99, winner: 0, forces: [], survivors: 1 }]; assert.equal(run(a, 'validate').ok, false);
});
test('all five maps complete ten turns with finite, bounded and internally consistent results', () => {
  for (const scenario of scenarios) {
    let s = createSession(scenario, createDoctrine()); s.plans.forEach(p => p.submitted = true);
    for (let turn = 0; turn < 10; turn++) {
      s = next(s);
      s.state.nations.forEach((n, i) => {
        assert.ok(Object.values(n.resources).every(v => Number.isInteger(v) && v >= 0 && v <= 1000000));
        assert.equal(n.resources.army, s.state.regions.filter(r => r.owner === i).reduce((sum, r) => sum + r.army, 0));
        assert.ok(Object.values(n.score).every(v => v >= 0 && v <= 100));
      });
    }
    assert.equal(s.state.turn, 11);
  }
});

test('three-country contests are deterministic and signed peace partners cannot collide', () => {
  const s = fresh();
  const target = s.state.regions.find(r => new Set(r.neighbors.map(id => s.state.regions[id].owner).filter(owner => owner !== r.owner)).size >= 2)!;
  assert.ok(target);
  const a = s.state.regions[target.neighbors.find(id => s.state.regions[id].owner !== target.owner)!];
  const b = s.state.regions[target.neighbors.find(id => s.state.regions[id].owner !== target.owner && s.state.regions[id].owner !== a.owner)!];
  s.plans[a.owner].orders = [{ kind: 'attack', from: a.id, to: target.id, amount: 5 }];
  s.plans[b.owner].orders = [{ kind: 'attack', from: b.id, to: target.id, amount: 5 }];
  const result = run(s); assert.equal(result.ok, true, result.error); assert.equal(result.state.report!.battles[0].forces.length, 3); assert.deepEqual(result, run(s));
  s.state.treaties.push(treaty(s, a.owner, b.owner)); assert.match(run(s).error!, /Peace partners/);
});
test('unfunded trade is atomic, does not earn partnership score, and records the failure', () => {
  const s = fresh(); s.state.treaties.push({ ...treaty(s, 0, 2, 'trade'), amount: 100 });
  s.state.nations[0].resources.treasury = 0;
  const baseline = structuredClone(s); baseline.state.treaties = [];
  const a = next(s), b = next(baseline);
  assert.equal(a.state.nations[0].resources.food, b.state.nations[0].resources.food);
  assert.equal(a.state.nations[2].resources.treasury, b.state.nations[2].resources.treasury);
  assert.equal(a.state.nations[0].score.diplomacy, 20);
  assert.ok(a.state.report!.events.some(e => e.code === 'treaty-unfulfilled'));
});
