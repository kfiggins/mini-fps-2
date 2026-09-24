// Wave-by-wave enemy HP/threat vs v1's Arena (the difficulty the player liked).
import { ACTS } from '../src/slices/waves/defs.js';
import { TYPES } from '../src/slices/enemies/types.js';
const mix = (g, r, s, t, w = 0) => ({ grunt: g, rusher: r, sniper: s, tank: t, wasp: w });
const V1 = [mix(4,0,0,0), mix(5,2,0,0), mix(4,3,2,0), mix(4,3,2,2), 'warden', mix(6,4,2,2,2), mix(5,4,3,3,2), mix(4,6,4,3,3), mix(6,5,4,4,3), 'titan',
  mix(6,5,3,3,2), mix(6,6,4,3,3), mix(7,6,4,4,3), mix(6,8,5,4,4), 'butcher', mix(8,7,5,4,4), mix(8,8,5,5,4), mix(8,9,6,5,5), mix(9,10,6,6,5), 'overlord',
  mix(8,8,5,5,4), mix(9,9,6,5,5), mix(9,10,6,6,5), mix(10,10,7,6,6), 'phantom', mix(10,11,7,6,5), mix(10,12,7,7,6), mix(11,12,8,7,6), mix(12,13,8,8,7), 'apex'];
const HP1 = { grunt: 100, rusher: 30, sniper: 30, tank: 240, wasp: 30 };
// threat weight per unit (rough DPS pressure relative to a grunt)
const THREAT = { grunt: 1, rusher: 1.1, sniper: 1.3, tank: 1.4, wasp: 1.2, bulwark: 1.6, mender: 1.5, scorcher: 1.5, slag: 1.4 };
console.log('wave | v1 count  hp    | v2 count  hp    threat | hp ratio');
for (let w = 1; w <= 30; w++) {
  const v1 = V1[w - 1];
  const def = ACTS[Math.ceil(w / 10) - 1].waves[(w - 1) % 10];
  const scale = 1 + (w - 1) * 0.04;
  if (typeof v1 === 'string') {
    const t2 = TYPES[def.boss];
    console.log(`${String(w).padStart(4)} | BOSS ${v1.padEnd(9)} | BOSS ${def.boss.padEnd(8)} hp ${t2.hp} + escort ${def.escort.length}`);
    continue;
  }
  let c1 = 0, h1 = 0;
  for (const [k, n] of Object.entries(v1)) { c1 += n; h1 += n * HP1[k] * (k === 'grunt' || k === 'tank' ? scale : 1); }
  let c2 = 0, h2 = 0, th = 0;
  for (const t of def) { c2++; const T = TYPES[t]; h2 += T.hp * (T.scales ? scale : 1); th += THREAT[t]; }
  console.log(`${String(w).padStart(4)} | ${String(c1).padStart(4)} ${String(Math.round(h1)).padStart(7)} | ${String(c2).padStart(4)} ${String(Math.round(h2)).padStart(7)} ${th.toFixed(0).padStart(6)} | ${(h2 / h1).toFixed(2)}`);
}
