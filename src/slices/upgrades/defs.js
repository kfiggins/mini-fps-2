// The roguelike layer as pure data. Every card mutates the run's stats
// block; every slice reads stats (never card ids) to apply effects.
// To add a card: add one entry. To add a synergy: list its two ingredients.

export const TIERS = {
  common: { label: 'COMMON', color: '#b8c0cc' },
  uncommon: { label: 'UNCOMMON', color: '#4ade80' },
  rare: { label: 'RARE', color: '#38bdf8' },
  legendary: { label: 'LEGENDARY', color: '#f59e0b' },
  cursed: { label: 'CURSED', color: '#c084fc' },
};
export const TIER_ORDER = ['common', 'uncommon', 'rare', 'legendary'];

export function tierWeights(wave) {
  const w = Math.min(wave, 25);
  return {
    common: Math.max(20, 62 - 2.2 * w),
    uncommon: 26 + 0.8 * w,
    rare: 9.5 + 0.9 * w,
    legendary: 2.5 + 0.5 * w,
  };
}

export function createStats() {
  return {
    damageMult: 1, fireRateMult: 1, reloadMult: 1, magMult: 1, magFlat: 0,
    maxHealthBonus: 0, speedMult: 1, jumpMult: 1, regenRate: 8, regenDelay: 5,
    headshotMult: 1, longshotMult: 1, executionerMult: 1, bossSlayer: 1, highGround: 1,
    damageReduction: 0, killHeal: 0, killAmmo: 0, adrenaline: 0, adrenalSurge: 0,
    comboMax: 5, shockImmune: false, pierce: 0, explosive: 0, ricochet: 0,
    chainLightning: 0, chainTargets: 1, doubleJump: 0, secondWind: false, berserker: false,
    scrapDropMult: 1, scrapValueMult: 1, thorns: 0, doubleTap: false, doubleTapEvery: 4,
    bossSlayerMult: 1, offerSize: 3, overshield: false, grenadeDmgMult: 1, grenadeDropMult: 1,
    grenadeMaxBonus: 0, clusterBombs: false, clusterCount: 3, blastRadius: 1, enemySlow: 1,
    instantReload: false, luck: 0, weaponMult: {}, weaponRate: {}, weaponPierce: {},
    arcChains: 1, railCharge: 1, airborneDmg: 1, longHeadMult: 1, executeHeadshot: false,
    killSurge: false, berserkHealMult: 1, secondWindPerAct: false, novaMult: 1, frozenDmg: 1,
    noAds: false, regenDisabled: false, damageTakenMult: 1, enemyHpMult: 1, abilityCdMult: 1,
    // per-frame temporaries written by the upgrades slice
    tempDamage: 1, tempFireRate: 1, tempSpeed: 1, berserkActive: false,
  };
}

const W = (s, id, k, v) => { s[k][id] = (s[k][id] || 1) * v; };

