import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';

const temp=await mkdtemp(join(tmpdir(),'strat-atlas-')),base='http://127.0.0.1:5189';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5189'],{windowsHide:true,env:{...process.env,GAME_DATA_PATH:join(temp,'rooms.json')},stdio:'ignore'});
let browser,current;
try {
  for(let i=0;i<80;i++){try{if((await fetch(base+'/api/config')).ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}
  browser=await chromium.launch({channel:'msedge',headless:true});
  await mkdir('build/screenshots',{recursive:true});
  const failures=[];
  const context=await browser.newContext({viewport:{width:1500,height:1050}});
  const page=await context.newPage();current=page;page.on('pageerror',e=>failures.push(e.message));
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto(base);
  await page.getByLabel('Player name',{exact:true}).fill('Atlas preview');
  await page.getByRole('button',{name:/Play as guest/}).click();await page.locator('.profile-identity h2').waitFor();
  await page.getByRole('button',{name:/Learn by playing/}).click();await page.getByRole('button',{name:/Start practice/}).click();
  await page.locator('.spotlight-card').waitFor();await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Reset map',exact:true}).click();
  await page.locator('.mission-atlas').screenshot({path:'build/screenshots/atlas-world.png'});
  assert.equal(await page.locator('.troop-formation circle').count(),0,'No separate glowing bubbles');
  assert.equal(await page.locator('.unit-force').count(),25);
  const raster=await page.locator('.atlas-relief').getAttribute('href');assert.ok(raster.length>100000,'Detailed geographic base rendered');
  await page.getByRole('button',{name:'Focus capital',exact:true}).click();
  await page.locator('.mission-atlas').screenshot({path:'build/screenshots/atlas-capital.png'});
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('.mission-atlas').screenshot({path:'build/screenshots/atlas-mobile.png'});
  assert.deepEqual(failures,[]);console.log('PASS: geographic base, compact infantry counters, capital/world camera and mobile width.');
} finally {await browser?.close();const exited=new Promise(r=>server.once('exit',r));server.kill();await exited;await rm(temp,{recursive:true,force:true});}
