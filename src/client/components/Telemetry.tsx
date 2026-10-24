import { useLayoutEffect, useRef, useState } from 'react';
import { animate, stagger } from 'animejs';
import { resourceInfo, type Resources } from '../game/scenarios';
import { resourceSeries, sparkline } from '../game/telemetry';
import type { GameState, Stock } from '../game/sandbox';
import type { Language } from '../game/policy';

export function Telemetry({ state, history, nation, language }: { state: GameState; history: GameState[]; nation: number; language: Language }) {
  const root = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const current = state.nations[nation], ledger = state.report?.ledger[nation];
  const t = (en: string, zh: string) => language === 'en' ? en : zh;
  useLayoutEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    let animations: ReturnType<typeof animate>[] = [];
    const sync = () => {
      animations.forEach(animation => animation.revert()); animations = [];
      if (!root.current || preference.matches) return;
      animations = [
        animate(root.current.querySelectorAll('.trend-line'), { strokeDashoffset: [1, 0], duration: 650, delay: stagger(35), ease: 'out(3)' }),
        animate(root.current.querySelectorAll('.flow-bars i'), { scaleX: [0, 1], duration: 400, delay: stagger(25), ease: 'out(3)' }),
      ];
    };
    sync(); preference.addEventListener('change', sync);
    return () => { animations.forEach(animation => animation.revert()); preference.removeEventListener('change', sync); };
  }, [state.turn, nation]);
  return <div className="telemetry" ref={root} data-expanded={expanded}>
    <div className="resource-grid" aria-label={t('Resources', '资源')}>{Object.entries(resourceInfo).map(([key, info]) => {
      const k = key as keyof Resources, series = resourceSeries(history, state, nation, k), delta = ledger ? ledger.after[k] - ledger.before[k] : 0;
      return <div className="resource-metric" key={key} tabIndex={0}><span>{info.icon} {info.name[language]}</span><strong className="metric-value">{current.resources[k]}</strong><small className={delta < 0 ? 'falling' : delta > 0 ? 'rising' : ''}>{ledger ? `${delta > 0 ? '+' : ''}${delta} ${t('last turn', '上回合')}` : t('Opening', '初始值')}</small>
        <svg className="resource-trend" viewBox="0 0 100 32" role="img" aria-label={`${info.name[language]}: ${series.map(p => `${t('Turn', '回合')} ${p.turn}: ${p.value}`).join('; ')}`}><path d="M3 30H97" stroke="#38383e" />{series.length > 1 ? <polyline className="trend-line" pathLength={1} points={sparkline(series.map(p => p.value))} fill="none" stroke="currentColor" strokeWidth="1.6" /> : <circle cx="50" cy="16" r="2" fill="currentColor" />}</svg>
        <div className="metric-detail">{info.detail[language]}<br/>{t('Last 8 snapshots · independent scales', '最近 8 次快照 · 各图独立刻度')}</div></div>;
    })}</div>
    <button className="telemetry-toggle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{t('Resource flow & national status', '资源收支与国家状态')} <span>{expanded ? '−' : '+'}</span></button>
    <div className="telemetry-bottom"><section className="ledger-panel"><h3>{t('RESOURCE FLOW', '资源收支')} <span>{ledger ? `${t('Turn', '回合')} ${state.report!.turn}` : t('Awaiting settlement', '等待首次结算')}</span></h3><table aria-label={t('Resource flow', '资源收支')}><thead><tr><th>{t('Stock', '库存')}</th><th>{t('Income', '收入')}</th><th>{t('Spent', '支出')}</th><th>{t('Other', '其他')}</th><th>{t('Net', '净变化')}</th><th>{t('Balance', '收支对比')}</th></tr></thead><tbody>{(['treasury', 'food', 'energy'] as Stock[]).map(k => {
      const income = ledger?.income[k] ?? 0, spent = ledger ? ledger.upkeep[k] + ledger.spending[k] : 0, net = ledger ? ledger.after[k] - ledger.before[k] : 0, other = net - income + spent, scale = Math.max(income, spent, 1);
      return <tr key={k}><th>{resourceInfo[k].name[language]}</th><td>{ledger ? `+${income}` : '—'}</td><td>{ledger ? `−${spent}` : '—'}</td><td>{ledger ? `${other > 0 ? '+' : ''}${other}` : '—'}</td><td className={net < 0 ? 'falling' : 'rising'}>{ledger ? `${net > 0 ? '+' : ''}${net}` : '—'}</td><td><div className="flow-bars" aria-hidden="true"><i style={{ width: `${income / scale * 100}%` }} /><i style={{ width: `${spent / scale * 100}%` }} /></div></td></tr>;
    })}</tbody></table></section><div className="national-vitals">{[
      [t('Stability', '稳定'), current.stability, 100, '%'], [t('War fatigue', '厌战'), current.fatigue, 100, '%'], [t('Trust', '信誉'), current.trust, 100, ''], [t('Total score', '总分'), Object.values(current.score).reduce((a, b) => a + b, 0), 400, ''],
    ].map(([name, value, max, suffix]) => <div key={name}><span>{name}</span><strong className="metric-value">{value}{suffix}</strong><meter min={0} max={Number(max)} value={Number(value)} aria-label={String(name)} /></div>)}</div></div>
  </div>;
}
