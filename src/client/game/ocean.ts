import {clip,contains,type Point,type TerrainWorld} from './world';
import type {GameState} from './sandbox';
export type SeaZone={id:number;owner:number;fleets:number[];blockade:number;neighbors:number[];ports:number[]};
export const seaNames=[['Western Ocean','西部洋'],['Emerald Strait','翡翠海峡'],['Northern Sea','北境海'],['Dawn Reach','曙光海'],['Southern Sea','南部海'],['Trade Wind Passage','信风航道']] as const;
export const seaSites:Point[]=[{x:0,y:425},{x:245,y:375},{x:540,y:0},{x:1030,y:370},{x:650,y:735},{x:235,y:690}];
const adjacency=[[1,2,5],[0,2,5],[0,1,3],[2,4],[3,5],[0,1,4]];
export const seaFrame={x:-80,y:-60,w:1200,h:860};
const cache=new WeakMap<TerrainWorld,{zones:SeaZone[];polygons:Point[][]}>();
/** @requires Fixed catalog geometry. @ensures Only exposed coastline provides access to sea zones. */
export function oceanGeography(world:TerrainWorld){
  const saved=cache.get(world);if(saved)return saved;
  const zones:SeaZone[]=seaSites.map((_,id)=>({id,owner:-1,fleets:[0,0,0,0,0],blockade:-1,neighbors:adjacency[id],ports:[]}));
  const polygons=seaSites.map((site,i)=>seaSites.reduce((polygon,other,j)=>i===j?polygon:clip(polygon,site,other),[{x:-80,y:-60},{x:1120,y:-60},{x:1120,y:800},{x:-80,y:800}]));
  for(const region of world.regions)for(let i=0;i<region.polygon.length;i++){
    const a=region.polygon[i],b=region.polygon[(i+1)%region.polygon.length],length=Math.hypot(b.x-a.x,b.y-a.y);if(length<.01)continue;
    for(const fraction of [.25,.5,.75])for(const sign of [-1,1]){
      const p={x:a.x+(b.x-a.x)*fraction+sign*(b.y-a.y)/length*1.5,y:a.y+(b.y-a.y)*fraction-sign*(b.x-a.x)/length*1.5};
      if(world.regions.some(r=>contains(r.polygon,p)))continue;
      const zone=seaSites.map((s,id)=>({id,d:Math.hypot(s.x-p.x,s.y-p.y)})).sort((a,b)=>a.d-b.d)[0].id;
      if(!zones[zone].ports.includes(region.id))zones[zone].ports.push(region.id);
    }
  }
  const result={zones,polygons};cache.set(world,result);return result;
}
export const navalKinds=['build_fleet','patrol','recall','blockade','open_sea'] as const;
export function navalTotal(state:GameState,nation:number){return (state.nations[nation].navalReserve??0)+(state.ocean??[]).reduce((sum,z)=>sum+z.fleets[nation],0);}
/** @requires Current settled state. @ensures Neutral/open water permits passage; explicit targeted blockades do not. */
export function seaPath(state:GameState,from:number,to:number,nation:number):number[]|null{
  if(!state.ocean)return state.regions[from].sea.includes(to)?[]:null;
  const allowed=(id:number)=>state.ocean![id].owner===nation||state.ocean![id].blockade!==nation;
  const queue=state.ocean.filter(z=>z.ports.includes(from)&&allowed(z.id)).map(z=>[z.id]),seen=new Set<number>();
  while(queue.length){const path=queue.shift()!,id=path[path.length-1];if(seen.has(id))continue;seen.add(id);const zone=state.ocean[id];if(zone.ports.includes(to))return path;for(const next of zone.neighbors)if(!seen.has(next)&&allowed(next))queue.push([...path,next]);}
  return null;
}
export function maritimeDestinations(state:GameState,from:number,nation:number){return state.regions.filter(r=>r.id!==from&&(state.regions[from].neighbors.includes(r.id)||(navalTotal(state,nation)>0&&seaPath(state,from,r.id,nation)!==null))).map(r=>r.id);}
