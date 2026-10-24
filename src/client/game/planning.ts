import { isDoctrine, type Doctrine } from './doctrine';
import type { Language } from './policy';

export const RULES_VERSION = 'draft-0.3';
export type TurnPlan = { turn: number; strategy: string; doctrine: Doctrine; language: Language; scenario: string; nation: string; rulesVersion: string; precedence: ['turn-strategy', 'national-doctrine']; status: 'awaiting-ai' };
/** @requires A known local seat and editable national doctrine. @ensures Submission snapshots are immutable from later editor changes. */
export function prepareTurn(doctrine: Doctrine, strategy: string, language: Language, scenario: string, nation: string, turn: number): TurnPlan {
  if (!isDoctrine(doctrine) || strategy.length > 4000 || !Number.isInteger(turn) || turn < 1) throw new Error('Invalid turn plan');
  return { doctrine: structuredClone(doctrine), strategy: strategy.trim(), language, scenario, nation, turn, rulesVersion: RULES_VERSION, precedence: ['turn-strategy', 'national-doctrine'], status: 'awaiting-ai' };
}
/** @requires Bounded doctrine. @ensures Rule, language or text changes invalidate a future compiled-plan cache. */
export function doctrineCacheKey(doctrine: Doctrine, language: Language): string {
  return JSON.stringify({ rulesVersion: RULES_VERSION, language, doctrine: doctrine[language] });
}
