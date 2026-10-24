import { useId, useLayoutEffect, useRef, useState } from 'react';
import { animate } from 'animejs';
import { presets, type Language } from '../game/policy';
import { createDoctrine, formatDoctrine, MODULE_KEYS, moduleLabels, type Doctrine, type ModuleKey } from '../game/doctrine';
import { loadTemplates, saveTemplate, TEMPLATE_KEY } from '../game/templates';

type Props = { language: Language; doctrine: Doctrine; onChange: (doctrine: Doctrine, preset?: string) => void };

const symbols: Record<ModuleKey, string> = {
  ideology: 'M12 3 3 8l9 5 9-5-9-5ZM3 12l9 5 9-5M3 16l9 5 9-5',
  political: 'm3 9 9-6 9 6H3Zm2 3v6m7-6v6m7-6v6M3 21h18',
  military: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm0 4v10m-4-7h8',
  diplomacy: 'M8 8h8v8H8zM3 3h4v4H3zM17 3h4v4h-4zM3 17h4v4H3zM17 17h4v4h-4zM7 7l2 2m6 6 2 2M7 17l2-2m6-6 2-2',
  economy: 'M4 20V10h4v10m4 0V4h4v16m4 0V8M2 21h20',
  society: 'M9 8a3 3 0 1 0 6 0 3 3 0 0 0-6 0ZM5 21v-2a7 7 0 0 1 14 0v2M3 6v6m-2-3h4m14-3v6m-2-3h4',
  technology: 'M7 7h10v10H7zM10 10h4v4h-4zM9 3v4m6-4v4M9 17v4m6-4v4M3 9h4m-4 6h4m10-6h4m-4 6h4',
  notes: 'M6 3h9l4 4v14H6V3Zm9 0v5h4M9 12h7m-7 4h7',
};

/** @requires Browser storage. @ensures Modules switch languages while preserving edits in both versions. */
export function DoctrineEditor({ language, doctrine, onChange }: Props) {
  const [templates, setTemplates] = useState(loadTemplates);
  const [name, setName] = useState('');
  const [namePreset, setNamePreset] = useState<string | null>(null);
  const [status, setStatus] = useState<'saved' | 'failed' | null>(null);
  const [active, setActive] = useState<ModuleKey>('ideology');
  const editorId = useId();
  const panel = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!panel.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const animation = animate(panel.current, { opacity: [.4, 1], y: [8, 0], duration: 240, ease: 'out(3)' });
    return () => { animation.revert(); };
  }, [active]);
  const t = (en: string, zh: string) => language === 'en' ? en : zh;
  const displayName = namePreset ? presets.find(p => p.id === namePreset)!.name[language] : name;
  const existing = templates.some(item => item.name === displayName.trim());

  /** @requires Valid modules and a title. @ensures Both languages are saved atomically in one template. */
  function save() {
    try {
      const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
      const next = saveTemplate(templates, displayName, doctrine, id);
      localStorage.setItem(TEMPLATE_KEY, JSON.stringify(next));
      setTemplates(next);
      setStatus('saved');
    } catch { setStatus('failed'); }
  }

  return <section className="doctrine-editor modular-doctrine">
    <details className="template-library">
      <summary>{t('Browse text templates', '浏览文字模板')} <span>↗</span></summary>
      <p>{t('Loading replaces both language versions. Saved copies remain unchanged.', '载入会替换当前的中英文版本，不会改动已保存的副本。')}</p>
      {presets.map(preset => <button key={preset.id} className="template-option" onClick={() => { onChange(createDoctrine(preset.id), preset.id); setNamePreset(preset.id); setStatus(null); }}>
        <strong>{t('Use: ', '使用：')}{preset.name[language]}</strong><span>{formatDoctrine(createDoctrine(preset.id), language)}</span>
      </button>)}
      {templates.length > 0 && <h3>{t('Your saved templates', '你保存的模板')}</h3>}
      {templates.map(template => <button key={template.id} className="template-option saved-template" onClick={() => { onChange(structuredClone(template.doctrine)); setNamePreset(null); setName(template.name); setStatus(null); }}><strong>{t('Load: ', '载入：')}{template.name}</strong><span>{formatDoctrine(template.doctrine, language) || t('This language version is empty.', '此语言版本尚未填写。')}</span></button>)}
    </details>
    <div className="doctrine-navigation" role="group" aria-label={t('Policy modules', '国策模块')}>{MODULE_KEYS.map(key => <button type="button" key={key} className={`doctrine-tile ${active === key ? 'active' : ''}`} aria-pressed={active === key} aria-controls={`${editorId}-panel`} onClick={() => setActive(key)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={symbols[key]} /></svg><span>{moduleLabels[key][language]}</span><i className={doctrine[language][key].trim() ? 'filled' : ''} aria-hidden="true" />
    </button>)}</div>
    <div className="doctrine-focus" id={`${editorId}-panel`} ref={panel}>
      <div className="doctrine-focus-heading"><label htmlFor={`${editorId}-text`}>{moduleLabels[active][language]}</label><span>{String(MODULE_KEYS.indexOf(active) + 1).padStart(2, '0')} / 08</span></div>
      <textarea id={`${editorId}-text`} maxLength={active === 'notes' ? 2000 : 1000} value={doctrine[language][active]} onChange={e => { onChange({ ...doctrine, [language]: { ...doctrine[language], [active]: e.target.value } }); setStatus(null); }} placeholder={t('Describe your policy…', '描述你的政策……')} />
    </div>
    <div className="input-note"><span>{t('English and Chinese edits are saved separately.', '中英文修改分别保存。')}</span></div>
    <label className="template-name-label" htmlFor={`${editorId}-name`}>{t('Template name', '模板名称')}</label>
    <div className="template-save"><input id={`${editorId}-name`} maxLength={60} value={displayName} onChange={e => { setName(e.target.value); setNamePreset(null); setStatus(null); }} placeholder={t('e.g. Armed neutrality', '例如：武装中立路线')} /><button className="secondary-button" disabled={!displayName.trim() || !formatDoctrine(doctrine, language).trim()} onClick={save}>{existing ? t('Update template', '更新模板') : t('Save template', '保存模板')}</button></div>
    {status && <p className="template-status" role="status">{status === 'saved' ? t('Template saved.', '模板已保存。') : t('Could not save. Check storage or the 20-template limit.', '保存失败，请检查存储或是否超过 20 个模板。')}</p>}
  </section>;
}
