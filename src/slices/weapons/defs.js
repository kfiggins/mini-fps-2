// Weapon roster. Rifle + marksman keep their v1 feel (the game was built
// around them); the Armory weapons are offered between acts.
// Damage numbers are per pellet. interval = seconds between shots.
//   zoom: FOV multiplier while aiming; scope: full-screen scope overlay.
//   recoil: [pitch kick, yaw jitter]; spread: hip-fire cone (radians).

// Balance model (sustained body-shot DPS, reload included, no upgrades):
//   rifle 136 · marksman 120 (+pierce, 3x heads) · scattergun ~200 inside
//   10m · arc smg ~150 +35% arcs · rail 173 pierce-all · launcher ~100 splash.
// The rifle is the all-rounder; every other gun wins its niche outright.
// Proc effects (explosive, ricochet, arcs) scale off the hit's damage, so a
// fast gun gets no free proc advantage. Holstered guns reload themselves.
export const WEAPONS = {
  rifle: {
    id: 'rifle', icon: '🔫', name: 'RIFLE', model: 'rifle', sound: 'rifle',
    desc: 'Reliable at every range. Right-click for a red-dot sight.',
    body: 34, head: 75, pellets: 1, interval: 0.14, reload: 1.1, mag: 10,
    spread: 0.006, moveSpread: 0.012, zoom: 0.72, recoil: [0.012, 0.004],
    auto: true, tracer: 0xffd98a, casing: 'rifle',
  },
  marksman: {
    id: 'marksman', icon: '🎯', name: 'MARKSMAN', model: 'marksman', sound: 'marksman',
    desc: 'Huge single shots that punch through the first target. +25% vs elites & bosses.',
    body: 120, head: 360, pellets: 1, interval: 0.7, reload: 1.5, mag: 5,
    spread: 0.012, moveSpread: 0.03, zoom: 0.26, scope: true, recoil: [0.05, 0.01],
    auto: false, tracer: 0xfff0c0, casing: 'big', bolt: true, pierce: 1, bigGame: 1.25,
  },
  scattergun: {
    id: 'scattergun', icon: '💥', name: 'SCATTERGUN', model: 'scattergun', sound: 'scattergun', armory: true,
    desc: '10 pellets, devastating inside 10m. Staggers what it hits.',
    body: 18, head: 36, pellets: 10, interval: 0.62, reload: 1.6, mag: 6,
    spread: 0.055, moveSpread: 0.01, adsSpread: 0.04, zoom: 0.85, recoil: [0.055, 0.015],
    auto: false, tracer: 0xffc070, casing: 'shell', pump: true, falloff: [10, 26, 0.45], stagger: true,
  },
  arcsmg: {
    id: 'arcsmg', icon: '⚡', name: 'ARC SMG', model: 'arcsmg', sound: 'arcsmg', armory: true,
    desc: 'Electric bullet hose. Every hit arcs 35% damage to a nearby enemy.',
    body: 16, head: 34, pellets: 1, interval: 0.066, reload: 1.35, mag: 32,
    spread: 0.012, moveSpread: 0.01, adsSpread: 0.006, zoom: 0.8, recoil: [0.006, 0.006],
    auto: true, tracer: 0x66e0ff, casing: 'small', arc: { frac: 0.35, range: 6 },
  },
  rail: {
    id: 'rail', icon: '🔱', name: 'RAIL LANCER', model: 'rail', sound: 'rail_fire', armory: true,
    desc: 'Charge to fire a beam that pierces everything in its path.',
    body: 260, head: 520, pellets: 1, interval: 0.25, reload: 1.8, mag: 3,
    spread: 0, moveSpread: 0.004, zoom: 0.5, recoil: [0.07, 0.01], charge: 0.65,
    auto: false, tracer: 0x9f7bff, casing: null, pierce: 99,
  },
  launcher: {
    id: 'launcher', icon: '🧨', name: 'LAUNCHER', model: 'launcher', sound: 'launcher', armory: true,
    desc: 'Arcing explosive shells: 130 splash in 4.5m, +50% on a direct hit.',
    body: 0, head: 0, pellets: 1, interval: 0.8, reload: 2.0, mag: 4,
    spread: 0, moveSpread: 0, zoom: 0.8, recoil: [0.06, 0.01],
    auto: false, tracer: null, casing: null, projectile: { speed: 34, dmg: 130, radius: 4.5, gravity: 14 },
  },
};

export const STARTING_SLOTS = ['rifle', 'marksman'];
export const ARMORY_POOL = ['scattergun', 'arcsmg', 'rail', 'launcher'];

export const GRENADE = {
  max: 5, minSpeed: 13, maxSpeed: 30, chargeTime: 1.1,
  damage: 120, radius: 6, fuse: 1.8, clusterDamage: 60, clusterRadius: 4,
};
