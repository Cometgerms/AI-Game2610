import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const temp = await mkdtemp(join(tmpdir(), 'sovereign-ui-'));
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:5180';
const server = process.env.PREVIEW_URL ? null : spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5180'], { windowsHide: true, env: { ...process.env, GAME_DATA_PATH: join(temp, 'rooms.json') }, stdio: 'ignore' });
let browser;
try {
  for (let attempt = 0; attempt < 80; attempt++) {
    try { if ((await fetch(base + '/api/config')).ok) break; } catch {}
    if (attempt === 79) throw new Error('Preview did not start');
    await new Promise(done => setTimeout(done, 250));
  }
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true, args: ['--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1540, height: 1100 } });
  context.setDefaultTimeout(15000);
  const failures = [], pages = [];
  await mkdir('build/screenshots', { recursive: true });
  const guest = async i => {
    const page = await context.newPage(); page.on('pageerror', error => failures.push(error.message));
    await page.goto(base);
    await page.getByRole('textbox', { name: 'Player name', exact: true }).fill(`Commander ${i + 1}`);
    await page.getByRole('button', { name: /Play as guest/ }).click();
    await page.locator('.profile-identity h2').waitFor();
    pages.push(page); return page;
  };
  const page = await guest(0);
  await page.locator('.app-shell[data-motion="ready"]').waitFor();
  assert.equal(await page.locator('.profile-watermark').count(), 1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('.app-shell[data-motion="reduced"]').waitFor();
  assert.equal(await page.locator('canvas').count(), 0);
  assert.equal(await page.locator('.doctrine-tile').count(), 8);
  assert.equal(await page.locator('.doctrine-editor textarea').count(), 1);
  await page.getByRole('button', { name: 'Foreign policy', exact: true }).click();
  await page.getByRole('textbox', { name: 'Foreign policy', exact: true }).fill('Stay neutral unless directly threatened.');
  await page.getByRole('button', { name: 'Switch to Chinese' }).click();
  await page.getByRole('textbox', { name: '外交政策', exact: true }).fill('除非受到直接威胁，否则保持中立。');
  await page.getByRole('textbox', { name: '模板名称' }).fill('Neutral doctrine');
  await page.getByRole('button', { name: '保存模板', exact: true }).click();
  await page.getByRole('button', { name: '保存国策', exact: true }).click();
  await page.screenshot({ path: 'build/screenshots/profile-zh.png', fullPage: true });
  await page.getByRole('button', { name: '房间', exact: true }).click();
  const heading = await page.locator('.page-heading h1').boundingBox();
  const action = await page.locator('.page-heading > button').boundingBox();
  assert.ok(action.x >= heading.x + heading.width || action.y >= heading.y + heading.height, 'room heading/action do not overlap');
  assert.ok(action.width < 250, 'create button stays compact');
  await page.screenshot({ path: 'build/screenshots/rooms-zh.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: 'build/screenshots/rooms-mobile.png', fullPage: true });
  await page.locator('a.brand').click();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: 'build/screenshots/profile-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1540, height: 1100 });
  await page.reload();
  await page.getByRole('button', { name: 'Foreign policy', exact: true }).click();
  assert.equal(await page.getByRole('textbox', { name: 'Foreign policy', exact: true }).inputValue(), 'Stay neutral unless directly threatened.');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByRole('button', { name: 'Create a room', exact: true }).click();
  assert.equal(await page.locator('.world-card').count(), 5);
  for (let i = 0; i < 5; i++) {
    await page.locator('.world-card').nth(i).click();
    await page.locator(`svg[data-world="${4000 + i}"]`).waitFor();
    assert.equal(await page.getByRole('button', { name: /^Sector / }).count(), 25);
  }
  await page.locator('.world-card').first().click();
  await page.getByRole('textbox', { name: 'Room name', exact: true }).fill('Five-tab test');
  await page.getByRole('button', { name: /^Create room/ }).click();
  await page.getByRole('heading', { name: 'Five-tab test' }).waitFor();
  const code = await page.evaluate(() => sessionStorage.getItem('sovereign.room'));
  assert.equal(await page.getByRole('button', { name: /Start match/ }).isDisabled(), true);
  const originalToken = await page.evaluate(() => sessionStorage.getItem('sovereign.player.v1'));
  const duplicate = await context.newPage();
  await duplicate.addInitScript(token => sessionStorage.setItem('sovereign.player.v1', token), originalToken);
  await duplicate.goto(base);
  await duplicate.getByRole('button', { name: /Play as guest/ }).waitFor();
  assert.equal(await duplicate.evaluate(() => sessionStorage.getItem('sovereign.player.v1')), null, 'duplicate tab resets inherited identity');
  await duplicate.close();
  for (let i = 1; i < 5; i++) {
    const other = await guest(i);
    await other.getByRole('button', { name: 'Join a room', exact: true }).click();
    await other.getByRole('textbox', { name: 'Room code', exact: true }).fill(code);
    await other.getByRole('button', { name: 'Join room', exact: true }).click();
    await other.getByRole('heading', { name: 'Five-tab test' }).waitFor();
    assert.equal(await other.locator('.seat-list button').first().isDisabled(), true);
  }
  const tokens = await Promise.all(pages.map(p => p.evaluate(() => sessionStorage.getItem('sovereign.player.v1'))));
  assert.equal(new Set(tokens).size, 5);
  await page.getByRole('button', { name: /Start match/ }).click();
  await Promise.all(pages.map(p => p.locator('.sandbox').waitFor()));
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.locator('svg[data-territory-colors="5"]').waitFor();
  assert.equal(await page.locator('.map-nation-sidebar > button:visible').count(), 5);
  assert.equal(await page.locator('.resource-trend').count(), 7);
  await page.getByRole('button', { name: 'Resource flow & national status' }).click();
  assert.equal(await page.getByRole('table', { name: 'Resource flow' }).count(), 1);
  await page.getByRole('button', { name: 'Resource flow & national status' }).click();
  assert.equal(await page.locator('.resource-trend circle').count(), 7, 'opening data uses dots, not fabricated trends');
  await page.locator('.sandbox[data-motion="ready"]').waitFor();
  await page.screenshot({ path: 'build/screenshots/dashboard-opening.png', fullPage: true });
  const visible = await page.evaluate(() => {
    const map = document.querySelector('.operations-map').getBoundingClientRect(), data = document.querySelector('.telemetry').getBoundingClientRect(), settle = document.querySelector('.settlement-bar').getBoundingClientRect();
    return { nonoverlap: map.bottom <= data.top, fit: data.bottom <= innerHeight && settle.bottom <= innerHeight, height: document.documentElement.scrollHeight, viewport: innerHeight };
  });
  assert.ok(visible.nonoverlap && visible.fit && visible.height <= visible.viewport + 1, JSON.stringify(visible));
  await page.setViewportSize({ width: 1150, height: 650 });
  await page.evaluate(() => scrollTo(0, 600));
  assert.equal(await page.locator('.operations-map').evaluate(el => getComputedStyle(el).position), 'static');
  assert.ok(await page.evaluate(() => document.querySelector('.operations-map').getBoundingClientRect().bottom <= document.querySelector('.telemetry').getBoundingClientRect().top), 'scrolling cannot float the map over the data');
  await page.setViewportSize({ width: 1540, height: 1100 });
  await page.evaluate(() => scrollTo(0, 0));
  for (let i = 0; i < 5; i++) {
    assert.equal(await pages[i].locator('.country-switcher button').count(), 0);
    assert.match(await pages[i].locator('.country-seat.mine').innerText(), new RegExp(`Commander ${i + 1}`));
    await pages[i].locator('.strategy-notes > summary').click();
    await pages[i].getByRole('textbox', { name: 'Current-turn instructions' }).fill(`Private plan ${i}`);
    await pages[i].getByRole('button', { name: 'Confirm country orders' }).click();
    await pages[i].locator('.submission-card').waitFor();
    if(await pages[i].getByRole('button',{name:/^Keep exploring/}).isVisible())await pages[i].getByRole('button',{name:/^Keep exploring/}).click();
  }
  // Confirm immediately after editing: a delayed autosave must not withdraw confirmation.
  await page.waitForFunction(() => document.querySelector('.sandbox-status')?.textContent.includes('5 / 5'));
  await new Promise(done => setTimeout(done, 1000));
  assert.equal(await page.getByRole('button', { name: 'Resolve turn', exact: false }).isEnabled(), true);
  assert.equal(await pages[1].getByRole('button', { name: 'Resolve turn', exact: false }).isDisabled(), true);
  await page.getByRole('textbox', { name: 'Current-turn instructions' }).fill('Hold the line instead.');
  await page.getByRole('button', { name: 'Recruit', exact: true }).click();
  assert.match(await page.locator('.order-feedback').innerText(), /Recruit.*Queued for settlement/);
  await page.getByRole('button', { name: 'Hold', exact: true }).click();
  assert.match(await page.locator('.sandbox-message').innerText(), /already queued/);
  assert.equal(await page.locator('.queued-orders > div').count(), 1);
  await page.getByRole('button', { name: 'Dismiss message' }).click();
  await page.getByRole('button', { name: 'Development & research', exact: true }).click();
  await page.locator('.development-grid button').first().click();
  await page.locator('.development-grid button').nth(3).click();
  await page.locator('.tech-list button').first().click();
  assert.match(await page.locator('.order-feedback').innerText(), /Research.*Queued for settlement/);
  await page.getByRole('button', { name: 'Decrees', exact: true }).click();
  await page.locator('.edict-list > div').filter({ has: page.getByText('Diplomacy', { exact: true }) }).getByRole('button', { name: 'Enact', exact: true }).click();
  assert.match(await page.locator('.order-feedback').innerText(), /Enact.*Diplomacy.*Queued for settlement/);
  assert.equal(await page.locator('.queued-orders > div').count(), 5);
  await page.screenshot({ path: 'build/screenshots/commands-queued.png', fullPage: true });
  await page.getByRole('tab', { name: 'Treaties', exact: true }).click();
  await page.getByRole('button', { name: /Propose & sign/ }).click();
  await pages[1].getByRole('tab', { name: 'Treaties', exact: true }).click();
  await pages[1].getByRole('button', { name: 'Reject proposal', exact: true }).click();
  await page.locator('[data-treaty-status="rejected"]').waitFor();
  assert.match(await page.locator('[data-treaty-status="rejected"]').innerText(), /Rejected/);
  assert.equal(await page.locator('[data-treaty-status="rejected"] button').count(), 0);
  await page.getByRole('button', { name: /Propose & sign/ }).click();
  await page.getByRole('button', { name: 'Withdraw proposal', exact: true }).click();
  await pages[1].locator('[data-treaty-status="withdrawn"]').waitFor();
  await page.getByRole('button', { name: /Propose & sign/ }).click();
  await pages[1].getByRole('button', { name: 'Accept exact terms', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.treaty-list')?.textContent.includes('2/2'));
  for (const p of pages.slice(0, 2)) {
    await p.getByRole('tab', { name: 'Orders', exact: true }).click();
    await p.getByRole('button', { name: 'Confirm country orders' }).click();
    await p.locator('.submission-card').waitFor();
    if(await p.getByRole('button',{name:/^Keep exploring/}).isVisible())await p.getByRole('button',{name:/^Keep exploring/}).click();
  }
  await pages[2].reload();
  await pages[2].locator('.sandbox').waitFor();
  await pages[2].locator('.strategy-notes > summary').click();
  assert.equal(await pages[2].getByRole('textbox', { name: 'Current-turn instructions' }).inputValue(), 'Private plan 2');
  await page.getByRole('button', { name: 'Resolve turn', exact: false }).click();
  await Promise.all(pages.map(p => p.getByRole('heading', { name: 'After-action report.' }).waitFor()));
  for(const [i,p] of pages.entries()){
    await p.locator('.turn-review-modal').waitFor();
    await p.getByRole('button',{name:'Ready for next turn',exact:true}).click();
    if(i<4)assert.equal(await p.getByRole('button',{name:'Waiting for the other commanders…',exact:true}).isDisabled(),true);
  }
  await Promise.all(pages.map(p=>p.locator('.turn-review-modal').waitFor({state:'hidden'})));

  for (const p of pages) assert.match(await p.locator('.sandbox-heading h1').innerText(), /02/);
  assert.equal(await page.locator('.resource-metric strong').nth(3).innerText(), '65');
  assert.equal(await page.locator('.resource-metric strong').nth(5).innerText(), '125');
  await page.getByRole('tab', { name: 'Treaties', exact: true }).click();
  assert.equal(await page.locator('[data-treaty-status="rejected"]').count(), 1);
  assert.equal(await page.locator('[data-treaty-status="withdrawn"]').count(), 1);
  await page.getByRole('tab', { name: 'Orders', exact: true }).click();
  await page.getByRole('button', { name: 'Development & research', exact: true }).click();
  assert.match(await page.locator('.tech-list > div').first().innerText(), /1 \/ 3/);
  await page.getByRole('button', { name: 'Decrees', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Renew', exact: true }).count(), 1);
  await page.screenshot({ path: 'build/screenshots/game-en.png', fullPage: true });
  assert.equal(await page.locator('.resource-trend polyline').count(), 7);
  await page.getByRole('combobox', { name: 'History', exact: true }).selectOption('0');
  assert.equal(await page.locator('.resource-trend circle').count(), 7, 'history cannot display later resource values');
  await page.getByRole('tab', { name: 'Orders', exact: true }).click();
  await page.locator('.strategy-notes > summary').click();
  assert.equal(await page.getByRole('textbox', { name: 'Current-turn instructions' }).isDisabled(), true);
  await page.getByRole('combobox', { name: 'History', exact: true }).selectOption('-1');
  for (const p of pages) {
    await p.getByRole('tab', { name: 'Orders', exact: true }).click();
    await p.getByRole('button', { name: 'Confirm country orders' }).click();
    await p.locator('.submission-card').waitFor();
    if(await p.getByRole('button',{name:/^Keep exploring/}).isVisible())await p.getByRole('button',{name:/^Keep exploring/}).click();
  }
  await page.getByRole('button', { name: 'Resolve turn', exact: false }).click();
  await page.getByRole('heading', { name: 'After-action report.' }).waitFor();
  for(const p of pages){await p.locator('.turn-review-modal').waitFor();await p.getByRole('button',{name:'Ready for next turn',exact:true}).click();}
  await page.locator('.turn-review-modal').waitFor({state:'hidden'});
  assert.match(await page.locator('.sandbox-heading h1').innerText(), /03/);
  await page.getByRole('tab', { name: 'Goals', exact: true }).click();
  await page.getByRole('button', { name: 'End match & score', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.sandbox-heading h1')?.textContent.includes('FINAL STANDINGS'));
  await page.screenshot({ path: 'build/screenshots/sandbox-scores.png', fullPage: true });
  await page.getByRole('button', { name: 'Switch to Chinese' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: 'build/screenshots/game-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1540, height: 1100 });
  const previousZoom=Number(await page.locator('.flat-map').getAttribute('data-zoom'));
  await page.getByRole('button', { name: '放大地图', exact: true }).click();
  assert.ok(Number(await page.locator('.flat-map').getAttribute('data-zoom'))>previousZoom);
  await page.getByRole('button', { name: '重置地图' }).click();
  assert.equal(await page.locator('.flat-map').getAttribute('data-zoom'),'1.00');
  await page.getByRole('button', { name: '保存并返回' }).click();
  await page.getByRole('button', { name: '账号菜单' }).click();
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await page.getByRole('button', { name: /游客游玩/ }).waitFor();
  assert.equal(await pages[1].locator('.sandbox').count(), 1, 'logging out does not affect other tabs');
  assert.deepEqual(failures, []);
  console.log('PASS: five same-context tabs, identity isolation, duplicated-tab handling, locked countries, private drafts, autosave/confirm race, signed treaties, two C++ turns, refresh recovery, scoring, logout isolation, modular bilingual policy, room layout, mobile, reduced motion and 2D map zoom.');
} finally {
  await browser?.close();
  if (server) { const exited = new Promise(done => server.once('exit', done)); server.kill(); await exited; }
  await rm(temp, { recursive: true, force: true });
}