export const UPGRADES = [
  // ---------- common ----------
  { id: 'sharp', tier: 'common', icon: '🔪', name: 'Sharpened Rounds', desc: '+10% damage', apply: (s) => { s.damageMult *= 1.1; } },
  { id: 'trigger', tier: 'common', icon: '⚡', name: 'Rapid Trigger', desc: '+10% fire rate', apply: (s) => { s.fireRateMult *= 1.1; } },
  { id: 'hands', tier: 'common', icon: '✋', name: 'Quick Hands', desc: '+18% reload speed', apply: (s) => { s.reloadMult *= 1.18; } },
  { id: 'mag', tier: 'common', icon: '📦', name: 'Extended Mag', desc: '+20% magazine size', apply: (s) => { s.magMult += 0.2; } },
  { id: 'vest', tier: 'common', icon: '🦺', name: 'Plated Vest', desc: '+15 max health', apply: (s) => { s.maxHealthBonus += 15; } },
  { id: 'feet', tier: 'common', icon: '👟', name: 'Fleet Foot', desc: '+8% move speed', apply: (s) => { s.speedMult *= 1.08; } },
  { id: 'dressing', tier: 'common', icon: '🩹', name: 'Field Dressing', desc: '+25% health regen', apply: (s) => { s.regenRate *= 1.25; } },
  { id: 'greed', tier: 'common', icon: '🪙', name: 'Greed', desc: '+25% scrap drop chance', apply: (s) => { s.scrapDropMult *= 1.25; } },
  { id: 'springs', tier: 'common', icon: '🦘', name: 'Spring Soles', desc: '+20% jump height', apply: (s) => { s.jumpMult *= 1.2; } },

  // ---------- uncommon ----------
  { id: 'hollow', tier: 'uncommon', icon: '💥', name: 'Hollow Points', desc: '+20% damage', apply: (s) => { s.damageMult *= 1.2; } },
  { id: 'bigmag', tier: 'uncommon', icon: '🧰', name: 'Drum Magazine', desc: '+45% magazine size', apply: (s) => { s.magMult += 0.45; } },
  { id: 'jugger', tier: 'uncommon', icon: '🛡️', name: 'Juggernaut Plating', desc: '+30 max health', apply: (s) => { s.maxHealthBonus += 30; } },
  { id: 'adrenaline', tier: 'uncommon', icon: '💉', name: 'Adrenaline', desc: 'Kills grant +25% speed for 3s (stacks)', apply: (s) => { s.adrenaline += 1; } },
  { id: 'scavenger', tier: 'uncommon', icon: '♻️', name: 'Scavenger', desc: 'Kills refund 15% of your magazine', apply: (s) => { s.killAmmo += 0.15; } },
  { id: 'longshot', tier: 'uncommon', icon: '🎯', name: 'Longshot', desc: '+25% damage beyond 25m', apply: (s) => { s.longshotMult *= 1.25; } },
  { id: 'lightweight', tier: 'uncommon', icon: '🪶', name: 'Lightweight Frame', desc: '+15% move speed', apply: (s) => { s.speedMult *= 1.15; } },
  { id: 'fieldmedic', tier: 'uncommon', icon: '⛑️', name: 'Combat Medic', desc: 'Regen starts 2s sooner', apply: (s) => { s.regenDelay = Math.max(1, s.regenDelay - 2); } },
  { id: 'highground', tier: 'uncommon', icon: '⛰️', name: 'High Ground', desc: '+25% damage to enemies 1.5m+ below you', apply: (s) => { s.highGround *= 1.25; } },
  { id: 'boots', tier: 'uncommon', icon: '🚀', name: 'Rocket Boots', desc: 'Double jump (stacks: +1 air jump)', apply: (s) => { s.doubleJump += 1; } },
  // weapon-specific (only offered while you carry the weapon)
  { id: 'rifle-match', tier: 'uncommon', icon: '🔫', weapon: 'rifle', name: 'Match Barrel', desc: 'Rifle: +25% damage, +10% fire rate', apply: (s) => { W(s, 'rifle', 'weaponMult', 1.25); W(s, 'rifle', 'weaponRate', 1.1); } },
  { id: 'mark-deadeye', tier: 'uncommon', icon: '🔭', weapon: 'marksman', name: 'Deadeye Rounds', desc: 'Marksman: +30% damage, pierces +1 more', apply: (s) => { W(s, 'marksman', 'weaponMult', 1.3); s.weaponPierce.marksman = (s.weaponPierce.marksman || 0) + 1; } },
  { id: 'scatter-choke', tier: 'uncommon', icon: '💢', weapon: 'scattergun', name: 'Tight Choke', desc: 'Scattergun: +30% damage, tighter spread', apply: (s) => { W(s, 'scattergun', 'weaponMult', 1.3); s.scatterChoke = (s.scatterChoke || 1) * 0.75; } },
  { id: 'arc-coils', tier: 'uncommon', icon: '🌩️', weapon: 'arcsmg', name: 'Overcharged Coils', desc: 'Arc SMG: +20% damage, arcs jump to 2 enemies', apply: (s) => { W(s, 'arcsmg', 'weaponMult', 1.2); s.arcChains = Math.max(s.arcChains, 2); } },
  { id: 'rail-caps', tier: 'uncommon', icon: '🔋', weapon: 'rail', name: 'Capacitor Bank', desc: 'Rail Lancer: charges 35% faster, +15% damage', apply: (s) => { s.railCharge *= 1.35; W(s, 'rail', 'weaponMult', 1.15); } },
  { id: 'launch-hex', tier: 'uncommon', icon: '🧨', weapon: 'launcher', name: 'High-Ex Shells', desc: 'Launcher: +25% damage, +25% blast radius', apply: (s) => { W(s, 'launcher', 'weaponMult', 1.25); s.launcherRadius = (s.launcherRadius || 1) * 1.25; } },

  // ---------- rare ----------
  { id: 'cranial', tier: 'rare', icon: '🧠', name: 'Cranial Trauma', desc: 'Headshots deal +50% damage', apply: (s) => { s.headshotMult *= 1.5; } },
  { id: 'vampire', tier: 'rare', icon: '🧛', name: 'Vampire Rounds', desc: '+5 health per kill', apply: (s) => { s.killHeal += 5; } },
  { id: 'hose', tier: 'rare', icon: '🚿', name: 'Bullet Hose', desc: '+35% fire rate, −10% damage', apply: (s) => { s.fireRateMult *= 1.35; s.damageMult *= 0.9; } },
  { id: 'caliber', tier: 'rare', icon: '🔩', name: 'Heavy Caliber', desc: '+50% damage, −15% fire rate', apply: (s) => { s.damageMult *= 1.5; s.fireRateMult *= 0.85; } },
  { id: 'kevlar', tier: 'rare', icon: '🧥', name: 'Kevlar Weave', desc: 'Take 15% less damage', apply: (s) => { s.damageReduction = 1 - (1 - s.damageReduction) * 0.85; } },
  { id: 'executioner', tier: 'rare', icon: '🪓', name: 'Executioner', desc: '+40% damage to enemies under 30% HP', apply: (s) => { s.executionerMult *= 1.4; } },
  { id: 'coldblood', tier: 'rare', icon: '🧊', name: 'Cold Blood', desc: 'Combo multiplier cap +1', apply: (s) => { s.comboMax += 1; } },
  { id: 'blastshield', tier: 'rare', icon: '🪨', name: 'Blast Shield', desc: 'Immune to boss ground slams', unique: true, apply: (s) => { s.shockImmune = true; } },
  { id: 'thorns', tier: 'rare', icon: '🌵', name: 'Thorns', desc: 'Melee attackers take 25% of their max HP (min 50)', apply: (s) => { s.thorns += 1; } },
  { id: 'doubletap', tier: 'rare', icon: '✌️', name: 'Double Tap', desc: 'Every 4th shot is free', unique: true, apply: (s) => { s.doubleTap = true; } },
  { id: 'bossslayer', tier: 'rare', icon: '👑', name: 'Boss Slayer', desc: '+25% damage to bosses', apply: (s) => { s.bossSlayer *= 1.25; } },
  { id: 'quartermaster', tier: 'rare', icon: '🃏', name: 'Quartermaster', desc: 'Upgrade offers show 4 choices', unique: true, apply: (s) => { s.offerSize = Math.max(s.offerSize, 4); } },
  { id: 'adrenalsurge', tier: 'rare', icon: '😤', name: 'Adrenal Surge', desc: 'Taking damage grants +30% fire rate for 3s', apply: (s) => { s.adrenalSurge += 1; } },
  { id: 'overshield', tier: 'rare', icon: '💠', name: 'Overshield', desc: 'Kill heals can overfill health to 130%', unique: true, apply: (s) => { s.overshield = true; } },
  { id: 'grenadier', tier: 'rare', icon: '💣', name: 'Grenadier', desc: 'Grenades +50% damage, drop twice as often, +1 max', apply: (s) => { s.grenadeDmgMult *= 1.5; s.grenadeDropMult *= 2; s.grenadeMaxBonus += 1; } },
  { id: 'pierce', tier: 'rare', icon: '🪡', name: 'Penetrator Rounds', desc: 'Shots pierce 1 extra enemy', apply: (s) => { s.pierce += 1; } },

  // ---------- legendary ----------
  { id: 'explosive', tier: 'legendary', icon: '🎆', name: 'Explosive Rounds', desc: 'Hits burst for 40% of their damage in 2.6m', unique: true, apply: (s) => { s.explosive = 1; } },
  { id: 'secondwind', tier: 'legendary', icon: '🕊️', name: 'Second Wind', desc: 'Cheat death once per run', unique: true, apply: (s) => { s.secondWind = true; } },
  { id: 'berserker', tier: 'legendary', icon: '👹', name: 'Berserker', desc: 'Under 30% HP: +50% damage, +25% speed', unique: true, apply: (s) => { s.berserker = true; } },
  { id: 'goldengun', tier: 'legendary', icon: '🏆', name: 'Golden Gun', desc: '+50% damage — and your guns turn to gold', unique: true, apply: (s) => { s.damageMult *= 1.5; } },
  { id: 'chain', tier: 'legendary', icon: '⛓️', name: 'Chain Lightning', desc: 'Kills arc 25% of the victim\'s max HP to a nearby enemy', unique: true, apply: (s) => { s.chainLightning = 1; } },
  { id: 'timedilation', tier: 'legendary', icon: '⏳', name: 'Time Dilation', desc: 'Enemies move 15% slower (bosses resist)', unique: true, apply: (s) => { s.enemySlow = 0.85; } },
  { id: 'ricochet', tier: 'legendary', icon: '🎱', name: 'Ricochet', desc: 'Hits bounce 50% of their damage to a nearby enemy', unique: true, apply: (s) => { s.ricochet = 1; } },
  { id: 'juggernaut', tier: 'legendary', icon: '🦏', name: 'Juggernaut', desc: '+100 max health, −12% move speed', unique: true, apply: (s) => { s.maxHealthBonus += 100; s.speedMult *= 0.88; } },
  { id: 'clusterbombs', tier: 'legendary', icon: '🍇', name: 'Cluster Bombs', desc: 'Grenades split into bomblets', unique: true, apply: (s) => { s.clusterBombs = true; } },
];

