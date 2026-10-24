import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PracticeStore} from '../../src/server/practice';
import {Interpreter} from '../../src/server/ai';
import {HttpError} from '../../src/server/rooms';

test('unsupported and mixed AI requests are recoverable teaching guidance, not partial plans',async t=>{
 const folder=await mkdtemp(join(tmpdir(),'strat-feedback-'));t.after(()=>rm(folder,{recursive:true,force:true}));
 const store=new PracticeStore(),view=store.start('learner'),base={orders:[],standing:view.session.plans[view.nation].standing};
 const before=JSON.stringify(base);
 const request:typeof fetch=async()=>new Response(JSON.stringify({status:'completed',usage:{input_tokens:100,output_tokens:100},output:[{content:[{type:'output_text',text:JSON.stringify({explanation:'Unsupported attack',unsupported:['教学暂不支持河流偷渡或进攻。'],duration:1,clauses:[],orders:[{kind:'invest',field:'industry',from:null,to:null,amount:20}]})}]}]}));
 const ai=new Interpreter({key:'test',logPath:join(folder,'usage.jsonl')},request);
 await assert.rejects(store.interpret('learner',0,'秘密渡河然后攻打敌方首都，顺便投资',undefined,undefined,base,'zh',ai),e=>e instanceof HttpError&&e.status===400&&e.code==='practice-command'&&e.message.includes('偷渡'));
 assert.equal(JSON.stringify(base),before);
 const offline=new Interpreter({logPath:'unused'});
 await assert.rejects(store.interpret('learner',0,'全力调动',view.threatFrom,view.defend,base,'zh',offline),e=>e instanceof HttpError&&e.code==='practice-command');
 const result=await store.interpret('learner',0,'加强首都；工业投资100万；研究生产科技',undefined,undefined,base,'zh',offline);
 assert.equal(result.stage,0);assert.equal(result.plan.orders.find(o=>o.kind==='invest')?.amount,250);
 assert.ok(result.adjustments.some(a=>a.requested===1000000));
});

test('provider failures remain diagnostic errors',async t=>{
 const folder=await mkdtemp(join(tmpdir(),'strat-feedback-failure-'));t.after(()=>rm(folder,{recursive:true,force:true}));
 const store=new PracticeStore(),v=store.start('failure'),base={orders:[],standing:v.session.plans[v.nation].standing};
 const ai=new Interpreter({key:'test',logPath:join(folder,'usage.jsonl')},async()=>new Response('{}',{status:503}));
 await assert.rejects(store.interpret('failure',0,'Help my nation thrive',undefined,undefined,base,'en',ai),e=>e instanceof Error&&e.message.includes('HTTP 503')&&!(e instanceof HttpError&&e.code==='practice-command'));
});
