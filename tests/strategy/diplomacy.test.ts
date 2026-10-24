import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RoomStore } from '../../src/server/rooms';
import { createDoctrine } from '../../src/client/game/doctrine';
import type { RoomView } from '../../src/client/game/network';

test('counteroffers preserve history, require new signatures, and active breaches penalize trust exactly once',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'sovereign-compact-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const store=new RoomStore(join(dir,'rooms.json')), players=await Promise.all(Array.from({length:5},(_,i)=>store.guest(`P${i}`)));
  const room=await store.create(players[0].token,{name:'Diplomacy',scenario:'frontier',doctrine:createDoctrine()});
  const act=(i:number,name:string,body={})=>store.action(players[i].token,room.code,name,body) as Promise<RoomView>;
  for(let i=1;i<5;i++)await act(i,'join',{doctrine:createDoctrine()});await act(0,'start');
  const treaty={to:1,kind:'compact',give:'treasury',receive:'food',amount:1,duration:3,clauses:[{kind:'peace',actor:0,target:1,resource:'treasury',amount:1,start:1,every:1}]};
  await act(0,'treaty',{turn:1,operation:'propose',treaty});
  await assert.rejects(act(2,'treaty',{turn:1,operation:'counter',id:1,treaty:{...treaty,to:0,clauses:[{...treaty.clauses[0],actor:2,target:0}]}}),/recipient/);
  const counter=await act(1,'treaty',{turn:1,operation:'counter',id:1,treaty:{...treaty,to:0,duration:2}});
  assert.equal(counter.session.state.treaties[0].status,'superseded');assert.deepEqual(counter.session.state.treaties[1].signatures,[1]);assert.equal(counter.session.state.treaties[1].supersedes,1);
  await assert.rejects(act(0,'treaty',{turn:1,operation:'accept',id:1}),/no longer/);
  await act(0,'treaty',{turn:1,operation:'accept',id:2});
  for(let i=0;i<5;i++){const r=await store.get(players[i].token,room.code);assert.ok(r);await act(i,'confirm',{turn:1,draftRevision:r.draftRevision,plan:r.session.plans[i]});}
  const active=await act(0,'resolve',{turn:1}), trust=active.session.state.nations[1].trust;
  for(let i=0;i<5;i++)await act(i,'continue',{turn:2});
  await assert.rejects(act(2,'treaty',{turn:2,operation:'break',id:2}),/parties/);
  const broken=await act(1,'treaty',{turn:2,operation:'break',id:2});assert.equal(broken.session.state.treaties[1].status,'broken');assert.equal(broken.session.state.nations[1].trust,trust-15);
  await assert.rejects(act(1,'treaty',{turn:2,operation:'break',id:2}),/not active/);
  assert.equal((await store.get(players[0].token,room.code))!.session.state.nations[1].trust,trust-15);
});
