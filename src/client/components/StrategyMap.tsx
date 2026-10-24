import {MilitaryGlyph} from './MilitaryGlyph';
import {operationArrow} from '../game/operationArrow';
import {WaterMotion,MapClouds} from './MapAtmosphere';
import {reliefImage} from '../game/reliefImage';
import {animate} from 'animejs';
import type {MapMovement} from '../game/practice';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { contains, edgeDistance, generateTerrain, type Point, type TerrainWorld } from '../game/world';
import {oceanGeography,seaSites,seaNames,type SeaZone} from '../game/ocean';
import {troopFormation} from '../game/troops';
import type { Language, Localized } from '../game/policy';

type Props = { capitals?:number[];focusRegion?:number;focusKey?:number;threat?:{from:number;to:number;amount:number};movements?:MapMovement[];replayKey?:number;onReplayEnd?:()=>void;previousGarrisons?:number[];previousOwnership?:number[]; ocean?:SeaZone[];selectedSea?:number;onSelectSea?:(id:number)=>void; seed: number; terrain?: TerrainWorld; nations: { name: Localized; color?: string; resources?: { army: number } }[]; language: Language; selected: number; onSelect: (id: number) => void; ownership?: number[]; garrisons?: number[]; routes?: {from:number;to:number}[]; orderRoutes?: {from:number;to:number}[]; showArmies?: boolean; activeNation?: number; relief?: number; monochrome?: boolean; highlighted?: number };
const outline=(points:Point[])=>points.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')+'Z';

