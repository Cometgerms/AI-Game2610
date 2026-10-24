import assert from 'node:assert/strict';
import test from 'node:test';
import { scenarios } from '../../src/client/game/scenarios.ts';
import { scenarioWorld } from '../../src/client/game/scenarioWorld.ts';
import { contains, polygonArea, regionAt } from '../../src/client/game/world.ts';
import { buildSurface } from '../../src/client/game/terrainMesh.ts';
import { createDoctrine } from '../../src/client/game/doctrine.ts';
import { doctrineCacheKey, prepareTurn } from '../../src/client/game/planning.ts';

test('five fixed worlds have distinct names, starting states and finite five-nation geometry', () => {
  assert.equal(scenarios.length, 5);
  assert.equal(new Set(scenarios.flatMap(s => s.nations.map(n => n.name.en))).size, 25);
  const shapes = new Set<string>();
  for (const s of scenarios) {
    assert.equal(s.nations.length, 5);
    const w = scenarioWorld(s);
    assert.deepEqual(w, scenarioWorld(s));
    shapes.add(JSON.stringify(w.landforms));
    assert.equal(w.regions.length, 25);
    const landArea = w.landforms.reduce((sum, p) => sum + polygonArea(p), 0);
    const provinceArea = w.regions.reduce((sum, r) => sum + polygonArea(r.polygon), 0);
    assert.ok(Math.abs(landArea - provinceArea) < .01, `${s.id}: ${landArea} vs ${provinceArea}`);
    for (let i = 0; i < 5; i++) {
      assert.ok(w.regions.some(r => r.nation === i));
      assert.ok(Object.values(s.nations[i].resources).every(v => Number.isInteger(v) && v > 0));
    }
    assert.equal(Math.max(...s.nations.map(n => n.resources.army)), s.nations[0].resources.army);
    for (const r of w.regions) {
      assert.ok(contains(r.polygon, r.center), `${s.id}: center ${r.id}`);
      assert.equal(regionAt(w, r.center)?.nation, r.nation);
    }
    for (let y = 10; y < 710; y += 13) for (let x = 10; x < 990; x += 13) {
      const p = { x, y };
      const owners = w.nationShapes!.filter(shape => contains(shape, p));
      assert.ok(owners.length <= 1, `${s.id}: overlap ${x},${y}`);
      assert.equal(owners.length > 0, !!regionAt(w, p), `${s.id}: hole ${x},${y}`);
    }
    const mesh = buildSurface(w, 12);
    assert.ok(mesh.indices.length > 1000);
    assert.ok([...mesh.positions, ...mesh.colors, ...mesh.pointColors].every(Number.isFinite));
  }
  assert.equal(shapes.size, 5);
});

test('sketch has a northern military state, western island, southern industry and smaller research state', () => {
  const w = scenarioWorld(scenarios[0]);
  assert.equal(regionAt(w, { x: 600, y: 200 })?.nation, 0);
  assert.equal(regionAt(w, { x: 100, y: 400 })?.nation, 1);
  assert.equal(regionAt(w, { x: 390, y: 400 })?.nation, 2);
  assert.equal(regionAt(w, { x: 540, y: 600 })?.nation, 3);
  assert.equal(regionAt(w, { x: 500, y: 490 })?.nation, 4);
  const area = (n: number) => w.regions.filter(r => r.nation === n).reduce((sum, r) => sum + polygonArea(r.polygon), 0);
  assert.ok(area(0) > area(4) * 4);
});

test('turn strategy has explicit precedence without mutating doctrine or prior submission snapshots', () => {
  const doctrine = createDoctrine();
  const original = structuredClone(doctrine);
  const key = doctrineCacheKey(doctrine, 'en');
  const turn = prepareTurn(doctrine, 'Attack now to defend the capital.', 'en', scenarios[0].id, scenarios[0].nations[0].id, 1);
  assert.deepEqual(turn.precedence, ['turn-strategy', 'national-doctrine']);
  assert.equal(turn.status, 'awaiting-ai');
  assert.deepEqual(doctrine, original);
  doctrine.en.military = 'Withdraw.';
  assert.notEqual(doctrineCacheKey(doctrine, 'en'), key);
  assert.deepEqual(turn.doctrine, original);
  assert.throws(() => prepareTurn(doctrine, 'x'.repeat(4001), 'en', 'frontier', 'frontier-0', 1));
  assert.throws(() => prepareTurn(doctrine, '', 'en', 'frontier', 'frontier-0', 0));
});
