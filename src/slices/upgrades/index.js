import { TIERS, TIER_ORDER, tierWeights, createStats, UPGRADES, CURSED, SYNERGIES } from './defs.js';
import { injectStyles } from './styles.js';

// Upgrades slice: the run's stat block, card offers (tiered rolls, boss
// legendaries, cursed cards, weapon cards, ability cards), synergies, the
// Armory weapon offer, and every on-kill / on-hurt effect the cards grant.
//
// Listens: run:start, offer:open, offer:reroll, armory:open, enemy:killed,
//          player:hurt, key
// Emits:   offer:picked, armory:done, ability:assign, weapon:give, heal,
//          damage:enemy, fx:arc, build:changed, synergy, hud:banner, hud:feed, sfx
// Publishes state.stats, state.build, state.codex

const CODEX_KEY = 'mfps2-codex';

export function createUpgrades(state, bus) {
  injectStyles();
  const els = {
    screen: document.getElementById('intermission'),
    title: document.getElementById('offer-title'),
    sub: document.getElementById('offer-sub'),
    cards: document.getElementById('offer-cards'),
  };
  const owned = new Map();
  const synergies = new Set();
  let offer = [];
  let offerBoss = false;
  let openedAt = 0;
  let mode = null; // 'offer' | 'armory' | 'slot'
  let adrenT = 0, surgeT = 0;

  let discovered;
  try { discovered = new Set(JSON.parse(localStorage.getItem(CODEX_KEY) || '[]')); } catch { discovered = new Set(); }
  const discover = (id) => {
    if (discovered.has(id)) return;
    discovered.add(id);
    try { localStorage.setItem(CODEX_KEY, JSON.stringify([...discovered])); } catch { /* private mode */ }
  };

  function abilityCards() {
    const defs = state.abilityDefs || {};
    return Object.values(defs).map((a) => ({
      id: `ab-${a.id}`, tier: a.tier, icon: a.icon, name: a.name, desc: a.desc, unique: true, ability: a.id, apply: () => {},
    }));
  }
  const pool = () => [...UPGRADES, ...abilityCards()];

  state.codex = {
    tiers: TIERS,
    cards: () => [...pool(), ...CURSED],
    synergies: SYNERGIES,
    discovered,
    tierWeights,
  };

  function ownedIdSet() {
    const set = new Set(owned.keys());
    for (const w of state.weapons.slots || []) set.add(`w-${w}`);
    const ab = state.abilities?.slots || {};
    for (const k of ['Q', 'E']) if (ab[k]) set.add(`ab-${ab[k]}`);
    return set;
  }

  function checkSynergies() {
    const have = ownedIdSet();
    for (const syn of SYNERGIES) {
      if (synergies.has(syn.id)) continue;
      if (syn.needs.every((n) => have.has(n))) {
        synergies.add(syn.id);
        syn.apply(state.stats);
        discover(`syn-${syn.id}`);
        bus.emit('synergy', { id: syn.id, name: syn.name, desc: syn.desc });
        bus.emit('hud:banner', { title: `SYNERGY: ${syn.name}`, sub: syn.desc, color: '#ffd36b' });
        bus.emit('sfx', { id: 'synergy' });
      }
    }
  }

  function publishBuild() {
    state.build = { owned, synergies };
    bus.emit('build:changed', { owned, synergies });
  }

  function resetRun() {
    state.stats = createStats();
    owned.clear();
    synergies.clear();
    adrenT = surgeT = 0;
    publishBuild();
  }

  // ---------- rolling ----------
  function available(tier, picked) {
    const have = owned;
    const slots = state.weapons.slots || [];
    return pool().filter((u) => {
      if (u.tier !== tier || picked.has(u.id)) return false;
      if (u.unique && have.has(u.id)) return false;
      if (u.weapon && !slots.includes(u.weapon)) return false;
      if (u.ability && state.abilities?.slots && Object.values(state.abilities.slots).includes(u.ability)) return false;
      return true;
    });
  }

  function roll(wave, count, guaranteeLegendary) {
    const weights = tierWeights(wave + (state.stats.luck || 0));
    const picks = [];
    const picked = new Set();
    const pick = (list) => {
      const u = list[Math.floor(Math.random() * list.length)];
      picks.push(u);
      picked.add(u.id);
    };
    if (guaranteeLegendary) {
      const l = available('legendary', picked);
      if (l.length) pick(l);
      else {
        const r = available('rare', picked);
        if (r.length) pick(r);
      }
    }
    // weight synergy-completing cards up a little so builds come together
    const have = ownedIdSet();
    while (picks.length < count) {
      const total = TIER_ORDER.reduce((s, t) => s + weights[t], 0);
      let r = Math.random() * total;
      let tier = 'common';
      for (const t of TIER_ORDER) { r -= weights[t]; if (r <= 0) { tier = t; break; } }
      let list = available(tier, picked);
      if (!list.length) {
        const i = TIER_ORDER.indexOf(tier);
        for (const t of [...TIER_ORDER.slice(0, i).reverse(), ...TIER_ORDER.slice(i + 1)]) {
          list = available(t, picked);
          if (list.length) break;
        }
      }
      if (!list.length) break;
      const boosted = [];
      for (const u of list) {
        boosted.push(u);
        if (SYNERGIES.some((s) => s.needs.includes(u.id) && s.needs.some((n) => n !== u.id && have.has(n)) && !synergies.has(s.id))) boosted.push(u, u);
      }
      pick(boosted);
    }
    // cursed: from wave 6, sometimes swap the last common/uncommon for a curse
    if (wave >= 6 && Math.random() < 0.22) {
      const curses = CURSED.filter((c) => !owned.has(c.id) && !picked.has(c.id));
      if (curses.length) {
        let idx = picks.length - 1;
        while (idx > 0 && picks[idx].tier === 'legendary') idx--;
        picks[idx] = curses[Math.floor(Math.random() * curses.length)];
      }
    }
    return picks;
  }

  // ---------- UI ----------
  function synergyHint(u) {
    const have = ownedIdSet();
    const lines = [];
    for (const s of SYNERGIES) {
      if (!s.needs.includes(u.id) || synergies.has(s.id)) continue;
      const other = s.needs.find((n) => n !== u.id);
      if (have.has(other)) lines.push(`<div class="syn-hint complete">⚡ COMPLETES ${s.name}</div>`);
      else if (discovered.has(`syn-${s.id}`)) lines.push(`<div class="syn-hint">↔ ${s.name} with ${nameOf(other)}</div>`);
    }
    return lines.slice(0, 2).join('');
  }
  function nameOf(id) {
    if (id.startsWith('w-')) return state.weaponDefs?.[id.slice(2)]?.name || id;
    const c = [...pool(), ...CURSED].find((x) => x.id === id);
    return c ? c.name : id;
  }

  function cardHtml(u, i) {
    const t = TIERS[u.tier];
    const count = owned.get(u.id) || 0;
    const tag = u.ability ? 'ABILITY' : u.weapon ? 'WEAPON' : u.unique ? 'UNIQUE' : 'STACKS';
    return `
      <div class="card-shine"></div>
      <div class="card-tier" style="color:${t.color}">${t.label}<span class="card-tag">${tag}</span></div>
      <div class="card-icon">${u.icon || '✦'}</div>
      <div class="card-name">${u.name}</div>
      <div class="card-desc">${u.desc}</div>
      ${synergyHint(u)}
      <div class="card-foot">${count ? `OWNED ×${count}` : '&nbsp;'}</div>
      <div class="card-key">${i + 1}</div>`;
  }

  function renderOffer() {
    mode = 'offer';
    els.cards.innerHTML = '';
    offer.forEach((u, i) => {
      const b = document.createElement('button');
      b.className = `card tier-${u.tier}`;
      b.style.setProperty('--tier', TIERS[u.tier].color);
      b.style.animationDelay = `${i * 0.08}s`;
      b.innerHTML = cardHtml(u, i);
      b.onmouseenter = () => bus.emit('sfx', { id: 'ui_hover', vol: 0.4 });
      b.onclick = () => choose(i);
      els.cards.appendChild(b);
    });
    const hasLeg = offer.some((u) => u.tier === 'legendary');
    const hasCurse = offer.some((u) => u.tier === 'cursed');
    bus.emit('sfx', { id: hasLeg ? 'card_legendary' : hasCurse ? 'card_cursed' : 'card_flip' });
  }

  function choose(i) {
    if (performance.now() - openedAt < 450) return;
    if (mode === 'offer') {
      const u = offer[i];
      if (!u) return;
      if (u.ability) return renderSlotChoice(u);
      take(u);
    } else if (mode === 'slot' && pendingAbility) {
      if (i === 0 || i === 1) {
        const slot = i === 0 ? 'Q' : 'E';
        const u = pendingAbility;
        pendingAbility = null;
        bus.emit('ability:assign', { slot, id: u.ability });
        take(u, `${u.name} → ${slot}`);
      } else renderOffer();
    } else if (mode === 'armory') {
      armoryChoose(i);
    }
  }

  let pendingAbility = null;
  function renderSlotChoice(u) {
    mode = 'slot';
    pendingAbility = u;
    const slots = state.abilities?.slots || {};
    const defs = state.abilityDefs || {};
    els.cards.innerHTML = '';
    ['Q', 'E', 'BACK'].forEach((k, i) => {
      const b = document.createElement('button');
      b.className = 'card slot-card';
      b.style.setProperty('--tier', TIERS[u.tier].color);
      const cur = slots[k] ? `replaces ${defs[slots[k]]?.name}` : k === 'BACK' ? 'choose another card' : 'empty slot';
      b.innerHTML = `<div class="card-icon big">${k === 'BACK' ? '←' : k}</div><div class="card-name">${k === 'BACK' ? 'Back' : `Bind ${u.name}`}</div><div class="card-desc">${cur}</div><div class="card-key">${i + 1}</div>`;
      b.onclick = () => choose(i);
      els.cards.appendChild(b);
    });
  }

  function take(u, feed) {
    u.apply(state.stats);
    owned.set(u.id, (owned.get(u.id) || 0) + 1);
    discover(u.id);
    bus.emit('sfx', { id: u.tier === 'cursed' ? 'card_cursed' : 'card_pick' });
    bus.emit('hud:feed', { text: feed || `${TIERS[u.tier].label}: ${u.name}`, color: TIERS[u.tier].color });
    checkSynergies();
    publishBuild();
    mode = null;
    bus.emit('offer:picked', { id: u.id });
  }

  // ---------- armory ----------
  let armoryOffer = [];
  let armoryPick = null;
  function renderArmory() {
    mode = 'armory';
    const defs = state.weaponDefs || {};
    els.cards.innerHTML = '';
    if (!armoryPick) {
      armoryOffer.forEach((id, i) => {
        const w = defs[id];
        const b = document.createElement('button');
        b.className = 'card tier-armory';
        b.style.setProperty('--tier', '#ffd36b');
        b.innerHTML = `<div class="card-shine"></div><div class="card-tier" style="color:#ffd36b">ARMORY<span class="card-tag">WEAPON</span></div>
          <div class="card-icon">${w.icon || '🔫'}</div><div class="card-name">${w.name}</div><div class="card-desc">${w.desc}</div>
          <div class="card-stats">${weaponStats(w)}</div><div class="card-key">${i + 1}</div>`;
        b.onclick = () => choose(i);
        els.cards.appendChild(b);
      });
      const skip = document.createElement('button');
      skip.className = 'card slot-card';
      skip.innerHTML = `<div class="card-icon big">✋</div><div class="card-name">Keep my guns</div><div class="card-desc">+60 scrap instead</div><div class="card-key">${armoryOffer.length + 1}</div>`;
      skip.onclick = () => choose(armoryOffer.length);
      els.cards.appendChild(skip);
    } else {
      const slots = state.weapons.slots;
      [...slots, 'BACK'].forEach((id, i) => {
        const b = document.createElement('button');
        b.className = 'card slot-card';
        b.innerHTML = id === 'BACK'
          ? `<div class="card-icon big">←</div><div class="card-name">Back</div><div class="card-key">${i + 1}</div>`
          : `<div class="card-icon big">${i + 1}</div><div class="card-name">Replace ${defs[id].name}</div><div class="card-desc">with ${defs[armoryPick].name}</div><div class="card-key">${i + 1}</div>`;
        b.onclick = () => choose(i);
        els.cards.appendChild(b);
      });
    }
  }
  // sustained body-shot DPS: a full magazine plus the reload
  function weaponStats(w) {
    const per = (w.body || w.projectile?.dmg || 0) * w.pellets;
    const cycle = w.interval + (w.charge || 0);
    const dps = Math.round((per * w.mag) / (w.mag * cycle + w.reload));
    return `DMG ${w.body ? `${w.body}${w.pellets > 1 ? `×${w.pellets}` : ''}` : `${w.projectile.dmg} splash`} · MAG ${w.mag} · ${dps} SUSTAINED DPS`;
  }
  function armoryChoose(i) {
    if (!armoryPick) {
      if (i === armoryOffer.length) {
        bus.emit('scrap:add', { amount: 60, reason: 'armory' });
        return finishArmory();
      }
      if (!armoryOffer[i]) return;
      armoryPick = armoryOffer[i];
      bus.emit('sfx', { id: 'ui_click' });
      renderArmory();
    } else {
      const slots = state.weapons.slots;
      if (i >= slots.length) { armoryPick = null; return renderArmory(); }
      bus.emit('weapon:give', { id: armoryPick, slot: i });
      discover(`w-${armoryPick}`);
      bus.emit('sfx', { id: 'card_legendary' });
      armoryPick = null;
      checkSynergies();
      publishBuild();
      finishArmory();
    }
  }
  function finishArmory() {
    mode = null;
    bus.emit('armory:done');
  }

  // ---------- events ----------
  bus.on('run:start', resetRun);
  bus.on('offer:open', ({ wave, boss, act }) => {
    offerBoss = !!boss;
    openedAt = performance.now();
    els.title.textContent = boss ? 'BOSS DOWN — CLAIM YOUR REWARD' : 'CHOOSE AN UPGRADE';
    els.sub.textContent = boss ? 'A legendary is guaranteed' : `Wave ${wave} cleared · Act ${act}`;
    offer = roll(wave, state.stats.offerSize, offerBoss);
    renderOffer();
  });
  bus.on('offer:reroll', () => {
    offer = roll(state.run.wave, state.stats.offerSize, offerBoss);
    renderOffer();
  });
  bus.on('armory:open', () => {
    openedAt = performance.now();
    const defs = state.weaponDefs || {};
    const slots = state.weapons.slots;
    armoryOffer = Object.keys(defs).filter((id) => defs[id].armory && !slots.includes(id));
    armoryOffer.sort(() => Math.random() - 0.5);
    armoryOffer = armoryOffer.slice(0, 3);
    armoryPick = null;
    els.title.textContent = 'THE ARMORY';
    els.sub.textContent = 'Take a new weapon into the next act — or keep your kit';
    renderArmory();
    bus.emit('sfx', { id: 'card_legendary' });
  });
  bus.on('key', ({ code }) => {
    if (state.mode !== 'offer' || !mode) return;
    const m = /^Digit([1-5])$/.exec(code);
    if (m) choose(Number(m[1]) - 1);
  });
  // number keys also work without pointer lock on the offer screen
  document.addEventListener('keydown', (e) => {
    if (state.mode !== 'offer' || !mode || state.input?.locked) return;
    const m = /^Digit([1-5])$/.exec(e.code);
    if (m) choose(Number(m[1]) - 1);
  });

  // on-kill effects
  bus.on('enemy:killed', (k) => {
    const s = state.stats;
    if (!s) return;
    if (s.killHeal) {
      const mult = s.berserkActive ? s.berserkHealMult : 1;
      bus.emit('heal', { amount: s.killHeal * mult, overfill: true });
    }
    if (s.adrenaline) adrenT = 3;
    if (s.killSurge && s.adrenalSurge) surgeT = 3;
    if (s.chainLightning && (k.depth || 0) === 0 && k.source !== 'bosswipe') {
      const hit = new Set([k.enemy]);
      let from = k.center;
      const dmg = Math.max(40, Math.round(k.enemy.maxHp * 0.25)) * s.chainLightning * (s.damageMult || 1);
      for (let n = 0; n < s.chainTargets; n++) {
        let best = null, bd = 64;
        for (const e of state.enemies.list) {
          if (!e.alive || hit.has(e) || e.untargetable) continue;
          const d = (e.center.x - from.x) ** 2 + (e.center.y - from.y) ** 2 + (e.center.z - from.z) ** 2;
          if (d < bd) { bd = d; best = e; }
        }
        if (!best) break;
        hit.add(best);
        bus.emit('fx:arc', { from, to: best.center, color: 0x66ddff });
        bus.emit('damage:enemy', { enemy: best, amount: Math.round(dmg), part: 'body', source: 'chain', point: best.center, depth: 1 });
        from = best.center;
      }
    }
  });
  bus.on('player:hurt', ({ kind, source, amount, absorbed }) => {
    const s = state.stats;
    if (s?.adrenalSurge) surgeT = 3;
    // Thorns: only when a melee hit actually landed on you
    if (s?.thorns && kind === 'melee' && source?.alive && (amount || 0) + (absorbed || 0) > 0) {
      const base = source.boss ? source.maxHp * 0.02 : Math.max(50, source.maxHp * 0.25);
      bus.emit('damage:enemy', { enemy: source, amount: Math.round(base * s.thorns), part: 'body', source: 'thorns', point: source.center, depth: 1 });
    }
  });

  return {
    update(dt) {
      const s = state.stats;
      if (!s) return;
      adrenT = Math.max(0, adrenT - dt);
      surgeT = Math.max(0, surgeT - dt);
      const p = state.player;
      s.berserkActive = s.berserker && p.health < p.maxHealth * 0.3 && p.alive;
      s.tempSpeed = (adrenT > 0 ? 1 + 0.25 * s.adrenaline : 1) * (s.berserkActive ? 1.25 : 1);
      s.tempFireRate = surgeT > 0 ? 1.3 ** s.adrenalSurge : 1;
      s.tempDamage = (s.berserkActive ? 1.5 : 1) * (p.airborne ? s.airborneDmg : 1);
      s.surgeActive = surgeT > 0;
      s.adrenActive = adrenT > 0;
    },
    owned,
  };
}
