import {createDoctrine} from '../client/game/doctrine';
import {defaultStanding,isStoredPlan,type GameState,type Plan,type Order} from '../client/game/sandbox';
import type {ForecastCase,PlanForecast} from '../client/game/forecast';
import {nativeSimulation} from './native';

export function forecastCase(before:GameState,after:GameState,nation:number,kind:ForecastCase['kind'],assumptions:ForecastCase['assumptions']):ForecastCase {
  const report=after.report!;
  return {kind,assumptions,ledger:report.ledger[nation],
    battles:report.battles.filter(b=>b.forces.some(f=>f.nation===nation)),
    control:after.regions.filter(r=>r.owner!==before.regions[r.id].owner&&(r.owner===nation||before.regions[r.id].owner===nation)).map(r=>({region:r.id,from:before.regions[r.id].owner,to:r.owner,capital:r.capital===nation})),
    exposed:after.regions.filter(r=>r.owner===nation&&r.army===0&&r.neighbors.some(id=>after.regions[id].owner!==nation)).map(r=>r.id),
    events:report.events.filter(e=>e.nation===nation||e.target===nation).filter(e=>['shortage','treaty-condition','treaty-default','trade-blocked','program-reduced','auto-recruit'].includes(e.code))
  };
}

const peaceful=(state:GameState,a:number,b:number)=>state.treaties.some(t=>
  (t.status==='active'||t.status==='pending'&&t.signatures.length===2)&&
  [t.from,t.to].includes(a)&&[t.from,t.to].includes(b)&&
  (['nonaggression','ceasefire'].includes(t.kind)||t.clauses?.some(c=>c.kind==='peace')));

/** @requires Public opening state only. @ensures Each hypothetical source is spent once, obeys energy limits and respects signed peace. */
function opposition(state:GameState,nation:number,own:Plan,fraction:number):ForecastCase['assumptions'] {
  const result:ForecastCase['assumptions']=[],used=new Set<number>(),energy=state.nations.map(n=>n.resources.energy);
  const attacks=own.orders.filter(o=>o.kind==='attack').map(o=>o.to!);
  const defense=own.orders.filter(o=>o.kind==='hold'||o.kind==='move'||o.kind==='retreat').map(o=>o.kind==='hold'?o.from!:o.to!);
  const capital=state.regions.find(r=>r.capital===nation&&r.owner===nation);
  if(capital)defense.push(capital.id);
  for(const target of [...new Set([...attacks,...defense])]){
    const region=state.regions[target];
    const candidates=state.regions.filter(r=>r.owner!==nation&&r.army>1&&!used.has(r.id)&&r.neighbors.includes(target)&&
      (region.owner!==nation?r.owner===region.owner:!peaceful(state,r.owner,nation))).sort((a,b)=>b.army-a.army||a.id-b.id);
    // A defensive stress case uses one neighbouring opponent per target; it does not invent a coalition.
    const actor=region.owner===nation?candidates[0]?.owner:region.owner;
    for(const source of candidates.filter(r=>r.owner===actor)){
      const amount=Math.min(Math.floor(source.army*fraction),energy[source.owner]*10);
      if(amount<1)continue;
      const order:Order={kind:region.owner===nation?'attack':'move',from:source.id,to:target,amount};
      result.push({nation:source.owner,order});used.add(source.id);energy[source.owner]-=Math.ceil(amount/10);
    }
  }
  return result;
}

/** @requires An authorized server snapshot and the player's draft. @ensures No opponent plans enter the forecast and no room state is mutated. */
export async function forecastPlan(state:GameState,nation:number,input:unknown):Promise<PlanForecast>{
  if(!isStoredPlan(input)||input.orders.length>20)throw new Error('Invalid forecast draft. / 推演指令无效。');
  const opening=structuredClone(state),own=structuredClone(input);
  const cases:ForecastCase[]=[];
  for(const [kind,fraction] of [['unchanged',0],['pressure',.25],['surge',.5]] as const){
    const assumptions=fraction?opposition(opening,nation,own,fraction):[];
    const plans=opening.nations.map((n,i):Plan=>{
      const standing=defaultStanding(n.resources.army);standing.mobilization.mode='off';
      return i===nation?{...own,submitted:true}:{strategy:'',doctrine:createDoctrine(),standing,orders:assumptions.filter(a=>a.nation===i).map(a=>a.order),submitted:true};
    });
    const after=await nativeSimulation(opening,plans,'resolve');
    cases.push(forecastCase(opening,after,nation,kind,assumptions));
  }
  return {scenario:opening.scenario,turn:opening.turn,nation,cases};
}
