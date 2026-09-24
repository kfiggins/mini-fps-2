// Dump procedural textures to PNGs for inspection: node tools/texdump.mjs
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const server = await createServer({ server: { port: 5198 }, logLevel: 'error' });
await server.listen();
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(server.resolvedUrls.local[0] + 'tools/blank.html');
const out = await page.evaluate(async () => {
  const T = await import('/src/slices/arenas/textures.js');
  const res = {};
  const list = { concrete: T.concrete(21, 0xbcae96, { panels: 2 }), sand: T.sand(11, 0xcfa46d), metal: T.metalPanel(42, 0x4d5157, { panelsX: 1, panelsY: 1 }), asphalt: T.asphalt(31, 0x46443f), corr: T.corrugated(51, 0x8f3b2a), tech: T.techPanel(3, 0x1c2230, 0x19e6ff) };
  for (const [k, m] of Object.entries(list)) {
    res[k] = m.map.image.toDataURL('image/png');
    res[k + '_n'] = m.normalMap.image.toDataURL('image/png');
  }
  return res;
});
fs.mkdirSync('shots', { recursive: true });
for (const [k, v] of Object.entries(out)) fs.writeFileSync(`shots/tex-${k}.png`, Buffer.from(v.split(',')[1], 'base64'));
console.log(Object.keys(out).join(' '));
await browser.close();
await server.close();
