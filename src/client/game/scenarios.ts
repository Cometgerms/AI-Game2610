import type { Localized } from './policy';

export type Resources = { treasury: number; food: number; energy: number; industry: number; research: number; army: number; population: number };
export type Nation = { id: string; name: Localized; role: Localized; color: string; resources: Resources; trust: number };
export type Scenario = { id: string; name: Localized; description: Localized; layout: number; nations: Nation[] };
const colors = ['#e86b70', '#69be97', '#65bce1', '#d8bd66', '#d99bbb'];
const roles = [
  { en: 'Military power · costly army', zh: '军事强国 · 军费负担高' },
  { en: 'Maritime state · limited manpower', zh: '海洋国家 · 人力有限' },
  { en: 'Trade crossroads · exposed borders', zh: '贸易枢纽 · 边境脆弱' },
  { en: 'Industrial heartland · energy demand', zh: '工农业大国 · 能源需求高' },
  { en: 'Research enclave · small territory', zh: '科研小国 · 纵深有限' },
];
const opening: Resources[] = [
  { treasury: 140, food: 95, energy: 100, industry: 60, research: 25, army: 120, population: 85 },
  { treasury: 180, food: 80, energy: 65, industry: 40, research: 65, army: 35, population: 35 },
  { treasury: 220, food: 100, energy: 70, industry: 55, research: 50, army: 45, population: 60 },
  { treasury: 160, food: 180, energy: 85, industry: 100, research: 40, army: 70, population: 110 },
  { treasury: 150, food: 55, energy: 60, industry: 35, research: 100, army: 25, population: 25 },
];
const definitions = [
  ['frontier', 'The Five Frontiers', '五国边境', 'A northern military power, a western island and a contested southern heartland.', '北方军事强国、西侧岛国与南方腹地；依据你的草图。', ['Veyr Directorate', 'Verdant Isles', 'Azure League', 'Aurean Union', 'Rose Institute'], ['维尔统辖国', '翠屿联邦', '蔚蓝同盟', '奥瑞亚联盟', '蔷薇学邦']],
  ['straits', 'The Divided Seas', '分海诸国', 'Five separated shores. Maritime access defines every border.', '五片分离的海岸，海上通道决定战略空间。', ['Ember Dominion', 'Jade Republic', 'Tidal Compact', 'Amber Commonwealth', 'Orchid Assembly'], ['烬火领国', '翡翠共和国', '潮汐协约国', '琥珀共同体', '兰庭议邦']],
  ['meridian', 'Meridian Divide', '子午分界', 'A tall continent links the northern shield and southern production belt.', '狭长大陆串起北方屏障与南方生产带。', ['Bastion Federation', 'Cedar Isles', 'Meridian League', 'Sol Republic', 'Iris Academy'], ['壁垒联邦', '雪松群岛', '子午同盟', '曦光共和国', '鸢尾学国']],
  ['crescent', 'The Eastern Crescent', '东部新月', 'An eastern maritime state faces a broad western continent.', '东方海洋国家与西方宽阔大陆隔海相望。', ['Garnet Command', 'Moss Archipelago', 'Cobalt Pact', 'Harvest Union', 'Lotus Council'], ['石榴统领国', '青苔群岛', '钴蓝公约国', '丰穰联盟', '莲华理事国']],
  ['rift', 'The Long Reach', '长岸裂境', 'A low, wide landmass with distant capitals and a narrow research corridor.', '低矮广阔的陆地、遥远的首都与狭窄科研走廊。', ['Redstone Empire', 'Laurel Republic', 'Riverglass Union', 'Ochre Collective', 'Dawn Conservatory'], ['赤岩帝国', '月桂共和国', '镜河联盟', '赭土联合体', '晨曦学邦']],
] as const;

export const scenarios: Scenario[] = definitions.map((d, layout) => ({
  id: d[0], name: { en: d[1], zh: d[2] }, description: { en: d[3], zh: d[4] }, layout,
  nations: opening.map((base, i) => ({ id: `${d[0]}-${i}`, name: { en: d[5][i], zh: d[6][i] }, role: roles[i], color: colors[i], trust: [40, 65, 75, 55, 80][i],
    resources: Object.fromEntries(Object.entries(base).map(([key, value]) => [key, value + layout * (i + 2) * (key === 'army' ? 1 : 2)])) as Resources,
  })),
}));

export const resourceInfo: Record<keyof Resources, { icon: string; name: Localized; detail: Localized }> = {
  treasury: { icon: '◈', name: { en: 'Treasury', zh: '国库' }, detail: { en: 'Funds investment and army upkeep.', zh: '用于投资和军队维护。' } },
  food: { icon: '♧', name: { en: 'Food', zh: '粮食' }, detail: { en: 'Supplies the population and deployed forces.', zh: '供给人口及部署中的军队。' } },
  energy: { icon: 'ϟ', name: { en: 'Energy', zh: '能源' }, detail: { en: 'Supports industry and military operations.', zh: '支持工业生产与军事行动。' } },
  industry: { icon: '▥', name: { en: 'Industry', zh: '工业' }, detail: { en: 'Production capacity; not a spendable stockpile.', zh: '生产能力指标，不是可直接消费的库存。' } },
  research: { icon: '⌬', name: { en: 'Research', zh: '科研' }, detail: { en: 'Knowledge spent on production, military and logistics technology.', zh: '用于生产、军事和后勤科技的科研点。' } },
  army: { icon: '⚑', name: { en: 'Army', zh: '军力' }, detail: { en: 'The sum of surviving garrisons across your regions.', zh: '本国所有地区现存驻军的总和。' } },
  population: { icon: '♙', name: { en: 'Population', zh: '人口' }, detail: { en: 'Abstract civilian population. Recruitment consumes one unit per five strength.', zh: '抽象平民人口。每征募 5 兵力消耗 1 人口。' } },
};
