import test from 'node:test';
import assert from 'node:assert/strict';
import { resourceSeries, sparkline } from '../../src/client/game/telemetry';
import { createSession } from '../../src/client/game/sandbox';
import { createDoctrine } from '../../src/client/game/doctrine';
import { scenarios } from '../../src/client/game/scenarios';
import { scenarioWorld } from '../../src/client/game/scenarioWorld';
import { buildSurface } from '../../src/client/game/terrainMesh';

test('history telemetry excludes future state and includes exactly one current snapshot', () => {
  const base = createSession(scenarios[0], createDoctrine()).state;
  const history = Array.from({ length: 12 }, (_, i) => { const state = structuredClone(base); state.turn = i + 1; state.nations[0].resources.food = 100 + i; return state; });
  assert.deepEqual(resourceSeries(history, history[3], 0, 'food').map(x => x.turn), [1, 2, 3, 4]);
  assert.deepEqual(resourceSeries(history, history[11], 0, 'food').map(x => x.turn), [5, 6, 7, 8, 9, 10, 11, 12]);
  assert.equal(resourceSeries([], base, 0, 'food').length, 1);
});
test('sparklines handle zero/flat series without fake movements or non-finite coordinates', () => {
  assert.equal(sparkline([0]), '50,16');
  assert.equal(sparkline([30, 30]), '3,16 97,16');
  assert.equal(sparkline([5, 0, 10]), '3,16 50,28 97,4');
});
test('GPU vertices keep province membership so recoloring follows runtime ownership', () => {
  const world = scenarioWorld(scenarios[0]), surface = buildSurface(world);
  assert.equal(surface.regionIds.length * 3, surface.positions.length);
  assert.equal(surface.pointRegionIds.length * 3, surface.points.length);
  assert.ok(surface.pointRegionIds.every(id => id >= 0 && id < world.regions.length));
  const owners = world.regions.map(r => r.nation);
  assert.equal(new Set(surface.pointRegionIds.map(id => owners[id])).size, 5);
  owners[0] = 4;
  assert.ok(surface.pointRegionIds.filter(id => id === 0).every(id => owners[id] === 4));
});
