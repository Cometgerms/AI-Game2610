import {loadEnv} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {PracticeStore} from '../../src/server/practice';
import {Interpreter} from '../../src/server/ai';
const env=loadEnv('development',process.cwd(),'');
if(!env.OPENAI_API_KEY){console.log('SKIP: AI key not configured.');process.exit(0);}
await mkdir('build/playtest',{recursive:true});
const store=new PracticeStore();
const interpreter=new Interpreter({key:env.OPENAI_API_KEY,model:env.MODEL_NAME,projectBudget:1,roomBudget:.6,logPath:'build/playtest/practice-ai-usage.jsonl'});
const cases=[
 {text:'把后方20号地区的部队一个不留地送到首都，并且拿一百万国库投资工业，再把生产科技升一级。',all:true},
 {text:'首都的防线让我不放心。请从能直接增援的己方地区调一些部队过来，后方也要留人，再花20国库发展工业并研究生产科技。'},
 {text:'Send exactly 3 troops from sector 20 to the capital. Invest 20 funds in industry and research production.',exact:3}
];
const results=[];
for(const [i,test] of cases.entries()){
 const id=`intent-smoke-${Date.now()}-${i}`,v=store.start(id);
 const result=await store.interpret(id,0,test.text,undefined,undefined,{orders:[],standing:v.session.plans[v.nation].standing!},i===2?'en':'zh',interpreter);
 assert.equal(result.source,'ai');
 const moves=result.plan.orders.filter(o=>o.kind==='move');assert.ok(moves.length>0);
 for(const m of moves){assert.equal(m.to,v.defend);assert.equal(v.session.state.regions[m.from].owner,v.nation);assert.ok(m.amount>0&&m.amount<=v.session.state.regions[m.from].army);}
 if(test.all){assert.equal(moves[0].amount,10);assert.equal(result.plan.orders.find(o=>o.kind==='invest')?.amount,250);}
 if(test.exact){assert.equal(moves.length,1);assert.equal(moves[0].amount,test.exact);assert.equal(moves[0].from,19);}
 if(i===1)for(const m of moves)assert.ok(m.amount<v.session.state.regions[m.from].army,'preserve rear garrison');
 assert.equal(result.plan.orders.find(o=>o.kind==='research')?.field,'production');
 const settled=await store.advance(id,0,result.plan);assert.equal(settled.stage,1);
 results.push({text:test.text,result,settledTurn:settled.session.state.turn,capitalArmy:settled.session.state.regions[v.defend].army});
 console.log(JSON.stringify({case:i,source:result.source,orders:result.plan.orders,settledTurn:settled.session.state.turn}));
}
await writeFile('build/playtest/practice-ai-result.json',JSON.stringify(results,null,2));
