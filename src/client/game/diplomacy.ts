import type { Clause, Treaty } from './sandbox';

/** @requires Untrusted clause input and server-owned parties. @ensures Only bounded, executable bilateral obligations are accepted. */
export function validClauses(value: unknown, from: number, to: number, duration: number): value is Clause[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 8 && value.every(c => {
    if (!c || !['transfer', 'peace', 'cancel_on_attack'].includes(c.kind) || ![from, to].includes(c.actor) || !Number.isInteger(c.target) || c.target < 0 || c.target > 4 || c.actor === c.target) return false;
    if (c.kind !== 'cancel_on_attack' && ![from, to].includes(c.target)) return false;
    return ['treasury', 'food', 'energy'].includes(c.resource) && Number.isInteger(c.amount) && c.amount >= 1 && c.amount <= 100
      && Number.isInteger(c.start) && c.start >= 1 && c.start <= duration && Number.isInteger(c.every) && c.every >= 1 && c.every <= 5;
  });
}
export function treatyClauses(t: Treaty): Clause[] {
  if (t.kind === 'compact') return t.clauses ?? [];
  const base = { actor: t.from, target: t.to, resource: t.give, amount: t.amount, start: 1, every: 1 };
  return t.kind === 'trade' ? [{ ...base, kind: 'transfer' }, { ...base, kind: 'transfer', actor: t.to, target: t.from, resource: t.receive }] : [{ ...base, kind: 'peace' }];
}
