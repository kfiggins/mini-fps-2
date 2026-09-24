// Put the player on high ground, spawn robots at the gates, and report how
// close (and how high) they get. node tools/ai-reach.mjs
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
const server = await createServer({ server: { port: 5197 }, logLevel: 'error' });
await server.listen();
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'], defaultViewport: { width: 800, height: 450 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(server.resolvedUrls.local[0]);
await page.waitForFunction(() => window.__game && document.getElementById('boot').classList.contains('done'), { timeout: 60000 });
const spots = [
  ['outpost', 'CP roof', 2, 7.8, 2],
  ['outpost', 'CP 2F', -3, 3.9, 0],
  ['outpost', 'NW tower', -30, 5, -29],
  ['outpost', 'container perch', 26, 5.2, -32],
  ['refinery', 'deck', 3, 3.5, 3],
  ['refinery', 'gantry', 8, 8.5, 10.5],
  ['refinery', 'tank top', 38, 7, -22],
  ['refinery', 'pump roof', -30, 7.2, -30],
  ['reactor', 'ring', 0, 6, 15.5],
  ['reactor', 'control 2F', -32, 3.6, -30],
  ['reactor', 'hangar pad', -32, 2, 24],
];
const only = process.argv[2];
for (const [arena, name, x, y, z] of spots.filter((sp) => !only || sp[1].includes(only))) {
  const r = await page.evaluate(async (arena, x, y, z) => {
    const g = window.__game;
    if (g.state.world.id !== arena) { g.bus.emit('arena:load', { id: arena }); }
    g.state.mode = 'playing'; g.state.autopilot = true; g.state.debugGod = true;
    g.state.run.difficulty = { enemyDmg: 0, playerHp: 1, regenRate: 1, regenDelay: 1, playerSpeed: 1 };
    g.state.run.waveState = 'idle';
    g.bus.emit('enemies:clear');
    const p = g.state.player; p.pos.set(x, y + 1.7, z); p.vel.set(0, 0, 0);
    await new Promise((res) => setTimeout(res, 300));
    const list = [];
    for (let i = 0; i < 6; i++) list.push(g.debug.spawn(i % 2 ? 'rusher' : 'grunt'));
    const t0 = performance.now();
    let best = [];
    while (performance.now() - t0 < 25000) {
      await new Promise((res) => setTimeout(res, 500));
      p.pos.set(x, y + 1.7, z); p.vel.set(0, 0, 0);
      best = list.map((e) => ({ t: e.type, d: +Math.hypot(e.pos.x - x, e.pos.z - z).toFixed(1), y: +e.pos.y.toFixed(1) }));
      if (best.filter((b) => b.t === 'rusher').every((b) => b.d < 3 && Math.abs(b.y - y) < 1)) break;
    }
    return { secs: +((performance.now() - t0) / 1000).toFixed(1), best };
  }, arena, x, y, z);
  const rushers = r.best.filter((b) => b.t === 'rusher');
  const ok = rushers.filter((b) => b.d < 3.5 && Math.abs(b.y - y) < 1).length;
  console.log(`${arena.padEnd(9)} ${name.padEnd(16)} rushers reached ${ok}/${rushers.length} in ${r.secs}s  grunts: ${r.best.filter((b) => b.t === 'grunt').map((b) => `${b.d}m@${b.y}`).join(' ')}`);
}
console.log(errors.length ? errors.slice(0, 5) : 'no page errors');
await browser.close();
await server.close();
