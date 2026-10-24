import { isDoctrine, type Doctrine } from './doctrine';
import type { Resources, Scenario } from './scenarios';
import { scenarioWorld } from './scenarioWorld';
import {oceanGeography,type SeaZone} from './ocean';
import { contains, type TerrainWorld } from './world';

export const tracks = ['production', 'military', 'logistics'] as const;
export const domains = ['political', 'military', 'diplomacy', 'economy', 'society', 'technology'] as const;
export type Track = typeof tracks[number];
export type Domain = typeof domains[number];
export type Stock = 'treasury' | 'food' | 'energy';
export type Order = { kind: 'invest' | 'research' | 'edict' | 'cancel' | 'recruit' | 'move' | 'attack' | 'retreat' | 'hold' | 'build_fleet' | 'patrol' | 'recall' | 'blockade' | 'open_sea'; field?: string; from?: number; to?: number; amount?: number };
export const programs = ['political', 'economy', 'society', 'technology', 'diplomacy'] as const;
export type Program = typeof programs[number];
export type Standing = { mobilization: { mode: 'off' | 'reserve' | 'expansion' | 'emergency'; target: number; budget: number; region: number }; programs: Record<Program, number> };
export const defaultStanding = (army = 0): Standing => ({ mobilization: { mode: 'reserve', target: army, budget: 20, region: -1 }, programs: { political: 0, economy: 0, society: 0, technology: 0, diplomacy: 0 } });
export function isStanding(value: unknown): value is Standing {
  if (!value || typeof value !== 'object') return false;
  const s = value as Standing, m = s.mobilization;
  return !!m && ['off', 'reserve', 'expansion', 'emergency'].includes(m.mode) && Number.isInteger(m.target) && m.target >= 0 && m.target <= 10000
    && Number.isInteger(m.budget) && m.budget >= 0 && m.budget <= 200 && Number.isInteger(m.region) && m.region >= -1 && m.region < 25
    && !!s.programs && programs.every(k => Number.isInteger(s.programs[k]) && s.programs[k] >= 0 && s.programs[k] <= 30);
}
export type Plan = { strategy: string; doctrine: Doctrine; orders: Order[]; submitted: boolean; standing?: Standing };
export type RegionState = { id: number; owner: number; army: number; terrain: string; neighbors: number[]; sea: number[]; capital: number };
export type NationState = { navalReserve?:number; resources: Resources; stability: number; fatigue: number; trust: number; tech: Record<Track, number>; edicts: { kind: Domain; remaining: number }[]; standing?: Standing; score: Record<'military' | 'economy' | 'technology' | 'diplomacy', number> };
export type Clause = { kind: 'transfer' | 'peace' | 'cancel_on_attack'; actor: number; target: number; resource: Stock; amount: number; start: number; every: number };
export type Treaty = { id: number; from: number; to: number; kind: 'trade' | 'nonaggression' | 'ceasefire' | 'compact'; give: Stock; receive: Stock; amount: number; duration: number; remaining: number; signatures: number[]; status: 'pending' | 'active' | 'expired' | 'rejected' | 'withdrawn' | 'superseded' | 'broken' | 'terminated' | 'breached'; closedBy?: number; closedTurn?: number; clauses?: Clause[]; text?: string; supersedes?: number; activatedTurn?: number };
export type Ledger = { nation: number; before: Resources; after: Resources; income: Record<Stock, number>; upkeep: Record<Stock, number>; spending: Record<Stock, number>; shortage: Record<Stock, number> };
export type Battle = { region: number; winner: number; forces: { nation: number; army: number; power: number; factor?:number;supply?:number;defense?:number;military?:number;fatigue?:number;held?:boolean;food?:number;energy?:number;treasury?:number;remaining?:number;losses?:number;retreated?:number;retreatTo?:number }[]; survivors: number;terrain?:string;defender?:number };
export type Report = { turn: number; ledger: Ledger[]; battles: Battle[]; events: { code: string; nation: number; target?: number; amount?: number; treaty?: number; reason?: string }[] };
export type GameState = { version: 1; scenario: string; turn: number; nations: NationState[]; regions: RegionState[]; treaties: Treaty[]; report: Report | null; ocean?:SeaZone[] };
export type Session = { version: 1; state: GameState; plans: Plan[]; history: GameState[]; ended: boolean };

