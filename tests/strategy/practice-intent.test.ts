import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PracticeStore} from '../../src/server/practice';
import {Interpreter} from '../../src/server/ai';
import {checkPracticePlan} from '../../src/client/game/practiceLimits';
import {trainingPhrase} from '../../src/client/game/trainingPhrase';
import {spotlightPosition} from '../../src/client/game/spotlightPosition';
const offline=new Interpreter({logPath:'unused-test-log'});

test('training clips a million-fund investment, shares the budget, reports adjustments and actually settles',async()=>{
 const store=new PracticeStore(),v=store.start('clip'),base={orders:[],standing:v.session.plans[v.nation].standing!};
 const plan=trainingPhrase('后方部队全力增援首都；工业投资100万；研究生产科技',v,v.reinforceFrom,v.defend,base)!;
 assert.equal(plan.orders[0].amount,v.session.state.regions[v.reinforceFrom].army);
 const before=JSON.stringify(v),preview=await store.interpret('clip',0,'后方部队全力增援首都；工业投资100万；研究生产科技',v.reinforceFrom,v.defend,base,'zh',offline);
 assert.equal(preview.plan.orders[1].amount,250);assert.equal(preview.adjustments[0].requested,1000000);assert.equal(JSON.stringify(v),before);
 const next=await store.advance('clip',0,plan);assert.equal(next.stage,1);assert.equal(next.adjustments![0].actual,250);assert.equal(next.session.state.regions[v.reinforceFrom].army,0);assert.equal(next.session.state.nations[v.nation].tech.production,1);
});
test('ambiguous, fractional, nonfinite and foreign intents cannot bypass checks',async()=>{
 const store=new PracticeStore(),v=store.start('bounds'),base={orders:[],standing:v.session.plans[v.nation].standing!};
 assert.equal(trainingPhrase('不要调动全部兵力',v,v.reinforceFrom,v.defend,base),null);
 await assert.rejects(store.interpret('bounds',0,'全力调动',v.defend,v.defend,base,'zh',offline),/adjacent/);
 await assert.rejects(store.interpret('bounds',0,'全力调动',v.threatFrom,v.defend,base,'zh',offline),/own region/);
 for(const amount of [-1,NaN,Infinity,null])assert.throws(()=>checkPracticePlan({...base,orders:[{kind:'invest',field:'industry',amount}]},v.session.state,v.nation,0),/finite/);
 const result=checkPracticePlan({...base,orders:[{kind:'move',from:v.reinforceFrom,to:v.defend,amount:99999},{kind:'invest',field:'industry',amount:200.8},{kind:'invest',field:'food',amount:100000}]},v.session.state,v.nation,0);
 assert.deepEqual(result.plan.orders.map(o=>o.amount),[10,200,50]);
 await assert.rejects(store.interpret('bounds',1,'固守首都',v.defend,v.defend,base,'zh',offline),/changed/);
});
test('free-form AI result is clipped before native validation and cannot mutate training',async t=>{
 const folder=await mkdtemp(join(tmpdir(),'strat-practice-ai-'));t.after(()=>rm(folder,{recursive:true,force:true}));
 const store=new PracticeStore(),v=store.start('ai'),base={orders:[],standing:v.session.plans[v.nation].standing!};
 const request:typeof fetch=async()=>new Response(JSON.stringify({status:'completed',usage:{input_tokens:100,output_tokens:100},output:[{content:[{type:'output_text',text:JSON.stringify({explanation:'Invest',unsupported:[],duration:1,clauses:[],orders:[{kind:'invest',field:'industry',from:null,to:null,amount:1000000}]})}]}]}));
 const ai=new Interpreter({key:'test',logPath:join(folder,'usage.jsonl')},request);
 const result=await store.interpret('ai',0,'Pour a million funds into industry',v.reinforceFrom,v.defend,base,'en',ai);
 assert.equal(result.source,'ai');assert.equal(result.plan.orders[0].amount,250);assert.equal(result.adjustments[0].requested,1000000);assert.equal(v.stage,0);
});
test('spotlight attaches 14px from either side instead of pinning to the opposite screen edge',()=>{
 const map={x:170,y:90,w:740,h:580};const a=spotlightPosition(map,340,250,1600,900);assert.equal(a.left,924);
 const controls={x:1030,y:350,w:500,h:260};const b=spotlightPosition(controls,340,250,1600,900);assert.equal(b.left+340,1016);
 const mobile=spotlightPosition({x:16,y:28,w:358,h:500},340,250,390,844);assert.ok(mobile.left>=16&&mobile.left+340<=374);assert.ok(mobile.top+250<=828);
});


test('defensive goals infer owned adjacent reinforcements without selector fields and retain rear troops',async()=>{
 const store=new PracticeStore();
 for(const [i,text] of ['加强首都','增援首都','强化首都防御','Strengthen the capital','Reinforce capital','Bolster the capital defenses'].entries()){
  const id=`goal-${i}`,v=store.start(id),base={orders:[],standing:v.session.plans[v.nation].standing!};
  const result=await store.interpret(id,0,text,undefined,undefined,base,'zh',offline);
  assert.ok(result.plan.orders.length>0);assert.ok(result.explanation.length>20);
  for(const o of result.plan.orders){assert.equal(o.kind,'move');assert.equal(o.to,v.defend);const from=v.session.state.regions[o.from!];assert.equal(from.owner,v.nation);assert.ok(from.neighbors.includes(v.defend));assert.ok(o.amount!<=Math.floor(from.army/2));}
 }
});