// Cursed: a real upside with a real cost. From wave 6, one card slot may
// roll cursed (glows purple). Never more than one per offer.
export const CURSED = [
  { id: 'c-glass', tier: 'cursed', icon: '🍷', name: 'Glass Cannon', desc: '+60% damage · −35% max health', unique: true, apply: (s) => { s.damageMult *= 1.6; s.maxHealthBonus -= 35; } },
  { id: 'c-bloodpact', tier: 'cursed', icon: '🩸', name: 'Blood Pact', desc: 'Kills heal +10 · health no longer regenerates', unique: true, apply: (s) => { s.killHeal += 10; s.regenDisabled = true; } },
  { id: 'c-heart', tier: 'cursed', icon: '🫀', name: 'Overclocked Heart', desc: '+30% fire rate & speed · take 25% more damage', unique: true, apply: (s) => { s.fireRateMult *= 1.3; s.speedMult *= 1.3; s.damageTakenMult *= 1.25; } },
  { id: 'c-greed', tier: 'cursed', icon: '💰', name: 'Greedy Gambit', desc: 'Double scrap · enemies have +20% health', unique: true, apply: (s) => { s.scrapValueMult *= 2; s.enemyHpMult *= 1.2; } },
  { id: 'c-hipfire', tier: 'cursed', icon: '🔥', name: 'Berserk Chip', desc: '+45% damage · you can no longer aim down sights', unique: true, apply: (s) => { s.damageMult *= 1.45; s.noAds = true; } },
  { id: 'c-deathwish', tier: 'cursed', icon: '💀', name: 'Deathwish', desc: '+1 card per offer, rarer cards · −25% max health', unique: true, apply: (s) => { s.offerSize += 1; s.luck += 6; s.maxHealthBonus -= 25; } },
  { id: 'c-cooldowns', tier: 'cursed', icon: '🌀', name: 'Unstable Core', desc: 'Abilities recharge 45% faster · −20% max health', unique: true, apply: (s) => { s.abilityCdMult *= 0.55; s.maxHealthBonus -= 20; } },
];

