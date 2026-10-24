import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const temp = await mkdtemp(join(tmpdir(), 'sovereign-responsive-'));
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5182'], { windowsHide: true, env: { ...process.env, GAME_DATA_PATH: join(temp, 'rooms.json') }, stdio: 'ignore' });
const base = 'http://127.0.0.1:5182'; let browser;
try {
  for (let i = 0; i < 80; i++) { try { if ((await fetch(base + '/api/config')).ok) break; } catch {} await new Promise(done => setTimeout(done, 250)); }
  browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage(); const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const call = async (path, body, token) => { const r = await fetch(base + '/api' + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined }); const value = await r.json(); assert.equal(r.ok, true, JSON.stringify(value)); return value; };
  const players = await Promise.all(Array.from({ length: 5 }, (_, i) => call('/auth/guest', { name: `Layout ${i}` })));
  const keys = ['ideology','political','military','diplomacy','economy','society','technology','notes'];
  const doctrine = { en: Object.fromEntries(keys.map(k => [k, ''])), zh: Object.fromEntries(keys.map(k => [k, ''])) };
  let roomCode;
  await page.addInitScript(({ token }) => sessionStorage.setItem('sovereign.player.v1', token), { token: players[0].token });
  await page.goto(base);
  await mkdir('build/screenshots', { recursive: true });
  for (const scenario of ['frontier','straits','meridian','crescent','rift']) {
    const room = await call('/rooms', { name: 'Responsive test', scenario, doctrine }, players[0].token); roomCode = room.code;
    for (const player of players.slice(1)) await call(`/rooms/${room.code}/join`, { doctrine }, player.token);
    await call(`/rooms/${room.code}/start`, {}, players[0].token);
    await page.evaluate(code => sessionStorage.setItem('sovereign.room', code), room.code);
    await page.reload(); await page.locator('.sandbox').waitFor();
    for (const [width, height] of [[1440,800],[1280,720],[1024,768],[390,844]]) {
      await page.setViewportSize({ width, height });
      await page.locator('svg[data-territory-colors="5"]').waitFor();
      await page.waitForTimeout(150);
      const result = await page.evaluate(() => {
        const map = document.querySelector('.flat-map').getBoundingClientRect();
        const labels = [...document.querySelectorAll('.flat-province-label')].filter(el => getComputedStyle(el).visibility !== 'hidden' && !el.hidden).map(el => { const r = el.getBoundingClientRect(); return { x:r.x,y:r.y,w:r.width,h:r.height,text:el.textContent }; });
        const overlaps = labels.flatMap((a,i) => labels.slice(i+1).filter(b => a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y).map(b => [a.text,b.text]));
        return { height:map.height, overflow:document.documentElement.scrollWidth > innerWidth, overlaps, countries:document.querySelectorAll('.map-nation-sidebar > button').length, compact:document.querySelectorAll('.marker-compact').length };
      });
      assert.ok(result.height >= 280, `${scenario} ${width}x${height}: ${JSON.stringify(result)}`);
      assert.equal(result.overflow, false); assert.equal(result.countries, 5);
      assert.deepEqual(result.overlaps, [], `${scenario} ${width}x${height}`);
      if (scenario === 'rift') await page.screenshot({ path: `build/screenshots/responsive-${width}x${height}.png`, fullPage: true });
    }
  }
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.getByRole('button',{name:'Zoom in',exact:true}).click();
  await page.getByRole('button',{name:'Reset map',exact:true}).click();
  await page.locator('.flat-badge[data-region="12"]').click();
  assert.equal(await page.getByRole('button',{name:/^Sector 13 ·/}).getAttribute('aria-pressed'),'true');
  await page.getByRole('button',{name:/^Sector 14 ·/}).focus();await page.keyboard.press('Enter');
  assert.equal(await page.getByRole('button',{name:/^Sector 14 ·/}).getAttribute('aria-pressed'),'true');
  await page.getByRole('button',{name:'Reset map',exact:true}).click();
  await page.getByRole('button', { name: 'Resource flow & national status' }).click();
  await page.getByRole('table', { name: 'Resource flow' }).waitFor();
  assert.ok((await page.locator('.flat-map').boundingBox()).height >= 280);
  await page.getByRole('button', { name: 'Resource flow & national status' }).click();
  assert.equal(await page.getByRole('table', { name: 'Resource flow' }).isVisible(), false);
  assert.deepEqual(failures, []);
  console.log('PASS: five worlds × four viewport sizes; minimum map height, nonoverlapping labels, no horizontal overflow, accessible country key and expandable accounts.');
} finally {
  await browser?.close(); const exited = new Promise(done => server.once('exit', done)); server.kill(); await exited; await rm(temp, { recursive:true, force:true });
}
