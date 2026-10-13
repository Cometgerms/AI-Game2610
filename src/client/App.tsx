import { useEffect, useMemo, useState } from 'react';
import { WorldMap } from './components/WorldMap';
import { DoctrineEditor } from './components/DoctrineEditor';
import { allocate, createPolicy, isPolicy, nations, type Budget, type Language, type Policy } from './game/policy';
import { generateWorld, polygonArea } from './game/world';

const STORAGE_KEY = 'sovereign.policy.v1';

/** @requires Browser storage may be unavailable. @ensures Invalid drafts never become game state. */
function loadPolicy(): Policy {
  try { const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'); if (isPolicy(saved)) return saved; } catch { /* A fresh draft remains usable in private browsing. */ }
  return createPolicy();
}

/** @requires A browser environment. @ensures Policy previews never imply server or AI execution. */
export function App() {
  const [language, setLanguage] = useState<Language>('en');
  const [policy, setPolicy] = useState<Policy>(loadPolicy);
  const [selected, setSelected] = useState(10);
  const [mode, setMode] = useState<'prepare' | 'preview'>('prepare');
  const [notice, setNotice] = useState<'saved' | 'failed' | 'reset' | null>(null);
  const [savedPolicy, setSavedPolicy] = useState<Policy | null>(null);
  const [help, setHelp] = useState(false);
  const [nationMenu, setNationMenu] = useState(false);
  const [relief, setRelief] = useState(1);
  const t = (en: string, zh: string) => language === 'en' ? en : zh;
  const nation = nations.find(n => n.id === policy.nation)!;
  const regions = useMemo(() => generateWorld(policy.seed), [policy.seed]);
  const region = regions[selected];
  const areas = nations.map((_, i) => regions.filter(r => r.nation === i).reduce((sum, r) => sum + polygonArea(r.polygon), 0));
  const areaTotal = areas.reduce((a, b) => a + b, 0);
  const dirty = JSON.stringify(savedPolicy) !== JSON.stringify(policy);

  useEffect(() => { document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN'; }, [language]);

  /** @requires A valid policy. @ensures Storage failure is visible and leaves the draft editable. */
  function save() {
    if (!isPolicy(policy)) { setNotice('failed'); return; }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(policy)); setSavedPolicy(structuredClone(policy)); setNotice('saved'); }
    catch { setNotice('failed'); }
  }

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#main"><span className="brand-mark">S</span><span>SOVEREIGN<small>{t('A WORLD WRITTEN BY YOU', '由你书写的世界')}</small></span></a>
      <span className="build-label"><span className="status-dot" />{t('LOCAL PROTOTYPE', '本地原型')}<span className="version"> / 0.1</span></span>
      <div className="header-actions"><button className="text-button" onClick={() => setHelp(!help)} aria-expanded={help}>{t('Field guide', '操作指南')} ↗</button><button className="language" onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')} aria-label={t('Switch to Chinese', '切换为英文')}>{language === 'en' ? 'EN / 中文' : '中文 / EN'}</button></div>
    </header>

    {help && <aside className="guide">
      <strong>{t('Your first directive', '你的第一份指令')}</strong>
      <p>{t('Choose a nation, load a text template and edit your founding doctrine. Save named templates for later matches. Inspect the point-cloud map and its elevations. AI translation, multiplayer and combat are not connected yet.', '选择国家，载入文字模板并编辑建国方针。为模板命名保存，供后续对局使用。点云地图可查看高程；AI 翻译、多人联机和战斗尚未接入。')}</p>
    </aside>}

    <main id="main">
      <section className="page-heading"><div><div className="eyebrow">{t('PRE-GAME / STRATEGIC COMMAND', '开局准备 / 战略指挥')}</div><h1>{mode === 'prepare' ? t('Shape your nation.', '塑造你的国家。') : t('Survey your world.', '审视你的世界。')}</h1><p>{t('Borders are inherited. The future is a decision.', '疆界来自过去，未来由你决定。')}</p></div><div className="phase"><span className="phase-number">{mode === 'prepare' ? '01' : '02'}</span><span>{t('MISSION PHASE', '任务阶段')}<strong>{mode === 'prepare' ? t('Doctrine preparation', '国策准备') : t('World preview', '世界预览')}</strong></span></div></section>

      <div className="workspace">
        <section className="map-panel" aria-label={t('World preview', '世界预览')}>
          <div className="panel-bar"><span><span className="tiny-cross">+</span> {t('THE FRACTURED CONTINENT', '破碎大陆')}</span><span>{t('SEED', '种子')} {policy.seed.toString().padStart(6, '0')}</span></div>
          <div className="map-container"><WorldMap seed={policy.seed} language={language} selected={selected} relief={relief} onSelect={setSelected} />
            <div className="map-caption"><span>{t('TACTICAL TERRAIN', '战术地形')}</span><strong>{t('Every border is a possibility.', '每一道疆界，都是一种可能。')}</strong></div>
            <div className="compass" aria-hidden="true">N<span>↑</span></div>
          </div>
          <div className="map-toolbar"><div className="legend"><span><i className="legend-dot" />{t('Territory', '领土')}</span><span><i className="legend-line" />{t('River', '河流')}</span><span>△ {t('Highlands', '山地')}</span></div><button className="text-button" disabled={mode === 'preview'} onClick={() => setPolicy({ ...policy, seed: policy.seed % 999999 + 1 })}>↻ {t('New terrain', '重新生成')}</button></div>
          <label className="relief-control"><span>{t('Terrain height', '地形起伏')}</span><input type="range" min="0" max="1.6" step="0.1" value={relief} onChange={e => setRelief(Number(e.target.value))} /><output>{relief.toFixed(1)}×</output><small>{t('View only', '仅调整显示')}</small></label>
          <div className="country-areas">{nations.map((n, i) => <span key={n.id} className={`country-color-${i}`}>{n.name[language]} <strong>{(areas[i] / areaTotal * 100).toFixed(1)}%</strong></span>)}</div>
          <div className="region-details"><div><span className="eyebrow">{t('SELECTED SECTOR', '选中地区')}</span><strong>{String(region.id + 1).padStart(2, '0')} <span>/ {nations[region.nation].name[language]}</span></strong></div><span className="terrain-tag">{region.terrain === 'mountain' ? t('MOUNTAIN', '山地') : region.terrain === 'river' ? t('RIVER VALLEY', '河谷') : t('PLAIN', '平原')} · {region.elevation} {t('m', '米')}</span></div>
          <div className="map-note">{t('32 irregular regions · Point-cloud elevation · Coastline and unequal national territories', '32 个不规则地区 · 点云高程 · 自然海岸线与不同大小的国家')}</div>
        </section>

        <section className="command-panel" aria-label={t('Initial doctrine', '初始国策')}>
          <div className="panel-bar"><span>{t('NATIONAL DIRECTIVE', '国家指令')}</span><span className="accent">{t('BEFORE TURN 01', '第 01 回合之前')}</span></div>
          {mode === 'prepare' ? <div className="command-body">
            <div className="field-label"><span>01</span>{t('Choose your nation', '选择你的国家')}</div>
            <div className="nation-picker" onKeyDown={e => { if (e.key === 'Escape') { setNationMenu(false); e.currentTarget.querySelector('button')?.focus(); } }}>
              <button className="nation-toggle" aria-label={t('Choose your nation', '选择你的国家')} aria-expanded={nationMenu} aria-controls="nation-options" onClick={() => setNationMenu(!nationMenu)}>{nation.name[language]}<span>⌄</span></button>
              {nationMenu && <div className="nation-options" id="nation-options" role="group" aria-label={t('Available nations', '可选国家')}>{nations.map((n, i) => <button key={n.id} aria-pressed={n.id === policy.nation} onClick={() => { setPolicy({ ...policy, nation: n.id }); setNationMenu(false); }}>{n.name[language]}<span>{(areas[i] / areaTotal * 100).toFixed(1)}%</span></button>)}</div>}
            </div>
            <p className="nation-description">{nation.character[language]}<span>{nation.strength[language]}</span></p>

            <DoctrineEditor language={language} text={policy.intent} onChange={(intent, preset) => setPolicy({ ...policy, intent, preset: preset ?? policy.preset })} />
            <details className="test-parameters"><summary>{t('Manual test parameters', '手动测试参数')}</summary><p>{t('For the economy sandbox only. These values are independent of your written doctrine until AI translation is connected.', '仅用于经济沙盒。AI 尚未接入，这些数值不会随文字国策自动变化。')}</p>
            <div className="allocation-title"><span>{t('RESOURCE ALLOCATION', '资源分配')}</span><span>100 / 100</span></div>
            <div className="allocation-bar">{(Object.keys(policy.budget) as (keyof Budget)[]).map(key => <span key={key} className={key} style={{ width: `${policy.budget[key]}%` }} />)}</div>
            {(Object.keys(policy.budget) as (keyof Budget)[]).map(key => <label className="slider-row" key={key}><span>{key === 'industry' ? t('Industry', '工业') : key === 'research' ? t('Research', '科研') : t('Defense', '国防')}</span><input type="range" min="0" max="100" step="5" value={policy.budget[key]} onChange={e => setPolicy({ ...policy, budget: allocate(policy.budget, key, Number(e.target.value)) })} /><output>{policy.budget[key]}%</output></label>)}

            </details>
            <div className="form-actions"><button className="secondary-button" onClick={save}>{!dirty ? t('Draft saved ✓', '草案已保存 ✓') : t('Save draft', '保存草案')}</button><button className="primary-button" disabled={!isPolicy(policy)} onClick={() => { setMode('preview'); setNotice(null); }}>{t('Preview deployment', '预览部署')} <span>→</span></button></div>
            <button className="reset-button" onClick={() => { setPolicy(createPolicy(language)); setNotice('reset'); }}>{t('Reset current draft', '重置当前草案')}</button>
          </div> : <div className="command-body preview-body">
            <div className="preview-symbol">◇</div><div className="eyebrow">{t('DOCTRINE PREVIEW', '国策预览')}</div><h2>{nation.name[language]}</h2><p>{nation.strength[language]}</p>
            <div className="preview-budget">{(Object.keys(policy.budget) as (keyof Budget)[]).map(key => <div key={key}><strong>{policy.budget[key]}<small>%</small></strong><span>{key === 'industry' ? t('Industry', '工业') : key === 'research' ? t('Research', '科研') : t('Defense', '国防')}</span></div>)}</div>
            <blockquote>{policy.intent || t('No written directive.', '尚未填写战略意图。')}</blockquote>
            <p className="prototype-note">{t('This is a local preparation preview. No match has started. Your written intent has not been translated into executable orders.', '这是本地开局准备预览，尚未开始对局。文字意图尚未转换为可执行指令。')}</p>
            <button className="primary-button" onClick={() => setMode('prepare')}>← {t('Revise doctrine', '修改国策')}</button><button className="secondary-button" onClick={save}>{t('Save draft', '保存草案')}</button>
          </div>}
          <div className="notice" role="status">{notice === 'saved' ? t('Draft saved on this device.', '草案已保存在此设备。') : notice === 'failed' ? t('Could not save. Check browser storage and your draft.', '保存失败，请检查浏览器存储和草案。') : notice === 'reset' ? t('Current draft reset. Save to replace your stored draft.', '当前草案已重置，保存后才会覆盖已存草案。') : t('Your doctrine is a starting point. You can change course.', '国策是起点，你可以随时调整方向。')}</div>
        </section>
      </div>
      <footer><span>SOVEREIGN <span className="accent">//</span> {t('PROTOTYPE 001', '原型 001')}</span><span>{t('Plan with words. Change the world.', '用语言规划，让世界改变。')}</span><span>{t('LOCAL ONLY · NO API COST', '仅本地运行 · 无 API 费用')}</span></footer>
    </main>
  </div>;
}
