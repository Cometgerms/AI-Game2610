import {useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {animate} from 'animejs';
import {spotlightPosition} from '../game/spotlightPosition';
import type {Language} from '../game/policy';

/** @requires A mounted target selector. @ensures Guidance follows the target on scroll/resize and yields to actual play on dismissal. */
export function Spotlight({target,title,body,progress,language,onNext,onSkip}:{target:string;title:string;body:string;progress?:string;language:Language;onNext:()=>void;onSkip:()=>void}) {
 const uid=useId().replace(/:/g,''),card=useRef<HTMLElement>(null),[box,setBox]=useState<{x:number;y:number;w:number;h:number}|null>(null);
 const [position,setPosition]=useState({left:16,top:16});
 const t=(en:string,zh:string)=>language==='en'?en:zh;
 useLayoutEffect(()=>{
  const node=document.querySelector(target);if(!node)return;
  const original=document.activeElement as HTMLElement|null;
  const measure=()=>{
   const r=node.getBoundingClientRect(),width=Math.min(340,innerWidth-32),height=card.current?.offsetHeight??250;
   const x=Math.max(8,r.left-7),y=Math.max(8,r.top-7),right=Math.min(innerWidth-8,r.right+7),bottom=Math.min(innerHeight-8,r.bottom+7);
   const next={x,y,w:Math.max(0,right-x),h:Math.max(0,bottom-y)};setBox(old=>old&&Object.keys(next).every(k=>old[k as keyof typeof next]===next[k as keyof typeof next])?old:next);
   const {left,top}=spotlightPosition(next,width,height,innerWidth,innerHeight);
   setPosition(old=>old.left===left&&old.top===top?old:{left,top});
  };
  const r=node.getBoundingClientRect();
  if(innerWidth<850)window.scrollBy({top:r.top-28,behavior:'instant'});
  else if(r.top<12||r.bottom>innerHeight-12)node.scrollIntoView({block:'center',behavior:'instant'});
  measure();const observer=new ResizeObserver(measure);observer.observe(node);if(card.current)observer.observe(card.current);
  let frame=0;const track=()=>{measure();frame=requestAnimationFrame(track);};frame=requestAnimationFrame(track);
  card.current?.querySelector<HTMLButtonElement>('.spotlight-next')?.focus({preventScroll:true});
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();onSkip();}};window.addEventListener('keydown',key);
  return()=>{cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('keydown',key);if(original?.isConnected)original.focus({preventScroll:true});};
 },[target,title,language]);
 useEffect(()=>{if(!card.current||matchMedia('(prefers-reduced-motion: reduce)').matches)return;const a=animate(card.current,{opacity:[0,1],translateY:[8,0],duration:220,ease:'out(2)'});return()=>{a.revert();};},[target,title]);
 return createPortal(<div className="field-spotlight"><svg className="spotlight-shade" aria-hidden="true"><defs><mask id={uid}><rect width="100%" height="100%" fill="white"/>{box&&<rect x={box.x} y={box.y} width={box.w} height={box.h} rx="7" fill="black"/>}</mask></defs><rect width="100%" height="100%" fill="#04070b" opacity=".72" mask={`url(#${uid})`}/>{box&&<rect x={box.x} y={box.y} width={box.w} height={box.h} rx="7" fill="none" stroke="#ef7789" strokeWidth="1.5"/>}</svg><aside ref={card} className="spotlight-card" role="dialog" aria-modal="false" aria-labelledby={`${uid}-title`} style={position}><span className="eyebrow">{t('FIELD GUIDE','随身小指南')}{progress?` / ${progress}`:''}</span><h2 id={`${uid}-title`}>{title}</h2><p>{body}</p><div><button className="spotlight-next primary-button" onClick={onNext}>{t('Got it →','明白啦 →')}</button><button className="text-button" onClick={onSkip}>{t('Skip this tip','跳过提示')}</button></div></aside></div>,document.body);
}
