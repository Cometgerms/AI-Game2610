import type {GameState,Order} from './sandbox';
/** @requires An owned destination and opening state. @ensures Goal-based planning preserves rear garrisons, respects adjacency and never invents an attack. */
export function reinforceCapital(state:GameState,nation:number,target:number):Order[]{
 const capital=state.regions[target];if(!capital||capital.owner!==nation)return [];
 const danger=Math.max(0,...capital.neighbors.filter(id=>state.regions[id].owner!==nation).map(id=>state.regions[id].army));
 let needed=Math.max(5,Math.ceil(danger*1.25)-capital.army),energy=state.nations[nation].resources.energy;
 const sources=capital.neighbors.map(id=>state.regions[id]).filter(r=>r.owner===nation&&r.army>1&&r.capital!==nation)
  .sort((a,b)=>a.neighbors.filter(id=>state.regions[id].owner!==nation).length-b.neighbors.filter(id=>state.regions[id].owner!==nation).length||b.army-a.army||a.id-b.id);
 const orders:Order[]=[];
 for(const source of sources){const amount=Math.min(needed,Math.floor(source.army/2),energy*10);if(amount>0){orders.push({kind:'move',from:source.id,to:target,amount});needed-=amount;energy-=Math.ceil(amount/10);}if(needed<=0)break;}
 return orders;
}
