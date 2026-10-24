import {Modal} from './Modal';
import {ForecastRequest} from './PlanForecast';
import {TurnReview} from './TurnReview';
import {NavalDesk} from './NavalDesk';
import {maritimeDestinations,navalTotal,seaPath} from '../game/ocean';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { animate, createScope, stagger } from 'animejs';
import {researchCost,researchFunds} from '../game/balance';
import { TurnStatus } from './TurnStatus';
import { DoctrineEditor } from './DoctrineEditor';
import { api, roomAction, type RoomView } from '../game/network';
import type { Language } from '../game/policy';
import { resourceInfo, type Scenario } from '../game/scenarios';
import { Telemetry } from './Telemetry';
import { StandingOrders } from './StandingOrders';
import { DiplomacyDesk, type TreatyIntent } from './DiplomacyDesk';
import { OrderInterpreter } from './OrderInterpreter';
import { scenarioWorld } from '../game/scenarioWorld';
import { defaultStanding, domains, tracks, type Domain, type GameState, type Order, type Plan } from '../game/sandbox';

import { StrategyMap as WorldMap } from './StrategyMap';
const noRoutes: { from: number; to: number }[] = [];
const labels = {
  political: ['Government', '政治'], military: ['Military', '军事'], diplomacy: ['Diplomacy', '外交'], economy: ['Economy', '经济'], society: ['Society', '社会'], technology: ['Technology', '科技'],
  production: ['Production', '生产'], logistics: ['Logistics', '后勤'], industry: ['Industry', '工业'], food: ['Food', '粮食'], energy: ['Energy', '能源'], research: ['Research', '科研'], treasury: ['Treasury', '国库'],
  build_fleet:['Build fleet','建造舰队'],patrol:['Patrol','巡逻'],recall:['Recall fleet','撤回舰队'],blockade:['Blockade','封锁'],open_sea:['Open passage','开放通航'],
  invest: ['Invest', '投资'], recruit: ['Recruit', '征兵'], move: ['Move', '调动'], attack: ['Attack', '进攻'], retreat: ['Retreat', '撤退'], hold: ['Hold', '固守'], edict: ['Enact', '颁布'], cancel: ['Cancel edict', '取消法令'],
  trade: ['Trade', '贸易'], nonaggression: ['Non-aggression', '互不侵犯'], ceasefire: ['Ceasefire', '停火'],
} as const;
const effects: Record<Domain, [string, string]> = {
  political: ['+6 stability / −5 treasury per turn', '每回合稳定 +6 / 国库 −5'], military: ['+10% combat power / −5 food per turn', '战力 +10% / 每回合粮食 −5'],
  diplomacy: ['+4 trust per turn', '每回合信誉 +4'], economy: ['+6 industry per turn', '每回合工业 +6'], society: ['+20 food / +3 stability per turn', '每回合粮食 +20 / 稳定 +3'], technology: ['+10 research / −5 energy per turn', '每回合科研 +10 / 能源 −5'],
};
type Props = { scenario: Scenario; room: RoomView; onRoom: (room: RoomView) => void; language: Language; onExit: () => void };
type Tab = 'orders' | 'doctrine' | 'diplomacy' | 'report' | 'scores';

