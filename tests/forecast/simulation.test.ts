import test from 'node:test';
import assert from 'node:assert/strict';
import {forecastPlan} from '../../src/server/forecast';
import {PracticeStore} from '../../src/server/practice';
import {createSession,defaultStanding,type Plan} from '../../src/client/game/sandbox';
import {createDoctrine} from '../../src/client/game/doctrine';
import {scenarios} from '../../src/client/game/scenarios';
import {nativeSimulation} from '../../src/server/native';
import type {PracticeInput} from '../../src/client/game/practice';

const setup=()=>{const s=createSession(scenarios[0],createDoctrine());s.plans.forEach((p,i)=>{p.standing=defaultStanding(s.state.nations[i].resources.army);p.standing.mobilization.mode='off';p.submitted=true;});return s;};
test('forecast uses native settlement costs and battle outcomes without altering the opening state',async()=>{
 const s=setup(),nation=3,from=s.state.regions.find(r=>r.owner===nation&&r.neighbors.some(id=>s.state.regions[id].owner===0))!,to=from.neighbors.find(id=>s.state.regions[id].owner===0)!;
 const plan:Plan={...s.plans[nation],orders:[{kind:'attack',from:from.id,to,amount:5},{kind:'invest',field:'industry',amount:20},{kind:'research',field:'military'}]};
 const before=JSON.stringify(s),forecast=await forecastPlan(s.state,nation,plan);
 const actual=await nativeSimulation(s.state,s.plans.map((p,i)=>i===nation?plan:p),'resolve');
 assert.deepEqual(forecast.cases[0].ledger,actual.report!.ledger[nation]);
 assert.deepEqual(forecast.cases[0].battles,actual.report!.battles.filter(b=>b.forces.some(f=>f.nation===nation)));
 assert.equal(forecast.cases[0].ledger.spending.treasury,30);
 assert.equal(forecast.cases[0].ledger.spending.energy,1);
 assert.equal(JSON.stringify(s),before);assert.equal(forecast.cases.length,3);
 for(const c of forecast.cases.slice(1)){
  assert.ok(c.assumptions.length>0);const seen=new Set<number>();
  for(const a of c.assumptions){assert.notEqual(a.nation,nation);assert.ok(!seen.has(a.order.from!));seen.add(a.order.from!);assert.ok(a.order.amount!<=Math.floor(s.state.regions[a.order.from!].army*(c.kind==='pressure'?.25:.5)));}
 }
});

test('pressure cases respect signed peace and exhausted enemy energy',async()=>{
 const s=setup(),nation=3;
 s.state.treaties=s.state.nations.flatMap((_,i)=>i===nation?[]:[{id:i+1,from:nation,to:i,kind:'nonaggression' as const,give:'treasury' as const,receive:'food' as const,amount:1,duration:3,remaining:3,signatures:[nation,i],status:'active' as const,text:''}]);
 let result=await forecastPlan(s.state,nation,s.plans[nation]);assert.ok(result.cases.every(c=>c.assumptions.length===0));
 s.state.treaties=[];s.state.nations.forEach((n,i)=>{if(i!==nation)n.resources.energy=0;});
 result=await forecastPlan(s.state,nation,s.plans[nation]);assert.ok(result.cases.every(c=>c.assumptions.length===0));
});

test('all three tutorial forecasts match later real settlement including trade, recruitment and defense',async()=>{
 const store=new PracticeStore();let v=store.start('forecast');
 for(let stage=0;stage<3;stage++){
  const standing=structuredClone(v.session.plans[v.nation].standing!);
  const plan:PracticeInput={standing,orders:stage===0?[{kind:'move',from:v.reinforceFrom,to:v.defend,amount:5},{kind:'invest',field:'industry',amount:20},{kind:'research',field:'production'}]:stage===1?[{kind:'patrol',from:-1,to:v.session.state.ocean!.find(z=>z.ports.some(id=>v.session.state.regions[id].owner===v.nation))!.id,amount:3}]:[{kind:'hold',from:v.defend}]};
  if(stage===1){standing.mobilization.mode='reserve';standing.mobilization.target=v.session.state.nations[v.nation].resources.army+12;standing.mobilization.budget=12;plan.tradeOffer={give:5,receive:10};}
  const f=await store.forecast('forecast',stage,plan),again=await store.forecast('forecast',stage,plan);assert.deepEqual(f,again);
  v=await store.advance('forecast',stage,plan);
  assert.deepEqual(f.cases[0].ledger,v.session.state.report!.ledger[v.nation]);
  assert.deepEqual(f.cases[0].battles,v.session.state.report!.battles.filter(b=>b.forces.some(x=>x.nation===v.nation)));
 }
 assert.equal(v.stage,3);assert.ok(v.won);
});

test('partial tutorial drafts can be forecast but still cannot skip objectives',async()=>{
 const store=new PracticeStore(),v=store.start('partial'),plan={orders:[],standing:v.session.plans[v.nation].standing};
 const f=await store.forecast('partial',0,plan);assert.equal(f.turn,1);
 await assert.rejects(store.advance('partial',0,plan),/objectives/);
 assert.deepEqual(await store.forecast('partial',0,plan),f);
});


test('unopposed occupation is visible even when no combat report is generated',async()=>{
 const s=setup(),nation=3,from=s.state.regions.find(r=>r.owner===nation&&r.neighbors.some(id=>s.state.regions[id].owner===0))!,to=from.neighbors.find(id=>s.state.regions[id].owner===0)!;
 s.state.nations[0].resources.army-=s.state.regions[to].army;s.state.regions[to].army=0;
 const result=await forecastPlan(s.state,nation,{...s.plans[nation],orders:[{kind:'attack',from:from.id,to,amount:5}]});
 assert.ok(result.cases[0].control.some(c=>c.region===to&&c.to===nation));
 assert.ok(!result.cases[0].battles.some(b=>b.region===to));
});
