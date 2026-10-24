import assert from 'node:assert/strict';
import test from 'node:test';
import { createDoctrine, formatDoctrine, isDoctrine } from '../../src/client/game/doctrine.ts';
import { isTemplateLibrary, migrateTemplates, saveTemplate } from '../../src/client/game/templates.ts';
import { migratePolicy, presets } from '../../src/client/game/policy.ts';

test('templates preserve bilingual modules on create/update and do not alias editable objects', () => {
  const doctrine = createDoctrine();
  const first = saveTemplate([], '  Neutrality  ', doctrine, 'a');
  doctrine.en.diplomacy = 'Remain neutral.';
  doctrine.zh.diplomacy = '保持中立。';
  assert.notEqual(first[0].doctrine.en.diplomacy, doctrine.en.diplomacy);
  const second = saveTemplate(first, 'Science', createDoctrine('liberal'), 'b');
  const updated = saveTemplate(second, 'Neutrality', doctrine, 'unused');
  assert.equal(updated.length, 2);
  assert.equal(updated[0].id, 'a');
  assert.equal(updated[0].doctrine.zh.diplomacy, '保持中立。');
  assert.deepEqual(updated[1], second[1]);
});

test('built-in text and headings switch languages; custom edits remain language-specific', () => {
  const doctrine = createDoctrine();
  assert.match(formatDoctrine(doctrine, 'zh'), /意识形态/);
  assert.match(formatDoctrine(doctrine, 'en'), /Ideology/);
  assert.match(doctrine.zh.economy, /国营工业/);
  const zh = doctrine.zh.economy;
  doctrine.en.economy = 'Test custom text';
  assert.equal(doctrine.zh.economy, zh);
  assert.equal(createDoctrine().en.economy.includes('Test custom'), false);
});

test('invalid bilingual payloads and excessive libraries are rejected', () => {
  for (const value of [null, {}, { en: {}, zh: {} }, { ...createDoctrine(), en: { ...createDoctrine().en, economy: 'x'.repeat(1001) } }]) assert.equal(isDoctrine(value), false);
  assert.equal(isTemplateLibrary([{ id: 'x', name: ' ', doctrine: createDoctrine() }]), false);
  assert.throws(() => saveTemplate([], '', createDoctrine(), 'x'));
  const full = Array.from({ length: 20 }, (_, i) => ({ id: String(i), name: String(i), doctrine: createDoctrine() }));
  assert.throws(() => saveTemplate(full, 'New', createDoctrine(), 'new'));
  assert.equal(saveTemplate(full, '0', createDoctrine('liberal'), 'unused')[0].doctrine.en.ideology, createDoctrine('liberal').en.ideology);
});

test('legacy drafts and templates survive upgrade without overwriting old prose', () => {
  const old = { version: 1, nation: 'federation', preset: 'planned', budget: { industry: 60, research: 25, defense: 15 }, seed: 2610, intent: '优先保卫首都，不要主动进攻。' };
  const migrated = migratePolicy(old)!;
  assert.equal(migrated.version, 2);
  assert.equal(migrated.doctrine.zh.notes, old.intent);
  assert.equal(migrated.doctrine.en.notes, '');
  assert.deepEqual(migratePolicy({ ...old, intent: presets[0].intent.en })?.doctrine, createDoctrine());
  const templates = migrateTemplates([{ id: 'a', name: 'Old text', text: 'Keep this exact text.' }]);
  assert.equal(templates[0].doctrine.en.notes, 'Keep this exact text.');
  assert.deepEqual(migrateTemplates([{ id: 'a', name: 'bad', text: 'x'.repeat(2001) }]), []);
});
