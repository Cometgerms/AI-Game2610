import test from 'node:test';
import assert from 'node:assert/strict';
import {PracticeStore} from '../../src/server/practice';
import {nativeSimulation} from '../../src/server/native';
import {forecastDefense} from '../../src/client/game/battleForecast';
test('known-force forecast matches native power and casualties, including shortage and hold',async()=>{
 for(const shortage of [false,true])for(const hold of [false,true]){
  const v=new PracticeStore().start('forecast'),s=v.session,defender=v.nation,attacker=s.state.regions[v.threatFrom].owner;
  s.plans.forEach(p=>{p.submitted=true;p.orders=[];});
  s.state.nations[defender].tech.military=1;s.state.nations[defender].fatigue=20;
  if(shortage)s.state.nations[defender].resources.food=0;
  s.plans[attacker].orders=[{kind:'attack',from:v.threatFrom,to:v.defend,amount:12}];
  if(hold)s.plans[defender].orders=[{kind:'hold',from:v.defend}];
  const estimate=forecastDefense(s.state,v.threatFrom,v.defend,12,s.plans[defender].orders);
  const result=await nativeSimulation(s.state,s.plans,'resolve'),battle=result.report!.battles.find(b=>b.region===v.defend)!;
  assert.equal(estimate.winner,battle.winner);assert.equal(estimate.survivors,battle.survivors);
  for(const force of battle.forces){const prediction=estimate.forces.find(f=>f.nation===force.nation)!;assert.ok(Math.abs(force.power-prediction.power)<.051);assert.equal(force.remaining!+force.losses!,force.army);}
 }
});