/** @requires Untrusted stored plans. @ensures Incomplete drafts may load, but malformed commands cannot reach rendering. */
export function isStoredPlan(value: unknown): value is Plan {
  if (!value || typeof value !== 'object') return false;
  const p = value as Plan;
  const index = (n: unknown) => Number.isInteger(n) && Number(n) >= 0 && Number(n) < 25;
  return isDoctrine(p.doctrine) && (p.standing === undefined || isStanding(p.standing)) && typeof p.strategy === 'string' && p.strategy.length <= 4000 && typeof p.submitted === 'boolean'
    && Array.isArray(p.orders) && p.orders.length <= 100 && p.orders.every(o => {
      if (!o || typeof o !== 'object') return false;
      if (['edict', 'cancel'].includes(o.kind)) return domains.includes(o.field as Domain);
      if (o.kind === 'research') return tracks.includes(o.field as Track);
      if (o.kind === 'hold') return index(o.from);
      const sea=(n:unknown)=>Number.isInteger(n)&&Number(n)>=0&&Number(n)<6;
      if(o.kind==='open_sea')return sea(o.from);
      if(o.kind==='blockade')return sea(o.from)&&Number.isInteger(o.to)&&o.to!>=0&&o.to!<5;
      if(o.kind==='build_fleet')return Number.isInteger(o.amount)&&o.amount!>=1&&o.amount!<=20;
      if(o.kind==='patrol')return (o.from===-1||sea(o.from))&&sea(o.to)&&Number.isInteger(o.amount)&&o.amount!>=1&&o.amount!<=10000;
      if(o.kind==='recall')return sea(o.from)&&Number.isInteger(o.amount)&&o.amount!>=1&&o.amount!<=10000;
      if (!Number.isInteger(o.amount) || o.amount! < 1 || o.amount! > 10000) return false;
      if (o.kind === 'invest') return ['industry', 'research', 'food', 'energy'].includes(o.field ?? '');
      return index(o.from) && (o.kind === 'recruit' || (['move', 'attack', 'retreat'].includes(o.kind) && index(o.to)));
    });
}

/** @requires A fixed catalog world. @ensures Reciprocal ground links and fixed sea links connect all five countries. */
export function connections(world: TerrainWorld): { neighbors: number[]; sea: number[] }[] {
  const links = world.regions.map(() => ({ neighbors: [] as number[], sea: [] as number[] }));
  const link = (a: number, b: number, sea = false) => {
    const key = sea ? 'sea' : 'neighbors';
    if (!links[a][key].includes(b)) { links[a][key].push(b); links[b][key].push(a); }
  };
  // Probe both sides of shared edges: subdivisions have different vertex counts.
  for (const a of world.regions) for (const b of world.regions) {
    if (a.id >= b.id || a.landmass !== b.landmass) continue;
    const touches = a.polygon.some((p, i) => {
      const q = a.polygon[(i + 1) % a.polygon.length];
      return [0, .25, .5, .75, 1].some(t => {
        const x = p.x + (q.x - p.x) * t, y = p.y + (q.y - p.y) * t;
        return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => contains(b.polygon, { x: x + dx * .8, y: y + dy * .8 }));
      });
    });
    if (touches) link(a.id, b.id);
  }
  const landmasses = [...new Set(world.regions.map(r => r.landmass))];
  // A minimum-distance spanning network gives islands explicit, limited crossings.
  const joined = new Set([landmasses[0]]);
  while (joined.size < landmasses.length) {
    let best: [number, number, number] = [-1, -1, Infinity];
    for (const a of world.regions) for (const b of world.regions) if (joined.has(a.landmass) && !joined.has(b.landmass)) {
      const distance = Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y);
      if (distance < best[2]) best = [a.id, b.id, distance];
    }
    link(best[0], best[1], true); joined.add(world.regions[best[1]].landmass);
  }
  return links;
}

/** @requires A catalog scenario and validated doctrine. @ensures Five independent drafts and conserved opening armies. */
export function createSession(scenario: Scenario, doctrine: Doctrine): Session {
  const world = scenarioWorld(scenario), links = connections(world);
  const regions = world.regions.map(r => {
    const owned = world.regions.filter(p => p.nation === r.nation);
    const total = scenario.nations[r.nation].resources.army;
    return { id: r.id, owner: r.nation, army: Math.floor(total / owned.length) + (owned.findIndex(p => p.id === r.id) < total % owned.length ? 1 : 0), terrain: r.terrain, ...links[r.id], capital: owned[0].id === r.id ? r.nation : -1 };
  });
  return { version: 1, state: { version: 1, scenario: scenario.id, turn: 1, regions, ocean:structuredClone(oceanGeography(world).zones), treaties: [], report: null,
    nations: scenario.nations.map((n,i) => ({ navalReserve:oceanGeography(world).zones.some(z=>z.ports.some(id=>regions[id].owner===i))?[4,8,4,5,2][i]:0, resources: { ...n.resources }, stability: 70, fatigue: 0, trust: n.trust, tech: { production: 0, military: 0, logistics: 0 }, edicts: [], score: { military: 0, economy: 0, technology: 0, diplomacy: 0 } })) },
    plans: scenario.nations.map(() => ({ strategy: '', doctrine: structuredClone(doctrine), orders: [], submitted: false })), history: [], ended: false };
}

