import assert from 'node:assert/strict';
import test from 'node:test';
import { coastline, contains, elevationAt, generateWorld, polygonArea, project, WIDTH, HEIGHT } from '../../src/client/game/world.ts';

test('world is reproducible and another seed changes geometry', () => {
  assert.deepEqual(generateWorld(2610), generateWorld(2610));
  assert.notDeepEqual(generateWorld(2610), generateWorld(2611));
});

test('irregular regions cover the map without degenerate polygons or out-of-bounds coordinates', () => {
  for (const seed of [1, 2610, 2611, 999999]) {
    const world = generateWorld(seed);
    assert.equal(world.length, 32);
    let total = 0;
    for (const { polygon } of world) {
      assert.ok(polygon.length >= 3);
      let area = 0;
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i], b = polygon[(i + 1) % polygon.length];
        assert.ok(Number.isFinite(a.x) && Number.isFinite(a.y));
        assert.ok(a.x >= -1e-6 && a.x <= WIDTH + 1e-6 && a.y >= -1e-6 && a.y <= HEIGHT + 1e-6);
        area += a.x * b.y - a.y * b.x;
      }
      assert.ok(Math.abs(area) > 1);
      total += Math.abs(area) / 2;
    }
    assert.ok(Math.abs(total - polygonArea(coastline(seed))) < 1e-5);
    assert.ok(total < WIDTH * HEIGHT * 0.65, 'Land must not cover the rectangular viewport.');
  }
});

test('countries have unequal areas and each has territory across representative seeds', () => {
  for (const seed of [1, 2610, 2611, 999999, ...Array.from({ length: 50 }, (_, i) => i + 2612)]) {
    const world = generateWorld(seed);
    const areas = [0, 1, 2, 3].map(nation => world.filter(r => r.nation === nation).reduce((sum, r) => sum + polygonArea(r.polygon), 0));
    assert.ok(areas.every(area => area > 0), `Missing nation at ${seed}.`);
    assert.ok(Math.max(...areas) / Math.min(...areas) > 1.7);
    for (const region of world) assert.ok(contains(coastline(seed), region.center));
  }
});

test('local elevations vary within regions and projection raises peaks without changing world coordinates', () => {
  const seed = 2610;
  const elevations = new Set<number>();
  for (let x = 80; x < 940; x += 12) for (let y = 60; y < 670; y += 12) {
    const point = { x, y };
    if (!contains(coastline(seed), point)) continue;
    const height = elevationAt(point, seed);
    elevations.add(height);
    assert.ok(height >= 0 && height < 3000);
    for (const relief of [0, 1, 1.6]) {
      const screen = project(point, height, relief);
      assert.ok(screen.x >= 0 && screen.x <= WIDTH && screen.y >= 0 && screen.y <= HEIGHT);
    }
    assert.ok(project(point, height, 1).y <= project(point, height, 0).y);
  }
  assert.ok(elevations.size > 300);
  assert.ok(Math.max(...elevations) > 1500);
});
