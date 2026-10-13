export type Point = { x: number; y: number };
export type Region = { id: number; center: Point; polygon: Point[]; nation: number; landmass: number; elevation: number; terrain: 'mountain' | 'plateau' | 'plain' | 'river' | 'island' };
export type Peak = { center: Point; radius: number; height: number; region: number };
export type RiverPoint = Point & { width: number };
export type TerrainWorld = { seed: number; regions: Region[]; landforms: Point[][]; peaks: Peak[]; rivers: RiverPoint[][] };
export const WIDTH = 1000;
export const HEIGHT = 720;
let cached: TerrainWorld | undefined;

/** @requires Integer seed. @ensures Reproducible geometry without global random state. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}

/** @requires Polygon and distinct sites. @ensures A clipped province stays on its own landmass. */
function clip(polygon: Point[], a: Point, b: Point): Point[] {
  const dx = b.x - a.x, dy = b.y - a.y;
  const offset = (b.x * b.x + b.y * b.y - a.x * a.x - a.y * a.y) / 2;
  const distance = (p: Point) => p.x * dx + p.y * dy - offset;
  const result: Point[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const start = polygon[i], end = polygon[(i + 1) % polygon.length];
    const ds = distance(start), de = distance(end);
    if (ds <= 0) result.push(start);
    if ((ds <= 0) !== (de <= 0)) {
      const ratio = ds / (ds - de);
      result.push({ x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio });
    }
  }
  return result;
}

/** @requires Finite shape parameters. @ensures Bounded, irregular coastlines separated by open water. */
function outline(cx: number, cy: number, rx: number, ry: number, seed: number): Point[] {
  return Array.from({ length: 96 }, (_, i) => {
    const angle = i * Math.PI * 2 / 96;
    const radius = .89 + .065 * Math.sin(3 * angle + seed * .17) + .035 * Math.cos(5 * angle - seed * .09);
    return { x: cx + Math.cos(angle) * rx * radius, y: cy + Math.sin(angle) * ry * radius };
  });
}

/** @requires A simple polygon. @ensures Hit tests and height samples share one land mask. */
export function contains(polygon: Point[], p: Point): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** @requires A simple polygon. @ensures Area reflects land, excluding sea between islands. */
export function polygonArea(polygon: Point[]): number {
  return Math.abs(polygon.reduce((sum, a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    return sum + a.x * b.y - a.y * b.x;
  }, 0)) / 2;
}

/** @requires Nonempty polygon. @ensures Local peaks can be bounded wholly inside one province. */
export function edgeDistance(p: Point, polygon: Point[]): number {
  return Math.min(...polygon.map((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    const fraction = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / Math.max(.0001, dx * dx + dy * dy)));
    return Math.hypot(p.x - a.x - dx * fraction, p.y - a.y - dy * fraction);
  }));
}

/** @requires Finite y. @ensures A meandering valley shared by water and terrain. */
export function riverX(y: number, seed: number): number {
  return 460 + 24 * Math.sin(y / 78 + Math.sin(seed) * .3) + 9 * Math.sin(y / 29);
}

/** @requires Generated world. @ensures Ocean is never assigned a nation. */
export function regionAt(world: TerrainWorld, point: Point): Region | undefined {
  const landmass = world.landforms.findIndex(polygon => contains(polygon, point));
  if (landmass < 0) return undefined;
  let best: Region | undefined;
  let distance = Infinity;
  for (const r of world.regions) {
    if (r.landmass !== landmass) continue;
    const current = (point.x - r.center.x) ** 2 + (point.y - r.center.y) ** 2;
    if (current < distance) { best = r; distance = current; }
  }
  return best;
}

