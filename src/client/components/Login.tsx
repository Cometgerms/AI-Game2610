import { useEffect, useState } from 'react';
import type { Language } from '../game/policy';
import { api, rememberSession, type Player } from '../game/network';

/** @requires A reachable game server. @ensures Guest and email sessions belong to this tab only. */
export function Login({ language, onLogin }: { language: Language; onLogin: (player: Player) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const t = (en: string, zh: string) => language === 'en' ? en : zh;
  useEffect(() => { void api<{ emailEnabled: boolean }>('/config').then(config => setEnabled(config.emailEnabled)).catch(() => setError(t('Cannot reach the game server.', '无法连接游戏服务器。'))); }, []);
  useEffect(() => { if (!cooldown) return; const timer = window.setTimeout(() => setCooldown(cooldown - 1), 1000); return () => clearTimeout(timer); }, [cooldown]);
  async function signIn(mode: 'guest' | 'email' | 'verify') {
    setBusy(true); setError('');
    try {
      if (mode === 'email') {
        await api('/auth/email', { email }); setSentTo(email.trim()); setCooldown(60);
      } else {
        const result = await api<{ token: string; player: Player }>(`/auth/${mode}`, { name: name.trim() || 'Commander', email: sentTo, code });
        rememberSession(result.token); onLogin(result.player);
      }
    } catch (e) { setError(e instanceof Error ? e.message : t('Sign-in failed.', '登录失败。')); }
    finally { setBusy(false); }
  }
  return <section className="login-layout"><div><span className="eyebrow">STRAT / ACCESS</span><h1>{t('YOUR NEXT', '你的下一步')}<br/>{t('MOVE.', '战略。')}</h1><p>{t('One player. One country. A shared world.', '一名玩家，一个国家，同一个世界。')}</p><p>{t('For a five-tab test, enter as a different guest in each tab.', '五标签测试时，在每个标签页分别以游客身份进入。')}</p></div><form className="login-card" onSubmit={e => { e.preventDefault(); void signIn(sentTo ? 'verify' : 'email'); }}><h2>{t('Enter the command room', '进入指挥室')}</h2><label>{t('Email', '邮箱')}<input type="email" value={email} onChange={e => { setEmail(e.target.value); setSentTo(''); setCode(''); }} autoComplete="email" disabled={busy || !enabled} /></label>{sentTo && <label>{t('Email code', '邮箱验证码')}<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" maxLength={10} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} /></label>}<button className="primary-button full-button" disabled={busy || !enabled || !email.trim() || (!!sentTo && code.length < 6) || (!sentTo && cooldown > 0)}>{sentTo ? t('Verify & sign in', '验证并登录') : t('Register / sign in by email', '邮箱注册／登录')}</button>{sentTo && <><p>{t('Code sent to', '验证码已发送至')} {sentTo}</p><button type="button" className="text-button" disabled={busy || cooldown > 0} onClick={() => signIn('email')}>{t('Send again', '重新发送')}{cooldown > 0 ? ` (${cooldown}s)` : ''}</button></>}{!enabled && <p className="connection-note">{t('Email login awaits project configuration. Guest play is available.', '邮箱登录等待项目配置，游客游玩已可用。')}</p>}<div className="login-divider">{t('Or proceed as a guest', '或以游客身份继续')}</div><label>{t('Player name', '玩家名称')}<input value={name} onChange={e => setName(e.target.value)} maxLength={30} autoComplete="nickname" placeholder="Commander" /></label><p className="guest-progress-note">{t('Guest progress is temporary. Closing this tab or signing out may make it unrecoverable. Sign in by email to keep access to your games.', '游客进度不会永久保留。关闭此标签页或退出后，可能无法找回。想保留对局进度，请使用邮箱登录。')}</p><button type="button" className="secondary-button full-button" disabled={busy} onClick={() => signIn('guest')}>{t('Play as guest', '游客游玩')} →</button>{error && <p role="alert">{error}</p>}</form></section>;
}
