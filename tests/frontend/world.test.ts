import assert from 'node:assert/strict';
import test from 'node:test';
import { contains, generateTerrain, generateWorld, polygonArea, regionAt, sampleHeight } from '../../src/client/game/world.ts';
import { buildSurface } from '../../src/client/game/terrainMesh.ts';

test('worlds are repeatable and coastlines change with seed', () => {
  const first = generateTerrain(2610);
  assert.notDeepEqual(first, generateTerrain(2611));
  assert.deepEqual(first, generateTerrain(2610));
});

test('provinces cover land only, including a separate island nation and all four countries', () => {
  for (const seed of [1, 2610, 2611, 999999, ...Array.from({ length: 50 }, (_, i) => 2612 + i)]) {
    const world = generateTerrain(seed);
    assert.equal(world.regions.length, 32);
    assert.ok(Math.abs(world.regions.reduce((s, r) => s + polygonArea(r.polygon), 0) - world.landforms.reduce((s, p) => s + polygonArea(p), 0)) < 1e-5);
    const areas = [0, 1, 2, 3].map(n => world.regions.filter(r => r.nation === n).reduce((s, r) => s + polygonArea(r.polygon), 0));
    assert.ok(areas.every(a => a > 0));
    assert.ok(Math.max(...areas) / Math.min(...areas) > 1.7);
    assert.ok(world.regions.filter(r => r.nation === 1).every(r => r.landmass > 0));
    for (const r of world.regions) assert.ok(contains(world.landforms[r.landmass], r.center));
    assert.equal(regionAt(world, { x: 0, y: 0 }), undefined);
  }
});

test('every summit footprint is confined to one province', () => {
  for (const seed of [2610, 2611, 2644, 999999]) {
    const world = generateTerrain(seed);
    assert.ok(world.peaks.length > 0);
    for (const peak of world.peaks) for (let angle = 0; angle < Math.PI * 2; angle += .1) {
      const point = { x: peak.center.x + Math.cos(angle) * peak.radius, y: peak.center.y + Math.sin(angle) * peak.radius };
      assert.ok(contains(world.regions[peak.region].polygon, point));
    }
  }
});

test('plains, a flat plateau, narrow peaks and widening rivers coexist', () => {
  const world = generateTerrain(2610);
  assert.ok(generateWorld(2610).some(r => r.terrain === 'plain'));
  assert.ok(world.regions.some(r => r.terrain === 'plateau'));
  assert.ok(world.regions.some(r => r.terrain === 'mountain'));
  assert.ok(sampleHeight(world, { x: 275, y: 330 }) > 300);
  assert.ok(Math.abs(sampleHeight(world, { x: 280, y: 330 }) - sampleHeight(world, { x: 285, y: 330 })) < 10);
  const river = world.rivers[0];
  assert.ok(river.length > 70);
  assert.ok(river[river.length - 1].width > river[0].width * 3);
  assert.ok(river.every(p => regionAt(world, p)?.landmass === 0));
});

test('GPU surface has finite geometry and triangles never bridge ocean or islands', () => {
  const surface = buildSurface(generateTerrain(2610), 12);
  assert.ok(surface.indices.length > 1000);
  assert.ok(surface.positions.every(Number.isFinite));
  for (let i = 0; i < surface.indices.length; i += 3) {
    const masses = surface.indices.slice(i, i + 3).map(index => surface.landmasses[index]);
    assert.ok(masses.every(m => m >= 0 && m === masses[0]));
  }
});
