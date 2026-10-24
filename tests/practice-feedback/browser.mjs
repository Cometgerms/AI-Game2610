import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
const temp=await mkdtemp(join(tmpdir(),'strat-feedback-ui-')),base='http://127.0.0.1:5193';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5193'],{windowsHide:true,env:{...process.env,GAME_DATA_PATH:join(temp,'rooms.json')},stdio:'ignore'});
let browser;
try{
 for(let i=0;i<80;i++){try{if((await fetch(base+'/api/config')).ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}
 browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.getByLabel('Player name',{exact:true}).fill('Feedback learner');await page.getByRole('button',{name:/Play as guest/}).click();
 await page.getByRole('button',{name:/Learn by playing/}).click();await page.getByRole('button',{name:/Start practice/}).click();
 await page.locator('.spotlight-card').waitFor();await page.keyboard.press('Escape');await page.locator('.spotlight-card').waitFor({state:'hidden'});
 const input=page.locator('#practice-intent'),preview=page.getByRole('button',{name:'Preview orders →',exact:true});
 // The model response is simulated; requests still travel through the real client error handling.
 await page.route('**/api/practice/interpret',route=>route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({code:'practice-command',error:'River infiltration and attacks are not available in this tutorial.'})}));
 await input.fill('Cross the river and attack the enemy capital');await preview.click();await page.locator('.mission-command-guidance').waitFor();
 assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await input.inputValue(),'Cross the river and attack the enemy capital');assert.equal(await page.locator('.mission-intent-preview').count(),0);
 await page.setViewportSize({width:390,height:844});await page.locator('.mission-command-guidance').scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await mkdir('build/screenshots',{recursive:true});await page.screenshot({path:'build/screenshots/practice-command-guidance.png'});
 await page.unroute('**/api/practice/interpret');
 await page.getByRole('button',{name:'Use this example ↗',exact:true}).click();assert.equal(await page.locator('.mission-command-guidance').count(),0);
 await preview.click();await page.locator('.mission-intent-preview').waitFor();assert.equal(await page.getByRole('dialog').count(),0);
 // Real transport failures must still open the copyable diagnostic dialog.
 await page.route('**/api/practice/interpret',route=>route.abort('failed'));
 await input.fill('A new request');await preview.click();await page.getByRole('dialog').waitFor();assert.match(await page.getByLabel('Error details').inputValue(),/Network failure/);
 assert.deepEqual(errors,[]);console.log('PASS: inline teaching feedback, original text retained, no partial preview, mobile fit, example recovery and diagnostic network failure.');
}finally{await browser?.close();const exited=new Promise(done=>server.once('exit',done));server.kill();await exited;await rm(temp,{recursive:true,force:true});}
