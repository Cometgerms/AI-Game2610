import assert from 'node:assert/strict';
import test from 'node:test';
import { allocate, createPolicy, isPolicy, type Budget } from '../../src/client/game/policy.ts';

test('budget editing preserves a finite 100-point allocation, including all-in transitions', () => {
  let budget: Budget = { industry: 100, research: 0, defense: 0 };
  for (const key of ['industry', 'research', 'defense'] as const) {
    for (let value = 0; value <= 100; value++) {
      budget = allocate(budget, key, value);
      assert.equal(budget[key], value);
      assert.equal(Object.values(budget).reduce((a, b) => a + b, 0), 100);
      assert.ok(Object.values(budget).every(n => Number.isInteger(n) && n >= 0));
    }
  }
});

test('stored drafts reject corrupt, oversized and unrecognized values', () => {
  const policy = createPolicy();
  assert.ok(isPolicy(policy));
  for (const value of [null, {}, { ...policy, extra: true }, { ...policy, nation: 'unknown' }, { ...policy, preset: 'unknown' }, { ...policy, budget: null }, { ...policy, budget: { ...policy.budget, extra: 1 } }, { ...policy, budget: { industry: -1, research: 51, defense: 50 } }, { ...policy, seed: Infinity }, { ...policy, seed: 0 }, { ...policy, intent: 'x'.repeat(2001) }]) {
    assert.equal(isPolicy(value), false);
  }
});
