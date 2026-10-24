import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';

const temp=await mkdtemp(join(tmpdir(),'strat-onboarding-')),base='http://127.0.0.1:5188';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5188'],{windowsHide:true,env:{...process.env,GAME_DATA_PATH:join(temp,'rooms.json')},stdio:'ignore'});
let browser,current;
try {
  for(let i=0;i<80;i++){try{if((await fetch(base+'/api/config')).ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}
  browser=await chromium.launch({channel:'msedge',headless:true});
  await mkdir('build/screenshots',{recursive:true});
  const failures=[];
  for(const mobile of [false,true]){
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},permissions:['clipboard-read','clipboard-write']});
    const page=await context.newPage();current=page;page.setDefaultTimeout(10000);page.on('pageerror',e=>{failures.push(e.message);console.log('Browser error:',e.message);});
    await page.emulateMedia({reducedMotion:mobile?'reduce':'no-preference'});
    await page.goto(base);
    assert.ok((await page.getByLabel('Email',{exact:true}).boundingBox()).y<(await page.getByLabel('Player name',{exact:true}).boundingBox()).y);
    await page.getByLabel('Player name',{exact:true}).fill(mobile?'Mobile learner':'Desktop learner');
    await page.getByRole('button',{name:/Play as guest/}).click();
    await page.locator('.profile-identity h2').waitFor();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:`build/screenshots/strat-profile-${mobile?'mobile':'desktop'}.png`,fullPage:true});
    await page.locator('.connection-indicator[data-connected=true]').waitFor();
    const badge=await page.locator('.connection-indicator').boundingBox();
    assert.ok(badge.x+badge.width>(mobile?390:1440)-30&&badge.y+badge.height>(mobile?844:900)-30);
    // An actual failed request exercises diagnostics rather than dispatching synthetic UI events.
    await page.route('**/api/config',route=>route.abort('failed'));
    await page.evaluate(()=>window.dispatchEvent(new Event('online')));
    await page.locator('.connection-indicator[data-connected=false]').waitFor();
    const dialog=page.getByRole('dialog');await dialog.waitFor();
    await page.getByRole('button',{name:'Copy error details',exact:true}).click();
    await page.getByRole('button',{name:'Copied ✓',exact:true}).waitFor();
    const diagnostic=await page.evaluate(()=>navigator.clipboard.readText());
    assert.match(diagnostic,/GET \/api\/config/);assert.match(diagnostic,/Network failure/);assert.doesNotMatch(diagnostic,/Bearer|password/i);
    await page.screenshot({path:`build/screenshots/strat-error-${mobile?'mobile':'desktop'}.png`});
    await page.getByRole('button',{name:'Close',exact:true}).click();
    await page.unroute('**/api/config');await page.evaluate(()=>window.dispatchEvent(new Event('online')));
    await page.locator('.connection-indicator[data-connected=true]').waitFor();
    await page.evaluate(async()=>{const {api}=await import('/src/client/game/network.ts');await api('/missing-diagnostic-check').catch(()=>{});});
    await dialog.waitFor();
    assert.match(await page.getByLabel('Error details').inputValue(),/HTTP: 404/);
    assert.doesNotMatch(await page.getByLabel('Error details').inputValue(),/Request: Not received/);
    await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined}));
    await page.getByRole('button',{name:'Copy error details',exact:true}).click();
    await page.getByRole('button',{name:'Copied ✓',exact:true}).waitFor();
    await page.evaluate(()=>delete navigator.clipboard);
    assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/Unknown endpoint/);
    await page.getByRole('button',{name:'Close',exact:true}).click();
    await page.getByRole('button',{name:/Learn by playing/}).click();await dialog.waitFor();
    await page.getByRole('button',{name:'Not now',exact:true}).click();assert.equal(await page.locator('.practice').count(),0);
    await page.getByRole('button',{name:/Learn by playing/}).click();await page.getByRole('button',{name:/Start practice/}).click();
    await page.locator('.mission-atlas').waitFor();
    const dismissTip=async()=>{await page.locator('.spotlight-card').waitFor();await page.locator('.spotlight-card').getByRole('button',{name:'Got it →',exact:true}).click();await page.locator('.spotlight-card').waitFor({state:'hidden'});};
    for(let i=0;i<4;i++){
      await page.locator('.spotlight-card').waitFor();
      assert.match(await page.locator('.spotlight-card .eyebrow').innerText(),new RegExp(`${i+1} / 4`));
      await page.waitForTimeout(300);
      if(!mobile&&(i===0||i===2)){
        const card=await page.locator('.spotlight-card').boundingBox(),target=await page.locator(i===0?'.mission-atlas .flat-map':'.mission-intent').boundingBox();
        const gap=Math.max(card.x-(target.x+target.width),target.x-(card.x+card.width),card.y-(target.y+target.height),target.y-(card.y+card.height));
        assert.ok(gap>=0&&gap<=24,`Spotlight must be adjacent; gap ${gap}`);
      }
      if(i===0)await page.screenshot({path:`build/screenshots/spotlight-intro-${mobile?'mobile':'desktop'}.png`});
      await page.locator('.spotlight-card').getByRole('button',{name:'Got it →',exact:true}).click();
    }
    await page.locator('.spotlight-card').waitFor({state:'hidden'});
    await page.getByRole('button',{name:'Show guide',exact:true}).click();
    await page.locator('.spotlight-card').waitFor();await page.keyboard.press('Escape');await page.locator('.spotlight-card').waitFor({state:'hidden'});
    assert.ok(await page.locator('.troop-dot').count()>50);
    assert.equal(await page.locator('pattern[id$="-dots"]').count(),0);
    assert.equal(await page.locator('.terrain-contour').count(),0);
    const auras=page.locator('.troop-aura');
    const alpha=await auras.first().evaluate(el=>getComputedStyle(el).opacity);await page.waitForTimeout(350);const nextAlpha=await auras.first().evaluate(el=>getComputedStyle(el).opacity);
    if(mobile)assert.equal(alpha,nextAlpha);else await page.waitForFunction(initial=>getComputedStyle(document.querySelector('.troop-aura')).opacity!==initial,alpha,{timeout:5000});
    assert.ok(Number(await page.locator('.flat-map').getAttribute('data-zoom'))>2);
    const visibleUnits=await page.locator('.flat-map').evaluate(svg=>{const box=svg.getBoundingClientRect();return [...svg.querySelectorAll('.flat-badge')].filter(el=>{const b=el.getBoundingClientRect();return b.x>box.x&&b.right<box.right&&b.y>box.y&&b.bottom<box.bottom;}).length;});
    assert.ok(visibleUnits>0&&visibleUnits<25,'Tactical camera must crop the world while keeping units visible');
    if(!mobile){
      const before=await page.locator('.flat-map').getAttribute('viewBox'),box=await page.locator('.flat-map').boundingBox();
      await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+70,box.y+box.height/2+45,{steps:8});await page.mouse.up();
      assert.notEqual(await page.locator('.flat-map').getAttribute('viewBox'),before);
      await page.getByRole('button',{name:'Focus capital',exact:true}).click();
    }
    await page.getByRole('button',{name:'Leave training',exact:true}).click();
    await page.getByRole('button',{name:'Keep learning',exact:true}).click();
    const responses=[];
    page.on('response',async r=>{if(r.url().endsWith('/api/practice/advance')&&r.ok())responses.push(await r.json());});
    await page.route('**/api/practice/advance',async route=>{await new Promise(r=>setTimeout(r,450));await route.continue();});
    const settle=async n=>{
      await page.getByRole('button',{name:`Confirm turn ${n} →`,exact:true}).click();
      await page.locator('.turn-overlay').waitFor();
      await page.locator('.turn-overlay').waitFor({state:'hidden'});
      if(!mobile){await page.locator('.mission-playback').waitFor();assert.ok(await page.locator('.movement-token').count()>0);}
      await page.getByRole('button',{name:'Replay movements',exact:true}).waitFor();
      await page.waitForFunction(()=>!document.querySelector('.mission-playback'));
      assert.equal(responses.length,n);
      await page.locator('.turn-review-modal').waitFor();
      if(n===1||n===3){assert.ok(await page.locator('.combat-sides article').count()>=2);await page.locator('.combat-phases button').last().click();await page.locator('.combat-outcome').waitFor();}
      await page.waitForTimeout(650);
      await page.screenshot({path:`build/screenshots/turn-review-${n}-${mobile?'mobile':'desktop'}.png`});
      if(n===2&&!mobile)await page.locator('.turn-review-modal').getByRole('button',{name:'Ready for next turn',exact:true}).click();
      else await page.locator('.turn-review-modal').getByRole('button',{name:'Close / 关闭',exact:true}).click();
      if(n===1)await dismissTip();
    };
    assert.equal(await page.locator('.mission-confirm').isDisabled(),true);
    const languageOrder=async text=>{
      await page.getByLabel('Your command',{exact:true}).fill(text);
      await page.getByRole('button',{name:'Preview orders →',exact:true}).click();
      await page.locator('.mission-intent-preview').waitFor();
    };
    if(!mobile){
      assert.equal(await page.getByLabel('Source troops',{exact:true}).count(),0);
      await languageOrder('Strengthen the capital; invest 1000000 in industry; research production');
      assert.match(await page.locator('.limit-change').innerText(),/1,000,000.*250/);
      assert.match(await page.locator('.mission-intent-preview').innerText(),/Move 5 troops/);
      await page.screenshot({path:'build/screenshots/training-language-preview.png',fullPage:true});
      await page.getByRole('button',{name:'Apply reviewed orders',exact:true}).click();
    }else{
      await page.locator('.mission-manual summary').click();
      await page.getByRole('button',{name:/Rear unit #/}).click();
      await page.getByLabel('Troops to move',{exact:true}).fill('4');
      await page.getByRole('button',{name:'Choose destination on map',exact:true}).click();
      await dismissTip();
      await page.getByRole('button',{name:'Focus capital',exact:true}).click();
      await page.locator('.flat-badge[data-region="16"]').click();
      await page.getByRole('button',{name:'↗ Develop',exact:true}).click();
      await dismissTip();
      await page.getByLabel('Industry investment',{exact:true}).fill('1000000');
      await page.getByRole('button',{name:'Queue industry investment',exact:true}).click();
      assert.match(await page.locator('.mission-notice').innerText(),/1,000,000.*250/);
      assert.equal(await page.getByLabel('Industry investment',{exact:true}).inputValue(),'250');
      await page.getByRole('button',{name:/^Research production ·/}).click();
    }
    assert.equal(await page.locator('.flat-order-route').count(),mobile?1:2);
    for(const path of await page.locator('.flat-order-route').all()){assert.match(await path.getAttribute('d'),/Z$/);assert.equal(await path.getAttribute('marker-end'),null);}
    await page.screenshot({path:`build/screenshots/tactical-planning-${mobile?'mobile':'desktop'}.png`,fullPage:true});
    await settle(1);
    assert.equal(responses[0].session.state.regions[16].army,mobile?14:18);
    assert.equal(responses[0].session.state.regions[23].owner,2);
    await page.getByRole('button',{name:'Replay movements',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('.mission-playback'));
    await page.getByRole('button',{name:'Plan next turn →',exact:true}).click();
    await dismissTip();
    if(!mobile){
      await page.getByRole('button',{name:'Use this example ↗',exact:true}).click();
      const example=await page.getByLabel('Your command',{exact:true}).inputValue();
      await languageOrder(example.replace('trade 5 funds for 10 food','trade 6 funds for 12 food'));
      await page.getByRole('button',{name:'Apply reviewed orders',exact:true}).click();
    }else{
      if(!await page.locator('.mission-manual').evaluate(el=>el.open))await page.locator('.mission-manual summary').click();
      await page.getByRole('button',{name:'Queue patrol',exact:true}).click();
      await page.getByRole('button',{name:'▣ Army',exact:true}).click();await dismissTip();
      await page.getByRole('checkbox',{name:'Reserve recruitment · at the capital',exact:true}).check();
      await page.getByLabel('Funds / turn',{exact:true}).fill('12');
      await page.getByRole('button',{name:'⇄ Treaty',exact:true}).click();await dismissTip();
      await page.getByLabel('Funds you give',{exact:true}).fill('6');
      await page.getByLabel('Food you receive',{exact:true}).fill('12');
      await page.getByRole('button',{name:'Include trade offer',exact:true}).click();
    }
    await settle(2);
    assert.ok(responses[1].session.state.ocean.some(z=>z.owner===3));
    assert.equal(responses[1].session.state.treaties[0].clauses[0].amount,6);
    if(mobile)await page.getByRole('button',{name:'Plan next turn →',exact:true}).click();
    await dismissTip();
    await page.getByRole('button',{name:'Locate enemy ↗',exact:true}).click();
    await page.locator('.threat-label').waitFor();
    assert.match(await page.locator('.threat-label').textContent(),/12/);
    if(mobile){
      await page.getByRole('button',{name:'Switch to Chinese',exact:true}).click();
      await page.getByRole('button',{name:'定位敌军 ↗',exact:true}).click();
      assert.match(await page.locator('.threat-label').textContent(),/敌军来袭 12/);
      await page.screenshot({path:'build/screenshots/tactical-enemy-mobile-zh.png',fullPage:true});
      await page.getByRole('button',{name:'切换为英文',exact:true}).click();
    }
    await page.getByRole('button',{name:'Assess battle',exact:true}).click();
    await page.getByRole('dialog',{name:'Battle forecast',exact:true}).waitFor();
    assert.match(await page.locator('.combat-detail').innerText(),/Conditional forecast/);
    await page.getByRole('button',{name:'Close / 关闭',exact:true}).click();
    await page.screenshot({path:`build/screenshots/tactical-enemy-${mobile?'mobile':'desktop'}.png`,fullPage:true});
    if(!mobile){await languageOrder('Hold capital');await page.getByRole('button',{name:'Apply reviewed orders',exact:true}).click();}
    else{if(!await page.locator('.mission-manual').evaluate(el=>el.open))await page.locator('.mission-manual summary').click();await page.getByRole('button',{name:/^Capital #/}).click();await page.getByRole('button',{name:'Hold position',exact:true}).click();}
    await settle(3);
    await page.getByRole('heading',{name:'Home, safe and sound.',exact:true}).waitFor();
    assert.equal(await page.locator('.mission-objectives p').filter({hasText:'✓'}).count(),7);
    assert.equal(responses[2].won,true);
    assert.ok(responses[2].session.state.report.battles.some(b=>b.region===16&&b.winner===3));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:`build/screenshots/tactical-victory-${mobile?'mobile':'desktop'}.png`,fullPage:true});
    await page.getByRole('button',{name:'Return to command profile',exact:true}).click();
    await page.locator('.profile-identity h2').waitFor();
    await context.close();
  }
  assert.deepEqual(failures,[]);
  console.log('PASS: natural-language full deployment and million-fund clipping, manual million-fund clipping, adjacent desktop/mobile spotlight introduction and contextual tips, Escape/reopen, animated troop formations/reduced motion, clean terrain without contour clutter; three actual turns; chosen troop quantities and treaty price; conquest, patrol control, battle victory, camera crop/drag, bilingual enemy alerts, replay/reduced motion, diagnostics and entry/exit.');
}catch(error){if(current&&!current.isClosed()){await current.screenshot({path:'build/screenshots/onboarding-failure.png',fullPage:true});console.log((await current.locator('body').innerText()).slice(-6000));}throw error;}finally{await browser?.close();const exited=new Promise(r=>server.once('exit',r));server.kill();await exited;await rm(temp,{recursive:true,force:true});}



