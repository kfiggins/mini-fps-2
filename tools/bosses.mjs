import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
// Fight every boss for 12s in god mode: errors, phase 2, screenshots. node tools/bosses.mjs
const server = await createServer({ server: { port: 5195 }, logLevel: 'error' });
await server.listen();
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--enable-gpu'], defaultViewport: { width: 1280, height: 720 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
await page.goto(server.resolvedUrls.local[0]);
await page.waitForFunction(() => window.__game && document.getElementById('boot').classList.contains('done'), { timeout: 60000 });
for (const [wave, name] of [[5, 'warden'], [10, 'titan'], [15, 'butcher'], [20, 'vulcan'], [25, 'phantom'], [30, 'apex']]) {
  const info = await page.evaluate(async (wave) => {
    const g = window.__game, s = g.state;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    if (s.mode === 'menu' || s.mode === 'over') { g.debug.start('normal'); await wait(800); }
    g.debug.god(true); s.input.locked = true;
    g.debug.skipTo(wave);
    await wait(2500);
    const b = s.enemies.boss;
    if (!b) return { err: 'no boss' };
    // stand 15m from the boss, strafe, keep firing at it
    let hitsTaken = 0;
    const off = g.bus.on('player:hurt', () => hitsTaken++);
    const t0 = performance.now();
    while (performance.now() - t0 < 12000) {
      await wait(100);
      if (!b.alive) break;
      const p = s.player;
      const dx = b.center.x - p.pos.x, dy = b.center.y - p.pos.y, dz = b.center.z - p.pos.z;
      p.yaw = Math.atan2(-dx, -dz); p.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      s.input.fire = true;
      if (performance.now() - t0 > 6000 && b.phase === 1) g.bus.emit('damage:enemy', { enemy: b, amount: Math.ceil(b.maxHp * 0.55), part: 'body', source: 'debug', point: b.center });
    }
    s.input.fire = false;
    off();
    return { name: b.cfg.name, hp: Math.round(b.hp), max: b.maxHp, phase: b.phase, hitsTaken, minions: s.enemies.alive - 1, fps: s.fps };
  }, wave);
  await page.screenshot({ path: `shots/boss-${name}.png` });
  console.log(wave, JSON.stringify(info));
}
console.log('errors:', errors.slice(0, 10));
await browser.close();
await server.close();
