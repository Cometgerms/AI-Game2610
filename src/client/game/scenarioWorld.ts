import { clip, contains, edgeDistance, sampleHeight, type Point, type Region, type TerrainWorld } from './world';
import type { Scenario } from './scenarios';
const cache = new Map<string, TerrainWorld>();
type Pair = [number, number];
/** @requires An open path with at least two points. @ensures Shared national borders use identical samples. */
function path(points: Pair[]): Point[] {
  let result = points.map(([x, y]) => ({ x, y }));
  for (let pass = 0; pass < 3; pass++) {
    const next = [result[0]];
    for (let i = 0; i < result.length - 1; i++) {
      const a = result[i], b = result[i + 1];
      next.push({ x: .75 * a.x + .25 * b.x, y: .75 * a.y + .25 * b.y }, { x: .25 * a.x + .75 * b.x, y: .25 * a.y + .75 * b.y });
    }
    next.push(result[result.length - 1]); result = next;
  }
  return result;
}
const reverse = (points: Point[]) => [...points].reverse();
/** @requires One of the five catalog scenarios. @ensures Fixed geography follows the sketched five-country topology. */
export function scenarioWorld(scenario: Scenario): TerrainWorld {
  const saved = cache.get(scenario.id); if (saved) return saved;
  const north = path([[230, 300], [205, 225], [205, 145], [310, 157], [430, 120], [510, 70], [590, 90], [735, 164], [875, 158], [960, 216], [952, 256], [910, 300]]);
  const redEast = path([[910, 300], [825, 345], [740, 383], [650, 383], [570, 365]]);
  const redWest = path([[570, 365], [525, 333], [480, 286], [410, 265], [320, 298], [265, 308], [230, 300]]);
  const blueWest = path([[230, 300], [274, 354], [284, 397], [285, 436], [310, 450]]);
  const blueLower = path([[310, 450], [355, 472], [395, 472], [417, 434], [440, 425]]);
  const bluePink = path([[440, 425], [471, 419], [490, 450], [520, 452], [550, 430], [570, 400]]);
  const short = path([[570, 400], [577, 384], [570, 365]]);
  const pink = path([[440, 425], [460, 466], [460, 510], [487, 533], [520, 535], [563, 510], [585, 482], [572, 450], [591, 416], [570, 400]]);
  const south = path([[310, 450], [321, 510], [338, 599], [378, 631], [507, 660], [584, 657], [665, 616], [663, 570], [706, 490], [770, 466], [839, 498], [877, 478], [929, 432], [947, 376], [933, 326], [910, 300]]);
  const island = path([[164, 337], [143, 300], [98, 302], [61, 330], [25, 413], [31, 468], [77, 488], [123, 526], [121, 564], [151, 585], [177, 579], [224, 529], [237, 496], [211, 470], [168, 453], [164, 420], [164, 337]]);
  let shapes = [north.concat(redEast, redWest), island, blueWest.concat(blueLower, bluePink, short, redWest), south.concat(redEast, reverse(short), reverse(pink), reverse(blueLower)), pink.concat(reverse(bluePink))];
  let landforms = [north.concat(reverse(south), reverse(blueWest)), island];
  const transform = (p: Point): Point => {
    switch (scenario.layout) {
      case 2: return { x: 500 + (p.y - 360) * 1.2, y: 360 - (p.x - 500) * .65 };
      case 3: return { x: 1000 - p.x, y: p.y * .88 + 42 };
      case 4: return { x: p.x * .94 + 30, y: 360 + (p.y - 360) * .68 + Math.sin(p.x / 180) * 35 };
      default: return p;
    }
  };
  shapes = shapes.map(polygon => polygon.map(transform)); landforms = landforms.map(polygon => polygon.map(transform));
  if (scenario.layout === 1) {
    const destinations = [{ x: 560, y: 170 }, { x: 120, y: 380 }, { x: 420, y: 385 }, { x: 640, y: 575 }, { x: 800, y: 365 }];
    shapes = shapes.map((polygon, i) => {
      const center = { x: (Math.min(...polygon.map(p => p.x)) + Math.max(...polygon.map(p => p.x))) / 2, y: (Math.min(...polygon.map(p => p.y)) + Math.max(...polygon.map(p => p.y))) / 2 };
      return polygon.map(p => ({ x: destinations[i].x + (p.x - center.x) * .65, y: destinations[i].y + (p.y - center.y) * .65 }));
    }); landforms = shapes;
  }
  const regions: Region[] = [];
  for (let nation = 0; nation < 5; nation++) {
    const polygon = shapes[nation];
    const candidates: Point[] = [];
    for (let y = 45; y < 690; y += 18) for (let x = 18; x < 990; x += 18) if (contains(polygon, { x, y }) && edgeDistance({ x, y }, polygon) > 12) candidates.push({ x, y });
    const sites = [candidates.reduce((best, p) => edgeDistance(p, polygon) > edgeDistance(best, polygon) ? p : best)];
    for (let i = 1; i < [9, 3, 4, 7, 2][nation]; i++) sites.push(candidates.reduce((best, p) => {
      const distance = (a: Point) => Math.min(...sites.map(b => Math.hypot(a.x - b.x, a.y - b.y)));
      return distance(p) > distance(best) ? p : best;
    }));
    for (const center of sites) {
      let province = polygon;
      for (const other of sites) if (other !== center) province = clip(province, center, other);
      regions.push({ id: regions.length, center, polygon: province, nation, landmass: scenario.layout === 1 ? nation : nation === 1 ? 1 : 0, elevation: 0, terrain: nation === 1 ? 'island' : 'plain' });
    }
  }
  const world: TerrainWorld = { seed: 4000 + scenario.layout, regions, landforms, nationShapes: shapes, peaks: [], rivers: [], plateau: transform({ x: 660, y: 250 }) };
  world.peaks = [0, 3, 4].map((nation, i) => {
    const r = regions.filter(r => r.nation === nation).sort((a, b) => edgeDistance(b.center, b.polygon) - edgeDistance(a.center, a.polygon))[0];
    return { center: r.center, radius: Math.min(36, edgeDistance(r.center, r.polygon) * .8), height: [370, 250, 300][i], region: r.id };
  });
  if (scenario.layout !== 1) {
    const river = path([[705, 180], [697, 231], [721, 287], [700, 344], [724, 400], [700, 458], [684, 493]]).map((p, i, all) => ({ ...transform(p), width: .6 + i / all.length * 2.8 })).filter(p => landforms.some(poly => contains(poly, p)));
    world.rivers = [river];
  }
  for (const r of regions) {
    r.elevation = Math.round(sampleHeight(world, r.center, r));
    r.terrain = world.peaks.some(p => p.region === r.id) ? 'mountain' : r.nation === 1 ? 'island' : r.elevation > 190 ? 'plateau' : 'plain';
  }
  cache.set(scenario.id, world); return world;
}
