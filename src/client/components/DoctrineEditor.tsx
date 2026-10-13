import { useState } from 'react';
import { presets, type Language } from '../game/policy';
import { loadTemplates, saveTemplate, TEMPLATE_KEY } from '../game/templates';

type Props = { language: Language; text: string; onChange: (text: string, preset?: string) => void };

/** @requires Browser environment. @ensures Templates retain the exact player's words without hidden execution. */
export function DoctrineEditor({ language, text, onChange }: Props) {
  const [templates, setTemplates] = useState(loadTemplates);
  const [name, setName] = useState('');
  const [status, setStatus] = useState<'saved' | 'failed' | null>(null);
  const t = (en: string, zh: string) => language === 'en' ? en : zh;
  const existing = templates.some(item => item.name === name.trim());

  /** @requires Nonempty bounded name and text. @ensures Failed storage does not report a successful save. */
  function save() {
    try {
      const next = saveTemplate(templates, name, text, crypto.randomUUID());
      localStorage.setItem(TEMPLATE_KEY, JSON.stringify(next));
      setTemplates(next);
      setStatus('saved');
    } catch { setStatus('failed'); }
  }

  return <section className="doctrine-editor">
    <label className="field-label" htmlFor="intent"><span>02</span>{t('Write your founding doctrine', '写下你的建国方针')}</label>
    <p className="editor-intro">{t('Your doctrine is a document. Start with a template, then make it yours.', '国策是一份文字文件。从模板出发，改成你自己的治国方针。')}</p>
    <details className="template-library">
      <summary>{t('Browse text templates', '浏览文字模板')} <span>↗</span></summary>
      <p>{t('Loading replaces the text below. Saved templates stay unchanged.', '载入会替换下方文字，不会改动已保存的模板。')}</p>
      {presets.map(preset => <button key={preset.id} className="template-option" onClick={() => { onChange(preset.intent[language], preset.id); setName(preset.name[language]); setStatus(null); }}>
        <strong>{t('Use: ', '使用：')}{preset.name[language]}</strong><span>{preset.intent[language]}</span>
      </button>)}
      {templates.length > 0 && <h3>{t('Your saved templates', '你保存的模板')}</h3>}
      {templates.map(template => <button key={template.id} className="template-option saved-template" onClick={() => { onChange(template.text); setName(template.name); setStatus(null); }}><strong>{t('Load: ', '载入：')}{template.name}</strong><span>{template.text}</span></button>)}
    </details>
    <textarea id="intent" maxLength={2000} value={text} onChange={e => { onChange(e.target.value); setStatus(null); }} placeholder={t('Our national priorities are…\nOur military posture is…\nIf circumstances change, we will…', '我国的发展重点是……\n军事姿态是……\n如果局势变化，我们将……')} />
    <div className="input-note"><span>{t('Text draft · not yet interpreted by AI', '文字草案 · 尚未经 AI 解析')}</span><span>{text.length}/2000</span></div>
    <label className="template-name-label" htmlFor="template-name">{t('Template name', '模板名称')}</label>
    <div className="template-save"><input id="template-name" maxLength={60} value={name} onChange={e => { setName(e.target.value); setStatus(null); }} placeholder={t('e.g. Armed neutrality', '例如：武装中立路线')} /><button className="secondary-button" disabled={!name.trim() || !text.trim()} onClick={save}>{existing ? t('Update template', '更新模板') : t('Save template', '保存模板')}</button></div>
    <p className="template-status" role="status">{status === 'saved' ? t('Template saved on this device. Load it again from the library.', '模板已保存在此设备，可从模板库重新载入。') : status === 'failed' ? t('Could not save. Check storage or the 20-template limit.', '保存失败，请检查存储或是否超过 20 个模板。') : t('Saved templates can be reused in future matches.', '保存后可在下一局再次使用。')}</p>
  </section>;
}