// Synergies: own both ingredients (upgrade ids, or `w-<weapon>` / `ab-<ability>`).
export const SYNERGIES = [
  { id: 'bloodlust', name: 'BLOODLUST', needs: ['vampire', 'berserker'], desc: 'While berserk, kill heals are tripled', apply: (s) => { s.berserkHealMult = 3; } },
  { id: 'stormcaller', name: 'STORM CALLER', needs: ['chain', 'ricochet'], desc: 'Chain Lightning hits 3 enemies for double damage', apply: (s) => { s.chainTargets = 3; s.chainLightning = 2; } },
  { id: 'skysniper', name: 'SKY SNIPER', needs: ['highground', 'boots'], desc: '+30% damage while airborne', apply: (s) => { s.airborneDmg = 1.3; } },
  { id: 'demolition', name: 'DEMOLITIONIST', needs: ['explosive', 'grenadier'], desc: 'All explosions 40% larger', apply: (s) => { s.blastRadius *= 1.4; } },
  { id: 'carpet', name: 'CARPET BOMBING', needs: ['clusterbombs', 'grenadier'], desc: '6 bomblets per grenade, +2 max grenades', apply: (s) => { s.clusterCount = 6; s.grenadeMaxBonus += 2; } },
  { id: 'headhunter', name: 'HEADHUNTER', needs: ['cranial', 'longshot'], desc: 'Headshots beyond 25m deal +50% more', apply: (s) => { s.longHeadMult = 1.5; } },
  { id: 'gunslinger', name: 'GUNSLINGER', needs: ['hose', 'doubletap'], desc: 'Every 3rd shot is free', apply: (s) => { s.doubleTapEvery = 3; } },
  { id: 'immovable', name: 'IMMOVABLE', needs: ['juggernaut', 'kevlar'], desc: 'Immune to slams and knockback, 10% less damage', apply: (s) => { s.shockImmune = true; s.noKnockback = true; s.damageReduction = 1 - (1 - s.damageReduction) * 0.9; } },
  { id: 'overload', name: 'ADRENAL OVERLOAD', needs: ['adrenaline', 'adrenalsurge'], desc: 'Kills also trigger Adrenal Surge', apply: (s) => { s.killSurge = true; } },
  { id: 'execution', name: 'EXECUTION', needs: ['executioner', 'cranial'], desc: 'Headshots execute non-bosses under 30% HP', apply: (s) => { s.executeHeadshot = true; } },
  { id: 'phoenix', name: 'PHOENIX', needs: ['secondwind', 'overshield'], desc: 'Second Wind recharges every act', apply: (s) => { s.secondWindPerAct = true; } },
  { id: 'timelord', name: 'TIME LORD', needs: ['timedilation', 'ab-nova'], desc: 'Stasis lasts 50% longer; frozen enemies take +25% damage', apply: (s) => { s.novaMult = 1.5; s.frozenDmg = 1.25; } },
  { id: 'bulletstorm', name: 'BULLET STORM', needs: ['bigmag', 'scavenger'], desc: 'Kills refund 35% of your magazine', apply: (s) => { s.killAmmo = Math.max(s.killAmmo, 0.35); } },
  { id: 'goldenage', name: 'GOLDEN AGE', needs: ['goldengun', 'greed'], desc: 'Scrap pickups are worth 50% more', apply: (s) => { s.scrapValueMult *= 1.5; } },
  { id: 'highvoltage', name: 'HIGH VOLTAGE', needs: ['chain', 'w-arcsmg'], desc: 'Arc SMG arcs jump to 3 enemies', apply: (s) => { s.arcChains = Math.max(s.arcChains, 3); } },
  { id: 'railgod', name: 'RAIL GOD', needs: ['pierce', 'w-rail'], desc: 'Rail Lancer charges 50% faster and deals +25% damage', apply: (s) => { s.railCharge *= 1.5; s.weaponMult.rail = (s.weaponMult.rail || 1) * 1.25; } },
  { id: 'grapplegun', name: 'DEATH FROM ABOVE', needs: ['ab-grapple', 'highground'], desc: 'Grapple cooldown halved; +20% damage while airborne', apply: (s) => { s.grappleCd = 0.5; s.airborneDmg = Math.max(s.airborneDmg, 1.2); } },
];

export const ALL_CARDS = [...UPGRADES, ...CURSED];
