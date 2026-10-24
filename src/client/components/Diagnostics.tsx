import {useEffect,useRef,useState} from 'react';
import {api,type Diagnostic} from '../game/network';
import type {Language} from '../game/policy';
import {Modal} from './Modal';

/** @requires Same-origin health endpoint. @ensures Diagnostics contain no request bodies, headers or session credentials. */
export function Diagnostics({language}:{language:Language}) {
  const [connection,setConnection]=useState<boolean|null>(null),[error,setError]=useState<Diagnostic|null>(null),[copied,setCopied]=useState(false);
  const [copyFailed,setCopyFailed]=useState(false);
  const recent=useRef(new Map<string,number>()),t=(en:string,zh:string)=>language==='en'?en:zh;
  useEffect(()=>{
    const status=(e:Event)=>setConnection((e as CustomEvent).detail.connected);
    const failure=(e:Event)=>{const d=(e as CustomEvent<Diagnostic>).detail,key=d.operation+d.message,now=Date.now();if(now-(recent.current.get(key)??0)>30000){recent.current.set(key,now);setError(previous=>previous??d);setCopied(false);setCopyFailed(false);}for(const [k,time] of recent.current)if(now-time>60000)recent.current.delete(k);};
    const offline=()=>setConnection(false);const probe=()=>{void api('/config').catch(()=>{});};
    window.addEventListener('strat:connection',status);window.addEventListener('strat:error',failure);window.addEventListener('offline',offline);window.addEventListener('online',probe);probe();const timer=setInterval(probe,10000);
    return()=>{clearInterval(timer);window.removeEventListener('strat:connection',status);window.removeEventListener('strat:error',failure);window.removeEventListener('offline',offline);window.removeEventListener('online',probe);};
  },[]);
  const diagnostic=error?`STRAT diagnostic\nTime: ${error.at}\nOperation: ${error.operation}\nHTTP: ${error.status||'Network failure'}\nRequest: ${error.requestId||'Not received'}\nMessage: ${error.message}`:'';
  async function copy(){setCopyFailed(false);try{if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(diagnostic);else{const area=document.createElement('textarea');area.value=diagnostic;document.querySelector('.strat-modal')?.appendChild(area);area.select();const ok=document.execCommand('copy');area.remove();if(!ok)throw Error();}setCopied(true);}catch{setCopied(false);setCopyFailed(true);}}
  return <><div className="connection-indicator" data-connected={connection===null?'unknown':String(connection)} role="status"><i/>{connection===null?t('Connecting','正在连接'):connection?t('Server connected','已连接游戏服务器'):t('Server disconnected','服务器连接中断')}</div>{error&&<Modal title={t('Something needs attention','有个小问题需要处理')} onClose={()=>setError(null)}><p>{error.message}</p><p className="connection-note">{t('Your error details are ready to copy. No password or session token is included.','可以复制下方诊断信息，方便排查；不含密码或登录令牌。')}</p><textarea readOnly aria-label={t('Error details','错误详情')} value={diagnostic}/>{copyFailed&&<p role="alert">{t('Copy was blocked by your browser. Select the details above and copy them manually.','浏览器阻止了复制，请选中上方详情手动复制。')}</p>}<div className="modal-actions"><button className="primary-button" onClick={copy}>{copied?t('Copied ✓','已复制 ✓'):t('Copy error details','复制报错信息')}</button><button className="secondary-button" onClick={()=>setError(null)}>{t('Close','关闭')}</button></div></Modal>}</>;
}
