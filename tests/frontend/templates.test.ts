import assert from 'node:assert/strict';
import test from 'node:test';
import { isTemplateLibrary, saveTemplate } from '../../src/client/game/templates.ts';

test('named text templates can be created, revised and reused without changing unrelated entries', () => {
  const text = '保卫首都。\nKeep our borders secure.';
  const first = saveTemplate([], '  Armed neutrality  ', text, 'a');
  const second = saveTemplate(first, 'Industrial expansion', 'Build factories.', 'b');
  const updated = saveTemplate(second, 'Armed neutrality', text + '\nSeek allies.', 'unused');
  assert.equal(updated.length, 2);
  assert.equal(updated[0].id, 'a');
  assert.equal(updated[0].text, text + '\nSeek allies.');
  assert.deepEqual(updated[1], second[1]);
  assert.equal(first[0].text, text);
});

test('template storage rejects invalid values and caps library size', () => {
  for (const input of [null, {}, [null], [{ id: 'x', name: ' ', text: 'x' }], [{ id: 'x', name: 'ok', text: 'a'.repeat(2001) }]]) assert.equal(isTemplateLibrary(input), false);
  assert.throws(() => saveTemplate([], '', 'Text', 'x'));
  assert.throws(() => saveTemplate([], 'Title', ' ', 'x'));
  const full = Array.from({ length: 20 }, (_, i) => ({ id: String(i), name: String(i), text: 'Text' }));
  assert.throws(() => saveTemplate(full, 'New', 'Text', 'new'));
  assert.equal(saveTemplate(full, '0', 'Updated', 'unused')[0].text, 'Updated');
});
