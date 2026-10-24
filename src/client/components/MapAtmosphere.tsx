import {useEffect,useId,useRef,useState} from 'react';
import {animate} from 'animejs';
import type {TerrainWorld} from '../game/world';
import type {Language} from '../game/policy';

/** @requires Downstream-ordered river paths and a sea mask. @ensures Decorative water cannot intercept map input. */
export function WaterMotion({world,waterMask}:{world:TerrainWorld;waterMask:string}){
 const root=useRef<SVGGElement>(null);
 useEffect(()=>{
  const media=matchMedia('(prefers-reduced-motion: reduce)');let motion:ReturnType<typeof animate>[]=[];
  const sync=()=>{motion.forEach(a=>a.revert());motion=[];if(media.matches||document.hidden||!root.current)return;
   motion.push(animate(root.current.querySelectorAll('.river-current'),{strokeDashoffset:[0,-60],duration:4600,loop:true,ease:'linear'}));
   motion.push(animate(root.current.querySelectorAll('.sea-current'),{strokeDashoffset:[0,-120],duration:12000,loop:true,ease:'linear'}));
   motion.push(animate(root.current.querySelectorAll('.sea-swell'),{translateY:[-3,5],opacity:[.16,.38],duration:4800,delay:(_:unknown,i=0)=>(i%7)*520,alternate:true,loop:true,ease:'inOut(2)'}));
   motion.push(animate(root.current.querySelectorAll('.shore-surf'),{strokeWidth:[2,15],strokeDashoffset:[0,-28],opacity:[.38,0],duration:5200,delay:(_:unknown,i=0)=>(i%2)*2600,loop:true,ease:'out(2)'}));
  };sync();media.addEventListener('change',sync);document.addEventListener('visibilitychange',sync);
  return()=>{motion.forEach(a=>a.revert());media.removeEventListener('change',sync);document.removeEventListener('visibilitychange',sync);};
 },[world]);
 return <g ref={root} className="map-water-motion" pointerEvents="none" aria-hidden="true"><g mask={`url(#${waterMask})`}>
  {Array.from({length:12},(_,row)=><g className="sea-swell" key={row} opacity=".25">{Array.from({length:8},(_,col)=>{const x=col*142-30+(row%2)*57,y=row*66+18+Math.sin(col*3.7+row)*12;return <g key={col}><path className="sea-current" d={`M${x} ${y}q27 -7 54 0t54 0`} pathLength="120" fill="none" stroke="#9fd6e5" strokeWidth="1.1" strokeLinecap="round" strokeDasharray="28 92"/><path d={`M${x+16} ${y+6}q18 -4 38 0`} fill="none" stroke="#5598b3" strokeWidth=".6" opacity=".5"/></g>;})}</g>)}
  {world.landforms.flatMap((poly,i)=>[0,1].map(phase=><path key={`${i}-${phase}`} className="shore-surf" d={poly.map((p,j)=>`${j?'L':'M'}${p.x} ${p.y}`).join(' ')+'Z'} fill="none" stroke="#b1e1e5" strokeWidth="3" strokeDasharray="26 14 7 33" strokeLinecap="round" opacity=".18"/>))}

 </g>{world.rivers.map((river,i)=><path key={i} className="river-current" d={river.map((p,j)=>`${j?'L':'M'}${p.x} ${p.y}`).join(' ')} fill="none" stroke="#d0f4ff" strokeWidth="1.1" strokeLinecap="round" strokeDasharray="4 13 1 12 7 23" opacity=".72"/>)}</g>;
}

const puffs=[[-29,3,24,11],[-12,-6,26,15],[10,-8,27,17],[32,0,23,12],[2,8,42,12]];
function Cloud({index,x,y,filter,language,dragged}:{index:number;x:number;y:number;filter:string;language:Language;dragged:()=>boolean}){
 const drift=useRef<SVGGElement>(null),body=useRef<SVGGElement>(null),[phase,setPhase]=useState<'alive'|'burst'|'gone'>('alive');
 useEffect(()=>{
  const media=matchMedia('(prefers-reduced-motion: reduce)');let motion:ReturnType<typeof animate>|undefined;
  const sync=()=>{motion?.pause();if(media.matches||document.hidden||!drift.current)return;motion??=animate(drift.current,{translateX:[-35,135],translateY:[0,-22],duration:76000+index*11000,alternate:true,loop:true,ease:'linear'});motion.resume();};
  sync();media.addEventListener('change',sync);document.addEventListener('visibilitychange',sync);
  return()=>{motion?.revert();media.removeEventListener('change',sync);document.removeEventListener('visibilitychange',sync);};
 },[index]);
 useEffect(()=>{
  if(phase!=='burst')return;
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){setPhase('gone');return;}
  const motion=animate(body.current!.querySelectorAll('.cloud-puff'),{translateX:(_:unknown,i=0)=>(i-2)*22,translateY:(_:unknown,i=0)=>(i%2?1:-1)*22,scale:[1,1.5],opacity:[1,0],duration:550,ease:'out(3)'});
  const ring=animate(body.current!.querySelector('.cloud-pop-ring')!,{r:[3,48],opacity:[.5,0],duration:600,ease:'out(3)'});
  const timer=setTimeout(()=>setPhase('gone'),620);return()=>{clearTimeout(timer);motion.revert();ring.revert();};
 },[phase]);
 useEffect(()=>{if(phase!=='gone')return;const timer=setTimeout(()=>setPhase('alive'),18000);return()=>clearTimeout(timer);},[phase]);
 const pop=()=>{if(phase==='alive'&&!dragged())setPhase('burst');};
 return <g transform={`translate(${x},${y})`}><g ref={drift} className="map-cloud-drift"><g ref={body} className="map-cloud" data-phase={phase} role="button" tabIndex={phase==='alive'?0:-1} aria-hidden={phase!=='alive'} aria-label={language==='zh'?'点散云朵':'Pop cloud'} style={{visibility:phase==='gone'?'hidden':undefined,pointerEvents:phase==='alive'?'all':'none'}} onClick={e=>{e.stopPropagation();pop();}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();pop();}}}>
  <title>{language==='zh'?'戳一下，云就散啦。':'A little cloud. Give it a pop.'}</title>
  <g filter={`url(#${filter})`} opacity=".26">{puffs.map(([cx,cy,rx,ry],i)=><g key={i} className="cloud-puff"><ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#c4d8df"/><ellipse cx={cx-2} cy={cy-4} rx={rx*.75} ry={ry*.48} fill="#eef4f4" opacity=".4"/></g>)}</g>
  <ellipse className="cloud-hit" cx="0" cy="0" rx="50" ry="19" fill="transparent"/>
  <circle className="cloud-pop-ring" r="3" fill="none" stroke="#d9f0f3" strokeWidth=".8" opacity="0" pointerEvents="none"/>
 </g></g></g>;
}
/** @requires Layer below military counters. @ensures Clouds pop without selecting territory; drag gestures still pan the map. */
export function MapClouds({world,language,dragged}:{world:TerrainWorld;language:Language;dragged:()=>boolean}){
 const id=useId().replace(/:/g,'')+'cloud';
 return <g className="map-cloud-layer"><defs><filter id={id} x="-40%" y="-60%" width="180%" height="220%"><feGaussianBlur stdDeviation="3"/></filter></defs>{[[245,228],[540,345],[775,555],[405,620]].map(([x,y],i)=><Cloud key={`${world.seed}-${i}`} index={i} x={x} y={y} filter={id} language={language} dragged={dragged}/>)}</g>;
}
