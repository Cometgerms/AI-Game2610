import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Interpreter } from '../../src/server/ai';
import { createSession } from '../../src/client/game/sandbox';
import { createDoctrine } from '../../src/client/game/doctrine';
import { scenarios } from '../../src/client/game/scenarios';
import type { RoomView } from '../../src/client/game/network';
const room=()=>({code:'ROOMTEST',nation:0,scenario:'frontier',draftRevision:0,session:createSession(scenarios[0],createDoctrine())} as RoomView);
const result={explanation:'Draft',unsupported:[],duration:3,clauses:[{kind:'peace',actor:0,target:1,resource:'treasury',amount:1,start:1,every:1}],orders:[]};
const fake=(value:unknown)=>async()=>new Response(JSON.stringify({status:'completed',usage:{input_tokens:100,output_tokens:100},output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}]}));
test('AI proposals are nonmutating, validate obligations, and unsupported prose cannot become executable clauses',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'sovereign-ai-'));t.after(()=>rm(dir,{recursive:true,force:true}));const r=room(),before=JSON.stringify(r);
  const ai=new Interpreter({key:'test',logPath:join(dir,'usage.jsonl')},fake(result));const draft=await ai.interpret(r,'Peace','treaty',1,3,'en');assert.equal(draft.clauses.length,1);assert.equal(JSON.stringify(r),before);
  const forged=new Interpreter({key:'test',logPath:join(dir,'usage.jsonl')},fake({...result,clauses:[{...result.clauses[0],actor:4}]}));await assert.rejects(forged.interpret(r,'Peace','treaty',1,3,'en'),/unsupported treaty/);
  const arbitrary=new Interpreter({key:'test',logPath:join(dir,'usage.jsonl')},fake({...result,clauses:[],orders:[{kind:'execute_code',field:'destroy',from:null,to:null,amount:null}]}));await assert.rejects(arbitrary.interpret(r,'code','orders',1,3,'en'),/invalid orders/);
});
test('budget reserves survive failed calls and restarting the interpreter',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'sovereign-ai-budget-'));t.after(()=>rm(dir,{recursive:true,force:true}));const logPath=join(dir,'usage.jsonl');let calls=0;
  const failed=async()=>{calls++;throw new Error('Network timeout');};
  await assert.rejects(new Interpreter({key:'test',logPath,projectBudget:.4},failed).interpret(room(),'Peace','treaty',1,3,'en'),/timeout/);
  await assert.rejects(new Interpreter({key:'test',logPath,projectBudget:.4},failed).interpret(room(),'Peace','treaty',1,3,'en'),/budget/);
  assert.equal(calls,1);assert.match(await readFile(logPath,'utf8'),/failed-reserve-retained/);
});


test('naval AI drafts include the strict enum, preserve reserve/sea identity and reject illegal deployment',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'strat-ai-ocean-'));t.after(()=>rm(dir,{recursive:true,force:true}));const r=room();r.nation=1;
 const sea=r.session.state.ocean!.find(z=>z.ports.some(id=>r.session.state.regions[id].owner===1))!.id;
 const value={explanation:'Patrol',unsupported:[],duration:1,clauses:[],orders:[{kind:'patrol',field:null,from:-1,to:sea,amount:3}]};
 const request:typeof fetch=async(_url,init)=>{const body=JSON.parse(init!.body as string);assert.equal(body.text.format.strict,true);assert.ok(body.text.format.schema.properties.orders.items.properties.kind.enum.includes('patrol'));assert.match(body.instructions,/Maritime rules/);return fake(value)();};
 const before=JSON.stringify(r),draft=await new Interpreter({key:'test',logPath:join(dir,'usage.jsonl')},request).interpret(r,'Deploy three reserve ships','orders',0,1,'en');assert.deepEqual(draft.orders,[{kind:'patrol',from:-1,to:sea,amount:3}]);assert.equal(JSON.stringify(r),before);
 value.orders[0].amount=999;await assert.rejects(new Interpreter({key:'test',logPath:join(dir,'bad.jsonl')},fake(value)).interpret(r,'Patrol','orders',0,1,'en'),/opening fleet/);
});
