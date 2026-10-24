import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, defaultStanding, type Treaty, type Clause } from '../../src/client/game/sandbox';
import { createDoctrine } from '../../src/client/game/doctrine';
import { scenarios } from '../../src/client/game/scenarios';
import { nativeSimulation } from '../../src/server/native';
const fresh = () => { const s=createSession(scenarios[0],createDoctrine()); s.plans.forEach((p,i)=>{p.submitted=true;p.standing=defaultStanding(s.state.nations[i].resources.army);p.standing.mobilization.mode='off';}); return s; };
const run = (s:ReturnType<typeof fresh>) => nativeSimulation(s.state,s.plans,'resolve');
const clause = (kind:Clause['kind'],actor=0,target=1):Clause => ({kind,actor,target,resource:'treasury',amount:10,start:1,every:1});
const compact = (clauses:Clause[],from=0,to=1):Treaty => ({id:1,from,to,kind:'compact',give:'treasury',receive:'food',amount:1,duration:3,remaining:0,signatures:[from,to],status:'pending',clauses});

test('automatic recruitment persists, honors target/budget, and charges costs with emergency tradeoffs',async()=>{
  const s=fresh(); s.plans[0].standing!.mobilization={mode:'emergency',target:125,budget:12,region:0};
  const result=await run(s), event=result.report!.events.find(e=>e.code==='auto-recruit' && e.nation===0)!;
  assert.equal(event.amount,3); assert.equal(result.nations[0].resources.army,123);assert.equal(result.nations[0].resources.population,84);
  assert.equal(result.report!.ledger[0].spending.treasury,12);assert.equal(result.report!.ledger[0].spending.food,3);assert.equal(result.nations[0].stability,68);
  s.state=result;s.plans[0].standing=undefined;
  const second=await run(s);assert.equal(second.nations[0].resources.army,125);
  s.state=second;assert.equal((await run(s)).report!.events.filter(e=>e.code==='auto-recruit'&&e.nation===0).length,0);
});
test('automatic recruitment safely reduces at reserves, zero population margin and a lost destination',async()=>{
  const s=fresh();s.state.nations[0].resources.treasury=21;s.state.nations[0].resources.food=21;s.state.nations[0].resources.population=20;
  s.plans[0].standing!.mobilization={mode:'expansion',target:999,budget:200,region:24};
  const r=await run(s), e=r.report!.events.find(e=>e.code==='auto-recruit')!;assert.equal(e.amount,0);assert.equal(e.target,0);assert.equal(r.report!.ledger[0].spending.treasury,0);
});
test('standing budgets scale proportionally, reserve cash, persist, and do not fund current-turn manual upgrades',async()=>{
  const s=fresh();s.state.nations[0].resources.treasury=30;s.plans[0].standing!.programs={political:20,economy:20,society:20,technology:20,diplomacy:20};
  const r=await run(s);assert.equal(r.report!.ledger[0].spending.treasury,10);assert.equal(r.report!.events.filter(e=>e.code==='program-funded').length,5);
  assert.equal(r.nations[0].standing!.programs.technology,20);assert.equal(r.nations[0].resources.research,32);
  s.state.nations[0].resources.research=24;s.plans[0].orders=[{kind:'research',field:'production'}];await assert.rejects(run(s),/insufficient research/);
});
test('compact schedules non-equal atomic transfers and expires after the promised settlements',async()=>{
  const s=fresh();s.state.treaties=[compact([{...clause('transfer'),amount:7,start:2,every:2},{...clause('transfer',1,0),resource:'food',amount:11,start:2,every:2}])];
  const one=await run(s);assert.equal(one.report!.events.filter(e=>e.code==='treaty-payment').length,0);
  s.state=one;const two=await run(s);assert.equal(two.report!.events.filter(e=>e.code==='treaty-payment').length,2);
  s.state=two;const three=await run(s);assert.equal(three.treaties[0].status,'expired');assert.equal(three.report!.events.filter(e=>e.code==='treaty-payment').length,0);
});
test('payment default transfers nothing, ends once, and applies trust penalty only to defaulting payer',async()=>{
  const s=fresh();s.state.nations[0].resources.treasury=0;
  s.state.treaties=[compact([{...clause('transfer'),amount:100},{...clause('transfer',1,0),resource:'food',amount:5}])];
  const baseline=structuredClone(s);baseline.state.treaties=[];
  const [a,b]=await Promise.all([run(s),run(baseline)]);assert.equal(a.treaties[0].status,'breached');assert.equal(a.nations[0].trust,b.nations[0].trust-8);assert.equal(a.nations[1].trust,b.nations[1].trust);
  a.nations.forEach((n,i)=>assert.deepEqual(n.resources,b.nations[i].resources));
  s.state=a;assert.equal((await run(s)).nations[0].trust,a.nations[0].trust);
});
test('declared third-party attack terminates the pact before combat without global trust penalty',async()=>{
  const s=fresh(), from=s.state.regions.find(r=>r.neighbors.some(id=>s.state.regions[id].owner!==r.owner))!, to=s.state.regions[from.neighbors.find(id=>s.state.regions[id].owner!==from.owner)!];
  const partner=[0,1,2,3,4].find(i=>i!==from.owner&&i!==to.owner)!;
  s.state.treaties=[compact([clause('peace',from.owner,partner),clause('cancel_on_attack',from.owner,to.owner)],from.owner,partner)];
  s.plans[from.owner].orders=[{kind:'attack',from:from.id,to:to.id,amount:1}];
  const r=await run(s);assert.equal(r.treaties[0].status,'terminated');assert.equal(r.nations[from.owner].trust,s.state.nations[from.owner].trust);assert.ok(r.report!.events.some(e=>e.code==='treaty-condition'));
});
test('illegal third-party obligations and malformed standing settings never enter native settlement',async()=>{
  const s=fresh();s.state.treaties=[compact([clause('transfer',2,0)])];await assert.rejects(run(s),/actor/);
  s.state.treaties=[];s.plans[0].standing!.mobilization.budget=-1;await assert.rejects(run(s),/Invalid standing/);
});
