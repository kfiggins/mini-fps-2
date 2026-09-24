// Headless play-test harness.
//   node tools/playtest.mjs shots [arena]        screenshots from preset cameras
//   node tools/playtest.mjs run [seconds] [diff] autopilot run with a bot player
//   node tools/playtest.mjs eval "<js>"           evaluate in the page after boot
// Screenshots land in ./shots. Prints console errors and a JSON summary.
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const [, , cmd = 'shots', arg1, arg2, arg3] = process.argv;
const OUT = path.resolve('shots');
fs.mkdirSync(OUT, { recursive: true });

const server = await createServer({ server: { port: 5199, strictPort: false }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--window-size=1600,900'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
  if (process.env.VERBOSE) console.log('page:', m.text());
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack || ''}`));

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && document.getElementById('boot').classList.contains('done'), { timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));

const shot = async (name) => {
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log('shot', name);
};

async function setCam(x, y, z, yaw, pitch = 0) {
  await page.evaluate((x, y, z, yaw, pitch) => {
    const g = window.__game;
    g.state.mode = 'playing';
    g.state.autopilot = true;
    const p = g.state.player;
    p.pos.set(x, y, z);
    p.vel.set(0, 0, 0);
    p.yaw = yaw;
    p.pitch = pitch;
    document.getElementById('menu').classList.add('hidden');
  }, x, y, z, yaw, pitch);
  await new Promise((r) => setTimeout(r, 700));
}

try {
  if (cmd === 'shots') {
    await shot('00-menu');
    await page.evaluate((a) => { if (a) window.__game.bus.emit('arena:load', { id: a }); }, arg1 || null);
    await new Promise((r) => setTimeout(r, 800));
    const cams = JSON.parse(fs.readFileSync(path.resolve('tools/cams.json'), 'utf8'))[arg1 || 'outpost'] || [];
    for (const c of cams) {
      await setCam(...c.pos, c.yaw, c.pitch || 0);
      await shot(`${arg1 || 'outpost'}-${c.name}`);
    }
  } else if (cmd === 'run') {
    const seconds = Number(arg1 || 60);
    await page.evaluate((d) => window.__game.debug.start(d), arg2 || 'normal');
    if (arg3 === 'god') await page.evaluate(() => window.__game.debug.god(true));
    // bot player: turn toward the nearest visible enemy and hold fire
    await page.evaluate(() => {
      const g = window.__game;
      g.state.input.locked = true;
      setInterval(() => {
        const s = g.state;
        if (s.mode === 'offer') {
          const b = document.querySelector('#offer-cards .card');
          if (b) b.click();
          return;
        }
        if (s.mode !== 'playing') return;
        const p = s.player;
        let best = null, bd = 1e9;
        for (const e of s.enemies.list) {
          if (!e.alive || e.untargetable) continue;
          const d = e.center.distanceTo(p.pos);
          if (d < bd) { bd = d; best = e; }
        }
        s.input.fire = false;
        s.input.keys.KeyW = false;
        if (best) {
          const dx = best.center.x - p.pos.x, dy = best.center.y - p.pos.y, dz = best.center.z - p.pos.z;
          p.yaw = Math.atan2(-dx, -dz);
          p.pitch = Math.atan2(dy, Math.hypot(dx, dz));
          s.input.fire = true;
          if (bd > 25) s.input.keys.KeyW = true;
        }
      }, 50);
    });
    const t0 = Date.now();
    let n = 0;
    while (Date.now() - t0 < seconds * 1000) {
      await new Promise((r) => setTimeout(r, 5000));
      const info = await page.evaluate(() => {
        const s = window.__game.state;
        return { mode: s.mode, wave: s.run.wave, ws: s.run.waveState, alive: s.enemies.alive, hp: Math.round(s.player.health), score: s.run.score, scrap: s.run.scrap, fps: s.fps, kills: s.run.kills };
      });
      console.log(JSON.stringify(info));
      if (n++ % 3 === 0) await shot(`run-${String(n).padStart(2, '0')}`);
      if (info.mode === 'over') break;
    }
    await shot('run-final');
  } else if (cmd === 'vm') {
    await page.evaluate(() => { window.__game.debug.start('normal'); window.__game.debug.god(true); });
    await new Promise((r) => setTimeout(r, 1500));
    const ids = (arg1 || 'rifle,marksman,scattergun,arcsmg,rail,launcher').split(',');
    for (const id of ids) {
      await page.evaluate((id) => {
        const g = window.__game;
        g.debug.weapon(id, 0);
        const p = g.state.player;
        p.pos.set(0, 1.7, 28); p.yaw = 0; p.pitch = 0.02;
        g.state.input.aim = false;
      }, id);
      await new Promise((r) => setTimeout(r, 900));
      await shot(`vm-${id}-hip`);
      await page.evaluate(() => { window.__game.state.input.aim = true; });
      await new Promise((r) => setTimeout(r, 700));
      await shot(`vm-${id}-ads`);
      await page.evaluate(() => { window.__game.state.input.aim = false; });
    }
  } else if (cmd === 'enemies') {
    await page.evaluate(() => { window.__game.debug.start('normal'); window.__game.debug.god(true); });
    await new Promise((r) => setTimeout(r, 800));
    const types = (arg1 || 'grunt,rusher,tank,sniper,bulwark,scorcher,slag,wasp,mender').split(',');
    await page.evaluate((types) => {
      const g = window.__game;
      g.bus.emit('enemies:clear');
      g.state.run.waveState = 'idle';
      const n = types.length;
      types.forEach((t, i) => {
        const x = (i - (n - 1) / 2) * (n > 3 ? 3.2 : 6);
        const e = g.debug.spawn(t, { at: { x, y: 0, z: 14 } });
        e.pos.set(x, e.cfg.fly ? 2.2 : 0, 14);
      });
      const p = g.state.player;
      p.pos.set(0, 1.7, 24.5); p.yaw = 0; p.pitch = -0.05;
    }, types);
    await new Promise((r) => setTimeout(r, 1500));
    await page.evaluate(() => {
      const g = window.__game;
      for (const e of g.state.enemies.list) { e.stun = 999; }
      g.state.player.pos.set(0, 1.7, 24.5); g.state.player.yaw = 0;
      g.slices.weapons && (g.state.player.inMech = false);
    });
    await new Promise((r) => setTimeout(r, 400));
    await shot(`enemies-${arg2 || 'lineup'}`);
  } else if (cmd === 'nav') {
    // top-down nav audit: colour = height, red = walkable but unreachable
    await page.evaluate((a) => { if (a) window.__game.bus.emit('arena:load', { id: a }); }, arg1 || null);
    await new Promise((r) => setTimeout(r, 1500));
    const res = await page.evaluate(() => {
      const g = window.__game.state.nav.graph;
      const S = 8;
      const c = document.createElement('canvas');
      c.width = g.nx * S; c.height = g.nz * S;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#111'; ctx.fillRect(0, 0, c.width, c.height);
      // true reachability: directed BFS from every enemy spawn (walk, drop, pad links)
      const reach = new Uint8Array(g.N);
      const q = [];
      for (const p of window.__game.state.world.spawnPoints) { const n = g.nearest(p.x, 0.3, p.z); if (n >= 0 && !reach[n]) { reach[n] = 1; q.push(n); } }
      while (q.length) { const u = q.pop(); for (let k = g.out.start[u]; k < g.out.start[u + 1]; k++) { const v = g.out.to[k]; if (!reach[v]) { reach[v] = 1; q.push(v); } } }
      const islands = new Map();
      // draw low nodes first so upper floors paint on top
      const order = [...Array(g.N).keys()].sort((a, b) => g.height[a] - g.height[b]);
      for (const n of order) {
        const ci = g.nodeCol[n];
        const ix = ci % g.nx, iz = (ci / g.nx) | 0;
        const h = g.height[n];
        const main = reach[n] === 1;
        if (!main) islands.set(g.comp[n], (islands.get(g.comp[n]) || 0) + 1);
        const l = Math.min(85, 25 + h * 6);
        ctx.fillStyle = main ? `hsl(${200 - h * 12}, 70%, ${l}%)` : '#ff2a2a';
        ctx.fillRect(ix * S + 1, iz * S + 1, S - 2, S - 2);
      }
      const w = window.__game.state.world;
      ctx.fillStyle = '#ffd36b';
      for (const p of w.spawnPoints) ctx.fillRect((p.x - g.minX) * S - 4, (p.z - g.minZ) * S - 4, 8, 8);
      ctx.fillStyle = '#3dff8a';
      const ps = w.playerSpawn;
      ctx.fillRect((ps.x - g.minX) * S - 5, (ps.z - g.minZ) * S - 5, 10, 10);
      const inside = (id) => { for (let k = 0; k < g.N; k++) if (g.comp[k] === id) { const o = {}; g.nodePos(k, o); return Math.abs(o.x) < 41 && Math.abs(o.z) < 41; } return false; };
      const big = [...islands.entries()].filter(([id, n]) => n >= 4 && inside(id)).sort((a, b) => b[1] - a[1]);
      // sample island positions
      const where = big.slice(0, 12).map(([id, n]) => {
        let k = 0; for (; k < g.N; k++) if (g.comp[k] === id) break;
        const o = {}; g.nodePos(k, o);
        return { nodes: n, x: o.x, y: +o.y.toFixed(2), z: o.z };
      });
      const spawnsOk = w.spawnPoints.map((p) => { const n = g.nearest(p.x, 0.2, p.z); return n >= 0 && g.comp[n] === g.main; });
      return { png: c.toDataURL(), N: g.N, E: g.E, main: g.compSize[g.main], islands: where, spawnsOk, buildMs: window.__game.state.nav.buildMs };
    });
    fs.writeFileSync(path.join(OUT, `nav-${arg1 || 'outpost'}.png`), Buffer.from(res.png.split(',')[1], 'base64'));
    delete res.png;
    console.log(JSON.stringify(res, null, 1));
  } else if (cmd === 'flow') {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const st = () => page.evaluate(() => { const s = window.__game.state; return { mode: s.mode, wave: s.run.wave, act: s.run.act, ws: s.run.waveState, alive: s.enemies.alive }; });
    await page.evaluate(() => { window.__game.debug.start('normal'); window.__game.debug.god(true); window.__game.state.input.locked = true; });
    await wait(1500);
    // clear wave 1 → offer
    await page.evaluate(() => window.__game.debug.scrap(1500));
    for (let i = 0; i < 20 && (await st()).mode !== 'offer'; i++) { await page.evaluate(() => window.__game.debug.winWave()); await wait(700); }
    await wait(900);
    await shot('flow-01-offer');
    // buy a drone + jetpack
    await page.evaluate(() => { for (const id of ['drone', 'jetpack', 'armor', 'armor']) document.querySelector(`.shop-item[data-id="${id}"]`)?.click(); });
    await wait(300);
    await shot('flow-02-shop');
    await page.evaluate(() => document.querySelector('#offer-cards .card')?.click());
    await wait(1200);
    console.log('after pick', JSON.stringify(await st()));
    // boss: wave 5
    await page.evaluate(() => window.__game.debug.skipTo(5));
    await wait(3500);
    await page.evaluate(() => {
      const s = window.__game.state; const b = s.enemies.boss; if (!b) return;
      const p = s.player; p.pos.set(b.pos.x, 1.7, b.pos.z + 14); p.yaw = 0; p.pitch = 0.15;
      window.__game.debug.god(true);
    });
    await wait(1500);
    await shot('flow-03-boss-warden');
    // force phase 2
    await page.evaluate(() => { const b = window.__game.state.enemies.boss; if (b) window.__game.bus.emit('damage:enemy', { enemy: b, amount: Math.ceil(b.maxHp * 0.55), part: 'body', source: 'debug', point: b.center }); });
    await wait(1200);
    await shot('flow-04-boss-phase2');
    // act end: wave 10 cleared → offer → armory → transition
    await page.evaluate(() => window.__game.debug.skipTo(10));
    await wait(2500);
    for (let i = 0; i < 20 && (await st()).mode !== 'offer'; i++) { await page.evaluate(() => { const s = window.__game.state; for (const e of s.enemies.list) if (e.alive) window.__game.bus.emit('damage:enemy', { enemy: e, amount: 1e7, part: 'body', source: 'debug', point: e.center }); window.__game.debug.winWave(); }); await wait(800); }
    await wait(900);
    await shot('flow-05-boss-reward');
    await page.evaluate(() => document.querySelector('#offer-cards .card')?.click());
    await wait(800);
    await shot('flow-06-armory');
    await page.evaluate(() => document.querySelector('#offer-cards .card')?.click());
    await wait(500);
    await shot('flow-07-armory-slot');
    await page.evaluate(() => document.querySelector('#offer-cards .card')?.click());
    await wait(1200);
    await shot('flow-08-transition');
    await wait(3500);
    console.log('act2', JSON.stringify(await st()));
    await shot('flow-09-act2');
    // death screen
    await page.evaluate(() => { window.__game.debug.god(false); window.__game.bus.emit('damage:player', { amount: 9999, kind: 'shot', from: { x: 0, y: 0, z: 0 } }); });
    await wait(2800);
    await shot('flow-10-death');
  } else if (cmd === 'eval') {
    const r = await page.evaluate(arg1);
    console.log(JSON.stringify(r, null, 1));
    if (arg2) { await new Promise((r) => setTimeout(r, Number(arg3 || 900))); await shot(arg2); }
  }
} catch (e) {
  console.error('HARNESS ERROR', e);
}
console.log(`\n${errors.length} console errors/warnings`);
for (const e of errors.slice(0, 30)) console.log(e);
await browser.close();
await server.close();
