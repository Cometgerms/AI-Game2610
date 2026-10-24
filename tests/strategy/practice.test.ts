import test from 'node:test';
import assert from 'node:assert/strict';
import {PracticeStore,type PracticeView} from '../../src/server/practice';
import type {PracticeInput} from '../../src/client/game/practice';
import {createSession,defaultStanding} from '../../src/client/game/sandbox';
import {createDoctrine} from '../../src/client/game/doctrine';
import {scenarios} from '../../src/client/game/scenarios';
import {researchCost,researchFunds} from '../../src/client/game/balance';
import {nativeSimulation} from '../../src/server/native';

function input(v:PracticeView,amount=5):PracticeInput {
 const standing=structuredClone(v.session.plans[v.nation].standing!);
 if(v.stage===0)return {standing,orders:[{kind:'move',from:v.reinforceFrom,to:v.defend,amount},{kind:'invest',field:'industry',amount:20},{kind:'research',field:'production'}]};
 if(v.stage===1){standing.mobilization={mode:'reserve',target:v.session.state.nations[v.nation].resources.army+12,budget:12,region:v.defend};return {standing,orders:[{kind:'patrol',from:-1,to:v.session.state.ocean!.find(z=>z.ports.some(id=>v.session.state.regions[id].owner===v.nation))!.id,amount:3}],tradeOffer:{give:5,receive:10}};}
 return {standing,orders:[{kind:'hold',from:v.defend}]};
}
test('practice completes three player-authored settlements with movement, conquest, trade and defence',async()=>{
 const store=new PracticeStore();let a=store.start('learner');const b=store.start('other');
 await assert.rejects(store.advance('missing',0,input(a)),/expired/);
 await assert.rejects(store.advance('learner',0,undefined),/Choose actual/);
 const first=input(a),opening=a.session.state.regions[a.defend].army;
 const pending=store.advance('learner',0,first);await assert.rejects(store.advance('learner',0,first),/advanced/);a=await pending;
 assert.equal(a.session.state.regions[a.defend].army,opening+5);
 assert.equal(a.session.state.regions[a.contested].owner,2);
 assert.ok(a.playback!.movements.some(m=>m.nation===0&&m.kind==='move'));
 assert.ok(a.playback!.movements.some(m=>m.nation===2&&m.kind==='attack'));
 assert.ok(a.playback!.movements.some(m=>m.nation===1&&m.kind==='patrol'));
 await assert.rejects(store.advance('learner',0,first),/advanced/);
 const unfair=input(a);unfair.tradeOffer!.receive=30;
 await assert.rejects(store.advance('learner',1,unfair),/at most 2 food/);
 for(let stage=1;stage<3;stage++)a=await store.advance('learner',stage,input(a));
 for(const b of a.session.state.report!.battles)for(const f of b.forces){assert.equal(f.losses!+f.remaining!,f.army);assert.ok(Number.isFinite(f.factor));assert.ok(f.supply===1||f.supply===.65);assert.equal(typeof f.treasury,'number');}
 assert.equal(a.session.state.turn,4);assert.equal(a.won,true);assert.ok(Object.values(a.objectives).every(Boolean));assert.equal(a.session.history.length,3);
 assert.equal(b.stage,0);assert.equal(b.session.state.turn,1);await assert.rejects(store.advance('learner',3,input(a)),/advanced/);
 const other=await store.advance('other',0,input(b,2));assert.equal(other.session.state.regions[b.defend].army,opening+2);
});
test('invalid or unaffordable training commands cannot advance or mutate the world',async()=>{
 const store=new PracticeStore(),v=store.start('validation');
 const incomplete=input(v);incomplete.orders.pop();await assert.rejects(store.advance('validation',0,incomplete),/objectives/);
 const malformed=input(v);malformed.orders[1].amount=NaN;await assert.rejects(store.advance('validation',0,malformed),/finite number/i);
 const foreign=input(v);foreign.orders[0].from=v.threatFrom;await assert.rejects(store.advance('validation',0,foreign),/own|source|enemy/i);
 const result=await store.advance('validation',0,input(v));assert.equal(result.stage,1);assert.equal(result.session.history.length,1);
});
test('v0.6 research is affordable with exactly the displayed funds/research, score caps remain bounded',async()=>{
  for(let level=0;level<3;level++){
    const s=createSession(scenarios[0],createDoctrine());s.plans.forEach(p=>{p.submitted=true;p.standing=defaultStanding();p.standing.mobilization.mode='off';});
    const n=s.state.nations[0];n.tech.production=level;n.resources.treasury=researchFunds;n.resources.research=researchCost(level);s.plans[0].orders=[{kind:'research',field:'production'}];
    const result=await nativeSimulation(s.state,s.plans,'resolve');assert.equal(result.nations[0].tech.production,level+1);assert.equal(result.report!.ledger[0].spending.treasury,10);
    n.resources.research--;await assert.rejects(nativeSimulation(s.state,s.plans,'resolve'),/research/);
    assert.equal(result.nations[0].score.economy,Math.min(100,Math.floor(result.nations[0].resources.industry/3)+Math.floor(result.nations[0].resources.treasury/40)));
  }
});


