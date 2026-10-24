import type { GameState } from './sandbox';
import type { Resources } from './scenarios';

/** @requires Ordered historical snapshots. @ensures History views never reveal future samples or invented forecast points. */
export function resourceSeries(history: GameState[], state: GameState, nation: number, key: keyof Resources) {
  return [...history.filter(s => s.turn < state.turn), state].slice(-8).map(s => ({ turn: s.turn, value: s.nations[nation].resources[key] }));
}
export function sparkline(values: number[]) {
  const low = Math.min(...values), span = Math.max(...values) - low;
  return values.map((v, i) => `${values.length === 1 ? 50 : 3 + i * 94 / (values.length - 1)},${span ? 28 - (v - low) * 24 / span : 16}`).join(' ');
}
