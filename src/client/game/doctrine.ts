import type { Language, Localized } from './policy';

export const MODULE_KEYS = ['ideology', 'political', 'military', 'diplomacy', 'economy', 'society', 'technology', 'notes'] as const;
export type ModuleKey = typeof MODULE_KEYS[number];
export type DoctrineModules = Record<ModuleKey, string>;
export type Doctrine = Record<Language, DoctrineModules>;
export const moduleLabels: Record<ModuleKey, Localized> = {
  ideology: { en: 'Ideology', zh: '意识形态' }, economy: { en: 'Economic policy', zh: '经济政策' },
  diplomacy: { en: 'Foreign policy', zh: '外交政策' }, military: { en: 'Military policy', zh: '军事政策' },
  notes: { en: 'Additional notes', zh: '补充说明' },
  political: { en: 'Political policy', zh: '政治政策' }, society: { en: 'Social policy', zh: '社会政策' },
  technology: { en: 'Technology policy', zh: '科技政策' },
};

const defaults: Record<string, Record<Language, Omit<DoctrineModules, 'political' | 'society' | 'technology'>>> = {
  planned: {
    en: { ideology: 'Follow a socialist, planned economy. Prioritize collective welfare and public services.', economy: 'Invest first in public industry and essential infrastructure. Build productive capacity before expanding.', diplomacy: 'Seek reliable resource trade and non-aggression agreements. Preserve political independence.', military: 'Defend the capital and supply routes. Avoid early offensives; request approval before changing strategy.', notes: '' },
    zh: { ideology: '采用社会主义与计划经济路线，重视集体福祉和公共服务。', economy: '优先投资国营工业和基础设施，先提高生产能力，再考虑扩张。', diplomacy: '寻求稳定的资源贸易与互不侵犯协议，保持政治独立。', military: '保卫首都和补给线，避免开局主动进攻；改变军事战略前须征求确认。', notes: '' },
  },
  liberal: {
    en: { ideology: 'Build a liberal republic that values individual rights, scientific progress and political independence.', economy: 'Prioritize research, open markets and productive trade. Diversify essential imports.', diplomacy: 'Offer mutually beneficial agreements and peaceful cooperation. Avoid dependence on a single partner.', military: 'Maintain a compact defensive force. Protect trade access and avoid wars of conquest.', notes: '' },
    zh: { ideology: '建立重视个人权利、科学进步与政治独立的自由共和国。', economy: '优先发展科研、开放市场和互利贸易，分散关键进口渠道。', diplomacy: '主动提出互利协议与和平合作，避免依赖单一伙伴。', military: '保持精干的防御力量，保护贸易通道，避免征服战争。', notes: '' },
  },
  security: {
    en: { ideology: 'Place sovereignty, national resilience and public security first.', economy: 'Build strategic reserves and enough industry to sustain defense. Keep emergency funds available.', diplomacy: 'Pursue armed neutrality and non-aggression agreements. Reject commitments that force a two-front war.', military: 'Hold passes and crossings. Withdraw exposed units toward the capital when necessary; approve offensives explicitly.', notes: '' },
    zh: { ideology: '将国家主权、韧性与公共安全置于首位。', economy: '建立战略储备与支撑防御的工业，保留应急资金。', diplomacy: '奉行武装中立，争取互不侵犯协议，拒绝可能导致两线作战的承诺。', military: '控制山口和渡河点，必要时将暴露部队撤向首都；进攻必须获得明确批准。', notes: '' },
  },
};

/** @requires Preset ID. @ensures Each language has independently editable, complete module text. */
export function createDoctrine(preset = 'planned'): Doctrine {
  const base = structuredClone(defaults[preset] ?? defaults.planned);
  return {
    en: { ...base.en, political: 'Maintain stable institutions and reserve capacity for emergencies.', society: 'Protect food security and public welfare. Limit the social cost of mobilization.', technology: 'Develop production, military capability and logistics in support of national goals.' },
    zh: { ...base.zh, political: '保持制度稳定，为紧急情况保留治理能力。', society: '保障粮食与公共福利，控制动员带来的社会代价。', technology: '围绕国家目标发展生产、军事与后勤科技。' },
  };
}

/** @requires Untrusted current or legacy doctrine. @ensures Older five-module drafts retain all their text. */
export function migrateDoctrine(value: unknown): Doctrine | null {
  if (isDoctrine(value)) return value;
  if (!value || typeof value !== 'object' || Object.keys(value).length !== 2) return null;
  const result = createDoctrine();
  for (const lang of ['en', 'zh'] as const) {
    const fields = (value as Record<string, unknown>)[lang];
    if (!fields || typeof fields !== 'object' || Object.keys(fields).length !== 5) return null;
    for (const key of ['ideology', 'economy', 'diplomacy', 'military', 'notes'] as const) {
      const text = (fields as Record<string, unknown>)[key];
      if (typeof text !== 'string' || text.length > (key === 'notes' ? 2000 : 1000)) return null;
      result[lang][key] = text;
    }
  }
  return result;
}

/** @requires Untrusted storage. @ensures All bilingual fields are strings within their limits. */
export function isDoctrine(value: unknown): value is Doctrine {
  if (!value || typeof value !== 'object' || Object.keys(value).length !== 2) return false;
  return (['en', 'zh'] as const).every(language => {
    const modules = (value as Partial<Doctrine>)[language];
    return modules && Object.keys(modules).length === MODULE_KEYS.length
      && MODULE_KEYS.every(key => typeof modules[key] === 'string' && modules[key].length <= (key === 'notes' ? 2000 : 1000));
  });
}

/** @requires Valid doctrine and language. @ensures Display text reflects the active language, including headings. */
export function formatDoctrine(doctrine: Doctrine, language: Language): string {
  return MODULE_KEYS.filter(key => doctrine[language][key]).map(key => `${moduleLabels[key][language]}:\n${doctrine[language][key]}`).join('\n\n');
}

/** @requires Legacy text up to 2000 characters. @ensures Existing prose is retained verbatim, never guessed into policies. */
export function migrateText(text: string): Doctrine {
  const empty = Object.fromEntries(MODULE_KEYS.map(key => [key, ''])) as DoctrineModules;
  const doctrine = { en: { ...empty }, zh: { ...empty } };
  doctrine[/[\u3400-\u9fff]/.test(text) ? 'zh' : 'en'].notes = text;
  return doctrine;
}
