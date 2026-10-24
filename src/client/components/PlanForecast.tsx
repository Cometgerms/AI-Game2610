import {useEffect,useRef,useState} from 'react';
import type {PlanForecast as Forecast} from '../game/forecast';
import type {Language} from '../game/policy';
import {resourceInfo,scenarios} from '../game/scenarios';
import {api} from '../game/network';

export function PlanForecast({value,language}:{value:Forecast;language:Language}){
 const [index,setIndex]=useState(0),t=(en:string,zh:string)=>language==='en'?en:zh;
 const nations=scenarios.find(s=>s.id===value.scenario)?.nations;
 const nationName=(id:number)=>nations?.[id].name[language]??`${t('Country','国家')} ${id+1}`;
 const current=value.cases[Math.min(index,value.cases.length-1)],row=current.ledger;
 const titles={scripted:t('Known exercise','已知教学行动'),unchanged:t('Hold positions','维持部署'),pressure:t('Limited response','有限应对'),surge:t('Strong response','大规模应对')};
 return <section className="plan-forecast" aria-label={t('Action forecast','行动推演')}>
  <header><span className="eyebrow">{t('BEFORE YOU COMMIT','落子之前')}</span><h3>{t('Test your next move.','先推演，再落子。')}</h3></header>
  <p className="forecast-context">{current.kind==='scripted'?t('Uses the actual scripted neighbours and the same settlement engine. Your turn has not advanced.','使用真实脚本邻居与同一结算引擎，尚未推进回合。'):t('Three scenarios, not win probabilities. Opponent orders stay private.','三种情境推演，不是胜率；不读取敌方隐藏指令。')}</p>
  {value.cases.length>1&&<nav className="forecast-tabs" aria-label={t('Opponent assumptions','敌方假设')}>{value.cases.map((c,i)=><button type="button" key={c.kind} aria-pressed={i===index} onClick={()=>setIndex(i)}>{titles[c.kind]}</button>)}</nav>}
  {current.kind!=='scripted'&&<p className="forecast-assumption">{current.kind==='unchanged'?t('Opponents keep their opening positions.','敌方保持期初驻军部署。'):t(`Adjacent opponents commit up to ${current.kind==='pressure'?25:50}% of opening troops to reinforce attacked regions or pressure your capital / defended destinations, within energy and treaty limits. Hypothesis only.`,`邻接敌军最多投入期初兵力的 ${current.kind==='pressure'?25:50}%，增援受攻击地区，或向你的首都／防守目的地施压；受能源与条约限制。仅为假设。`)}</p>}
  {current.kind!=='scripted'&&<details><summary>{t('Model limits','推演范围')}</summary><p>{t('No new enemy recruitment, research or policy spending; existing edicts remain. Enemy naval movements and nonadjacent reinforcements are not modelled. These cases are not exhaustive, and their frequency is not a win probability.','不假设敌方新增征兵、科研或国政投入，已有法令保留；不推测敌方海军调动与远方增援。情境未穷尽所有可能，胜出情境占比不等于胜率。')}</p></details>}
  <div className="forecast-table-wrap"><table><caption>{t('Projected accounts · this scenario','本情境预计账目')}</caption><thead><tr><th>{t('Resource','资源')}</th><th>{t('Opening','期初')}</th><th>{t('Orders¹','行动¹')}</th><th>{t('Upkeep','维护')}</th><th>{t('End²','期末²')}</th></tr></thead><tbody>{(['treasury','food','energy'] as const).map(key=><tr key={key}><th>{resourceInfo[key].name[language]}</th><td>{row.before[key]}</td><td>−{row.spending[key]}</td><td>−{row.upkeep[key]}</td><td className={row.shortage[key]>0?'forecast-risk':''}>{row.after[key]}</td></tr>)}</tbody></table></div>
  <small>{t('¹ Includes standing-program spending. ² Includes production, trade and other settlement effects; not just opening minus costs.','¹ 包含长期投入支出。² 已计入产出、贸易等结算影响，不只是期初减成本。')}</small>
  <div className="forecast-metrics">{(['industry','research','army'] as const).map(key=><div key={key}><span>{resourceInfo[key].name[language]}</span><strong>{row.before[key]} → {row.after[key]}</strong></div>)}</div>
  {Object.values(row.shortage).some(n=>n>0)&&<p className="forecast-risk">{t('Supply shortfall in this scenario: army and stability may suffer.','本情境出现资源短缺，军队与稳定会受到影响。')}</p>}
  {current.control.map(c=><p key={c.region} className={c.to!==value.nation?'forecast-risk':''}>{c.to===value.nation?t('Projected capture','预计占领'):c.capital?t('Capital at risk','首都有失守风险'):t('Projected territory loss','预计失去领土')} · #{c.region+1}</p>)}
  {current.battles.length===0?<p>{t('No engagement involving your forces in this scenario.','本情境下没有涉及你的部队的交战。')}</p>:current.battles.map(b=>{
   const own=b.forces.find(f=>f.nation===value.nation)!,enemy=b.forces.filter(f=>f.nation!==value.nation),enemyPower=enemy.reduce((n,f)=>n+f.power,0),ratio=own.power/(enemyPower||1),won=b.winner===value.nation;
   return <article className="forecast-battle" key={b.region}><div className="forecast-battle-heading"><strong>#{b.region+1} · {won?t('Projected control','预计控制'):t('Projected loss of control','预计无法控制')}</strong><span className={!won?'forecast-risk':''}>{ratio>1.2?t('Advantage','优势'):ratio<.8?t('Disadvantage','劣势'):t('Close contest','接近')}</span></div>
    <div className="forecast-power" aria-hidden="true"><i style={{width:`${own.power/(own.power+enemyPower||1)*100}%`}}/></div>
    <p>{t('Effective power: yours / others','有效战力：我方 / 对方')} <b>{own.power.toFixed(1)} / {enemyPower.toFixed(1)}</b></p>
    <p>{t('Committed / losses / remaining¹','参战 / 损失 / 剩余¹')} <b>{own.army} / {own.losses??0} / {own.remaining??0}</b></p>
    <details><summary>{t('Why this result?','为什么是这个结果？')}</summary><p>{t('Power = troops × technology × terrain × supply × fatigue × hold × military edict × sea landing modifier.','战力 = 兵力 × 科技 × 地形 × 补给 × 厌战 × 固守 × 军事法令 × 登陆修正。')}</p><ul>{b.forces.map(f=><li key={f.nation}>{nationName(f.nation)} · {f.army} {t('troops','人')} · {t('power','战力')} {f.power.toFixed(1)} · {t('military tech','军事科技')} {f.military} · {t('terrain','地形')} {f.defense?.toFixed(2)}× · {t('supply','补给')} {f.supply?.toFixed(2)}× · {t('fatigue','厌战')} {f.fatigue}% · {t('hold','固守')} {f.held?'1.15':'1.00'}× · {t('total multiplier','综合倍率')} {f.factor?.toFixed(2)}×</li>)}</ul><small>{t('¹ Remaining includes troops that retreat. Later upkeep or shortages can change the end-of-turn army. Close contest describes power balance, not randomness.','¹ 剩余包含撤退兵力；后续维护或短缺可能改变回合末军力。「接近」描述战力差距，并非随机胜率。')}</small></details>
   </article>;
  })}
  {current.exposed.length>0&&<p className="forecast-risk">{t('Empty border garrisons after settlement','推演后边境空防')}：{current.exposed.map(id=>`#${id+1}`).join('、')}</p>}
  {current.events.some(e=>['treaty-condition','treaty-default','trade-blocked'].includes(e.code))&&<p className="forecast-risk">{t('Treaty or trade disruption in this scenario. Review your agreements before confirming.','本情境会触发协议终止、违约或贸易阻断，请核对协议。')}</p>}
  {current.assumptions.length>0&&<details className="forecast-assumptions"><summary>{t('Assumed enemy movements','假设的敌方调动')} · {current.assumptions.length}</summary><ul>{current.assumptions.map((a,i)=><li key={i}>{nationName(a.nation)} · #{a.order.from!+1} → #{a.order.to!+1} · {a.order.amount} {t('troops','人')}</li>)}</ul></details>}
 </section>;
}

export function ForecastRequest({path,body,worldKey,language,auto=false}:{path:string;body:unknown;worldKey:string;language:Language;auto?:boolean}){
 const [busy,setBusy]=useState(false),[result,setResult]=useState<{value:Forecast;key:string}|null>(null),[error,setError]=useState('');
 const key=JSON.stringify({path,body,worldKey}),current=useRef(key);current.current=key;
 const t=(en:string,zh:string)=>language==='en'?en:zh;
 async function run(){const snapshot=key;setBusy(true);setError('');setResult(null);try{const value=await api<Forecast>(path,body);if(current.current===snapshot)setResult({value,key:snapshot});}catch(e){if(current.current===snapshot)setError((e as Error).message);}finally{setBusy(false);}}
 useEffect(()=>{if(auto)void run();},[auto,key]);
 return <div className="forecast-request"><button type="button" className="secondary-button full-button" disabled={busy} onClick={run}>{busy?t('Simulating scenarios…','正在推演……'):t('Preview queued plan →','推演当前队列 →')}</button>{error&&<p role="alert">{error}</p>}{result&&(result.key===key?<PlanForecast value={result.value} language={language}/>:<p>{t('Plan or world changed. Preview again.','方案或局势已变化，请重新推演。')}</p>)}</div>;
}
