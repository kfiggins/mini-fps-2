import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
const [, , arena, x, y, z, type = 'rusher', secs = '20'] = process.argv;
const server = await createServer({ server: { port: 5196 }, logLevel: 'error' });
await server.listen();
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--enable-gpu'], defaultViewport: { width: 800, height: 450 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto(server.resolvedUrls.local[0]);
await page.waitForFunction(() => window.__game && document.getElementById('boot').classList.contains('done'), { timeout: 60000 });
const out = await page.evaluate(async (arena, x, y, z, type, secs) => {
  const g = window.__game;
  if (g.state.world.id !== arena) g.bus.emit('arena:load', { id: arena });
  g.state.mode = 'playing'; g.state.autopilot = true; g.state.debugGod = true;
  g.state.run.waveState = 'idle';
  const p = g.state.player; p.pos.set(x, y + 1.7, z);
  await new Promise((r) => setTimeout(r, 300));
  const list = [0, 1, 2, 3].map(() => g.debug.spawn(type));
  const log = [];
  const t0 = performance.now();
  while (performance.now() - t0 < secs * 1000) {
    await new Promise((r) => setTimeout(r, 1000));
    p.pos.set(x, y + 1.7, z); p.vel.set(0, 0, 0);
    const nav = g.state.nav;
    log.push(list.map((e) => `(${e.pos.x.toFixed(1)},${e.pos.y.toFixed(1)},${e.pos.z.toFixed(1)}) c=${nav.costAt(e.pos.x, e.pos.y, e.pos.z).toFixed(0)}${e.stuckT > 0.3 ? ' STUCK' : ''}`).join(' | '));
  }
  const tgt = {}; if (g.state.nav.target >= 0) g.state.nav.graph.nodePos(g.state.nav.target, tgt);
  return { target: tgt, log };
}, arena, +x, +y, +z, type, +secs);
console.log('target', JSON.stringify(out.target));
for (const l of out.log) console.log(l);
await browser.close();
await server.close();
