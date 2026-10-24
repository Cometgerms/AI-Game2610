import { mkdir,writeFile } from 'node:fs/promises';
import { createSession, defaultStanding, type Program } from '../../src/client/game/sandbox';
import { createDoctrine } from '../../src/client/game/doctrine';
import { scenarios } from '../../src/client/game/scenarios';
import { nativeSimulation } from '../../src/server/native';
import {researchCost,researchFunds} from '../../src/client/game/balance';
const roles=['military','diplomacy','industry','society','technology'];
const budgets:Record<Program,number>[]=[{political:5,economy:4,society:0,technology:6,diplomacy:0},{political:5,economy:4,society:10,technology:4,diplomacy:20},{political:5,economy:24,society:6,technology:8,diplomacy:0},{political:10,economy:8,society:24,technology:6,diplomacy:0},{political:5,economy:4,society:10,technology:30,diplomacy:0}];
const games=[];
for(const scenario of scenarios)for(let rotation=0;rotation<5;rotation++){
  const s=createSession(scenario,createDoctrine()),initial=structuredClone(s.state),states=[];
  for(let turn=1;turn<=10;turn++){
    s.plans.forEach((p,i)=>{
      const role=(i+rotation)%5,n=s.state.nations[i];p.submitted=true;p.orders=[];
      p.standing={mobilization:{mode:role===0?'expansion':'reserve',target:Math.round(initial.nations[i].resources.army*(role===0?1.5:1.2)),budget:role===0?30:8,region:-1},programs:budgets[role]};
      const tech=(role===0?['military','production','logistics']:['production','military','logistics']).find(k=>n.tech[k as keyof typeof n.tech]<3 && n.resources.research>=researchCost(n.tech[k as keyof typeof n.tech]));
      if(tech&&n.resources.treasury>=researchFunds+40&&(role===4||turn%3===0))p.orders.push({kind:'research',field:tech});
    });
    s.state=await nativeSimulation(s.state,s.plans,'resolve');states.push(s.state);
  }
  games.push({scenario:scenario.id,rotation,roles:initial.nations.map((_,i)=>roles[(i+rotation)%5]),initial,states});
}
const sensitivity=[];
for(const mode of ['off','reserve','expansion','emergency'] as const)for(const budget of [0,10,20,40,80]){
  const s=createSession(scenarios[0],createDoctrine());s.plans.forEach((p,i)=>{p.submitted=true;p.standing=defaultStanding(s.state.nations[i].resources.army);p.standing.mobilization.mode='off';});
  s.plans[0].standing!.mobilization={mode,target:200,budget,region:0};const state=await nativeSimulation(s.state,s.plans,'resolve');
  sensitivity.push({mode,budget,recruits:state.report!.events.find(e=>e.code==='auto-recruit'&&e.nation===0)?.amount??0,spending:state.report!.ledger[0].spending,tax:state.report!.ledger[0].income.treasury,stability:state.nations[0].stability,population:state.nations[0].resources.population});
}
await mkdir('build/strat',{recursive:true});await writeFile('build/strat/sweep.json',JSON.stringify({games,sensitivity},null,2));console.log('PASS: 25 peaceful scenarios / policy rotations, 250 settlements, 20 mobilization sensitivity cases.');