/** @requires Generated geometry. @ensures Plains, broad flat uplands and province-local summits coexist. */
export function sampleHeight(world: TerrainWorld, point: Point, region = regionAt(world, point)): number {
  if (!region) return 0;
  const shore = Math.min(1, edgeDistance(point, world.landforms[region.landmass]) / 30);
  const lowland = 45 + 12 * Math.sin(point.x / 56) * Math.cos(point.y / 63);
  const plateauDistance = Math.hypot((point.x - 275) / 125, (point.y - 330) / 140);
  const ramp = Math.max(0, Math.min(1, (1 - plateauDistance) / .35));
  const plateau = 330 * ramp * ramp * (3 - 2 * ramp);
  let height = lowland + (region.landmass === 0 ? plateau : 35);
  for (const peak of world.peaks) {
    if (peak.region !== region.id) continue;
    const distance = Math.hypot(point.x - peak.center.x, point.y - peak.center.y) / peak.radius;
    if (distance < 1) height += peak.height * (1 - distance * distance) ** 2;
  }
  if (region.landmass === 0 && point.y >= 178) {
    const width = 2 + Math.max(0, point.y - 178) / 85;
    const distance = Math.abs(point.x - riverX(point.y, world.seed));
    const blend = Math.max(0, Math.min(1, (distance - width * .6) / (width * 2.5)));
    const bed = Math.max(1, 40 - (point.y - 178) * .095);
    height = bed + (height - bed) * blend * blend * (3 - 2 * blend);
  }
  return Math.max(0, height * shore);
}

/** @requires Integer seed. @ensures A cached deterministic 28-province mainland plus four island provinces. */
export function generateTerrain(seed: number): TerrainWorld {
  if (cached?.seed === seed) return cached;
  const next = random(seed);
  const landforms = [outline(385, 365, 355, 310, seed), outline(835, 250, 105, 78, seed + 3), outline(845, 435, 90, 65, seed + 8), outline(930, 348, 39, 33, seed + 13)];
  const sites: Point[] = [];
  for (let attempt = 0; sites.length < 28 && attempt < 20000; attempt++) {
    const point = { x: 45 + next() * 675, y: 75 + next() * 575 };
    if (contains(landforms[0], point) && sites.every(p => Math.hypot(p.x - point.x, p.y - point.y) > 61)) sites.push(point);
  }
  if (sites.length !== 28) throw new Error('Could not generate a complete world.');
  const regions: Region[] = sites.map((center, id) => {
    let polygon = landforms[0];
    for (let j = 0; j < sites.length; j++) if (j !== id) polygon = clip(polygon, center, sites[j]);
    const nation = center.y > 450 && center.x < 360 ? 2 : center.x > 400 ? 3 : 0;
    return { id, center, polygon, nation, landmass: 0, elevation: 0, terrain: 'plain' };
  });
  const islandSites = [[{ x: 803, y: 250 }, { x: 867, y: 250 }], [{ x: 845, y: 435 }], [{ x: 930, y: 348 }]];
  for (let i = 0; i < islandSites.length; i++) for (const center of islandSites[i]) {
    let polygon = landforms[i + 1];
    for (const other of islandSites[i]) if (other !== center) polygon = clip(polygon, center, other);
    regions.push({ id: regions.length, center, polygon, nation: 1, landmass: i + 1, elevation: 0, terrain: 'island' });
  }
  for (const nation of [0, 2, 3]) if (!regions.some(r => r.nation === nation)) {
    const candidate = regions.filter(r => r.landmass === 0 && regions.filter(o => o.nation === r.nation).length > 1).sort((a, b) => b.center.y - a.center.y)[0];
    candidate.nation = nation;
  }
  const peakRegions = regions.filter(r => r.landmass === 0 && Math.abs(r.center.x - riverX(r.center.y, seed)) > 75 && edgeDistance(r.center, r.polygon) > 24)
    .sort((a, b) => a.center.y - b.center.y).filter((_, i) => i % 4 === 0).slice(0, 3);
  const peaks = peakRegions.map((r, i) => ({ center: r.center, radius: Math.min(44, edgeDistance(r.center, r.polygon) * .85), height: [660, 460, 560][i], region: r.id }));
  const river: RiverPoint[] = [];
  for (let y = 178; y < 700; y += 3) {
    const p = { x: riverX(y, seed), y, width: 1 + (y - 178) / 68 };
    if (!contains(landforms[0], p)) { if (river.length) break; else continue; }
    river.push(p);
  }
  const world: TerrainWorld = { seed, regions, landforms, peaks, rivers: [river] };
  for (const r of regions) {
    r.elevation = Math.round(sampleHeight(world, r.center, r));
    if (r.landmass > 0) continue;
    r.terrain = peaks.some(p => p.region === r.id) ? 'mountain' : Math.abs(r.center.x - riverX(r.center.y, seed)) < 32 ? 'river' : r.elevation > 230 ? 'plateau' : 'plain';
  }
  cached = world;
  return world;
}

/** @requires Integer seed. @ensures The same region data powers labels, selection and terrain. */
export function generateWorld(seed: number): Region[] { return generateTerrain(seed).regions; }
