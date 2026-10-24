import {PlanForecast} from './PlanForecast';
import type {PlanForecast as Forecast} from '../game/forecast';
import { useEffect, useRef, useState } from 'react';
import { api, type RoomView } from '../game/network';
import {navalKinds} from '../game/ocean';
import {scenarios} from '../game/scenarios';
import type { Order } from '../game/sandbox';
import type { Language } from '../game/policy';

export function OrderInterpreter({ room, language, text, before, apply, onPreview }: { room: RoomView; language: Language; text: string; before: () => Promise<unknown>; apply: (orders: Order[]) => void; onPreview:(orders:Order[]|null)=>void }) {
  const [busy,setBusy]=useState(false), [error,setError]=useState('');
  const [result,setResult]=useState<{explanation:string;unsupported:string[];orders:Order[];turn:number;draftRevision:number;forecast?:Forecast;text:string;world:string} | null>(null);
  const current=useRef(room);current.current=room;
  const world=JSON.stringify(room.session.state);
  const t=(en:string,zh:string)=>language === 'en' ? en : zh;
  const stale=result && (result.turn !== room.session.state.turn || result.draftRevision !== room.draftRevision || result.text !== text || result.world !== world);
  useEffect(()=>{onPreview(result&&!stale&&!result.unsupported.length?result.orders:null);return()=>onPreview(null);},[result,stale,onPreview]);
  async function interpret() {
    setBusy(true);setError('');setResult(null);
    try { await before(); const r=current.current; const value=await api<Omit<NonNullable<typeof result>,'text'|'world'>>(`/rooms/${r.code}/interpret`,{mode:'orders',text,turn:r.session.state.turn,language});setResult({...value,text,world:JSON.stringify(r.session.state)}); }
    catch(e) {setError(e instanceof Error ? e.message : 'AI unavailable');} finally {setBusy(false);}
  }
  const describe=(o:Order)=>{
    const naval=(navalKinds as readonly string[]).includes(o.kind),names:Record<string,[string,string]>={build_fleet:['Build fleet','建造舰队'],patrol:['Patrol','巡逻'],recall:['Recall fleet','撤回舰队'],blockade:['Blockade','封锁'],open_sea:['Open passage','开放通航']};
    const from=o.from===undefined?'':o.from===-1?t('Reserve','预备舰队'):naval?String.fromCharCode(65+o.from):`#${o.from+1}`;
    const to=o.to===undefined?'':o.kind==='blockade'?scenarios.find(s=>s.id===room.scenario)?.nations[o.to]?.name[language]??String(o.to):naval?String.fromCharCode(65+o.to):`#${o.to+1}`;
    return `${names[o.kind]?t(...names[o.kind]):o.kind} ${o.field??''} ${from}${to?` → ${to}`:''}${o.amount?` · ${o.amount}`:''}`;
  };
  return <div className="order-interpreter"><button className="secondary-button full-button" disabled={busy || !text.trim()} onClick={interpret}>{busy ? t('Interpreting…','解析中……') : t('AI: draft executable orders','AI：拟定可执行指令')}</button>
    {error && <p role="alert">{error}</p>}{result && <div className="ai-explanation"><p>{result.explanation}</p>{result.unsupported.map((s,i)=><p key={i}>{s}</p>)}<ul>{result.orders.map((o,i)=><li key={i}>{describe(o)}</li>)}</ul>{!stale&&result.forecast&&<PlanForecast value={result.forecast} language={language}/>} {stale && <p>{t('Draft changed. Interpret again before applying.','草稿已变化，请重新解析。')}</p>}<button disabled={!!stale || result.unsupported.length>0 || busy} onClick={()=>{apply(result.orders);setResult(null);}}>{t('Replace queue with reviewed orders','用已核对指令替换队列')}</button></div>}
    <p className="connection-note">{t('AI proposes only. Review before replacing the queue; final confirmation and native validation are still required.', 'AI 只拟定草案。核对后才替换队列，仍需确认指令并通过规则校验。')}</p>
  </div>;
}
