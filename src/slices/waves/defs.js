// Run structure: 3 acts × 10 waves. Wave 5 of each act is a mini-boss,
// wave 10 the act boss. Counts are NORMAL; difficulty scales them.

const mix = (o) => {
  const out = [];
  const add = (t, n) => { for (let i = 0; i < (n || 0); i++) out.push(t); };
  add('grunt', o.g); add('rusher', o.r); add('sniper', o.s); add('tank', o.t);
  add('wasp', o.w); add('bulwark', o.b); add('mender', o.m); add('scorcher', o.sc); add('slag', o.sl);
  return out;
};

export const ACTS = [
  {
    arena: 'outpost', name: 'DUST OUTPOST', tagline: 'The perimeter has fallen. Hold the outpost.',
    waves: [
      mix({ g: 4 }),
      mix({ g: 5, r: 2 }),
      mix({ g: 4, r: 3, s: 2 }),
      mix({ g: 4, r: 3, s: 2, t: 2 }),
      { boss: 'warden', escort: mix({ r: 2 }) },
      mix({ g: 6, r: 4, s: 2, t: 2, w: 2 }),
      mix({ g: 5, r: 4, s: 3, t: 2, w: 2, b: 1 }),
      mix({ g: 5, r: 5, s: 3, t: 3, w: 3, b: 1, m: 1 }),
      mix({ g: 6, r: 5, s: 4, t: 3, w: 3, b: 2, m: 1 }),
      { boss: 'titan', escort: mix({ g: 2, s: 2 }) },
    ],
  },
  {
    arena: 'refinery', name: 'THE REFINERY', tagline: 'They are building more of themselves. Shut it down.',
    waves: [
      mix({ g: 5, r: 4, s: 2, t: 2, w: 2, sc: 2, sl: 1 }),
      mix({ g: 5, r: 5, s: 3, t: 2, w: 3, sc: 2, sl: 1, b: 1 }),
      mix({ g: 5, r: 5, s: 3, t: 3, w: 3, sc: 2, sl: 2, b: 1, m: 1 }),
      mix({ g: 6, r: 6, s: 3, t: 3, w: 3, sc: 2, sl: 2, b: 2, m: 1 }),
      { boss: 'butcher', escort: mix({ r: 3, t: 1, w: 2 }) },
      mix({ g: 6, r: 6, s: 4, t: 3, w: 3, sc: 3, sl: 2, b: 2, m: 1 }),
      mix({ g: 6, r: 7, s: 4, t: 3, w: 4, sc: 3, sl: 2, b: 2, m: 2 }),
      mix({ g: 7, r: 7, s: 4, t: 4, w: 4, sc: 3, sl: 3, b: 2, m: 2 }),
      mix({ g: 7, r: 8, s: 5, t: 4, w: 4, sc: 3, sl: 3, b: 3, m: 2 }),
      { boss: 'vulcan', escort: mix({ s: 2, t: 2 }) },
    ],
  },
  {
    arena: 'reactor', name: 'REACTOR CORE', tagline: 'The heart of the machine. End this.',
    waves: [
      mix({ g: 7, r: 7, s: 4, t: 4, w: 4, sc: 2, sl: 2, b: 2, m: 1 }),
      mix({ g: 7, r: 8, s: 5, t: 4, w: 4, sc: 3, sl: 2, b: 2, m: 2 }),
      mix({ g: 8, r: 8, s: 5, t: 4, w: 5, sc: 3, sl: 3, b: 2, m: 2 }),
      mix({ g: 8, r: 9, s: 5, t: 5, w: 5, sc: 3, sl: 3, b: 3, m: 2 }),
      { boss: 'phantom', escort: mix({ s: 2, r: 2, w: 2 }) },
      mix({ g: 8, r: 9, s: 6, t: 5, w: 5, sc: 3, sl: 3, b: 3, m: 2 }),
      mix({ g: 9, r: 10, s: 6, t: 5, w: 5, sc: 3, sl: 3, b: 3, m: 3 }),
      mix({ g: 9, r: 10, s: 6, t: 5, w: 6, sc: 4, sl: 4, b: 3, m: 3 }),
      mix({ g: 10, r: 11, s: 7, t: 6, w: 6, sc: 4, sl: 4, b: 3, m: 3 }),
      { boss: 'apex', escort: mix({ t: 2, s: 2, r: 2, w: 2, m: 1 }) },
    ],
  },
];

export const DIFFICULTIES = {
  easy: {
    id: 'easy', label: 'EASY', desc: 'For new recruits (and kids). Tougher you, weaker robots.',
    enemyDmg: 0.45, enemyHp: 0.7, enemySpeed: 0.85, accuracy: 0.7, playerHp: 1.5, playerSpeed: 1,
    waveScale: 0.5, countMult: 0.7, scrapMult: 1.6, regenRate: 1.5, regenDelay: 0.6,
    cap: 12, eliteFrom: 22, eliteChance: 0.5, mutatorChance: 0.15,
  },
  normal: {
    id: 'normal', label: 'NORMAL', desc: 'The real game. Build smart or die trying.',
    enemyDmg: 1, enemyHp: 1, enemySpeed: 1, accuracy: 1, playerHp: 1, playerSpeed: 1,
    waveScale: 1, countMult: 1, scrapMult: 1, regenRate: 1, regenDelay: 1,
    cap: 20, eliteFrom: 12, eliteChance: 1, mutatorChance: 0.25,
  },
  overdrive: {
    id: 'overdrive', label: 'OVERDRIVE', desc: 'Unlocked by beating Normal. Everything hits harder.',
    enemyDmg: 1.25, enemyHp: 1.35, enemySpeed: 1.1, accuracy: 1.2, playerHp: 1, playerSpeed: 1,
    waveScale: 1.3, countMult: 1.2, scrapMult: 1, regenRate: 0.85, regenDelay: 1.2,
    cap: 26, eliteFrom: 6, eliteChance: 2, mutatorChance: 0.4,
  },
};

export const MUTATORS = {
  fog: { label: 'FOG', sub: 'THEY CLOSE IN UNSEEN' },
  frenzy: { label: 'FRENZY', sub: 'FASTER ENEMIES · DOUBLE SCRAP' },
  blackout: { label: 'BLACKOUT', sub: 'WATCH FOR THE GLOWING EYES' },
  lowgrav: { label: 'LOW GRAVITY', sub: 'JUMP HIGHER · FALL SLOWER' },
  goldrush: { label: 'GOLD RUSH', sub: 'ELITES EVERYWHERE · TRIPLE ELITE SCRAP' },
};

export const ELITE_AFFIX_IDS = ['shielded', 'volatile', 'swift', 'regen', 'splitting'];
