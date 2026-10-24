import {useEffect,useRef} from 'react';
import {animate} from 'animejs';
import type {Language} from '../game/policy';
import {MilitaryGlyph} from './MilitaryGlyph';
type Phase='submitting'|'resolving'|'waiting';
const posts=[[52,76],[137,35],[303,35],[388,76],[220,168]];
/** @requires Real confirmation flags when showing readiness. @ensures Decorative motion never advances readiness or pretends to be percentage progress. */
export function TurnAnimation({phase,confirmed}:{phase:Phase;confirmed?:boolean[]}){
 const root=useRef<SVGSVGElement>(null);
 useEffect(()=>{
  const media=matchMedia('(prefers-reduced-motion: reduce)');let animations:ReturnType<typeof animate>[]=[];
  const sync=()=>{animations.forEach(a=>a.revert());animations=[];if(media.matches||document.hidden||!root.current)return;
   animations.push(animate(root.current.querySelector('.command-sweep')!,{rotate:360,duration:11000,loop:true,ease:'linear'}));
   animations.push(animate(root.current.querySelectorAll('.command-beacon:not([data-ready=true]) .beacon-pulse'),{opacity:[.15,.65],scale:[.8,1.25],duration:1900,delay:(_:unknown,i=0)=>i*260,alternate:true,loop:true,ease:'inOut(2)'}));
   root.current.querySelectorAll<SVGGElement>('.dispatch-token').forEach((node)=>{
    const i=Number(node.dataset.post),p=posts[i],value={t:0},duration=phase==='waiting'?4400:2400;
    const motion=animate(value,{t:1,duration,delay:i*380,loop:true,ease:'inOut(2)',onUpdate:()=>{const t=value.t,x=p[0]+(220-p[0])*t,y=p[1]+(98-p[1])*t-Math.sin(t*Math.PI)*18;node.setAttribute('transform',`translate(${x},${y})`);node.style.opacity=String(Math.sin(t*Math.PI)*.9);}});animations.push(motion);
   });
  };sync();media.addEventListener('change',sync);document.addEventListener('visibilitychange',sync);
  return()=>{animations.forEach(a=>a.revert());media.removeEventListener('change',sync);document.removeEventListener('visibilitychange',sync);};
 },[phase,confirmed?.join(',')]);
 return <svg ref={root} className="turn-animation" data-phase={phase} viewBox="0 0 440 205" aria-hidden="true">
  <path className="command-grid" d="M20 48H420M20 98H420M20 148H420M70 18V188M170 18V188M270 18V188M370 18V188"/>
  <path className="command-land" d="m60 62 42-30 55 15 38-12 44 15 43-21 53 32 42 40-32 27-58-9-43 24-22 32-46-19-24-32-62-10Z"/>
  <g className="command-sweep"><circle cx="220" cy="98" r="56"/><path d="M220 98l-28-48 18-6Z"/></g>
  {posts.map(([x,y],i)=><g key={i}><path className="dispatch-route" d={`M${x} ${y}Q${(x+220)/2} ${(y+98)/2-25} 220 98`}/><g className="command-beacon" data-ready={confirmed?.[i]===true} transform={`translate(${x},${y})`}><circle className="beacon-pulse" r="14"/><circle className="beacon-core" r="8"/>{confirmed?.[i]?<path className="beacon-check" d="m-4 0 3 3 5-6"/>:<text y="3" textAnchor="middle">{i+1}</text>}</g>{(phase!=='waiting'||confirmed?.[i]===true)&&<g className="dispatch-token" data-post={i} transform={`translate(${x},${y})`} opacity="0"><path d="m0-4 5 4-5 4-5-4Z"/></g>}</g>)}
  <g className="command-hub" transform="translate(220,98)"><rect x="-22" y="-22" width="44" height="44" rx="9"/><g transform="translate(-13,-13) scale(1.08)"><MilitaryGlyph/></g></g>
  <path className="command-frame" d="M10 30V10H30M410 10h20v20M430 175v20h-20M30 195H10v-20"/>
 </svg>;
}
/** @requires Actual phase and confirmations. @ensures Motion conveys activity without fabricating completion percentages. */
export function TurnStatus({phase,ready,confirmed,language,onClose,reviewWaiting=false}:{reviewWaiting?:boolean;phase:Phase;ready:number;confirmed?:boolean[];language:Language;onClose?:()=>void}) {
 const t=(en:string,zh:string)=>language==='en'?en:zh;
 return <div className={`turn-status ${phase==='waiting'?'waiting':'working'}`} role="status" aria-live="polite">
  <div className="turn-status-top"><span>STRAT / {phase==='waiting'?t('COMMAND LINK','指挥联络'):t('FIELD OPERATIONS','战区行动')}</span><span className="status-live-dot"/></div>
  <TurnAnimation phase={phase} confirmed={confirmed}/>
  <div className="turn-status-copy"><strong>{reviewWaiting?t('Other fronts are debriefing.','其他战区正在结算。'):phase==='submitting'?t('Orders on their way.','指令正在路上。'):phase==='resolving'?t('A world in motion.','这一回合，世界动起来了。'):t('Your move is in. The others are plotting.','你的棋已落，队友还在运筹。')}</strong><p>{reviewWaiting?t(`${ready} of 5 countries are ready for the next turn.`,`${ready} / 5 个国家已准备进入下一回合。`):phase==='resolving'?t('Resolving battles, resources and agreements…','正在结算交战、资源与协议……'):phase==='submitting'?t('Checking your plan and delivering it to command…','正在核对计划，送往指挥部……'):t(`${ready} of 5 commanders have confirmed.`,`${ready} / 5 位指挥官已确认。`)}</p><small>{reviewWaiting?t('Battle reports are private to the combatants. Everyone advances together when they finish.','战报仅参战国可见；他们确认完毕后，所有人一起进入下一回合。'):phase==='waiting'?t('A little patience. Someone is probably writing a very ambitious treaty.','稍等一下，或许有人正在起草一份很有野心的条约。'):t('The board is an animation. Your actual results arrive next.','沙盘是加载动画，真实战果马上揭晓。')}</small>{onClose&&<button onClick={onClose}>{t('Keep exploring','继续查看')} →</button>}</div>
 </div>;
}
