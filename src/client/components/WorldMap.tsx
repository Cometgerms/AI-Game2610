import { useMemo } from 'react';
import { coastline, contains, elevationAt, generateWorld, project, riverX, WIDTH, HEIGHT, type Point } from '../game/world';
import { nations, type Language } from '../game/policy';

type Props = { seed: number; language: Language; selected: number; relief: number; onSelect: (id: number) => void };
const colors = ['#f69497', '#a4b4de', '#ceafdd', '#dfb590'];

/** @requires Ordered world points. @ensures Borders follow relief instead of bridging over peaks. */
function terrainPath(points: Point[], seed: number, relief: number, close = true): string {
  const samples: Point[] = [];
  for (let i = 0; i < points.length - (close ? 0 : 1); i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const steps = Math.max(1, Math.ceil(Math.hypot(a.x - b.x, a.y - b.y) / 7));
    for (let j = 0; j < steps; j++) {
      const p = { x: a.x + (b.x - a.x) * j / steps, y: a.y + (b.y - a.y) * j / steps };
      samples.push(project(p, elevationAt(p, seed), relief));
    }
  }
  if (!close && points.length) samples.push(project(points[points.length - 1], elevationAt(points[points.length - 1], seed), relief));
  return samples.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + (close ? ' Z' : '');
}

/** @requires Valid seed and region. @ensures Point-cloud relief and keyboard-accessible region selection. */
export function WorldMap({ seed, language, selected, relief, onSelect }: Props) {
  const world = useMemo(() => {
    const regions = generateWorld(seed);
    const coast = coastline(seed);
    const dots = [];
    for (let y = 45; y < 690; y += 8) for (let x = 40; x < 965; x += 8) {
      const p = { x, y };
      if (!contains(coast, p)) continue;
      let region = regions[0];
      let distance = Infinity;
      for (const candidate of regions) {
        const d = (candidate.center.x - x) ** 2 + (candidate.center.y - y) ** 2;
        if (d < distance) { region = candidate; distance = d; }
      }
      dots.push({ ...p, elevation: elevationAt(p, seed), region: region.id, nation: region.nation });
    }
    const river = Array.from({ length: 100 }, (_, i) => ({ x: riverX(145 + i * 5, seed), y: 145 + i * 5 })).filter(p => contains(coast, p));
    return { regions, coast, dots, river };
  }, [seed]);
  const surface = useMemo(() => world.regions.map(r => terrainPath(r.polygon, seed, relief)), [world, seed, relief]);
  return <svg className="world-map point-cloud" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="group" aria-label={language === 'en' ? 'Selectable elevation map' : '可选择的高程地图'}>
    <defs>
      <pattern id="ocean-grid" width="32" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".65" fill="#755362" opacity=".3" /></pattern>
      <radialGradient id="sea"><stop stopColor="#351925" /><stop offset="1" stopColor="#100d15" /></radialGradient>
    </defs>
    <rect width={WIDTH} height={HEIGHT} fill="url(#sea)" />
    <rect width={WIDTH} height={HEIGHT} fill="url(#ocean-grid)" pointerEvents="none" />
    <path d={terrainPath(world.coast, seed, 0)} transform="translate(0 22)" fill="#050609" stroke="#63404e" strokeDasharray="3 7" opacity=".7" pointerEvents="none" />
    <path d={terrainPath(world.coast, seed, 0)} fill="#20131b" stroke="#bf697c" strokeOpacity=".65" pointerEvents="none" />
    {world.regions.map(r => <path key={r.id} d={surface[r.id]} className={`region terrain-region territory-${r.nation} ${selected === r.id ? 'selected' : ''}`}
      role="button" tabIndex={0} aria-pressed={selected === r.id}
      aria-label={`${language === 'en' ? 'Sector' : '地区'} ${r.id + 1}, ${nations[r.nation].name[language]}`}
      onClick={() => onSelect(r.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(r.id); } }} />)}
    <g pointerEvents="none" className="terrain-dots">
      {world.dots.map((p, i) => {
        const screen = project(p, p.elevation, relief);
        return <circle key={i} cx={screen.x} cy={screen.y} r={p.region === selected ? 1.4 : 0.9 + p.elevation / 4000} fill={p.region === selected ? '#ffd7c9' : colors[p.nation]} opacity={p.region === selected ? .95 : .4 + p.elevation / 3800} />;
      })}
      <path d={terrainPath(world.river, seed, relief, false)} fill="none" stroke="#8ad5da" strokeWidth="2" opacity=".85" />
      {world.regions.map(r => {
        const p = project(r.center, r.elevation, relief);
        return <g key={r.id} transform={`translate(${p.x},${p.y})`}><circle r="4" fill="#190f18" stroke={colors[r.nation]} /><text x="8" y="-6" className="sector-label">{String(r.id + 1).padStart(2, '0')}</text></g>;
      })}
    </g>
    <text x="35" y="50" className="map-readout">{language === 'en' ? 'ELEVATION SCAN / 2.5D' : '高程扫描 / 2.5D'}</text>
    <text x="35" y="670" className="map-readout">{language === 'en' ? 'RELIEF / HEIGHT SAMPLES IN METERS' : '地形起伏 / 高度采样单位：米'}</text>
  </svg>;
}
