import { createDoctrine, isDoctrine, migrateDoctrine, migrateText, type Doctrine } from './doctrine';

export type Language = 'en' | 'zh';
export type Localized = Record<Language, string>;
export type Budget = { industry: number; research: number; defense: number };
export type Policy = {
  version: 2;
  nation: string;
  preset: string;
  budget: Budget;
  doctrine: Doctrine;
  seed: number;
};

export const nations: { id: string; name: Localized; character: Localized; strength: Localized }[] = [
  { id: 'federation', name: { en: 'Crimson Federation', zh: '赤色联邦' }, character: { en: 'A continental power at a crossroads.', zh: '站在时代岔路口的大陆强国。' }, strength: { en: 'Large army / High upkeep', zh: '军力雄厚 / 维护费高' } },
  { id: 'republic', name: { en: 'Pelagic Republic', zh: '远洋共和国' }, character: { en: 'Small borders. Far-reaching ambitions.', zh: '疆域有限，雄心无界。' }, strength: { en: 'Research & trade / Limited manpower', zh: '科研贸易 / 人力有限' } },
  { id: 'dominion', name: { en: 'Highland Dominion', zh: '高地公国' }, character: { en: 'The mountains remember every invasion.', zh: '群山记得每一次入侵。' }, strength: { en: 'Mountain defense / Scarce resources', zh: '山地防御 / 资源匮乏' } },
  { id: 'union', name: { en: 'Iron Union', zh: '钢铁联盟' }, character: { en: 'Tomorrow is built in the foundries.', zh: '在熔炉中铸造明天。' }, strength: { en: 'Industrial capacity / Resource demand', zh: '工业产能 / 资源需求高' } },
];

export const presets: { id: string; name: Localized; description: Localized; budget: Budget; intent: Localized }[] = [
  { id: 'planned', name: { en: 'Planned economy', zh: '计划经济' }, description: { en: 'Collective investment. Industry first.', zh: '集中投资，优先发展工业。' }, budget: { industry: 60, research: 25, defense: 15 }, intent: { en: 'Our state follows a socialist, planned economy. Prioritize public industry and essential services.\n\nFor the opening turns, invest in production before expansion. Maintain a defensive posture and protect the capital.\n\nSeek trade agreements for scarce resources. If war threatens the homeland, pause new investment and propose a defensive plan for my approval.', zh: '我国采用社会主义与计划经济路线，优先发展国营工业和基础公共服务。\n\n开局阶段先提高生产能力，再考虑扩张。军事保持防御姿态，优先保卫首都。\n\n通过贸易获取稀缺资源。如果本土面临战争，暂缓新增投资，提出防御方案并交由我确认。' } },
  { id: 'liberal', name: { en: 'Liberal republic', zh: '自由共和国' }, description: { en: 'Open exchange. Knowledge first.', zh: '开放交流，优先发展科研。' }, budget: { industry: 30, research: 50, defense: 20 }, intent: { en: 'Our republic values open trade, scientific progress and political independence.\n\nPrioritize research and productive trade partnerships. Keep a small defensive force and avoid territorial wars.\n\nOffer mutually beneficial agreements to our neighbors. If a partner threatens our independence, diversify trade and present alternative alliances for my approval.', zh: '我国重视开放贸易、科学进步与政治独立。\n\n优先发展科研和互利贸易，维持小规模防御力量，避免领土战争。\n\n主动向邻国提出互利协议。如果贸易伙伴威胁我国独立，分散贸易渠道，并提出其他联盟方案交由我确认。' } },
  { id: 'security', name: { en: 'Security state', zh: '安全优先' }, description: { en: 'Strategic reserves. Defense first.', zh: '建立战略储备，优先保障防御。' }, budget: { industry: 30, research: 15, defense: 55 }, intent: { en: 'National security is our first priority. Preserve the capital, supply routes and strategic reserves.\n\nHold mountain passes and river crossings. Withdraw exposed forces instead of fighting costly battles on every border.\n\nBuild enough industry to sustain defense. Seek non-aggression agreements, and ask for approval before launching an offensive.', zh: '国家安全是第一目标，优先保护首都、补给线与战略储备。\n\n守住山口和渡河点。必要时撤回暴露的部队，不在每一段边境进行高代价战斗。\n\n发展足以支撑防御的工业，争取互不侵犯协议；发动进攻前必须征求我的确认。' } },
];

/** @requires A known preset and language. @ensures A fresh, independently editable draft. */
export function createPolicy(): Policy {
  return { version: 2, nation: nations[0].id, preset: presets[0].id, budget: { ...presets[0].budget }, doctrine: createDoctrine(), seed: 2610 };
}

/** @requires Untrusted saved data is allowed. @ensures Only bounded, recognized drafts pass. */
export function isPolicy(value: unknown): value is Policy {
  if (!value || typeof value !== 'object') return false;
  const p = value as Partial<Policy>;
  if (!p.budget || typeof p.budget !== 'object') return false;
  if (Object.keys(p).length !== 6 || Object.keys(p.budget).length !== 3) return false;
  const allocations = [p.budget.industry, p.budget.research, p.budget.defense];
  return p.version === 2 && nations.some(n => n.id === p.nation) && presets.some(n => n.id === p.preset)
    && isDoctrine(p.doctrine)
    && Number.isInteger(p.seed) && Number(p.seed) >= 1 && Number(p.seed) <= 999999
    && allocations.every(n => Number.isInteger(n) && n >= 0 && n <= 100)
    && allocations.reduce((a, b) => a + b, 0) === 100;
}

/** @requires Untrusted saved v1/v2 data. @ensures Legacy drafts survive the modular upgrade without deletion. */
export function migratePolicy(value: unknown): Policy | null {
  if (isPolicy(value)) return value;
  if (!value || typeof value !== 'object') return null;
  const old = value as Record<string, unknown>;
  if (old.version === 2) { const updated = { ...old, doctrine: migrateDoctrine(old.doctrine) }; return isPolicy(updated) ? updated : null; }
  if (old.version !== 1 || typeof old.intent !== 'string' || old.intent.length > 2000) return null;
  const builtin = presets.find(p => p.intent.en === old.intent || p.intent.zh === old.intent);
  const upgraded = { version: 2, nation: old.nation, preset: old.preset, budget: old.budget, seed: old.seed, doctrine: builtin ? createDoctrine(builtin.id) : migrateText(old.intent) };
  return isPolicy(upgraded) ? upgraded : null;
}

/** @requires Valid budget, known field and integer 0..100. @ensures Total allocation stays 100. */
export function allocate(budget: Budget, key: keyof Budget, value: number): Budget {
  const others = (Object.keys(budget) as (keyof Budget)[]).filter(k => k !== key);
  const remainder = 100 - value;
  const previous = budget[others[0]] + budget[others[1]];
  const first = previous === 0 ? Math.floor(remainder / 2) : Math.round(remainder * budget[others[0]] / previous);
  return { ...budget, [key]: value, [others[0]]: first, [others[1]]: remainder - first };
}
