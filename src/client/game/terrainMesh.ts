import { regionAt, sampleHeight, WIDTH, HEIGHT, type TerrainWorld } from './world';

export const TERRAIN_SCALE = .09;
export const NATION_COLORS = [[.32, .14, .18], [.14, .30, .23], [.14, .26, .36], [.33, .29, .15], [.34, .21, .31]];
const POINT_COLORS = [[.72, .28, .32], [.29, .64, .44], [.27, .57, .78], [.67, .57, .25], [.70, .40, .60]];

/** @requires Generated land and a positive grid step.
 *  @ensures Triangles never bridge separate islands or ocean. */
export function buildSurface(world: TerrainWorld, step = 6) {
  const columns = Math.ceil(WIDTH / step) + 1, rows = Math.ceil(HEIGHT / step) + 1;
  const positions: number[] = [], colors: number[] = [], indices: number[] = [], points: number[] = [], pointColors: number[] = [], lines: number[] = [];
  const landmasses: number[] = [], regionIds: number[] = [], pointRegionIds: number[] = [];
  for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
    const point = { x: col * step, y: row * step };
    const region = regionAt(world, point);
    const height = sampleHeight(world, point, region);
    positions.push(point.x - 500, height * TERRAIN_SCALE, point.y - 360);
    landmasses.push(region?.landmass ?? -1);
    regionIds.push(region?.id ?? -1);
    const color = NATION_COLORS[region?.nation ?? 0];
    const shade = Math.min(.23, height / 2600);
    colors.push(color[0] + shade, color[1] + shade, color[2] + shade);
    if (region) {
      pointRegionIds.push(region.id);
      points.push(point.x - 500, height * TERRAIN_SCALE + .6, point.y - 360);
      const tint = POINT_COLORS[region.nation];
      pointColors.push(tint[0] + shade, tint[1] + shade, tint[2] + shade);
    }
  }
  for (let row = 0; row < rows - 1; row++) for (let col = 0; col < columns - 1; col++) {
    const a = row * columns + col, b = a + 1, c = a + columns, d = c + 1;
    for (const triangle of [[a, c, b], [b, c, d]]) {
      if (landmasses[triangle[0]] >= 0 && triangle.every(i => landmasses[i] === landmasses[triangle[0]])) indices.push(...triangle);
    }
    if (row % 4 === 0 && landmasses[a] >= 0 && landmasses[a] === landmasses[b]) {
      lines.push(positions[a * 3], positions[a * 3 + 1] + .5, positions[a * 3 + 2], positions[b * 3], positions[b * 3 + 1] + .5, positions[b * 3 + 2]);
    }
  }
  return { positions, colors, indices, points, pointColors, lines, landmasses, regionIds, pointRegionIds };
}
