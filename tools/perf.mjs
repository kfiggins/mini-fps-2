// Frame pacing at MacBook-retina size under combat load, per quality preset.
// node tools/perf.mjs [width height dpr]
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
const [, , W = '1512', H = '945', DPR = '2'] = process.argv;
const server = await createServer({ server: { port: 5194 }, logLevel: 'error' });
await server.listen();
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-frame-rate-limit', '--disable-gpu-vsync'],
  defaultViewport: { width: +W, height: +H, deviceScaleFactor: +DPR },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto(server.resolvedUrls.local[0]);
await page.waitForFunction(() => window.__game && document.getElementById('boot').classList.contains('done'), { timeout: 60000 });
await page.evaluate(async () => {
  const g = window.__game;
  g.debug.start('normal'); g.debug.god(true); g.state.input.locked = true;
  g.state.settings.qualityAuto = false;
  await new Promise((r) => setTimeout(r, 1000));
  g.debug.skipTo(9);
});
for (const q of ['high', 'medium', 'low']) {
  const r = await page.evaluate(async (q) => {
    const g = window.__game, s = g.state;
    s.settings.quality = q; g.bus.emit('quality:changed');
    await new Promise((r) => setTimeout(r, 2500));
    const times = [];
    let last = performance.now();
    await new Promise((res) => {
      const t0 = last;
      const f = (now) => { times.push(now - last); last = now; if (now - t0 < 5000) requestAnimationFrame(f); else res(); };
      requestAnimationFrame(f);
    });
    times.sort((a, b) => a - b);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    return {
      q, fps: +(1000 / avg).toFixed(1), p50: +times[times.length >> 1].toFixed(1), p95: +times[Math.floor(times.length * 0.95)].toFixed(1),
      max: +times[times.length - 1].toFixed(1), cpuUpdate: +s.perf.update.toFixed(2), cpuRender: +s.perf.render.toFixed(2), enemies: s.enemies.alive,
      buffer: `${g.slices.render.renderer.domElement.width}x${g.slices.render.renderer.domElement.height}`,
    };
  }, q);
  console.log(JSON.stringify(r));
}
await browser.close();
await server.close();
