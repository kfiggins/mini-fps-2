// Enemy roster — robots, each with a big pro and a big con.
// Numbers are wave-1 values; the run director passes hp/dmg/accuracy scalers.
//
//  ai: skirmish (hold a range band, strafe, use cover), rush (path straight
//      in, melee), sniper (keep far, laser-telegraphed shots, flee close),
//      wasp (fly, orbit, dive-bomb), support (hover behind allies, heal),
//      bulwark (advance behind a frontal shield, drop it to fire)
//  model: rig spec consumed by models.js
//  weak: bosses expose a glowing core (2x damage, like a headshot) in phase 2

export const TYPES = {
  grunt: {
    name: 'TROOPER', hp: 100, speed: 4.4, radius: 0.45, points: 100, scrap: 10,
    ai: 'skirmish', range: [8, 20], usesCover: true,
    burst: { n: 3, gap: 0.13, dmg: [6, 10], spread: 0.035, interval: [1.6, 2.8] },
    model: { kind: 'biped', size: 1, armor: 0x3d4a66, trim: 0x22262e, glow: 0xff2b2b, head: 'visor', arm: 'rifle', pack: 'box' },
  },
  rusher: {
    name: 'RIPPER', hp: 30, speed: 7.8, radius: 0.4, points: 150, scrap: 12,
    ai: 'rush', melee: { dmg: 14, range: 2.1, cd: 1.0 },
    model: { kind: 'quad', size: 0.8, armor: 0xc25a12, trim: 0x2a2320, glow: 0xffe14d },
  },
  tank: {
    name: 'BRUTE', hp: 240, speed: 2.1, radius: 0.8, points: 300, scrap: 25,
    ai: 'skirmish', range: [10, 24],
    burst: { n: 1, gap: 0, dmg: [16, 22], spread: 0.05, interval: [2.6, 3.4], heavy: true },
    model: { kind: 'biped', size: 1.45, bulk: 1.5, armor: 0x44583c, trim: 0x23281f, glow: 0xff9030, head: 'dome', arm: 'cannon', shoulder: 'plates' },
  },
  sniper: {
    name: 'LONGSHOT', hp: 30, speed: 3.6, radius: 0.4, points: 200, scrap: 15,
    ai: 'sniper', aimed: { dmg: 28, telegraph: 1.3, lock: 0.3, interval: [3.2, 4.4] },
    model: { kind: 'biped', size: 1.08, slim: 0.75, armor: 0x5fb6c4, trim: 0x20282c, glow: 0x2bffe0, head: 'eye', arm: 'longrifle', pack: 'antenna' },
  },
  wasp: {
    name: 'WASP', hp: 30, speed: 9, radius: 0.5, points: 150, scrap: 12,
    ai: 'wasp', fly: true, dive: { dmg: 32, radius: 3.2, speed: 18 },
    model: { kind: 'drone', size: 0.9, armor: 0xd8b400, trim: 0x1c1c1c, glow: 0xff3a1a },
  },
  bulwark: {
    name: 'BULWARK', hp: 170, speed: 3.0, radius: 0.6, points: 250, scrap: 20,
    ai: 'bulwark', range: [6, 16],
    shield: { up: 3.2, down: 1.8, hp: 99999 },
    burst: { n: 5, gap: 0.1, dmg: [6, 9], spread: 0.04, interval: [0.1, 0.1] },
    model: { kind: 'biped', size: 1.2, bulk: 1.3, armor: 0x6a6f78, trim: 0x2a2d33, glow: 0x4fa8ff, head: 'visor', arm: 'rifle', shieldArm: true },
  },
  mender: {
    name: 'MENDER', hp: 60, speed: 5, radius: 0.5, points: 200, scrap: 18,
    ai: 'support', fly: true, heal: { rate: 0.12, range: 14 },
    model: { kind: 'orb', size: 0.9, armor: 0xe6e6e0, trim: 0x2a2d33, glow: 0x3dff8a },
  },
  scorcher: {
    name: 'SCORCHER', hp: 140, speed: 3.6, radius: 0.55, points: 200, scrap: 18,
    ai: 'skirmish', range: [2.5, 6],
    flame: { dps: 22, range: 8 },
    model: { kind: 'biped', size: 1.1, bulk: 1.2, armor: 0x7a4a1e, trim: 0x2a1c12, glow: 0xff7a1a, head: 'dome', arm: 'flamer', pack: 'tanks' },
  },
  slag: {
    name: 'MORTAR', hp: 180, speed: 2.6, radius: 0.6, points: 250, scrap: 20,
    ai: 'skirmish', range: [14, 28],
    lob: { n: 1, dmg: 22, patchDps: 15, patchR: 2.4, patchT: 4, interval: [3.5, 5] },
    model: { kind: 'quad', size: 1.25, heavy: true, armor: 0x5a3a3a, trim: 0x221818, glow: 0xffb347, mortar: true },
  },

  // ---------------- bosses ----------------
  warden: {
    name: 'THE WARDEN', boss: true, hp: 2400, speed: 2.5, radius: 1.5, points: 2000, scrap: 150,
    ai: 'skirmish', range: [7, 16],
    burst: { n: 6, gap: 0.09, dmg: [6, 9], spread: 0.05, interval: [2.6, 3.4] },
    shock: { dmg: 30, radius: 7, trigger: 5.5, cd: 4.5 },
    summon: { types: ['rusher', 'rusher'], cd: 12, max: 4 },
    orbs: { n: 3, spread: 0.3, speed: 9, dmg: 22, interval: [5, 7] },
    phase2: { orbs: { n: 5, spread: 0.45, speed: 10, dmg: 22, interval: [4, 5.5] } },
    model: { kind: 'biped', size: 2.3, bulk: 1.5, armor: 0x8a1f2d, trim: 0x2a1418, glow: 0xffd24d, head: 'crown', arm: 'cannon', shoulder: 'plates', pack: 'reactor' },
  },
  titan: {
    name: 'THE TITAN', boss: true, hp: 5600, speed: 2.6, radius: 2.2, points: 5000, scrap: 150,
    ai: 'skirmish', range: [9, 20],
    burst: { n: 8, gap: 0.09, dmg: [7, 10], spread: 0.05, interval: [2.6, 3.4] },
    shock: { dmg: 40, radius: 8.5, trigger: 6.5, cd: 4.2 },
    missiles: { n: 2, dmg: 28, radius: 3, interval: [8, 11] },
    orbs: { n: 5, spread: 0.5, speed: 10, dmg: 24, interval: [5, 7] },
    summon: { types: ['grunt', 'rusher', 'sniper'], cd: 15, max: 5 },
    phase2: { missiles: { n: 4, dmg: 28, radius: 3, interval: [6, 8] }, aimed: { dmg: 40, telegraph: 1.1, lock: 0.3, interval: [7, 9] } },
    model: { kind: 'quad', size: 2.8, heavy: true, armor: 0x2a1136, trim: 0x14091a, glow: 0xff3df0, pods: true },
  },
  butcher: {
    name: 'THE BUTCHER', boss: true, hp: 9600, speed: 4.3, radius: 1.6, points: 7000, scrap: 150,
    ai: 'rush', range: [2, 8],
    melee: { dmg: 24, range: 3.6, cd: 1.15, cleave: true },
    shock: { dmg: 35, radius: 8, trigger: 6, cd: 3.8 },
    artillery: { n: 3, dmg: 38, radius: 4.5, telegraph: 1.6, interval: [8, 11] },
    summon: { types: ['rusher', 'rusher', 'rusher'], cd: 11, max: 6 },
    phase2: { enrage: { speed: 1.35, rate: 1.4 }, artillery: { n: 5, dmg: 38, radius: 4.5, telegraph: 1.4, interval: [6, 8] } },
    model: { kind: 'biped', size: 2.4, bulk: 1.7, hunch: true, armor: 0x7a1500, trim: 0x251210, glow: 0xff4444, head: 'horns', arm: 'blade', offArm: 'blade' },
  },
  vulcan: {
    name: 'VULCAN', boss: true, hp: 15000, speed: 3.0, radius: 1.7, points: 12000, scrap: 150,
    ai: 'skirmish', range: [10, 22],
    burst: { n: 26, gap: 0.055, dmg: [5, 7], spread: 0.065, interval: [4, 6], spinup: true },
    lob: { n: 3, dmg: 24, patchDps: 16, patchR: 2.6, patchT: 4, interval: [6, 8] },
    summon: { types: ['scorcher', 'wasp'], cd: 13, max: 4 },
    magnet: { interval: [9, 12], telegraph: 0.9, pull: 0.8, force: 16 },
    phase2: { enrage: { speed: 1.3, rate: 1.35 }, shock: { dmg: 40, radius: 9, trigger: 6.5, cd: 4 } },
    model: { kind: 'biped', size: 2.6, bulk: 1.6, armor: 0x2e3138, trim: 0x17181b, glow: 0xff3333, head: 'visor', arm: 'minigun', offArm: 'minigun', pack: 'reactor' },
  },
  phantom: {
    name: 'THE PHANTOM', boss: true, hp: 21000, speed: 3.6, radius: 1.3, points: 30000, scrap: 150,
    ai: 'skirmish', range: [10, 22], fly: true, hover: 3,
    burst: { n: 5, gap: 0.09, dmg: [8, 11], spread: 0.045, interval: [2.4, 3.2] },
    aimed: { dmg: 42, telegraph: 0.85, lock: 0.25, interval: [5, 7] },
    orbs: { n: 7, spread: 0.55, speed: 11, dmg: 26, interval: [4, 6] },
    teleport: { interval: [5, 8], range: [9, 17] },
    summon: { types: ['sniper', 'mender', 'rusher'], cd: 13, max: 5 },
    phase2: { enrage: { speed: 1.3, rate: 1.4 }, clones: 2 },
    model: { kind: 'wraith', size: 2.1, armor: 0x2d3a4a, trim: 0x10161e, glow: 0x9fefff },
  },
  apex: {
    name: 'THE APEX', boss: true, hp: 34000, speed: 2.5, radius: 2.3, points: 60000, scrap: 150,
    ai: 'skirmish', range: [9, 20],
    burst: { n: 12, gap: 0.07, dmg: [9, 12], spread: 0.05, interval: [2.4, 3] },
    shock: { dmg: 48, radius: 10, trigger: 8, cd: 3.4 },
    aimed: { dmg: 50, telegraph: 0.9, lock: 0.3, interval: [6, 8] },
    orbs: { n: 8, spread: 0.55, speed: 11, dmg: 28, interval: [4.5, 6] },
    missiles: { n: 3, dmg: 32, radius: 3.5, interval: [7, 10] },
    artillery: { n: 5, dmg: 45, radius: 5, telegraph: 1.6, interval: [8, 11] },
    summon: { types: ['tank', 'sniper', 'rusher', 'mender'], cd: 12, max: 7 },
    phase2: { enrage: { speed: 1.3, rate: 1.45 }, laser: { dmg: 60, interval: [9, 12] } },
    model: { kind: 'biped', size: 3.6, bulk: 1.6, armor: 0x121519, trim: 0x08090b, glow: 0xff2222, head: 'crown', arm: 'cannon', offArm: 'minigun', shoulder: 'pods', pack: 'reactor' },
  },
};

export const ELITE_AFFIXES = {
  shielded: { label: 'SHIELDED', color: 0x4fc3ff },
  volatile: { label: 'VOLATILE', color: 0xff6a1a },
  swift: { label: 'SWIFT', color: 0xfff26a },
  regen: { label: 'REGEN', color: 0x3dff8a },
  splitting: { label: 'SPLITTING', color: 0xd070ff },
};