/** @requires A catalog scenario. @ensures Every nation owns an independent draft; only native validation can advance a turn. */
export function Sandbox({ scenario, room, onRoom, language, onExit }: Props) {
  const nation = room.nation;
  const [localPlan, setLocalPlan] = useState<Plan>(() => room.session.plans[nation]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const roomRef = useRef(room); roomRef.current = room;
  const planRef = useRef(localPlan); planRef.current = localPlan;
  const dirtyRef = useRef(false);
  const editVersion = useRef(0);
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  const failed = useRef(false);
  const saveTimer = useRef<number | undefined>(undefined);
  const turnRef = useRef(room.session.state.turn);
  const session = { ...room.session, plans: room.session.plans.map((p, i) => i === nation ? { ...localPlan, submitted: dirty ? false : p.submitted } : p) };

  const [tab, setTab] = useState<Tab>('orders');
  const [orderCategory, setOrderCategory] = useState<'military' | 'development' | 'edicts' | 'programs' | 'navy'>('military');
  const [selected, setSelected] = useState(() => scenarioWorld(scenario).regions.find(r => r.nation === nation)!.id);
  const [selectedSea,setSelectedSea]=useState(-1);
  const [history, setHistory] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [phase,setPhase]=useState<'submitting'|'resolving'|null>(null);
  const [waitingHidden,setWaitingHidden]=useState(false);
  const [message, setMessage] = useState('');
  const [previewOrders,setPreviewOrders]=useState<Order[]|null>(null);
  const [orderFeedback, setOrderFeedback] = useState<Order | null>(null);

  const [amount, setAmount] = useState(5);
  const [target, setTarget] = useState(-1);
  const root = useRef<HTMLDivElement>(null);
  const state = history < 0 ? session.state : session.history[history];
  const current = state.nations[nation], draft = session.plans[nation];
  const selectedRegion = state.regions[selected];
  const readOnly = history >= 0 || session.ended || !!room.reviewReady;
  const t = (en: string, zh: string) => language === 'en' ? en : zh;
  const label = (key: string) => key in labels ? labels[key as keyof typeof labels][language === 'en' ? 0 : 1] : key;
  const baseWorld = useMemo(() => scenarioWorld(scenario), [scenario]);
  const ownership = useMemo(() => state.regions.map(r => r.owner), [state.turn, history, baseWorld]);
  const garrisons = useMemo(() => state.regions.map(r => r.army), [state.turn, history, baseWorld]);
  const routes = useMemo(() => state.regions.flatMap(r => r.sea.filter(to => to > r.id).map(to => ({ from: r.id, to }))), [state.turn, history, baseWorld]);
  const orderRoutes = useMemo(() => (previewOrders??draft.orders).filter(o => ['move','attack','retreat'].includes(o.kind) && o.to !== undefined && o.from !== undefined).map(o => ({ from: o.from!, to: o.to! })), [JSON.stringify(draft.orders),previewOrders]);
  const ready = session.plans.filter(p => p.submitted).length;
  const total = (s: GameState, i: number) => Object.values(s.nations[i].score).reduce((a, b) => a + b, 0);

  useLayoutEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let scope: ReturnType<typeof createScope> | undefined;
    const start = () => {
      scope?.revert();
      if (!root.current) return;
      if (preference.matches) { root.current.dataset.motion = 'reduced'; return; }
      root.current.dataset.motion = 'entering';
      scope = createScope({ root }).add(() => {
        animate('.sandbox-content', { opacity: [.5, 1], duration: 220, ease: 'out(3)' });
        if (root.current) root.current.dataset.motion = 'ready';
        animate('.score-fill', { scaleX: [0, 1], duration: 650, delay: stagger(50), ease: 'out(3)' });
      });
    };
    start(); preference.addEventListener('change', start);
    return () => { scope?.revert(); preference.removeEventListener('change', start); };
  }, [tab, nation, state.turn, history, session.ended]);

  useEffect(() => {
    if (turnRef.current !== room.session.state.turn) {
      turnRef.current = room.session.state.turn; dirtyRef.current = false; failed.current = false;
      setDirty(false); setLocalPlan(room.session.plans[nation]); setHistory(-1); setTab('report'); setOrderFeedback(null); setMessage('');
    } else if (!dirtyRef.current) setLocalPlan(room.session.plans[nation]);
  }, [room.revision]);
  function accept(value: RoomView) {
    if (value.revision >= roomRef.current.revision) { roomRef.current = value; onRoom(value); }
  }
  function writePlan(confirm = false) {
    if (confirm) window.clearTimeout(saveTimer.current);
    const operation = writes.current.catch(() => {}).then(async () => {
      if (!confirm && !dirtyRef.current) return roomRef.current;
      const version = editVersion.current, snapshot = structuredClone(planRef.current), currentRoom = roomRef.current;
      setSaving(true);
      try {
        const result = await roomAction(currentRoom.code, confirm ? 'confirm' : 'plan', { turn: currentRoom.session.state.turn, draftRevision: currentRoom.draftRevision, plan: snapshot });
        accept(result);
        if (version === editVersion.current) { dirtyRef.current = false; setDirty(false); setLocalPlan(result.session.plans[nation]); }
        failed.current = false;
        return result;
      } catch (error) { failed.current = true; setMessage(error instanceof Error ? error.message : 'Could not save draft'); throw error; }
      finally { setSaving(false); }
    });
    writes.current = operation; return operation;
  }
  useEffect(() => {
    if (!dirty || failed.current) return;
    const timer = window.setTimeout(() => { void writePlan().catch(() => {}); }, room.session.plans[nation].submitted ? 0 : 450);
    saveTimer.current = timer;
    return () => clearTimeout(timer);
  }, [localPlan, dirty]);
  useEffect(() => {
    const protectDraft = (event: BeforeUnloadEvent) => { if (dirtyRef.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', protectDraft);
    return () => window.removeEventListener('beforeunload', protectDraft);
  }, []);
  function editPlan(change: Partial<Plan>) {
    const next = { ...planRef.current, ...change, submitted: false };
    planRef.current = next; editVersion.current++; dirtyRef.current = true; failed.current = false;
    setLocalPlan(next); setDirty(true); setMessage('');
  }
  function addOrder(order: Order) { setOrderFeedback(null);
    const orders = planRef.current.orders;
    const pool=(o:Order)=>['patrol','recall'].includes(o.kind)?'fleet':['blockade','open_sea'].includes(o.kind)?'sea-policy':'army';
    const duplicate = orders.some(existing => order.kind==='build_fleet'?existing.kind==='build_fleet':order.from !== undefined ? existing.from === order.from && pool(existing)===pool(order)
      : order.kind === 'research' ? existing.kind === 'research' && existing.field === order.field
      : (order.kind === 'edict' || order.kind === 'cancel') && (existing.kind === 'edict' || existing.kind === 'cancel') && existing.field === order.field);
    if (duplicate) { setMessage(t('An order for this region or policy is already queued. Remove it from the queue before replacing it.', '此地区或政策已有待执行指令，请先从队列删除原指令再修改。')); return; }
    if (order.amount !== undefined && (!Number.isInteger(order.amount) || order.amount < 1 || order.amount > 10000)) {
      setMessage(t('Enter a whole number between 1 and 10,000.', '请输入 1 至 10,000 的整数。')); return;
    }
    if (order.from !== undefined && ['move', 'retreat', 'attack'].includes(order.kind) && order.amount! > state.regions[order.from].army) {
      setMessage(t('Strength cannot exceed the current garrison.', '出动兵力不能超过当前驻军。')); return;
    }
    editPlan({ orders: [...orders, order] }); setOrderFeedback(order);
  }
  async function treatyChange(payload: TreatyIntent) {
    setBusy(true);
    try {
      await writes.current.catch(() => {});
      if (dirtyRef.current) await writePlan();
      accept(await roomAction(room.code, 'treaty', { ...payload, turn: roomRef.current.session.state.turn }));
      return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Treaty action failed'); return false; }
    finally { setBusy(false); setPhase(null); }
  }
  async function submit() {
    setPhase('submitting');setWaitingHidden(false);
    setBusy(true); setMessage('');
    try { await writePlan(true); setMessage(t('Confirmed. Waiting for the other players.', '已确认，等待其他玩家。')); }
    catch { /* The draft and error remain visible. */ }
    finally { setBusy(false); setPhase(null); }
  }
  async function resolve() {
    setPhase('resolving');
    setBusy(true); setMessage('');
    try { accept(await roomAction(room.code, 'resolve', { turn: room.session.state.turn })); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Settlement failed'); }
    finally { setBusy(false); setPhase(null); }
  }
  async function save(exit = false) {
    setBusy(true);
    try { await writes.current.catch(() => {}); if (dirtyRef.current) await writePlan(); setMessage(t('Draft saved to the room server.', '草稿已保存至房间服务器。')); if (exit) onExit(); }
    catch { /* Failed saves must not navigate away. */ }
    finally { setBusy(false); setPhase(null); }
  }
  async function reload() {
    setBusy(true);
    try {
      await writes.current.catch(() => {});
      const value = await api<RoomView>(`/rooms/${room.code}`);
      dirtyRef.current = false; failed.current = false; setDirty(false); setLocalPlan(value.session.plans[nation]); accept(value); setMessage(''); setOrderFeedback(null);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not refresh'); }
    finally { setBusy(false); setPhase(null); }
  }
  async function endMatch() {
    setBusy(true);
    try { accept(await roomAction(room.code, 'end', { turn: room.session.state.turn })); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not end match'); }
    finally { setBusy(false); setPhase(null); }
  }
  function describe(order: Order) {
    if(['build_fleet','patrol','recall','blockade','open_sea'].includes(order.kind))return `${label(order.kind)} ${order.from===undefined?'':order.from<0?t('Reserve','预备'):String.fromCharCode(65+order.from)}${order.to===undefined?'':` → ${order.kind==='blockade'?scenario.nations[order.to].name[language]:String.fromCharCode(65+order.to)}`}${order.amount?` · ${order.amount}`:''}`;
    return `${label(order.kind)} ${order.field ? label(order.field) : ''}${order.from !== undefined ? ` #${order.from + 1}` : ''}${order.to !== undefined ? ` → #${order.to + 1}` : ''}${order.amount ? ` · ${order.amount}` : ''}`;
  }

  return <div className="sandbox" ref={root} aria-busy={busy}>
    {phase&&<div className="turn-overlay"><TurnStatus phase={phase} ready={ready} confirmed={session.plans.map(p=>p.submitted)} language={language}/></div>}
    {room.reviewReady&&!room.reviewReady[nation]&&session.state.report&&<TurnReview state={session.state} nation={nation} nations={scenario.nations} language={language} ready={room.reviewReady} acknowledged={room.reviewReady[nation]} busy={busy} onContinue={async()=>{setBusy(true);try{accept(await roomAction(room.code,'continue',{turn:session.state.turn}));}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}}/>}
    {!phase&&room.reviewReady&&room.reviewReady[nation]&&<Modal title={t('Waiting for battle reviews','等待战区确认')} dismissible={false} onClose={()=>{}} className="turn-wait-modal"><TurnStatus phase="waiting" reviewWaiting ready={room.reviewReady.filter(Boolean).length} confirmed={room.reviewReady} language={language}/></Modal>}
    {!phase&&draft.submitted&&ready<5&&!waitingHidden&&!readOnly&&<div className="turn-overlay"><TurnStatus phase="waiting" ready={ready} confirmed={session.plans.map(p=>p.submitted)} language={language} onClose={()=>setWaitingHidden(true)}/></div>}

    <div className="sandbox-heading"><div><span className="eyebrow">{scenario.name[language]} / {room.code}</span><h1>{session.ended ? t('FINAL STANDINGS', '最终排名') : t('WORLD OPERATIONS', '世界行动')}<span>{t('TURN', '回合')} {String(state.turn).padStart(2, '0')}</span></h1></div><div className="sandbox-tools"><span className="draft-status" role="status">{saving ? t('Saving…', '保存中……') : dirty ? t('Unsaved', '未保存') : t('Synced', '已同步')}</span><button disabled={busy} onClick={() => save()}>{t('Save', '保存')}</button><button disabled={busy} onClick={reload}>{t('Reload saved draft', '恢复服务器草稿')}</button><button disabled={busy} onClick={() => save(true)}>{t('Save & return', '保存并返回')}</button></div></div>
    <div className="country-switcher" aria-label={t('Players', '玩家')}>{scenario.nations.map((n, i) => <div key={n.id} className={`country-seat ${nation === i ? 'mine' : ''}`} style={{ borderTopColor: n.color }}><span className="country-number">0{i + 1}</span><span><strong>{n.name[language]}</strong><small>{room.seats[i]?.name}{i === nation ? t(' · You', ' · 你') : ''}</small><small>{session.plans[i].submitted ? t('Confirmed', '已确认') : t('Planning', '规划中')}</small></span><span className="ready-mark">{session.plans[i].submitted ? '✓' : '·'}</span></div>)}</div>
    <div className="sandbox-status"><span>{t('Your country: ', '你的国家：') + scenario.nations[nation].name[language]}</span><label>{t('History', '历史')} <select aria-label={t('History', '历史')} disabled={busy} value={history} onChange={e => setHistory(Number(e.target.value))}><option value={-1}>{t('Current', '当前')}</option>{session.history.map((s, i) => <option value={i} key={s.turn}>{t('Before turn', '回合开始前')} {s.turn}</option>)}</select></label><span>{history >= 0 ? t('Read-only snapshot', '只读快照') : `${ready} / 5 ${t('confirmed', '已确认')}`}</span></div>
    <div className="operations-layout"><div className="theatre-column"><section className="map-panel operations-map"><div className="panel-bar"><span>{t('THEATRE OVERVIEW', '战区总览')}</span><span>{t('LIVE POSITIONS', '当前部署')}</span></div><WorldMap seed={baseWorld.seed} terrain={baseWorld} nations={scenario.nations} showArmies language={language} selected={selected} relief={.8} onSelect={id => { setSelected(id); setTarget(-1); }} activeNation={nation} capitals={state.regions.map(r=>r.capital)} ownership={ownership} garrisons={garrisons} ocean={state.ocean} selectedSea={selectedSea} onSelectSea={id=>{setSelectedSea(id);setTab('orders');setOrderCategory('navy');}} routes={routes} orderRoutes={history < 0 ? orderRoutes : noRoutes} monochrome /><div className="sector-summary"><div><span>{t('SECTOR', '地区')} {String(selected + 1).padStart(2, '0')}</span><strong>{scenario.nations[selectedRegion.owner].name[language]}</strong></div><div><span>{t('GARRISON', '驻军')}</span><strong>{selectedRegion.army}</strong></div><div><span>{t('ELEVATION', '海拔')}</span><strong>{baseWorld.regions[selected].elevation}m</strong></div></div><div className="map-legend"><span>◇ {t('Capital', '首都')}</span><span>— {t('Sea route', '海路')}</span><span className="accent">→ {previewOrders?t('Preview only', '推演路线，尚未加入队列'):t('Planned order', '计划指令')}</span></div></section>
      <Telemetry state={state} history={session.history} nation={nation} language={language} />
    </div><section className="command-panel sandbox-panel"><div className="sandbox-tabs" role="tablist">{(['orders', 'doctrine', 'diplomacy', 'report', 'scores'] as Tab[]).map(key => <button role="tab" id={`sandbox-tab-${key}`} aria-controls="sandbox-panel" aria-selected={tab === key} key={key} onClick={() => setTab(key)}>{({ orders: t('Orders', '行动'), doctrine: t('Doctrine', '国策'), diplomacy: t('Treaties', '条约'), report: t('Report', '战报'), scores: t('Goals', '目标') })[key]}</button>)}</div>
    <div className="sandbox-content" id="sandbox-panel" role="tabpanel" aria-labelledby={`sandbox-tab-${tab}`}>
    {tab === 'orders' && <><div className="section-heading"><h2>{t('This turn.', '当回合行动。')}</h2><span>{t('OVERRIDES DOCTRINE', '优先于长期国策')}</span></div><fieldset disabled={readOnly || busy}><details className="strategy-notes"><summary>{t('Natural-language orders', '自然语言指令')}</summary><label className="strategy-label" htmlFor="sandbox-strategy">{t('Current-turn instructions', '当回合指令')}</label><textarea id="sandbox-strategy" maxLength={4000} value={draft.strategy} onChange={e => editPlan({ strategy: e.target.value })} placeholder={t('Protect the capital. Reinforce the western border…', '保卫首都，增援西部边境……')} /><OrderInterpreter onPreview={setPreviewOrders} room={room} language={language} text={draft.strategy} before={() => writePlan()} apply={orders => { editPlan({orders}); setOrderFeedback(null); }}/></details>
      <ol className="order-steps"><li><b>1</b>{t('Queue actions', '选择行动')}</li><li><b>2</b>{t('Confirm orders', '确认指令')}</li><li><b>3</b>{t('All 5 → resolve', '五人确认 → 结算')}</li></ol>
      <div className="command-categories" role="group" aria-label={t('Action category', '行动分类')}>
        <button aria-pressed={orderCategory === 'military'} onClick={() => setOrderCategory('military')}><span aria-hidden="true">⚑</span>{t('Military', '军事')}</button>
        <button aria-pressed={orderCategory === 'navy'} onClick={()=>setOrderCategory('navy')}><span aria-hidden="true">⚓</span>{t('Maritime','海洋')}</button>
        <button aria-pressed={orderCategory === 'development'} onClick={() => setOrderCategory('development')}><span aria-hidden="true">⌬</span>{t('Development & research', '发展与科研')}</button>
        <button aria-pressed={orderCategory === 'edicts'} onClick={() => setOrderCategory('edicts')}><span aria-hidden="true">▤</span>{t('Decrees', '法令')}</button>
        <button aria-pressed={orderCategory === 'programs'} onClick={() => setOrderCategory('programs')}><span aria-hidden="true">◈</span>{t('National programs', '持续国政')}</button>
      </div>
      {orderCategory === 'navy' && <NavalDesk state={state} nation={nation} scenario={scenario} language={language} selected={Math.max(0,selectedSea)} onSelect={setSelectedSea} onOrder={addOrder}/>}
      {orderCategory === 'military' && <><StandingOrders section="military" value={draft.standing ?? current.standing ?? defaultStanding(scenario.nations[nation].resources.army)} onChange={standing => editPlan({standing})} language={language} regions={state.regions} nation={nation}/><section className="order-section command-section"><h3>{t('Regional command', '地区指挥')} <span>#{selected + 1} · {selectedRegion.army} {t('stationed', '驻军')}</span></h3>{selectedRegion.owner === nation ? <><p>{t('Select your region on the map, enter strength, then choose an action. Recruitment adds troops here and needs no destination.', '在地图上选本国地区，填写兵力后选择行动。征兵会在本地区增加驻军，无需选择目的地。')}</p><div className="form-pair"><label>{t('Strength', '兵力')}<input aria-label={t('Strength', '兵力')} type="number" min={1} max={10000} value={amount} onChange={e => setAmount(Number(e.target.value))} /></label><label>{t('Destination', '目的地')}<select aria-label={t('Destination', '目的地')} value={target} onChange={e => setTarget(Number(e.target.value))}><option value={-1}>{t('Select border', '选择相邻地区')}</option>{maritimeDestinations(state,selected,nation).map(id => <option key={id} value={id}>#{id + 1} · {scenario.nations[state.regions[id].owner].name[language]}{!selectedRegion.neighbors.includes(id) ? t(' / Sea', ' / 海路') : ''}</option>)}</select></label></div>{Number.isInteger(amount) && amount > 0 && amount <= 10000 && <p className="recruit-cost">{t('Recruitment cost', '本次征兵消耗')}：{amount * 2} {t('funds', '国库')} · {amount} {t('food', '粮食')} · {Math.ceil(amount / 5)} {t('population', '人口')}</p>}{target>=0&&!selectedRegion.neighbors.includes(target)&&<p>{t('Sea transport','海运')}：{Math.ceil(amount/5)} {t('funds','国库')} · {Math.ceil(amount/10)+(seaPath(state,selected,target,nation)?.length??0)} {t('energy','能源')} · {t('Total turn capacity','全回合总运力')} {navalTotal(state,nation)*3+current.tech.logistics*5}</p>}<div className="action-grid"><button onClick={() => addOrder({ kind: 'hold', from: selected })}>{t('Hold', '固守')}</button><button onClick={() => addOrder({ kind: 'recruit', from: selected, amount })}>{t('Recruit', '征兵')}</button><button disabled={target < 0 || state.regions[target].owner !== nation} onClick={() => addOrder({ kind: 'move', from: selected, to: target, amount })}>{t('Move', '调动')}</button><button disabled={target < 0 || state.regions[target].owner !== nation} onClick={() => addOrder({ kind: 'retreat', from: selected, to: target, amount })}>{t('Retreat', '撤退')}</button><button disabled={target < 0 || state.regions[target].owner === nation} onClick={() => addOrder({ kind: 'attack', from: selected, to: target, amount })}>{t('Attack', '进攻')} ↗</button></div><p className="connection-note">{t('One army order per source. Recruitment: 2 funds + 1 food per strength; 1 population per 5.', '每个来源地区每回合一道军事指令。每兵力征募费用：国库 2、粮食 1；每 5 兵力消耗 1 人口。')}</p></> : <p>{t('Select one of your regions to give orders.', '选择本国地区下达军事指令。')}</p>}</section></>}
      {orderCategory === 'development' && <section className="order-section command-section"><h3>{t('Investment & upgrades', '投资与升级')}</h3><p>{t('Choose a resource investment or upgrade a technology below. Each click adds an order to your queue.', '点击资源卡投资，或选择下方科技进行升级。每次点击会加入一条待执行指令。')}</p><div className="development-grid">{(['industry', 'food', 'energy', 'research'] as const).map(field => <button key={field} onClick={() => addOrder({ kind: 'invest', field, amount: 20 })}><strong>{label(field)}</strong><span>{t('20 funds', '20 国库')} → +{field === 'industry' ? 5 : field === 'research' ? 10 : 20}</span></button>)}</div><p className="connection-note">{t('Current stocks (before queued actions)', '当前资源（未扣除队列消耗）')}：{current.resources.treasury} {t('funds', '国库')} · {current.resources.research} {t('research', '科研')}<br />{t('Short on research? Invest in Research above before adding an upgrade. Orders spend resources in queue order.', '科研不足？先点击上方「科研」投资，再添加科技升级。资源按队列顺序支出。')}</p><div className="tech-list">{tracks.map(track => <div key={track}><span><strong>{label(track)} <em>{current.tech[track]} / 3</em></strong><small>{track === 'military' ? t('+15% strength / level', '每级战力 +15%') : track === 'production' ? t('Higher resource output', '提高资源产出') : t('Lower upkeep & sea penalties', '降低维护与渡海惩罚')}</small></span><button disabled={current.tech[track] >= 3} onClick={() => addOrder({ kind: 'research', field: track })}>{t('Research', '研究')}<small>{researchCost(current.tech[track])} {t('research', '科研')} + {researchFunds} {t('funds', '国库')}</small></button></div>)}</div><p className="connection-note">{t('Research bonuses begin next turn.', '科技加成从下一回合开始生效。')}</p></section>}
      {orderCategory === 'edicts' && <section className="order-section command-section"><h3>{t('Six instruments of power', '六类国家法令')}</h3><p className="connection-note">{t('Each decree costs 20 funds and lasts 3 settlements.', '每道法令消耗 20 国库，持续 3 次结算。')}</p><div className="edict-list">{domains.map(domain => <div key={domain}><strong>{label(domain)}</strong><p>{effects[domain][language === 'en' ? 0 : 1]}</p><div><button onClick={() => addOrder({ kind: 'edict', field: domain })}>{current.edicts.some(e => e.kind === domain) ? t('Renew', '续期') : t('Enact', '颁布')}</button>{current.edicts.some(e => e.kind === domain) && <button onClick={() => addOrder({ kind: 'cancel', field: domain })}>{t('Cancel', '取消')} ({current.edicts.find(e => e.kind === domain)!.remaining})</button>}</div></div>)}</div></section>}
      {orderCategory === 'programs' && <StandingOrders section="programs" value={draft.standing ?? current.standing ?? defaultStanding(scenario.nations[nation].resources.army)} onChange={standing => editPlan({standing})} language={language} regions={state.regions} nation={nation}/>}
      <section className="queued-orders"><h3>{t('Command queue', '待执行指令')} <span>{draft.orders.length}</span></h3>{draft.orders.length ? draft.orders.map((o, i) => <div key={i}><span>{describe(o)}</span><button aria-label={`${t('Remove order', '移除指令')} ${i + 1}`} onClick={() => { editPlan({ orders: draft.orders.filter((_, index) => index !== i) }); setOrderFeedback(null); }}>×</button></div>) : <p>{t('No orders. Confirm to hold existing positions.', '暂无指令。确认后维持现有部署。')}</p>}</section>
      <ForecastRequest path={`/rooms/${room.code}/forecast`} body={{turn:state.turn,plan:draft}} worldKey={JSON.stringify(state)} language={language}/>{draft.submitted && <p className="submission-card">✓ {t('Confirmed. Any edit requires confirmation again.', '已确认。修改后需要重新确认。')}</p>}</fieldset></>}
    {tab === 'doctrine' && <><div className="section-heading"><h2>{t('Long-term doctrine.', '长期国策。')}</h2></div><p className="connection-note">{t('Independent for each country. Persists between turns; operational orders take priority. Use the natural-language orders panel to request a reviewed action draft.', '各国独立，跨回合沿用；冲突时以当回合指令为准。可在自然语言指令区请求 AI 拟定行动草案。')}</p><fieldset disabled={readOnly || busy}><DoctrineEditor key={nation} language={language} doctrine={draft.doctrine} onChange={doctrine => editPlan({ doctrine })} /></fieldset></>}
    {tab === 'diplomacy' && <DiplomacyDesk room={{...room,session:{...room.session,state}}} scenario={scenario} language={language} readOnly={readOnly} busy={busy} onAction={treatyChange}/>}
    {tab === 'report' && <><h2>{t('After-action report.', '回合结算报告。')}</h2>{state.report ? <><p>{t('Resolved turn', '已结算回合')} {state.report.turn}</p><div className="report-entry"><h3>{t('National accounts', '本国账目')}</h3>{Object.entries(resourceInfo).map(([key, info]) => { const k = key as keyof typeof current.resources, record = state.report!.ledger[nation]; return <div className="account-line" key={k}><span>{info.name[language]}</span><span>{record.before[k]} → <strong>{record.after[k]}</strong></span></div>; })}</div>{state.report.battles.map(b => <article className="report-entry" key={b.region}><h3>{t('Sector', '地区')} #{b.region + 1}</h3><p>{t('Held by', '结算控制方')} {scenario.nations[b.winner].name[language]} · {b.survivors} {t('survivors', '剩余兵力')}</p>{b.forces.map(f => <div className="account-line" key={f.nation}><span>{scenario.nations[f.nation].name[language]}</span><span>{f.army} ⚑ / {f.power} {t('power', '战力')}</span></div>)}</article>)}{state.report.events.map((event, i) => <p className="report-entry" key={i}>{scenario.nations[event.nation].name[language]} · {({ 'fleet-built':t('Fleet built; deploy next turn.','舰队建成，下回合可部署。'),'fleet-patrol':t('Fleet patrol deployed.','舰队已部署巡逻。'),'fleet-recalled':t('Fleet returned to reserve.','舰队已撤回预备。'),'sea-control':t('Sea control secured.','取得海洋控制权。'),'sea-contested':t('Sea control contested.','海域进入争夺状态。'),'sea-open':t('Sea passage opened.','海域开放通航。'),'sea-blockade':t('Targeted blockade imposed.','已实施针对性封锁。'),'trade-blocked':t('Trade blocked: no transfer, no trust penalty.','贸易受封锁：暂停付款，不扣信誉。'),'shortage': t('Resource shortage; stability and army losses.', '资源短缺，稳定与兵力受损。'), 'treaty-active': t('Agreement activated.', '协议生效。'), 'treaty-unfulfilled': t('Agreement could not be fulfilled this turn.', '本回合无法履约。'), 'treaty-expired': t('Agreement expired.', '协议到期。'), 'capture': t('Captured a sector.', '占领地区。'), 'auto-recruit': t(`Automatic recruitment: ${event.amount} into #${(event.target ?? 0)+1}${event.reason === 'limited' ? ' (resource/budget limit)' : ''}.`, `自动征兵：${event.amount} 兵力补入 #${(event.target ?? 0)+1}${event.reason === 'limited' ? '（资源或预算受限）' : ''}。`), 'program-funded': `${label(event.reason ?? '')} · ${event.amount} ${t('funds invested','国库已投入')}`, 'program-reduced': t('National programs reduced to protect reserves.', '国政投入已缩减以保留储备。'), 'treaty-condition': t(`Agreement #${event.treaty} ended by its attack condition.`, `协议 #${event.treaty} 因进攻条件触发而终止。`), 'treaty-payment': t(`Agreement #${event.treaty}: paid ${event.amount} ${label(event.reason ?? '')}.`, `协议 #${event.treaty}：支付 ${event.amount} ${label(event.reason ?? '')}。`), 'treaty-default': t(`Agreement #${event.treaty} defaulted: global trust −8.`, `协议 #${event.treaty} 付款违约：全球信誉 −8。`), 'treaty-broken': t(`Tore up agreement #${event.treaty}: global trust −15.`, `撕毁协议 #${event.treaty}：全球信誉 −15。`) } as Record<string, string>)[event.code] ?? event.code}</p>)}</> : <p>{t('Confirm all five countries, then resolve the turn to see the accounts and battles.', '五国确认后统一结算，即可查看账目与战斗结果。')}</p>}</>}
    {tab === 'scores' && <><h2>{session.ended ? t('The final balance.', '最终胜负。') : t('Paths to victory.', '胜利路径。')}</h2><p>{t('Four tracks, 100 points each. Total score decides victory; ties share the rank.', '四条路线各 100 分，总分决定胜负，同分并列。')}</p>{[0, 1, 2, 3, 4].sort((a, b) => total(state, b) - total(state, a)).map(i => <div className="score-row" key={i}><header><strong>{scenario.nations[i].name[language]}</strong><span>{total(state, i)} / 400</span></header><div className="score-track"><div className="score-fill" style={{ width: `${total(state, i) / 4}%` }} /></div><div className="score-breakdown">{Object.entries(state.nations[i].score).map(([key, value]) => <span key={key}>{label(key)} <strong>{value}</strong></span>)}</div></div>)}<details className="order-section"><summary>{t('Scoring rules', '计分规则')}</summary><p>{t('Military: 4 per land sector + 2 per controlled sea. Economy: industry / 3 + treasury / 40. Technology: completed levels × 100 / 9. Diplomacy: trust / 2 + 12 per distinct fulfilled treaty partner in the last turn. Round down; cap each track at 100. Countries without territory score zero. Scores are a snapshot, not farmable cumulative points.', '军事：陆地地区 ×4 + 控制海域 ×2。经济：工业÷3 + 国库÷40。科技：完成科技等级总数 ×100÷9。外交：信誉÷2 + 上回合实际履约的不同伙伴数 ×12。各项向下取整、上限100。失去全部领土的国家各项为0。分数按当前状态计算，不累积刷分。')}</p></details><div className="sandbox-ending"><button disabled={!room.host || busy || readOnly || state.turn <= 1 || ready > 0 || session.plans.some(p => p.orders.length > 0)} onClick={endMatch}>{t('End match & score', '结束对局并计分')}</button><p className="connection-note">{t('Finish after a settled turn, before entering new orders.', '请在一次回合结算后、新指令制定前结束对局。')}</p></div></>}
    </div><div className="settlement-bar">{tab === 'orders' && orderFeedback && <p className="order-feedback" role="status">{describe(orderFeedback)} · {t('Queued for settlement', '已加入队列，结算时生效')}</p>}<span>{ready}/5 {t('confirmed', '已确认')} · {draft.orders.length} {t('queued orders', '条待执行指令')}</span><button className="primary-button confirm-orders" disabled={readOnly || busy} onClick={submit}>{draft.submitted ? t('Reconfirm orders', '重新确认指令') : t('Confirm country orders', '确认本国指令')} →</button><button className="primary-button" disabled={!room.host || ready !== 5 || readOnly || busy || saving || dirty} onClick={resolve}>{busy ? t('Checking…', '处理中……') : t('Resolve turn', '统一结算')} →</button></div></section></div>
    {message && <div className="sandbox-message" role="status"><span>{message}</span><button aria-label={t('Dismiss message', '关闭消息')} onClick={() => setMessage('')}>×</button></div>}
  </div>;
}
