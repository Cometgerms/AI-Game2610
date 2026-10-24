import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
const temp=await mkdtemp(join(tmpdir(),'strat-maritime-')),base='http://127.0.0.1:5186';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5186'],{windowsHide:true,env:{...process.env,GAME_DATA_PATH:join(temp,'rooms.json')},stdio:'ignore'});
let browser,current;
try{
  for(let i=0;i<80;i++){try{if((await fetch(base+'/api/config')).ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}
  browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:1440,height:900}}),pages=[],players=[],failures=[];
  const call=async(path,body,token)=>{const r=await fetch(base+'/api'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});const value=await r.json();assert.ok(r.ok,JSON.stringify(value));return value;};
  for(let i=0;i<5;i++){
    const p=await context.newPage();current=p;p.setDefaultTimeout(15000);p.on('pageerror',e=>failures.push(e.message));await p.goto(base);await p.getByLabel('Player name',{exact:true}).fill(`Admiral ${i}`);await p.getByRole('button',{name:/Play as guest/}).click();await p.locator('.profile-identity h2').waitFor();pages.push(p);players.push(await p.evaluate(()=>sessionStorage.getItem('sovereign.player.v1')));
  }
  const keys=['ideology','political','military','diplomacy','economy','society','technology','notes'],doctrine={en:Object.fromEntries(keys.map(k=>[k,''])),zh:Object.fromEntries(keys.map(k=>[k,'']))};
  let room=await call('/rooms',{name:'Ocean playtest',scenario:'frontier',doctrine},players[0]);const code=room.code;
  for(let i=1;i<5;i++)await call(`/rooms/${code}/join`,{doctrine},players[i]);await call(`/rooms/${code}/start`,{},players[0]);
  for(const p of pages){await p.evaluate(code=>sessionStorage.setItem('sovereign.room',code),code);await p.reload();await p.locator('.sandbox').waitFor();await p.emulateMedia({reducedMotion:'reduce'});}
  room=await call(`/rooms/${code}`,null,players[1]);const sea=room.session.state.ocean.find(z=>z.ports.some(id=>room.session.state.regions[id].owner===1)).id,green=pages[1];current=green;
  const snapshots=[];
  const settle=async turn=>{
    for(const p of pages){await p.getByRole('button',{name:/^Confirm country orders/}).click();await p.locator('.submission-card').waitFor();if(await p.getByRole('button',{name:/^Keep exploring/}).isVisible())await p.getByRole('button',{name:/^Keep exploring/}).click();}
    await pages[0].getByRole('button',{name:/^Resolve turn/}).click();
    await pages[0].waitForFunction(n=>document.querySelector('.sandbox-heading h1 span')?.textContent.includes(`TURN ${String(n).padStart(2,'0')}`),turn+1);
    for(let i=0;i<pages.length;i++){const review=await call(`/rooms/${code}`,null,players[i]);if(review.reviewReady&&!review.reviewReady[i]){await pages[i].locator('.turn-review-modal').waitFor();await pages[i].getByRole('button',{name:'Ready for next turn',exact:true}).click();}}
    await Promise.all(pages.map(p=>p.locator('.turn-review-modal').waitFor({state:'hidden'})));
    const result=await call(`/rooms/${code}`,null,players[1]);assert.equal(result.session.state.turn,turn+1);snapshots.push(result.session.state);
    for(const p of pages){await p.waitForFunction(n=>document.querySelector('.sandbox-heading h1 span')?.textContent.includes(`TURN ${String(n).padStart(2,'0')}`),turn+1);await p.getByRole('tab',{name:'Orders',exact:true}).click();assert.equal(await p.locator('.sandbox-message').count(),0);}
    return result;
  };
  await green.getByRole('button',{name:'Maritime',exact:true}).click();await green.getByLabel('Sea zone',{exact:true}).selectOption(String(sea));await green.getByLabel('Fleet strength',{exact:true}).fill('3');await green.getByRole('button',{name:'Deploy patrol',exact:true}).click();
  assert.match(await green.locator('.queued-orders').innerText(),/Patrol Reserve/);
  room=await settle(1);assert.equal(room.session.state.ocean[sea].owner,1);assert.equal(room.session.state.nations[1].navalReserve,5);
  await green.getByLabel('Blockade target',{exact:true}).selectOption('0');await green.getByRole('button',{name:'Impose blockade',exact:true}).click();
  await pages[0].getByRole('button',{name:'Maritime',exact:true}).click();await pages[0].getByLabel('Fleet strength',{exact:true}).fill('1');await pages[0].getByRole('button',{name:'Build fleet',exact:true}).click();
  room=await settle(2);assert.equal(room.session.state.ocean[sea].blockade,0);assert.equal(room.session.state.nations[0].navalReserve,5);
  await green.getByRole('button',{name:'Open passage',exact:true}).click();
  const state=room.session.state,origin=state.ocean[sea].ports.find(id=>state.regions[id].owner===1);
  await green.getByRole('button',{name:'Military',exact:true}).click();await green.locator(`.flat-badge[data-region="${origin}"]`).click();
  const targets=await green.getByLabel('Destination',{exact:true}).locator('option').evaluateAll(options=>options.map(o=>({id:Number(o.value),text:o.textContent})));
  const destination=targets.find(o=>o.id>=0&&state.regions[o.id].owner===0);assert.ok(destination,'Island can issue an amphibious order to the mainland');
  await green.getByLabel('Destination',{exact:true}).selectOption(String(destination.id));await green.getByLabel('Strength',{exact:true}).fill('3');await green.getByRole('button',{name:/^Attack/}).click();
  room=await settle(3);assert.equal(room.session.state.ocean[sea].blockade,-1);assert.ok(room.session.state.report.battles.some(b=>b.region===destination.id));
  await green.getByRole('button',{name:'Maritime',exact:true}).click();await mkdir('build/screenshots',{recursive:true});await green.screenshot({path:'build/screenshots/maritime-desktop.png',fullPage:true});
  await green.setViewportSize({width:390,height:844});assert.ok(await green.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await green.screenshot({path:'build/screenshots/maritime-mobile.png',fullPage:true});
  await writeFile('build/maritime-playtest.json',JSON.stringify({turns:snapshots,errors:failures},null,2));assert.deepEqual(failures,[]);
  console.log('PASS: five independent tabs, three real turns: island patrol/control, targeted blockade, shipbuilding, reopening, amphibious landing, mobile naval controls.');
}catch(e){if(current&&!current.isClosed()){await current.screenshot({path:'build/screenshots/maritime-failure.png',fullPage:true});console.log((await current.locator('body').innerText()).slice(-3500));}throw e;}finally{await browser?.close();const exited=new Promise(r=>server.once('exit',r));server.kill();await exited;await rm(temp,{recursive:true,force:true});}