/** @requires Catalog geometry. @ensures Territory, terrain and orders share a flat, keyboard-selectable map. */
export function StrategyMap({seed,terrain,nations,language,selected,onSelect,ownership,garrisons,orderRoutes=[],showArmies=false,highlighted,ocean,selectedSea,onSelectSea,activeNation,capitals,focusRegion,focusKey,threat,movements=[],replayKey,onReplayEnd,previousGarrisons,previousOwnership}:Props) {
  const world=useMemo(()=>terrain??generateTerrain(seed),[terrain,seed]);
  const relief=useMemo(()=>reliefImage(world),[world]);
  const uid=useId().replace(/:/g,'');const [zoom,setZoom]=useState(1);const [pan,setPan]=useState({x:0,y:0});
  const svg=useRef<SVGSVGElement>(null),drag=useRef<{x:number;y:number;px:number;py:number;scale:number;moved:boolean}|null>(null);
  const bounds=useMemo(()=>{const points=world.regions.flatMap(r=>r.polygon),x=Math.min(...points.map(p=>p.x))-55,y=Math.min(...points.map(p=>p.y))-48;return {x,y,w:Math.max(...points.map(p=>p.x))-x+55,h:Math.max(...points.map(p=>p.y))-y+58};},[world]);
  const geography=useMemo(()=>oceanGeography(world),[world]),seas=ocean??geography.zones;
  const seaLabels=useMemo(()=>geography.polygons.map((polygon,i)=>{
    const candidates:Point[]=[];
    for(let y=bounds.y+22;y<bounds.y+bounds.h-22;y+=18)for(let x=bounds.x+22;x<bounds.x+bounds.w-22;x+=18){const p={x,y};if(contains(polygon,p)&&!world.regions.some(r=>contains(r.polygon,p))&&world.landforms.every(poly=>edgeDistance(p,poly)>18))candidates.push(p);}
    return candidates.sort((a,b)=>Math.hypot(a.x-seaSites[i].x,a.y-seaSites[i].y)-Math.hypot(b.x-seaSites[i].x,b.y-seaSites[i].y))[0];
  }),[world,geography,bounds]);
  const owner=(id:number)=>ownership?.[id]??world.regions[id].nation;
  const color=(id:number)=>nations[owner(id)].color??'#bdbdc8';
  const t=(en:string,zh:string)=>language==='en'?en:zh;
  useLayoutEffect(()=>{
    const node=svg.current;if(!node)return;
    const place=()=>{
      const occupied:{x:number;y:number;w:number;h:number}[]=[];
      node.querySelectorAll<SVGGElement>('.flat-badge').forEach(group=>{
        const region=world.regions[Number(group.dataset.region)],width=70;
        const offsets=[[0,0],[0,30],[0,-30],[35,0],[-35,0],...[40,-40,75,-75,110,-110,145].flatMap(dy=>[40,-40,75,-75,110,-110,0].map(dx=>[dx,dy]))];
        const candidates=offsets.map(([dx,dy])=>({x:region.center.x+dx,y:region.center.y+dy}));
        const p=candidates.find(p=>!occupied.some(a=>p.x-width/2<a.x+a.w&&p.x+width/2>a.x&&p.y-26<a.y+a.h&&p.y+16>a.y))??region.center;
        group.setAttribute('transform',`translate(${p.x},${p.y})`);
        const line=group.querySelector('line')!;line.setAttribute('x1',String(region.center.x-p.x));line.setAttribute('y1',String(region.center.y-p.y));
        occupied.push({x:p.x-width/2,y:p.y-26,w:width,h:42});
      });
    };
    place();const observer=new ResizeObserver(place);observer.observe(node);return()=>observer.disconnect();
  },[world,nations,ownership,language,showArmies,bounds]);
  useEffect(()=>{
    const media=matchMedia('(prefers-reduced-motion: reduce)');let pulses:ReturnType<typeof animate>[]=[];
    const sync=()=>{pulses.forEach(a=>a.revert());pulses=[];if(media.matches||document.hidden||!showArmies)return;const nodes=svg.current?.querySelectorAll('.troop-aura');if(nodes?.length){pulses.push(animate(nodes,{opacity:[.25,.65],duration:2100,delay:(_:unknown,i=0)=>(i%5)*170,alternate:true,loop:true,ease:'inOut(2)'}));pulses.push(animate(svg.current!.querySelectorAll('.troop-dot'),{opacity:[.55,1],duration:1800,delay:(_:unknown,i=0)=>(i%7)*110,alternate:true,loop:true,ease:'inOut(2)'}));}};
    sync();media.addEventListener('change',sync);document.addEventListener('visibilitychange',sync);return()=>{pulses.forEach(a=>a.revert());media.removeEventListener('change',sync);document.removeEventListener('visibilitychange',sync);};
  },[world,showArmies,garrisons?.join(',')]);
  const camera=useRef<ReturnType<typeof animate>|null>(null);
  const replayDone=useRef(onReplayEnd);replayDone.current=onReplayEnd;
  const clampPan=(z:number,p:Point)=>({x:Math.max(-bounds.w*(1-1/z)/2,Math.min(bounds.w*(1-1/z)/2,p.x)),y:Math.max(-bounds.h*(1-1/z)/2,Math.min(bounds.h*(1-1/z)/2,p.y))});
  const focus=(id:number,smooth=true)=>{const r=world.regions[id];if(!r)return;camera.current?.pause();const z=2.1,p=clampPan(z,{x:r.center.x-bounds.x-bounds.w/2,y:r.center.y-bounds.y-bounds.h/2});
    if(!smooth||matchMedia('(prefers-reduced-motion: reduce)').matches){setZoom(z);setPan(p);return;}
    const value={x:pan.x,y:pan.y,z:zoom};camera.current=animate(value,{x:p.x,y:p.y,z,duration:550,ease:'out(3)',onUpdate:()=>{setZoom(value.z);setPan({x:value.x,y:value.y});}});
  };
  const capital=capitals?.findIndex(n=>n===activeNation)??world.regions.find(r=>r.nation===activeNation)?.id??-1;
  useEffect(()=>{if(activeNation!==undefined)focus(capital,false);return()=>{camera.current?.pause();};},[world,activeNation]);
  useEffect(()=>{if(focusRegion!==undefined)focus(focusRegion);},[focusRegion,focusKey]);
  const movementPoints=(m:MapMovement)=>{
    const naval=m.kind==='patrol'||m.kind==='recall';
    if(!naval)return [world.regions[m.from]?.center,world.regions[m.to]?.center];
    const port=geography.zones.find(z=>z.id===(m.to>=0?m.to:m.from))?.ports.find(id=>owner(id)===m.nation)??world.regions.find(r=>owner(r.id)===m.nation)?.id??0;
    return [m.from<0?world.regions[port].center:seaLabels[m.from],m.to<0?world.regions[port].center:seaLabels[m.to]];
  };
  useEffect(()=>{
    if(replayKey===undefined)return;
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,animations:ReturnType<typeof animate>[]=[];
    if(!reduced)svg.current?.querySelectorAll<SVGGElement>('.movement-token').forEach((node)=>{const [a,b]=movementPoints(movements[Number(node.dataset.movement)]);if(!a||!b)return;const route=operationArrow(a,b),value={t:0};animations.push(animate(value,{t:1,duration:2600,ease:'inOut(2)',onUpdate:()=>{const p=route.point(value.t);node.setAttribute('transform',`translate(${p.x},${p.y})`);}}));});
    const timer=setTimeout(()=>replayDone.current?.(),reduced?50:3000);return()=>{clearTimeout(timer);animations.forEach(a=>a.pause());};
  },[replayKey]);
  useEffect(()=>{if(!previousGarrisons)return;const nodes=svg.current?.querySelectorAll('.unit-changed,.territory-changed');if(!nodes?.length||matchMedia('(prefers-reduced-motion: reduce)').matches)return;const a=animate(nodes,{opacity:[.65,1],duration:650});return()=>{a.revert();};},[previousGarrisons?.join(','),garrisons?.join(',')]);
  const landRoute=(from:number,to:number)=>operationArrow(world.regions[from].center,world.regions[to].center).path;
  const threatRoute=threat?landRoute(threat.from,threat.to):'';
  const reset=()=>{camera.current?.pause();setZoom(1);setPan({x:0,y:0});};
  const changeZoom=(z:number)=>{camera.current?.pause();setZoom(z);setPan(clampPan(z,pan));};
  return <div className="strategy-map"><div className="flat-map-toolbar"><span>{t('FIELD ATLAS','战区地图')} <small>{zoom>1.05?t('TACTICAL','战术视角'):t('WORLD','战略总览')}</small></span><div>{activeNation!==undefined&&capital>=0&&<button aria-label={t('Focus capital','定位首都')} onClick={()=>focus(capital)}>{t('Capital','首都')}</button>}<button aria-label={t('Zoom out','缩小地图')} disabled={zoom<=1} onClick={()=>changeZoom(Math.max(1,zoom-.3))}>−</button><button aria-label={t('Reset map','重置地图')} onClick={reset}>{t('World','总览')}</button><button aria-label={t('Zoom in','放大地图')} disabled={zoom>=3.5} onClick={()=>changeZoom(Math.min(3.5,zoom+.3))}>＋</button></div></div>
    <div className="map-atlas-frame"><svg ref={svg} className="flat-map" data-zoom={zoom.toFixed(2)} preserveAspectRatio={zoom>1.05?'xMidYMid slice':'xMidYMid meet'} data-renderer="svg2d" data-world={world.seed} data-territory-colors={new Set(world.regions.map(r=>owner(r.id))).size} viewBox={`${bounds.x+bounds.w*(1-1/zoom)/2+pan.x} ${bounds.y+bounds.h*(1-1/zoom)/2+pan.y} ${bounds.w/zoom} ${bounds.h/zoom}`} aria-label={t('Interactive two-dimensional strategy map','交互式二维战略地图')} style={{touchAction:zoom>1?'none':'pan-y'}}
      onPointerDown={e=>{if(zoom>1){drag.current={x:e.clientX,y:e.clientY,px:pan.x,py:pan.y,scale:1/(svg.current?.getScreenCTM()?.a??1),moved:false};}}}
      onPointerMove={e=>{const d=drag.current;if(!d)return;const scale=d.scale;d.moved ||=Math.abs(e.clientX-d.x)+Math.abs(e.clientY-d.y)>5;if(d.moved)e.currentTarget.setPointerCapture(e.pointerId);setPan(clampPan(zoom,{x:d.px-(e.clientX-d.x)*scale,y:d.py-(e.clientY-d.y)*scale}));}}
      onPointerUp={()=>{window.setTimeout(()=>{drag.current=null;},0);}} onPointerCancel={()=>{drag.current=null;}}>
      <defs><pattern id={`${uid}-contested-sea`} width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="4" height="12" fill="#d4b783" fillOpacity=".24"/></pattern><mask id={`${uid}-water`}><rect x={bounds.x} y={bounds.y} width={bounds.w} height={bounds.h} fill="white"/>{world.regions.map(r=><path key={r.id} d={outline(r.polygon)} fill="black"/>)}</mask><clipPath id={`${uid}-land`}>{world.regions.map(r=><path key={r.id} d={outline(r.polygon)}/>)}</clipPath>{world.regions.map(r=><clipPath id={`${uid}-r${r.id}`} key={r.id}><path d={outline(r.polygon)}/></clipPath>)}</defs>
      <rect x={bounds.x} y={bounds.y} width={bounds.w} height={bounds.h} fill="#08141d" pointerEvents="none"/>
      {relief&&<image className="atlas-relief" href={relief} x="0" y="0" width="1002" height="723" preserveAspectRatio="none" pointerEvents="none"/>}
      <g mask={`url(#${uid}-water)`}>{geography.polygons.map((polygon,id)=>{const sea=seas[id],name=seaNames[id][language==='en'?0:1],contested=sea.owner<0&&sea.fleets.some(n=>n>0),control=sea.owner>=0?nations[sea.owner].color:'#557c98';return <g key={id} data-owner={sea.owner} data-contested={contested} className={`flat-sea ${selectedSea===id?'selected':''}`} role={onSelectSea?'button':undefined} tabIndex={onSelectSea?0:undefined} aria-label={`${t('Sea','海域')} ${String.fromCharCode(65+id)} · ${name}`} aria-pressed={selectedSea===id} onClick={()=>{if(!drag.current?.moved)onSelectSea?.(id);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelectSea?.(id);}}}><path d={outline(polygon)} className="sea-control-fill" fill={control} fillOpacity={sea.owner>=0?(selectedSea===id?.38:.28):(selectedSea===id?.14:.025)} stroke={selectedSea===id?'#f4efda':sea.blockade>=0?'#ed6476':contested?'#d4b783':control} strokeOpacity={sea.owner>=0||selectedSea===id||contested?.85:.38} strokeWidth={sea.owner>=0||selectedSea===id?2:1} vectorEffect="non-scaling-stroke" strokeDasharray={sea.owner>=0?undefined:'5 8'}/>{contested&&<path d={outline(polygon)} fill={`url(#${uid}-contested-sea)`} pointerEvents="none"/>}<title>{name} · {sea.owner<0?(contested?t('Contested','争夺中'):t('Uncontrolled','无人控制')):nations[sea.owner].name[language]}{sea.blockade>=0?` · ${t('Blockade','封锁')} ${nations[sea.blockade].name[language]}`:''}</title></g>;})}</g>
      <g pointerEvents="none">{seaLabels.map((p,i)=>p&&<text key={i} x={p.x} y={p.y} className="flat-sea-label" textAnchor="middle" fill={seas[i].owner>=0?nations[seas[i].owner].color:'#668292'}>{String.fromCharCode(65+i)}{seas[i].blockade>=0?' ⊘':''}</text>)}</g>
      <g pointerEvents="none">{world.landforms.map((polygon,j)=><path key={j} d={outline(polygon)} fill="none" stroke="#76a7ba" strokeOpacity=".38" strokeWidth="1.4"/>)}</g>
      {world.regions.map(r=><g key={r.id} className={`flat-region ${selected===r.id?'selected':''} ${previousOwnership&&previousOwnership[r.id]!==owner(r.id)?'territory-changed':''}`} role="button" tabIndex={0} aria-pressed={selected===r.id} aria-label={`${t('Sector','地区')} ${r.id+1} · ${nations[owner(r.id)].name[language]}${garrisons?` · ${garrisons[r.id]} ${t('troops','兵力')}`:''}`} onClick={()=>{if(!drag.current?.moved)onSelect(r.id);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(r.id);}}} style={{color:color(r.id)}}>
        <path className="flat-land" d={outline(r.polygon)} fill={color(r.id)} fillOpacity={selected===r.id ? .24 : .13} stroke={r.id===highlighted?'#fff':color(r.id)} strokeOpacity={r.id===highlighted?1:.85} strokeDasharray={r.id===highlighted?'6 3':undefined} strokeWidth={r.id===highlighted?3:selected===r.id?2.6:1}/>
        <g clipPath={`url(#${uid}-r${r.id})`} pointerEvents="none">{world.peaks.filter(p=>p.region===r.id).map((p,i)=><g key={i}><path d={`M${p.center.x-4} ${p.center.y+3}l4 -8 4 8`} fill="none" stroke="#f1e3c3"/></g>)}</g>
        <title>{nations[owner(r.id)].name[language]} · {r.elevation}m · {r.terrain}</title>
      </g>)}
      <g pointerEvents="none">{world.rivers.map((river,i)=>{const d=river.map((p,j)=>`${j?'L':'M'}${p.x},${p.y}`).join(' ');return <g key={i}><path d={d} stroke="#0d171d" strokeWidth="6" fill="none"/><path d={d} stroke="#74b9d2" strokeWidth="1.5" opacity=".85" fill="none" strokeLinecap="round"/></g>;})}
      <WaterMotion world={world} waterMask={`${uid}-water`}/>
      <MapClouds world={world} language={language} dragged={()=>!!drag.current?.moved}/>
      {orderRoutes.map(({from,to},i)=><path key={`order-${i}`} className="operation-arrow flat-order-route" d={landRoute(from,to)}/>)}
      {threat&&<path className="operation-arrow threat-arrow" d={threatRoute}/>}
      {movements.map((m,i)=>{const [a,b]=movementPoints(m);return a&&b&&<path key={`replay-${i}`} className="operation-arrow replay-arrow" d={operationArrow(a,b).path} style={{color:nations[m.nation].color}}/>;})}
      {world.regions.map(r=><g key={r.id} className={`flat-badge ${previousGarrisons&&garrisons&&previousGarrisons[r.id]!==garrisons[r.id]?'unit-changed':''}`} data-region={r.id} pointerEvents="all" onClick={()=>{if(!drag.current?.moved)onSelect(r.id);}} style={{cursor:'pointer'}} transform={`translate(${r.center.x+28},${r.center.y+28})`}><line x1="-28" y1="-28" x2="0" y2="-12" stroke={color(r.id)} opacity=".45"/><rect x="-33" y="-28" width="66" height="47" fill="transparent"/><rect x="-30" y="-15" width="60" height="34" rx="3" fill="#10151a" fillOpacity=".94" stroke={r.id===selected?'#f1eee3':color(r.id)} strokeOpacity={r.id===selected?1:.35} strokeWidth=".8"/><path d="M-27 -12V16" stroke={color(r.id)} strokeWidth="3"/><g className="unit-force" transform="translate(-24,-11) scale(.8)" color="#e2e8ed" aria-hidden="true"><MilitaryGlyph/></g><text x="11" className="flat-province-label" fill={r.id===selected?'#fff':color(r.id)} textAnchor="middle" y="7">{showArmies?(garrisons?.[r.id]??0):String(r.id+1).padStart(2,'0')}</text><text className="unit-sector" y="-21" textAnchor="middle" fill={color(r.id)}>{capitals?.[r.id]===owner(r.id)?'★ ':''}#{String(r.id+1).padStart(2,'0')}</text>{showArmies&&(garrisons?.[r.id]??0)>0&&<g className="troop-formation" data-region={r.id}><path className="troop-aura" d="M-20 13H20" stroke={color(r.id)} strokeWidth="1" opacity=".3"/>{troopFormation(garrisons?.[r.id]??0).map((_,i)=><rect key={i} className="troop-dot" x={-20+i*3.5} y="11" width="2.2" height="3" fill={color(r.id)}/>)}</g>}{r.id===selected&&<path d="M-35 -8v-12h12M23 -20h12v12M35 10v14H23M-23 24h-12V10" stroke="#f4f1e7" strokeWidth="2" fill="none"/>}{previousGarrisons&&garrisons&&previousGarrisons[r.id]!==garrisons[r.id]&&<text className="unit-delta" y="30" textAnchor="middle" fill="#fff">{garrisons[r.id]>previousGarrisons[r.id]?'+':''}{garrisons[r.id]-previousGarrisons[r.id]}</text>}</g>)}
      {threat&&<g className="map-threat"><circle cx={world.regions[threat.from].center.x} cy={world.regions[threat.from].center.y} r="34" fill="none" stroke="#ff536a" strokeWidth="2"/><text x={world.regions[threat.from].center.x} y={world.regions[threat.from].center.y-56} textAnchor="middle" fill="#ff8c9c" className="threat-label">{t('INCOMING','敌军来袭')} {threat.amount}</text></g>}
      {movements.map((m,i)=>{const [a,b]=movementPoints(m);return a&&b&&<g key={i} className="map-movement"><g className="movement-token" data-movement={i} transform={`translate(${a.x},${a.y})`}><circle r="24" fill={nations[m.nation].color} opacity=".12"/>{troopFormation(m.amount).map((p,j)=><circle key={j} cx={p.x} cy={p.y} r="3.2" fill={nations[m.nation].color}/>)}<text textAnchor="middle" y="37" fill="#fff" fontSize="14" stroke="#11151b" strokeWidth="3" paintOrder="stroke">{m.amount}</text></g></g>;})}
      </g>
    </svg><aside className="map-nation-sidebar" aria-label={t('Countries and sea control','国家与海洋控制权')}><span className="map-sidebar-heading">{t('NATIONS','国家')}</span>{nations.map((n,i)=>{const owned=world.regions.filter(r=>owner(r.id)===i);return <button key={i} disabled={!owned.length} aria-pressed={selected>=0&&owner(selected)===i} onClick={()=>{const id=capitals?.findIndex(n=>n===i)??owned[0].id;focus(id>=0?id:owned[0].id);onSelect(id>=0?id:owned[0].id);}} style={{'--nation-color':n.color} as React.CSSProperties}><i/><strong>{n.name[language]}</strong><small>{owned.length} {t('land','陆地')} · {seas.filter(z=>z.owner===i).length} {t('sea','海域')}</small></button>;})}<span className="map-sidebar-heading">{t('SEA CONTROL','海洋控制')}</span><div className="sea-zone-key">{seas.map(z=><button key={z.id} disabled={!onSelectSea} onClick={()=>onSelectSea?.(z.id)} aria-pressed={selectedSea===z.id} title={`${seaNames[z.id][language==='en'?0:1]} · ${z.owner>=0?nations[z.owner].name[language]:z.fleets.some(n=>n>0)?t('Contested','争夺中'):t('Uncontrolled','无人控制')}`} data-controlled={z.owner>=0} data-contested={z.owner<0&&z.fleets.some(n=>n>0)} style={{color:z.owner>=0?nations[z.owner].color:undefined,'--sea-color':z.owner>=0?nations[z.owner].color:'#d4b783'} as React.CSSProperties}>{String.fromCharCode(65+z.id)}<small>{z.blockade>=0?'⊘':z.fleets.reduce((a,b)=>a+b,0)||'—'}</small></button>)}</div></aside></div><div className="flat-map-caption"><span>{t('Forces · pips show scale · numbers show troops','兵力标记 · 短条表示规模 · 数字为实际兵力')}</span><span>{t('Drag to explore · World to zoom out','拖动探索 · 总览缩回全图')}</span></div>
  </div>;
}



