import type {Battle,GameState,Order} from './sandbox';
/** @requires A known incoming force. @ensures A conditional deterministic preview never reads hidden opponent plans or pretends to be a random win probability. */
export function forecastDefense(state:GameState,from:number,to:number,amount:number,orders:Order[]):Battle{
 const defender=state.regions[to].owner,attacker=state.regions[from].owner,terrain=state.regions[to].terrain;
 const defenseArmy=state.regions[to].army+orders.filter(o=>o.kind==='move'&&o.to===to).reduce((sum,o)=>sum+(o.amount??0),0)-orders.filter(o=>o.kind==='move'&&o.from===to).reduce((sum,o)=>sum+(o.amount??0),0);
 const forces=[{nation:defender,army:defenseArmy},{nation:attacker,army:amount}].map(f=>{
  const n=state.nations[f.nation],defense=f.nation===defender?(terrain==='mountain'?1.4:['plateau','river'].includes(terrain)?1.2:1.1):1,supply=n.resources.food===0||n.resources.energy===0?.65:1;
  const held=f.nation===defender&&orders.some(o=>o.kind==='hold'&&o.from===to),factor=(1+.15*n.tech.military)*defense*supply*(1-n.fatigue*.003)*(held?1.15:1)*(n.edicts.some(e=>e.kind==='military')?1.1:1);
  return {...f,power:f.army*factor,factor,supply,defense,held,military:n.tech.military,fatigue:n.fatigue,food:n.resources.food,energy:n.resources.energy,treasury:n.resources.treasury};
 });
 const winner=forces[0].power>=forces[1].power?defender:attacker,w=forces.find(f=>f.nation===winner)!,other=forces.find(f=>f.nation!==winner)!;
 return {region:to,defender,terrain,winner,forces,survivors:Math.max(1,w.army-Math.ceil(other.power*.55/w.factor))};
}
