import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
const temp=await mkdtemp(join(tmpdir(),'strat-forecast-ui-')),base='http://127.0.0.1:5194';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5194'],{windowsHide:true,env:{...process.env,GAME_DATA_PATH:join(temp,'rooms.json')},stdio:'ignore'});
let browser;
try{
 for(let i=0;i<80;i++){try{if((await fetch(base+'/api/config')).ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}
 const call=async(path,body,token)=>{const r=await fetch(base+'/api'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});const value=await r.json();assert.ok(r.ok,JSON.stringify(value));return value;};
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto(base);await page.getByLabel('Player name',{exact:true}).fill('Forecast commander');await page.getByRole('button',{name:/Play as guest/}).click();
 const token=await page.evaluate(()=>sessionStorage.getItem('sovereign.player.v1'));
 await page.getByRole('button',{name:/Learn by playing/}).click();await page.getByRole('button',{name:/Start practice/}).click();await page.locator('.spotlight-card').waitFor();await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Use this example ↗',exact:true}).click();await page.getByRole('button',{name:'Preview orders →',exact:true}).click();
 const preview=page.locator('.mission-intent-preview');await preview.locator('.plan-forecast').waitFor();assert.ok(await page.locator('.flat-order-route').count()>0);assert.equal(await page.locator('.mission-queue > div').count(),0);
 await page.locator('#practice-intent').fill('Hold capital');assert.equal(await preview.count(),0);await page.waitForFunction(()=>document.querySelectorAll('.flat-order-route').length===0);
 await page.getByRole('button',{name:'Use this example ↗',exact:true}).click();await page.getByRole('button',{name:'Preview orders →',exact:true}).click();await preview.locator('.plan-forecast').waitFor();
 await mkdir('build/screenshots',{recursive:true});await preview.locator('.plan-forecast').screenshot({path:'build/screenshots/forecast-training.png'});
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await preview.locator('.plan-forecast').screenshot({path:'build/screenshots/forecast-mobile.png'});
 await page.getByRole('button',{name:'Apply reviewed orders',exact:true}).click();assert.ok(await page.locator('.mission-queue > div').count()>0);await page.getByRole('button',{name:'Preview queued plan →',exact:true}).click();await page.locator('.forecast-request .plan-forecast').waitFor();
 // Reload exits the isolated exercise; test multiplayer through the same public API.
 const keys=['ideology','political','military','diplomacy','economy','society','technology','notes'],doctrine={en:Object.fromEntries(keys.map(k=>[k,''])),zh:Object.fromEntries(keys.map(k=>[k,'']))};
 const players=[{token},...await Promise.all(Array.from({length:4},(_,i)=>call('/auth/guest',{name:`Opponent ${i}`})))];
 let room=await call('/rooms',{name:'Forecast privacy',scenario:'frontier',doctrine},token);const code=room.code;
 for(const p of players.slice(1))await call(`/rooms/${code}/join`,{doctrine},p.token);room=await call(`/rooms/${code}/start`,{},token);
 const from=room.session.state.regions.find(r=>r.owner===0&&r.neighbors.some(id=>room.session.state.regions[id].owner!==0)),to=from.neighbors.find(id=>room.session.state.regions[id].owner!==0);
 const plan={...room.session.plans[0],orders:[{kind:'attack',from:from.id,to,amount:5}]};
 const f=await call(`/rooms/${code}/forecast`,{turn:1,plan},token);
 let enemy=await call(`/rooms/${code}`,null,players[1].token);
 await call(`/rooms/${code}/plan`,{turn:1,draftRevision:enemy.draftRevision,plan:{...enemy.session.plans[1],strategy:'PRIVATE SECRET ORDER',orders:[{kind:'invest',field:'industry',amount:40}]}},players[1].token);
 const f2=await call(`/rooms/${code}/forecast`,{turn:1,plan},token);assert.deepEqual(f2,f);assert.ok(!JSON.stringify(f2).includes('PRIVATE'));
 room=await call(`/rooms/${code}`,null,token);const snapshot=JSON.stringify(room);await call(`/rooms/${code}/forecast`,{turn:1,plan},token);assert.equal(JSON.stringify(await call(`/rooms/${code}`,null,token)),snapshot);
 room=await call(`/rooms/${code}/plan`,{turn:1,draftRevision:room.draftRevision,plan},token);
 await page.evaluate(code=>sessionStorage.setItem('sovereign.room',code),code);await page.setViewportSize({width:1440,height:1000});await page.reload();await page.locator('.sandbox').waitFor();
 await page.getByRole('button',{name:'Preview queued plan →',exact:true}).click();const panel=page.locator('.forecast-request .plan-forecast');await panel.waitFor();assert.equal(await panel.locator('.forecast-tabs button').count(),3);
 await panel.getByRole('button',{name:'Strong response',exact:true}).click();assert.ok(await panel.locator('.forecast-battle').count()>0);await panel.locator('.forecast-battle').first().scrollIntoViewIfNeeded();await page.screenshot({path:'build/screenshots/forecast-multiplayer.png'});
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 // Deploy fleets in real settlement to verify control styling follows the authoritative owners.
 const state=room.session.state;const selectedZones=new Set();
 for(let i=0;i<5;i++){
  const r=await call(`/rooms/${code}`,null,players[i].token),eligible=state.ocean.filter(z=>z.ports.some(id=>state.regions[id].owner===i));
  const zone=eligible.find(z=>!selectedZones.has(z.id))??eligible[0];if(zone)selectedZones.add(zone.id);
  const standing={mobilization:{mode:'off',target:0,budget:0,region:-1},programs:{political:0,economy:0,society:0,technology:0,diplomacy:0}};
  await call(`/rooms/${code}/confirm`,{turn:1,draftRevision:r.draftRevision,plan:{...r.session.plans[i],standing,orders:zone?[{kind:'patrol',from:-1,to:zone.id,amount:2}]:[]}},players[i].token);
 }
 const settled=await call(`/rooms/${code}/resolve`,{turn:1},token);for(const p of players)await call(`/rooms/${code}/continue`,{turn:2},p.token);
 await page.setViewportSize({width:1440,height:1000});await page.reload();await page.locator('.sandbox').waitFor();await page.getByRole('button',{name:'Reset map',exact:true}).click();
 const owners=settled.session.state.ocean.filter(z=>z.owner>=0);assert.ok(owners.length>=2);
 for(const z of owners){const sea=page.locator('.flat-sea').nth(z.id);assert.equal(await sea.getAttribute('data-owner'),String(z.owner));assert.equal(await sea.locator('.sea-control-fill').getAttribute('fill-opacity'),'0.28');}
 const selected=owners[0];await page.locator('.sea-zone-key button').nth(selected.id).click();assert.equal(await page.locator('.flat-sea').nth(selected.id).locator('.sea-control-fill').getAttribute('fill-opacity'),'0.38');
 await page.locator('.strategy-map').screenshot({path:'build/screenshots/sea-control-forecast.png'});
 assert.deepEqual(errors,[]);console.log('PASS: teaching forecast/routes without execution, invalidation, mobile, queued preview, hidden-plan independence, immutable room snapshot, scenario switching and real sea-control colors.');
}finally{await browser?.close();const exited=new Promise(done=>server.once('exit',done));server.kill();await exited;await rm(temp,{recursive:true,force:true});}
