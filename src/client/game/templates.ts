export type DoctrineTemplate = { id: string; name: string; text: string };
export const TEMPLATE_KEY = 'sovereign.templates.v1';

/** @requires Untrusted browser data. @ensures Only bounded, uniquely identified text templates pass. */
export function isTemplateLibrary(value: unknown): value is DoctrineTemplate[] {
  if (!Array.isArray(value) || value.length > 20) return false;
  return value.every(item => item && typeof item === 'object'
    && typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 80
    && typeof item.name === 'string' && item.name.trim().length > 0 && item.name.length <= 60
    && typeof item.text === 'string' && item.text.trim().length > 0 && item.text.length <= 2000)
    && new Set(value.map(item => item.id)).size === value.length
    && new Set(value.map(item => item.name)).size === value.length;
}

/** @requires Existing library, name, text and unique ID for new entries. @ensures Updating a name preserves other templates. */
export function saveTemplate(library: DoctrineTemplate[], name: string, text: string, id: string): DoctrineTemplate[] {
  const normalized = name.trim();
  const existing = library.find(item => item.name === normalized);
  const template = { id: existing?.id ?? id, name: normalized, text };
  const next = existing ? library.map(item => item.id === existing.id ? template : item) : [...library, template];
  if (!isTemplateLibrary(next)) throw new Error('Invalid template or library limit reached.');
  return next;
}

/** @requires Browser environment; storage may be unavailable. @ensures Corrupt data is never used as a template. */
export function loadTemplates(): DoctrineTemplate[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(TEMPLATE_KEY) ?? '[]');
    return isTemplateLibrary(data) ? data : [];
  } catch { return []; }
}
