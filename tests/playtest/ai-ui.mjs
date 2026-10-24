import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
const temp=await mkdtemp(join(tmpdir(),'sovereign-ai-ui-')),path=join(temp,'rooms.json'),base='http://127.0.0.1:5186';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5186'],{windowsHide:true,env:{...process.env,GAME_DATA_PATH:path},stdio:'ignore'});
const evidence={calls:[],checks:[],errors:[]};let browser;
try {
  for(let i=0;i<100;i++){try{if((await fetch(base+'/api/config')).ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});const context=await browser.newContext({viewport:{width:1540,height:1100},reducedMotion:'reduce'});context.setDefaultTimeout(65000);const pages=[];
  for(let i=0;i<5;i++){const p=await context.newPage();pages.push(p);p.on('pageerror',e=>evidence.errors.push(e.message));await p.goto(base);await p.getByRole('textbox',{name:'Player name',exact:true}).fill(`AI UI ${i}`);await p.getByRole('button',{name:/Play as guest/}).click();await p.locator('.profile-identity').waitFor();}
  const call=(i,path,body)=>pages[i].evaluate(async({path,body})=>{const r=await fetch('/api'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${sessionStorage.getItem('sovereign.player.v1')}`},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw Error(data.error);return data;},{path,body});
  // UI handles all AI interpretation/review/application; API only prepares the isolated five-seat fixture.
  const doctrine={en:Object.fromEntries(['ideology','political','military','diplomacy','economy','society','technology','notes'].map(k=>[k,'Prioritize peace and industry.'])),zh:Object.fromEntries(['ideology','political','military','diplomacy','economy','society','technology','notes'].map(k=>[k,'重视和平与工业。']))};
  const room=await call(0,'/rooms',{name:'AI review UI',scenario:'frontier',doctrine}),code=room.code;
  for(let i=1;i<5;i++)await call(i,`/rooms/${code}/join`,{doctrine});await call(0,`/rooms/${code}/start`,{});
  const p=pages[0];await p.evaluate(code=>sessionStorage.setItem('sovereign.room',code),code);await p.reload();await p.locator('.sandbox').waitFor();
  await p.locator('.strategy-notes summary').click();await p.getByLabel('Current-turn instructions',{exact:true}).fill('Hold sector 1. Invest 20 funds in industry.');
  const orderResponse=p.waitForResponse(r=>r.url().endsWith('/interpret'));
  await p.getByRole('button',{name:'AI: draft executable orders',exact:true}).click();evidence.calls.push({mode:'orders',result:await (await orderResponse).json()});
  await p.getByRole('button',{name:'Replace queue with reviewed orders',exact:true}).waitFor();assert.equal((await call(0,`/rooms/${code}`)).session.plans[0].orders.length,0);evidence.checks.push('AI preview does not execute or replace orders');
  await p.getByRole('button',{name:'Replace queue with reviewed orders',exact:true}).click();await p.waitForFunction(()=>document.querySelector('.draft-status')?.textContent==='Synced');const saved=await call(0,`/rooms/${code}`);assert.deepEqual(saved.session.plans[0].orders,[{kind:'hold',from:0},{kind:'invest',field:'industry',amount:20}]);assert.equal(saved.session.plans[0].submitted,false);evidence.checks.push('Explicit review applies exact orders without confirming');
  await p.screenshot({path:'build/playtest/screens/08-ai-orders-reviewed.png',fullPage:true});
  await p.getByRole('tab',{name:'Treaties',exact:true}).click();await p.getByLabel('Negotiation text',{exact:true}).fill('For three turns, I pay Verdant Isles 10 treasury each turn and they pay me 20 food each turn. If I attack Azure League, end the entire pact.');
  const treatyResponse=p.waitForResponse(r=>r.url().endsWith('/interpret'));await p.getByRole('button',{name:'Translate into clauses',exact:true}).click();evidence.calls.push({mode:'treaty',result:await (await treatyResponse).json()});await p.locator('.clause-editor article').nth(2).waitFor();assert.equal((await call(0,`/rooms/${code}`)).session.state.treaties.length,0);evidence.checks.push('Treaty translation shows three editable clauses without proposing or signing');
  await p.screenshot({path:'build/playtest/screens/09-ai-treaty-reviewed.png',fullPage:true});assert.deepEqual(evidence.errors,[]);console.log('PASS: real AI orders and treaty UI: text -> preview -> explicit application; no implicit execution/signatures.');
} catch(e){evidence.errors.push(String(e));throw e;}
finally{await writeFile('build/playtest/ai-ui-results.json',JSON.stringify(evidence,null,2));await writeFile('build/playtest/ai-ui-usage.jsonl',await readFile(path+'.ai.jsonl','utf8').catch(()=>''));await browser?.close();const exited=new Promise(r=>server.once('exit',r));server.kill();await exited;await rm(temp,{recursive:true,force:true});}
