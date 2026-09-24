import * as THREE from 'three';
import { injectHudStyles } from './styles.js';

// HUD slice: every in-game overlay. Reads published state each frame (only
// touching the DOM when a value changes) and reacts to hud:* events.
//
// Listens: hud:banner, hud:popup, hud:feed, hud:callout, hud:killfeed,
//          hud:warn, hud:scrapgain, shot:result, player:hurt, fx:dmgnum,
//          enemy:killed, synergy, run:start

const $ = (id) => document.getElementById(id);

export function createHud(state, bus) {
  injectHudStyles();
  const root = document.getElementById('hud');
  root.innerHTML = `
    <div id="h-vitals">
      <div id="h-status"></div>
      <div id="h-armor"><div class="seg"></div><div class="seg"></div><div class="seg"></div><div class="seg"></div></div>
      <div id="h-hp-row"><span id="h-hp-num">100</span><div id="h-hp-bar"><div id="h-hp-fill"></div><div id="h-hp-ghost"></div></div></div>
      <div id="h-fuel"><div id="h-fuel-fill"></div></div>
    </div>
    <div id="h-abilities">
      <div class="h-ab" id="h-ab-Q"><div class="h-ab-cd"></div><div class="h-ab-icon"></div><div class="h-ab-key">Q</div><div class="h-ab-t"></div></div>
      <div class="h-ab" id="h-ab-E"><div class="h-ab-cd"></div><div class="h-ab-icon"></div><div class="h-ab-key">E</div><div class="h-ab-t"></div></div>
      <div class="h-ab h-nade" id="h-nade"><div class="h-ab-icon">💣</div><div class="h-ab-key">G</div><div class="h-ab-t" id="h-nade-n"></div><div id="h-nade-charge"></div></div>
    </div>
    <div id="h-weapon">
      <div id="h-ammo"><span id="h-ammo-cur">10</span><span id="h-ammo-max">/10</span></div>
      <div id="h-wname">RIFLE</div>
      <div id="h-reload"><div id="h-reload-fill"></div></div>
      <div id="h-slots"></div>
    </div>
    <div id="h-top">
      <div id="h-wave">WAVE 1</div>
      <div id="h-wave-sub"></div>
      <div id="h-boss" class="hidden"><div id="h-boss-name"></div><div id="h-boss-bar"><div id="h-boss-fill"></div><div id="h-boss-mark"></div></div></div>
    </div>
    <div id="h-score"><div id="h-score-num">0</div><div id="h-combo"><span id="h-combo-x">×1</span><div id="h-combo-bar"><div id="h-combo-fill"></div></div></div><div id="h-scrap">⬡ <span id="h-scrap-n">0</span><span id="h-scrap-gain"></span></div></div>
    <div id="h-feed"></div>
    <div id="h-bounty" class="hidden"><div class="hb-title">BOUNTY</div><div id="h-bounty-text"></div><div id="h-bounty-prog"></div></div>
    <div id="h-cross"><i class="c-t"></i><i class="c-b"></i><i class="c-l"></i><i class="c-r"></i><i class="c-dot"></i></div>
    <div id="h-hit"><i></i><i></i><i></i><i></i></div>
    <div id="h-dirs"></div>
    <div id="h-banner"></div>
    <div id="h-callout"></div>
    <div id="h-popup"></div>
    <div id="h-warn"></div>
    <div id="h-dmgnums"></div>
    <div id="h-scope"><div class="scope-ring"></div><div class="scope-h"></div><div class="scope-v"></div><div class="scope-dot"></div></div>
    <div id="h-cockpit"><div class="ck-frame"></div><div id="h-mech-hp"><span>MECH INTEGRITY</span><div id="h-mech-bar"><div id="h-mech-fill"></div></div></div></div>
    <div id="h-rail"><div id="h-rail-fill"></div></div>
    <div id="h-hints" class="hidden">
      <span><kbd>WASD</kbd> move</span><span><kbd>SHIFT</kbd> sprint</span><span><kbd>SPACE</kbd> jump</span>
      <span><kbd>RMB</kbd> aim</span><span><kbd>R</kbd> reload</span><span><kbd>1</kbd><kbd>2</kbd> swap</span><span><kbd>G</kbd> grenade</span>
    </div>
  `;

  const E = {};
  for (const id of ['h-hp-num', 'h-hp-fill', 'h-hp-ghost', 'h-armor', 'h-fuel', 'h-fuel-fill', 'h-ammo-cur', 'h-ammo-max', 'h-wname',
    'h-reload', 'h-reload-fill', 'h-slots', 'h-wave', 'h-wave-sub', 'h-boss', 'h-boss-name', 'h-boss-fill', 'h-score-num', 'h-combo-x',
    'h-combo-fill', 'h-combo', 'h-scrap-n', 'h-scrap-gain', 'h-feed', 'h-bounty', 'h-bounty-text', 'h-bounty-prog', 'h-cross', 'h-hit',
    'h-dirs', 'h-banner', 'h-callout', 'h-popup', 'h-warn', 'h-dmgnums', 'h-scope', 'h-cockpit', 'h-mech-fill', 'h-nade-n', 'h-nade-charge',
    'h-status', 'h-rail', 'h-rail-fill', 'h-vitals', 'h-abilities', 'h-weapon', 'h-top', 'h-score']) {
    E[id] = $(id);
  }
  const cache = new Map();
  const set = (key, el, prop, v) => {
    if (cache.get(key) === v) return;
    cache.set(key, v);
    if (prop === 'text') el.textContent = v;
    else if (prop === 'html') el.innerHTML = v;
    else if (prop.startsWith('--')) el.style.setProperty(prop, v);
    else el.style[prop] = v;
  };
  const toggle = (el, cls, on) => { if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on); };

  // ---------- transient elements ----------
  function restart(el, cls = 'show') {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }
  bus.on('hud:banner', ({ title, sub = '', color = '#e8ecf2', big = false }) => {
    E['h-banner'].innerHTML = `<div class="bn-title" style="color:${color}">${title}</div>${sub ? `<div class="bn-sub">${sub}</div>` : ''}`;
    E['h-banner'].classList.toggle('big', big);
    restart(E['h-banner']);
  });
  bus.on('hud:popup', ({ text }) => {
    E['h-popup'].textContent = text;
    restart(E['h-popup']);
  });
  bus.on('hud:callout', ({ text, level }) => {
    E['h-callout'].textContent = text;
    E['h-callout'].dataset.level = level;
    restart(E['h-callout']);
  });
  bus.on('hud:warn', ({ text }) => {
    E['h-warn'].textContent = text;
    restart(E['h-warn']);
  });
  function feedLine(html, color) {
    const d = document.createElement('div');
    d.className = 'feed-line';
    d.innerHTML = html;
    if (color) d.style.color = color;
    E['h-feed'].prepend(d);
    while (E['h-feed'].children.length > 7) E['h-feed'].lastChild.remove();
    setTimeout(() => d.classList.add('out'), 3800);
    setTimeout(() => d.remove(), 4400);
  }
  bus.on('hud:feed', ({ text, color }) => feedLine(text, color));
  bus.on('hud:killfeed', ({ name, points, tags, combo, boss, elite }) => {
    const t = tags.length ? ` <span class="kf-tags">${tags.join(' · ')}</span>` : '';
    feedLine(`<span class="kf-name${boss ? ' boss' : elite ? ' elite' : ''}">${name}</span> <span class="kf-pts">+${points}</span>${combo > 1 ? ` <span class="kf-x">×${combo}</span>` : ''}${t}`);
  });
  let gainT = 0, gainAcc = 0;
  bus.on('hud:scrapgain', ({ amount }) => {
    gainAcc = gainT > 0 ? gainAcc + amount : amount;
    gainT = 1.4;
    E['h-scrap-gain'].textContent = ` +${gainAcc}`;
    restart(E['h-scrap-gain'], 'pop');
  });
  bus.on('synergy', ({ name }) => feedLine(`⚡ SYNERGY <b>${name}</b>`, '#ffd36b'));

  // hitmarkers
  let hitT = 0;
  bus.on('shot:result', ({ head, kill }) => {
    hitT = kill ? 0.3 : 0.14;
    E['h-hit'].className = kill ? 'kill' : head ? 'head' : 'hit';
    restart(E['h-hit'], 'on');
  });
  bus.on('enemy:killed', ({ source }) => {
    if (['grenade', 'launcher', 'drone', 'missile', 'laser', 'chain', 'mech', 'explosive', 'ricochet', 'thorns', 'decoy'].includes(source)) {
      hitT = 0.3;
      E['h-hit'].className = 'kill';
      restart(E['h-hit'], 'on');
    }
  });

  // damage direction arcs
  const dirs = [];
  bus.on('player:hurt', ({ from, amount, absorbed }) => {
    if (!from) return;
    const el = document.createElement('div');
    el.className = 'dmg-dir';
    E['h-dirs'].appendChild(el);
    dirs.push({ el, from: { x: from.x, z: from.z }, t: 1.2, strength: Math.min(1, ((amount || 0) + (absorbed || 0)) / 30 + 0.4) });
    if (dirs.length > 8) dirs.shift().el.remove();
  });

  // damage numbers
  const nums = [];
  const _v = new THREE.Vector3();
  bus.on('fx:dmgnum', ({ pos, amount, crit, id }) => {
    if (!state.settings.damageNumbers || amount < 1) return;
    // merge rapid hits on the same robot into one growing number
    for (let i = nums.length - 1; i >= 0; i--) {
      const n = nums[i];
      if (n.id === id && n.t > 0.45) {
        n.amount += Math.round(amount);
        n.el.textContent = n.amount;
        n.crit = n.crit || crit;
        n.el.classList.toggle('crit', n.crit);
        n.t = 0.8;
        n.x = pos.x; n.y = pos.y; n.z = pos.z;
        return;
      }
    }
    const el = document.createElement('div');
    el.className = `dnum${crit ? ' crit' : ''}`;
    el.textContent = Math.round(amount);
    E['h-dmgnums'].appendChild(el);
    nums.push({ el, id, x: pos.x, y: pos.y, z: pos.z, t: 0.8, amount: Math.round(amount), crit, dx: (Math.random() - 0.5) * 30 });
    if (nums.length > 40) nums.shift().el.remove();
  });

  // first run ever: a strip of control hints for the first waves
  let hintT = 0;
  bus.on('run:start', () => {
    let seen = false;
    try { seen = localStorage.getItem('mfps2-hints') === '1'; localStorage.setItem('mfps2-hints', '1'); } catch { /* blocked */ }
    hintT = seen ? 0 : 40;
    E['h-feed'].innerHTML = '';
    for (const d of dirs) d.el.remove();
    dirs.length = 0;
    cache.clear();
  });

  // ---------- per frame ----------
  return {
    update(dt) {
      const visible = state.mode === 'playing' || state.mode === 'offer' || state.mode === 'transition';
      toggle(root, 'hidden', !visible);
      if (!visible) return;
      const p = state.player;
      const R = state.run;
      const W = state.weapons;
      const mech = state.mech || {};
      const S = state.stats || {};
      toggle(root, 'in-offer', state.mode !== 'playing');

      // vitals
      const hpFrac = Math.max(0, p.health / p.maxHealth);
      set('hpn', E['h-hp-num'], 'text', String(Math.ceil(p.health)));
      set('hpw', E['h-hp-fill'], 'width', `${Math.min(100, hpFrac * 100)}%`);
      toggle(E['h-hp-fill'], 'low', hpFrac < 0.35);
      toggle(E['h-hp-fill'], 'over', hpFrac > 1.001);
      const ghost = parseFloat(cache.get('ghost') ?? hpFrac * 100);
      const g2 = Math.max(hpFrac * 100, ghost - dt * 40);
      cache.set('ghost', g2);
      E['h-hp-ghost'].style.width = `${Math.min(100, g2)}%`;
      const bars = Math.ceil((p.armor || 0) / 25 - 0.001);
      set('armor', E['h-armor'], '--bars', String(bars));
      E['h-armor'].querySelectorAll('.seg').forEach((s, i) => toggle(s, 'on', i < bars));
      toggle(E['h-armor'], 'hidden', bars === 0);
      const jp = p.jetpack;
      toggle(E['h-fuel'], 'hidden', !jp?.owned || p.inMech);
      if (jp?.owned) set('fuel', E['h-fuel-fill'], 'width', `${(jp.fuel / jp.maxFuel) * 100}%`);
      const st = [];
      if (S.berserkActive) st.push('<span class="st berserk">BERSERK</span>');
      if (S.surgeActive) st.push('<span class="st surge">SURGE</span>');
      if (S.adrenActive) st.push('<span class="st adren">ADRENALINE</span>');
      if (state.abilities?.overclock) st.push('<span class="st oc">OVERCLOCK</span>');
      if (R.mutator) st.push(`<span class="st mut">${R.mutator.toUpperCase()}</span>`);
      set('status', E['h-status'], 'html', st.join(''));

      // abilities
      const A = state.abilities || { slots: {}, cds: {} };
      const defs = state.abilityDefs || {};
      for (const k of ['Q', 'E']) {
        const el = $(`h-ab-${k}`);
        let icon = '', cd = 0, max = 1, empty = false;
        if (p.inMech) {
          icon = k === 'Q' ? '🚀' : '💥';
          cd = mech.cds?.[k] || 0;
          max = mech.maxCds?.[k] || 1;
        } else if (A.slots[k]) {
          icon = defs[A.slots[k]]?.icon || '✦';
          cd = A.cds[k] || 0;
          max = A.maxCds?.[k] || defs[A.slots[k]]?.cd || 1;
        } else empty = true;
        set(`abi${k}`, el.querySelector('.h-ab-icon'), 'text', icon);
        toggle(el, 'empty', empty);
        toggle(el, 'cooling', cd > 0);
        set(`abcd${k}`, el.querySelector('.h-ab-cd'), '--p', `${(cd / max) * 100}%`);
        set(`abt${k}`, el.querySelector('.h-ab-t'), 'text', cd > 0 ? String(Math.ceil(cd)) : '');
      }
      set('nade', E['h-nade-n'], 'text', `×${W.grenades}`);
      toggle($('h-nade'), 'empty', W.grenades <= 0);
      const charging = W.grenadeCharge >= 0;
      toggle(E['h-nade-charge'], 'on', charging);
      if (charging) E['h-nade-charge'].style.width = `${Math.min(1, W.grenadeCharge / 1.1) * 100}%`;

      // weapon
      const def = state.weaponDefs?.[W.current];
      if (p.inMech) {
        set('ammo', E['h-ammo-cur'], 'text', '∞');
        set('ammomax', E['h-ammo-max'], 'text', '');
        set('wname', E['h-wname'], 'text', 'MECH CANNONS');
      } else if (def) {
        set('ammo', E['h-ammo-cur'], 'text', W.reloading ? '—' : String(W.ammo[W.current]));
        set('ammomax', E['h-ammo-max'], 'text', `/${W.mag}`);
        set('wname', E['h-wname'], 'text', def.name);
        toggle(E['h-ammo-cur'], 'low', !W.reloading && W.ammo[W.current] <= Math.ceil(W.mag * 0.25));
      }
      toggle(E['h-reload'], 'hidden', !W.reloading);
      if (W.reloading) E['h-reload-fill'].style.width = `${(W.reloadP || 0) * 100}%`;
      const slotsHtml = (W.slots || []).map((id, i) => {
        const d = state.weaponDefs?.[id];
        const full = W.ammo[id] >= Math.round((d?.mag || 1) * (S.magMult || 1)) + (S.magFlat || 0);
        return `<span class="slot${id === W.current ? ' cur' : ''}"><b>${i + 1}</b>${d?.name || id}${id !== W.current && !full ? ' <i class="rl">⟳</i>' : ''}</span>`;
      }).join('');
      set('slots', E['h-slots'], 'html', slotsHtml);
      const charge = W.charge || 0;
      toggle(E['h-rail'], 'hidden', !(W.current === 'rail' && charge > 0));
      if (charge > 0) E['h-rail-fill'].style.width = `${charge * 100}%`;

      // wave / boss
      set('wave', E['h-wave'], 'text', `WAVE ${R.wave}`);
      let sub = '';
      if (R.waveState === 'intermission') sub = `INCOMING ${Math.max(0, Math.ceil(R.countdown))}`;
      else if (R.waveState === 'active') sub = `${state.enemies.alive + Math.max(0, 0)} HOSTILES`;
      else if (state.mode === 'offer') sub = 'CHOOSE';
      set('wsub', E['h-wave-sub'], 'text', `ACT ${R.act} · ${sub}${R.difficulty?.id === 'easy' ? ' · EASY' : R.difficulty?.id === 'overdrive' ? ' · OVERDRIVE' : ''}`);
      const boss = state.enemies.boss;
      toggle(E['h-boss'], 'hidden', !boss);
      if (boss) {
        set('bossname', E['h-boss-name'], 'text', `${boss.cfg.name}${boss.phase === 2 ? ' — PHASE 2' : ''}`);
        set('bossw', E['h-boss-fill'], 'width', `${Math.max(0, boss.hp / boss.maxHp) * 100}%`);
        toggle(E['h-boss'], 'p2', boss.phase === 2);
      }

      // score / combo / scrap
      set('score', E['h-score-num'], 'text', R.score.toLocaleString());
      set('combo', E['h-combo-x'], 'text', `×${R.combo}`);
      E['h-combo-fill'].style.width = `${(R.comboTimer / 4) * 100}%`;
      set('combolv', E['h-combo'], '--lv', String(Math.min(R.combo, 6)));
      toggle(E['h-combo'], 'hot', R.combo > 1);
      set('scrap', E['h-scrap-n'], 'text', String(R.scrap));
      gainT = Math.max(0, gainT - dt);
      if (gainT === 0 && E['h-scrap-gain'].textContent) E['h-scrap-gain'].textContent = '';

      // bounty
      const b = R.bounty;
      toggle(E['h-bounty'], 'hidden', !b || b.pending);
      if (b && !b.pending) {
        set('btext', E['h-bounty-text'], 'text', b.text);
        let prog = '';
        if (b.def.damage) prog = `${Math.round(b.progress)} / ${b.goal} dmg`;
        else if (b.def.timed) prog = `${b.progress}s left`;
        else prog = `${Math.min(b.progress, b.goal)} / ${b.goal}`;
        set('bprog', E['h-bounty-prog'], 'text', b.done ? `✔ +${b.reward} SCRAP` : b.failed ? '✖ FAILED' : prog);
        toggle(E['h-bounty'], 'done', b.done);
        toggle(E['h-bounty'], 'failed', b.failed);
      }

      // crosshair
      const scoped = W.scoped && !p.inMech;
      const gap = 6 + (W.spread || 0) * 900 * (1 / (state.fovScale || 1));
      set('gap', E['h-cross'], '--gap', `${Math.min(60, gap).toFixed(1)}px`);
      toggle(E['h-cross'], 'hidden', scoped || state.mode !== 'playing');
      toggle(E['h-cross'], 'ads', (W.ads || 0) > 0.6 && !p.inMech);
      toggle(E['h-scope'], 'on', scoped);
      toggle(E['h-cockpit'], 'on', !!p.inMech);
      if (p.inMech) set('mechhp', E['h-mech-fill'], 'width', `${Math.max(0, mech.hp / mech.maxHp) * 100}%`);
      if (hintT > 0 && state.mode === 'playing') hintT -= dt;
      toggle($('h-hints'), 'hidden', !(hintT > 0));
      hitT = Math.max(0, hitT - dt);
      if (hitT === 0) E['h-hit'].classList.remove('on');

      // damage direction arcs
      for (let i = dirs.length - 1; i >= 0; i--) {
        const d = dirs[i];
        d.t -= dt;
        if (d.t <= 0) { d.el.remove(); dirs.splice(i, 1); continue; }
        const ang = Math.atan2(d.from.x - p.pos.x, d.from.z - p.pos.z);
        const rel = ang - (p.yaw + Math.PI);
        d.el.style.transform = `translate(-50%,-50%) rotate(${-rel}rad)`;
        d.el.style.opacity = String(Math.min(1, d.t * 1.5) * d.strength);
      }

      // damage numbers (project world → screen)
      const cam = state.camera;
      const w = window.innerWidth, h = window.innerHeight;
      for (let i = nums.length - 1; i >= 0; i--) {
        const n = nums[i];
        n.t -= dt;
        if (n.t <= 0) { n.el.remove(); nums.splice(i, 1); continue; }
        _v.set(n.x, n.y + (0.8 - n.t) * 1.2, n.z).project(cam);
        if (_v.z > 1) { n.el.style.opacity = '0'; continue; }
        const x = (_v.x * 0.5 + 0.5) * w + n.dx * (0.8 - n.t);
        const y = (-_v.y * 0.5 + 0.5) * h;
        n.el.style.transform = `translate(${x}px, ${y}px) translate(-50%,-50%) scale(${n.t > 0.65 ? 1.35 : 1})`;
        n.el.style.opacity = String(Math.min(1, n.t * 3));
      }
    },
  };
}
