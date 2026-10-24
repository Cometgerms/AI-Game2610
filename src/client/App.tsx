import { useEffect, useMemo, useRef, useState } from 'react';
import { Diagnostics } from './components/Diagnostics';
import { Modal } from './components/Modal';
import { Practice } from './components/Practice';
import { SignalMark } from './components/SignalMark';
import { useEntrance } from './useEntrance';
import { DoctrineEditor } from './components/DoctrineEditor';
import { createPolicy, isPolicy, migratePolicy, type Language, type Policy } from './game/policy';
import { Sandbox } from './components/Sandbox';
import { Login } from './components/Login';
import { AmbientGlow } from './components/AmbientGlow';
import { api, ApiError, rememberSession, restoreSession, roomAction, type Player, type RoomSummary, type RoomView } from './game/network';
import { scenarios, type Scenario } from './game/scenarios';
import { scenarioWorld } from './game/scenarioWorld';
import { polygonArea } from './game/world';


import { StrategyMap as WorldMap } from './components/StrategyMap';
const STORAGE_KEY = 'sovereign.policy.v2';
type Page = 'home' | 'rooms' | 'create' | 'lobby' | 'game' | 'practice';

/** @requires Browser storage may be unavailable. @ensures Invalid drafts never become game state. */
function loadPolicy(): Policy {
  try { const saved = migratePolicy(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem('sovereign.policy.v1') ?? 'null')); if (saved) return saved; } catch { /* The guest editor remains usable without storage. */ }
  return createPolicy();
}
/** @requires A reachable game host. @ensures Room views follow the authenticated player's server-owned seat. */
export function App() {
  const [language, setLanguage] = useState<Language>('en');
  const [policy, setPolicy] = useState<Policy>(loadPolicy);
  const [page, setPage] = useState<Page>('home');
  const [help, setHelp] = useState(false);
  const [practicePrompt,setPracticePrompt]=useState(false);
  const [account, setAccount] = useState(false);
  const [player, setPlayer] = useState<Player | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [lan, setLan] = useState<string[]>([]);
  const currentRoom = useRef<RoomView | null>(null);

  const [notice, setNotice] = useState('');
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [roomCode, setRoomCode] = useState('');
  const [password, setPassword] = useState('');
  const [roomName, setRoomName] = useState('');
  const [activeRoom, setActiveRoom] = useState<RoomView | null>(null);
  currentRoom.current = activeRoom;
  const [scenarioId, setScenarioId] = useState(scenarios[0].id);
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEntrance(root, player ? page : 'login', 0);
  const t = (en: string, zh: string) => language === 'en' ? en : zh;
  const scenario = scenarios.find(s => s.id === (activeRoom && (page === 'lobby' || page === 'game') ? activeRoom.scenario : scenarioId))!;
  const world = useMemo(() => scenarioWorld(scenario), [scenario]);
  const region = world.regions[selected] ?? world.regions[0];
  const areas = scenario.nations.map((_, i) => world.regions.filter(r => r.nation === i).reduce((sum, r) => sum + polygonArea(r.polygon), 0));
  const totalArea = areas.reduce((a, b) => a + b, 0);

  useEffect(() => { document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN'; setNotice(''); }, [language]);
  useEffect(() => { window.scrollTo(0, 0); setNotice(''); }, [page]);

  /** @requires A validated draft. @ensures Save errors remain visible without losing edits. */
  function save() {
    try { if (!isPolicy(policy)) throw new Error('Invalid draft'); localStorage.setItem(STORAGE_KEY, JSON.stringify(policy)); setNotice(t('Doctrine saved on this device.', '国策已保存在此设备。')); }
    catch { setNotice(t('Could not save. Your edits are still here.', '保存失败，当前修改仍保留在编辑器中。')); }
  }
  function acceptRoom(room: RoomView) {
    setActiveRoom(previous => !previous || previous.code !== room.code || room.revision >= previous.revision ? room : previous);
    sessionStorage.setItem('sovereign.room', room.code);
  }
  useEffect(() => {
    let disposed = false;
    void restoreSession().then(async token => { if (token) { const value = await api<Player>('/me'); if (!disposed) setPlayer(value); } }).catch(error => { if (!disposed && error instanceof ApiError && error.status === 401) rememberSession(''); }).finally(() => { if (!disposed) setAuthReady(true); });
    return () => { disposed = true; };
  }, []);
  useEffect(() => {
    if (!player) return;
    let disposed = false;
    const refresh = async () => {
      try { const list = await api<RoomSummary[]>('/rooms'); if (!disposed) setRooms(list); }
      catch (e) { if (!disposed && e instanceof ApiError && e.status === 401) { rememberSession(''); setPlayer(null); setActiveRoom(null); } }
    };
    void refresh(); const timer = window.setInterval(refresh, 2000);
    void api<{ lan: string[] }>('/config').then(config => { if (!disposed) setLan(config.lan); }).catch(() => {});
    const code = sessionStorage.getItem('sovereign.room');
    if (code) void api<RoomView>(`/rooms/${code}`).then(room => { if (!disposed) { acceptRoom(room); setPage(room.started ? 'game' : 'lobby'); } }).catch(error => { if (!disposed && error instanceof ApiError && [403, 404].includes(error.status)) sessionStorage.removeItem('sovereign.room'); });
    return () => { disposed = true; clearInterval(timer); };
  }, [player?.id]);
  useEffect(() => {
    if (!player || !activeRoom || page === 'practice') return;
    let disposed = false, pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const previous = currentRoom.current;
        const next = await api<RoomView | null>(`/rooms/${activeRoom.code}?revision=${previous?.revision ?? 0}`);
        if (!disposed && next) { acceptRoom(next); if (!previous?.started && next.started) setPage('game'); }
      } catch (error) { if (!disposed) setNotice(error instanceof Error ? error.message : 'Connection interrupted'); }
      finally { pending = false; }
    };
    const timer = window.setInterval(refresh, 800);
    return () => { disposed = true; clearInterval(timer); };
  }, [player?.id, activeRoom?.code, page]);
  async function logout() {
    try { await api('/auth/logout', {}); rememberSession(''); sessionStorage.removeItem('sovereign.room'); setPlayer(null); setActiveRoom(null); setAccount(false); setPage('home'); }
    catch { setNotice(t('Could not sign out. Retry when connected.', '退出失败，请恢复连接后重试。')); }
  }
  async function createRoom() {
    setBusy(true);
    try { const room = await api<RoomView>('/rooms', { name: roomName.trim() || t('Command room', '指挥室'), scenario: scenarioId, password, doctrine: policy.doctrine }); acceptRoom(room); setSelected(0); setPassword(''); setPage('lobby'); }
    catch (e) { setNotice(e instanceof Error ? e.message : 'Could not create room'); }
    finally { setBusy(false); }
  }
  async function joinRoom(code = roomCode) {
    setBusy(true);
    try { const room = await roomAction(code.trim().toUpperCase(), 'join', { password, doctrine: policy.doctrine }); acceptRoom(room); setSelected(0); setPassword(''); setPage(room.started ? 'game' : 'lobby'); }
    catch (e) { setNotice(e instanceof Error ? e.message : 'Could not join room'); }
    finally { setBusy(false); }
  }
  async function chooseNation(index: number) {
    if (!activeRoom) return; setBusy(true);
    try { acceptRoom(await roomAction(activeRoom.code, 'seat', { nation: index })); setSelected(world.regions.find(r => r.nation === index)!.id); }
    catch (e) { setNotice(e instanceof Error ? e.message : 'Could not claim country'); }
    finally { setBusy(false); }
  }
  async function startMatch() {
    if (!activeRoom) return; setBusy(true);
    try { acceptRoom(await roomAction(activeRoom.code, 'start')); setPage('game'); }
    catch (e) { setNotice(e instanceof Error ? e.message : 'Could not start match'); }
    finally { setBusy(false); }
  }
  async function leaveLobby() {
    if (!activeRoom) return;
    try { await roomAction(activeRoom.code, 'leave'); setActiveRoom(null); sessionStorage.removeItem('sovereign.room'); setPage('rooms'); }
    catch (e) { setNotice(e instanceof Error ? e.message : 'Could not leave room'); }
  }
  const doctrineEditor = <><DoctrineEditor language={language} doctrine={policy.doctrine} onChange={(doctrine, preset) => setPolicy({ ...policy, doctrine, preset: preset ?? policy.preset })} /><div className="save-doctrine"><button className="primary-button" onClick={save}>{t('Save doctrine', '保存国策')}</button></div><p className="compile-state">{t('Your long-term compass. Review AI-drafted actions inside a match.', '你的长期指南针。在对局中审阅并采用 AI 拟定的具体行动。')}</p></>;
  const mapPanel = <section className="map-panel scenario-map" aria-label={t('World map', '世界地图')}>
    <div className="panel-bar"><span>+ {scenario.name[language]}</span><span>{t('FIXED WORLD', '固定世界')} / 0{scenario.layout + 1}</span></div>
    <WorldMap seed={world.seed} terrain={world} nations={scenario.nations} showArmies={page === 'game'} language={language} selected={selected} onSelect={setSelected} />

    <div className="map-country-key">{scenario.nations.map((n, i) => <span key={n.id} style={{ color: n.color }}><i />{n.name[language]}<small>{(areas[i] / totalArea * 100).toFixed(1)}%</small></span>)}</div>
    <div className="region-details"><div><span className="eyebrow">{t('SELECTED SECTOR', '选中地区')}</span><strong>{String(region.id + 1).padStart(2, '0')} <span>/ {scenario.nations[region.nation].name[language]}</span></strong></div><span className="terrain-tag">{region.elevation} {t('m', '米')}</span></div>
  </section>;
  const scenarioCard = (s: Scenario) => <button key={s.id} className={`world-card ${s.id === scenarioId ? 'active' : ''}`} aria-pressed={s.id === scenarioId} onClick={() => { setScenarioId(s.id); setSelected(0); }}><span className="world-card-number">0{s.layout + 1}</span><span><strong>{s.name[language]}</strong><small>{s.description[language]}</small></span><span className="world-palette">{s.nations.map(n => <i key={n.id} style={{ background: n.color }} />)}</span></button>;

  if (!player) return <div className="app-shell" ref={root}><AmbientGlow /><Diagnostics language={language}/><header className="topbar"><span className="brand">STRAT</span><button className="language" aria-label={t('Switch to Chinese', '切换为英文')} onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')}>EN / 中文</button></header><main>{authReady ? <Login language={language} onLogin={setPlayer} /> : <p>{t('Connecting…', '连接中……')}</p>}</main></div>;
  return <div className="app-shell" ref={root}><AmbientGlow /><Diagnostics language={language}/>
    <header className="topbar"><a className="brand" href="#main" onClick={e => { if (page === 'game' || page === 'practice') e.preventDefault(); else setPage('home'); }}><span className="brand-mark">S</span><span>STRAT</span></a><nav className="main-nav"><button disabled={page === 'game' || page === 'practice'} className={page === 'home' ? 'active' : ''} onClick={() => setPage('home')}>{t('Command profile', '玩家主页')}</button><button disabled={page === 'game' || page === 'practice'} className={page === 'rooms' ? 'active' : ''} onClick={() => { setPassword(''); setPage('rooms'); }}>{t('Rooms', '房间')}</button></nav><div className="header-actions"><button className="text-button tutorial-button" onClick={() => setHelp(!help)} aria-expanded={help}>{t('Tutorial', '新手指引')}</button><button className="practice-entry text-button" disabled={page==='game'||page==='practice'} onClick={()=>setPracticePrompt(true)}>{t('Learn by playing', '试玩教学')} ↗</button><button className="language" onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')} aria-label={t('Switch to Chinese', '切换为英文')}>{language === 'en' ? 'EN / 中文' : '中文 / EN'}</button><div className="account-control"><button className="avatar small-avatar" onClick={() => setAccount(!account)} aria-label={t('Account menu', '账号菜单')} aria-expanded={account}>C</button>{account && <div className="account-menu"><strong>{player.name}</strong><small>{player.kind === 'email' ? player.email : t('Guest · This tab', '游客 · 当前标签页')}</small><button disabled={page === 'game' || page === 'practice'} onClick={logout}>{t('Log out', '退出登录')}</button></div>}</div></div></header>
    {help && <aside className="guide"><strong>{t('From doctrine to decisions', '从国策到每回合决策')}</strong><ol><li>{t('Edit and save a long-term doctrine on your profile.', '在主页编辑并保存长期国策。')}</li><li>{t('Create a room, choose one of five worlds, then select a nation.', '创建房间，选择五个世界之一，再选择国家。')}</li><li>{t('Open the match preview. Current-turn strategy takes priority over doctrine when they conflict.', '打开沙盒；发生冲突时，当回合策略优先于国策。')}</li><li>{t('Each player controls one country. Confirm your orders and wait for the host to resolve the turn.', '每位玩家控制一个国家。确认指令后，等待房主统一结算。')}</li></ol></aside>}
    <main id="main" className={page === 'game' ? 'game-main' : ''}>

      {page === 'home' && <><section className="profile-welcome"><div><span className="eyebrow">STRAT / {t('COMMAND PROFILE','玩家主页')}</span><h1>{t('Your next move.','下一步，由你决定。')}</h1><p>{t('Choose your direction. Shape a shared world.','定下方向，与其他玩家共同书写世界。')}</p></div><div className="profile-watermark"><SignalMark /></div></section><div className="profile-layout"><section className="profile-column"><article className="profile-card"><div className="profile-identity"><div className="avatar">C</div><span><h2>{player.name}</h2><p>{player.kind === 'email' ? player.email : t('Guest · This tab', '游客 · 当前标签页')}</p></span><span className="outline-badge">{t('UNRANKED', '暂无段位')}</span></div><div className="profile-stats"><div><strong>—</strong><span>{t('Matches', '对局')}</span></div><div><strong>—</strong><span>{t('Victories', '胜利')}</span></div><div><strong>—</strong><span>{t('Reputation', '声望')}</span></div></div></article><div className="entry-actions"><button className="primary-button" onClick={() => setNotice(t('Choose a public room in Rooms to join a match.', '请在房间列表选择公开房间加入对局。'))}>{t('Find a match', '开始匹配')} ↗</button><button className="secondary-button" onClick={() => { setPassword(''); setPage('rooms'); }}>{t('Join a room', '加入房间')}</button><button className="secondary-button" onClick={() => { setPassword(''); setPage('create'); }}>{t('Create a room', '创建房间')}</button></div><section className="empty-panel"><div className="section-label">{t('CAREER HIGHLIGHTS', '生涯高光')}<span>{t('COMING LATER', '待实现')}</span></div><div className="highlight-placeholder"><span>◇</span><p>{t('No highlights yet.', '暂无高光记录。')}</p></div></section><section className="empty-panel"><div className="section-label">{t('MATCH HISTORY', '历史对局')}</div><p>{t('No completed matches.', '暂无已完成对局。')}</p></section></section><section className="command-panel"><div className="panel-bar"><span>{t('NATIONAL DOCTRINE', '长期国策')}</span></div><div className="command-body">{doctrineEditor}</div></section></div></>}

      {page === 'create' && <><section className="page-heading"><div><h1>{t('Theatre selection', '战区选择')}</h1><p>{t('Five worlds. Choose your starting position.', '五个世界，选择你的起点。')}</p></div><button className="text-button" onClick={() => setPage('home')}>← {t('Profile', '主页')}</button></section><div className="room-create-layout"><div><div className="scenario-catalog">{scenarios.map(scenarioCard)}</div><section className="room-form"><label>{t('Room name', '房间名称')}<input maxLength={40} value={roomName} onChange={e => setRoomName(e.target.value)} placeholder={t('Command room', '指挥室')} /></label><label>{t('Room password (optional)', '房间密码（选填）')}<input type="password" maxLength={64} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></label><p>{t('Leave blank for a public room. Share the code with the other four players.', '留白为公开房间。将房间码分享给另外四名玩家。')}</p><button className="primary-button" disabled={busy} onClick={createRoom}>{t('Create room', '创建房间')} →</button></section></div><div>{mapPanel}<div className="scenario-stat-list">{scenario.nations.map(n => <div key={n.id}><strong style={{ color: n.color }}>{n.name[language]}</strong><small>{n.role[language]}</small><span>⚑ {n.resources.army} · ◈ {n.resources.treasury} · ⌬ {n.resources.research}</span></div>)}</div></div></div></>}

      {page === 'rooms' && <><section className="page-heading"><div><h1>{t('Operations rooms', '行动室')}</h1><p>{t('Shared rooms on this server', '此服务器上的共享房间')}</p></div><button className="primary-button" onClick={() => { setPassword(''); setPage('create'); }}>{t('Create a room', '创建房间')}</button></section><section className="join-form"><label>{t('Room code', '房间码')}<input value={roomCode} maxLength={8} onChange={e => setRoomCode(e.target.value.toUpperCase())} placeholder="XXXXXXXX" /></label><label>{t('Room password', '房间密码')}<input type="password" maxLength={64} value={password} onChange={e => setPassword(e.target.value)} /></label><button className="primary-button" disabled={busy || !roomCode.trim()} onClick={() => joinRoom()}>{t('Join room', '加入房间')}</button></section><div className="room-list">{rooms.length ? rooms.map(r => <article key={r.code}><span><strong>{r.name}</strong><small>{scenarios.find(s => s.id === r.scenario)!.name[language]} · {r.code}</small></span><span>{r.private ? t('Private', '私密') : t('Public', '公开')} · {r.count} / 5</span><button className="secondary-button" disabled={busy} onClick={() => { if (r.private) { setRoomCode(r.code); setNotice(t('Enter the room password above, then join.', '请在上方输入房间密码后加入。')); } else { void joinRoom(r.code); } }}>{t('Join', '加入')}</button></article>) : <div className="empty-panel"><p>{t('No rooms yet. Create one and invite your friends.', '暂无房间。创建房间即可测试等待大厅。')}</p></div>}</div></>}

      {page === 'lobby' && activeRoom && <><section className="page-heading"><div><div className="eyebrow">{t('WAITING ROOM', '等待大厅')} / {activeRoom.code}</div><h1>{activeRoom.name}</h1><p>{scenario.description[language]}</p></div><button className="text-button" onClick={leaveLobby}>← {t('Leave room', '离开房间')}</button></section><div className="lobby-layout">{mapPanel}<section className="command-panel"><div className="panel-bar"><span>{t('PARTICIPANTS', '参与者')}</span><span>{activeRoom.count} / 5</span></div><div className="command-body"><p className="section-description">{t('Choose an available country. Countries lock when the host starts.', '选择空闲国家，房主开局后锁定所属国家。')}</p><div className="seat-list">{scenario.nations.map((n, i) => <button key={n.id} aria-pressed={activeRoom.nation === i} disabled={busy || activeRoom.started || (!!activeRoom.seats[i] && !activeRoom.seats[i]?.mine)} onClick={() => chooseNation(i)}><span className="seat-avatar" style={{ borderColor: n.color, color: n.color }}>{activeRoom.nation === i ? 'C' : '◇'}</span><span><strong style={{ color: n.color }}>{n.name[language]}</strong><small>{activeRoom.seats[i]?.name ?? t('Open seat', '空席位')}{activeRoom.nation === i ? t(' · You', ' · 你') : ''}</small><small>{n.role[language]}</small></span></button>)}</div><div className="network-links"><strong>{t('Room code', '房间码')}: {activeRoom.code}</strong><br/>{t('This device: open five tabs at the same address.', '本机：用相同地址打开五个标签页。')}{lan.map(url => <div key={url}>{t('LAN', '局域网')}: <a href={url} target="_blank" rel="noopener noreferrer">{url}</a></div>)}</div><div className="lobby-readiness"><span>✓ {t('Your current doctrine is ready', '已携带当前国策')}</span><small>{t('Review concrete AI actions during the match', '进入对局后，可审阅具体 AI 行动')}</small></div><button className="primary-button full-button" disabled={busy || !activeRoom.host || activeRoom.count !== 5} onClick={startMatch}>{activeRoom.host ? t('Start match', '开始对局') : t('Waiting for host', '等待房主')} →</button><p className="section-description">{t('Open this address in five tabs. Each tab enters as a guest and joins the same room code.', '打开五个标签页，各自以游客身份进入，使用相同房间码加入。')}</p></div></section></div></>}

      {page === 'practice' && <Practice language={language} onExit={()=>setPage('home')}/>}
      {page === 'game' && activeRoom && <Sandbox key={activeRoom.code} scenario={scenario} room={activeRoom} onRoom={acceptRoom} language={language} onExit={() => setPage('rooms')} />}
      <div className="global-notice" role="status" aria-live="polite">{notice && <><span>{notice}</span><button className="text-button" aria-label={t('Dismiss notification', '关闭提示')} onClick={() => setNotice('')}>×</button></>}</div>
      <footer><span>STRAT</span><span>{t('Local prototype', '本地原型')}</span></footer>
    </main>
    {practicePrompt&&<Modal title={t('Start a guided practice?', '开始一场新手练习吗？')} onClose={()=>setPracticePrompt(false)}><p>{t('Three real turns at your own pace. Queue and confirm development, recruitment, naval patrol, diplomacy and defense. Training starts fresh and never changes a real room.', '按自己的节奏，完成三个真实回合。亲自加入指令并确认，学习发展、补员、海洋、外交与防守。练习从头开始，不会修改正式房间。')}</p><div className="modal-actions"><button className="secondary-button" onClick={()=>setPracticePrompt(false)}>{t('Not now','暂时不')}</button><button className="primary-button" onClick={()=>{setPracticePrompt(false);setPage('practice');}}>{t('Start practice','开始练习')} →</button></div></Modal>}
  </div>;
}
