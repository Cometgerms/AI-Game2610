import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession,defaultStanding,isStoredPlan,type Session} from '../../src/client/game/sandbox';
import {createDoctrine} from '../../src/client/game/doctrine';
import {scenarios} from '../../src/client/game/scenarios';
import {seaPath,navalTotal,oceanGeography} from '../../src/client/game/ocean';
import {scenarioWorld} from '../../src/client/game/scenarioWorld';
import {nativeSimulation} from '../../src/server/native';

function game(index=0){const s=createSession(scenarios[index],createDoctrine());s.plans.forEach(p=>{p.submitted=true;p.standing=defaultStanding();p.standing.mobilization.mode='off';});return s;}
const resolve=(s:Session)=>nativeSimulation(s.state,s.plans,'resolve');
const coastal=(s:Session,n:number)=>s.state.ocean!.find(z=>z.ports.some(id=>s.state.regions[id].owner===n))!;
function reset(s:Session){s.plans.forEach(p=>p.orders=[]);}

test('all five worlds give the island real coastal access, reciprocal sea routes and multiple foreign destinations',()=>{
  for(let map=0;map<5;map++){
    const s=game(map),sea=s.state.ocean!,world=scenarioWorld(scenarios[map]);
    assert.equal(sea.length,6);assert.equal(navalTotal(s.state,1),8);
    assert.ok(sea.filter(z=>z.ports.some(id=>s.state.regions[id].owner===1)).length>=2);
    for(const z of sea){for(const n of z.neighbors)assert.ok(sea[n].neighbors.includes(z.id));assert.equal(new Set(z.ports).size,z.ports.length);}
    const destinations=new Set<number>();
    for(const r of s.state.regions.filter(r=>r.owner===1))for(const other of s.state.regions)if(other.owner!==1&&seaPath(s.state,r.id,other.id,1))destinations.add(other.owner);
    assert.ok(destinations.size>=3);
    assert.ok(oceanGeography(world).polygons.every(poly=>poly.length>=3));
  }
});
test('patrols settle simultaneously, tie without combat, and charge only deployed maintenance',async()=>{
  const s=game(),z=coastal(s,1),baseline=await resolve(s);s.plans[1].orders=[{kind:'patrol',from:-1,to:z.id,amount:3}];
  s.state=await resolve(s);const n=s.state.nations[1],ledger=s.state.report!.ledger[1];
  assert.equal(s.state.ocean![z.id].owner,1);assert.equal(n.navalReserve,5);assert.equal(navalTotal(s.state,1),8);
  assert.equal(ledger.spending.energy,1);assert.equal(ledger.upkeep.energy,baseline.report!.ledger[1].upkeep.energy+1);
  assert.equal(ledger.upkeep.treasury,baseline.report!.ledger[1].upkeep.treasury+1);assert.equal(ledger.income.treasury,baseline.report!.ledger[1].income.treasury+2);
  assert.equal(n.score.military,baseline.nations[1].score.military+2);
  reset(s);s.state.ocean![z.id].fleets[0]=3;s.state.nations[0].tech={...n.tech};s.state=await resolve(s);
  assert.equal(s.state.ocean![z.id].owner,-1);assert.equal(s.state.ocean![z.id].fleets[0],3);assert.equal(s.state.ocean![z.id].fleets[1],3);
  s.state.nations[1].tech.military++;s.state=await resolve(s);assert.equal(s.state.ocean![z.id].owner,1);
});
test('new ships wait a turn, shipyard capacity and one movement per source are enforced atomically',async()=>{
  const s=game(),z=coastal(s,1);s.state.nations[1].navalReserve=0;
  s.plans[1].orders=[{kind:'build_fleet',amount:2},{kind:'patrol',from:-1,to:z.id,amount:2}];
  await assert.rejects(resolve(s),/opening fleet/);assert.equal(s.state.nations[1].navalReserve,0);
  s.plans[1].orders=[{kind:'build_fleet',amount:2}];s.state=await resolve(s);assert.equal(s.state.nations[1].navalReserve,2);assert.equal(s.state.report!.ledger[1].spending.treasury,20);assert.equal(s.state.report!.ledger[1].spending.energy,6);
  s.plans[1].orders=[{kind:'patrol',from:-1,to:z.id,amount:1},{kind:'patrol',from:-1,to:z.id,amount:1}];await assert.rejects(resolve(s),/One fleet movement/);
  s.plans[1].orders=[{kind:'build_fleet',amount:20}];await assert.rejects(resolve(s),/capacity/);
  s.plans[1].orders=[{kind:'patrol',from:-2,to:0,amount:1}];assert.equal(isStoredPlan(s.plans[1]),false);await assert.rejects(resolve(s));
});
test('island transports use coast-to-coast routes, opening capacity and route costs',async()=>{
  const s=game();const from=s.state.regions.find(r=>r.owner===1&&s.state.ocean!.some(z=>z.ports.includes(r.id)))!;
  const to=s.state.regions.find(r=>r.owner===0&&seaPath(s.state,from.id,r.id,1))!;
  const path=seaPath(s.state,from.id,to.id,1)!;assert.ok(path.length>0);
  s.plans[1].orders=[{kind:'attack',from:from.id,to:to.id,amount:3}];const next=await resolve(s);
  assert.equal(next.report!.ledger[1].spending.treasury,1);assert.equal(next.report!.ledger[1].spending.energy,1+path.length);assert.ok(next.report!.battles.some(b=>b.region===to.id));
  s.state.nations[1].navalReserve=0;await assert.rejects(resolve(s),/capacity/);
  s.state.nations[1].navalReserve=8;
  for(const z of s.state.ocean!)if(z.ports.includes(from.id)){z.owner=0;z.fleets[0]=3;z.blockade=1;}
  assert.equal(seaPath(s.state,from.id,to.id,1),null);await assert.rejects(resolve(s),/open coastal route/);
});
test('blockades pause island payments without defaults; a signed peace reopens passage',async()=>{
  const s=game();for(const z of s.state.ocean!){z.owner=0;z.fleets[0]=1;z.blockade=1;}
  s.state.treaties.push({id:1,from:1,to:3,kind:'compact',give:'treasury',receive:'food',amount:1,duration:3,remaining:3,status:'pending',signatures:[1,3],clauses:[{kind:'transfer',actor:1,target:3,resource:'treasury',amount:5,start:1,every:1}]});
  const trust=s.state.nations[1].trust;s.state=await resolve(s);assert.ok(s.state.report!.events.some(e=>e.code==='trade-blocked'));assert.equal(s.state.nations[1].trust,trust);assert.equal(s.state.treaties[0].status,'active');assert.equal(s.state.treaties[0].remaining,2);assert.ok(!s.state.report!.events.some(e=>e.code==='treaty-default'||e.code==='treaty-payment'));
  s.state.treaties.push({id:2,from:0,to:1,kind:'nonaggression',give:'treasury',receive:'food',amount:1,duration:2,remaining:2,status:'pending',signatures:[0,1]});s.state=await resolve(s);
  assert.ok(s.state.ocean!.every(z=>z.blockade===-1));assert.ok(s.state.report!.events.some(e=>e.code==='treaty-payment'));
  s.plans[0].orders=[{kind:'blockade',from:0,to:1}];await assert.rejects(resolve(s),/signed peace/);
});
test('sea policy needs opening control, control loss clears blockade, independent army and fleet sources work',async()=>{
  const s=game(),zone=coastal(s,1);s.plans[1].orders=[{kind:'blockade',from:zone.id,to:0}];await assert.rejects(resolve(s),/opening control/);
  s.plans[1].orders=[{kind:'patrol',from:-1,to:zone.id,amount:2},{kind:'hold',from:s.state.regions.find(r=>r.owner===1)!.id}];s.state=await resolve(s);
  s.plans[1].orders=[{kind:'blockade',from:zone.id,to:0},{kind:'recall',from:zone.id,amount:2}];s.state=await resolve(s);assert.equal(s.state.ocean![zone.id].owner,-1);assert.equal(s.state.ocean![zone.id].blockade,-1);assert.equal(navalTotal(s.state,1),8);
});
