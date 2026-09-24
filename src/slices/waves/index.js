import { ACTS, DIFFICULTIES, MUTATORS, ELITE_AFFIX_IDS } from './defs.js';
import { WAVES_PER_ACT, FINAL_WAVE } from '../../core/constants.js';

// Waves slice — the run director. Owns the run's flow (acts, waves,
// intermissions, offers, armory, act transitions), enemy pacing, scaling,
// elites, mutators, score/combo/kills, the scrap wallet and run statistics.
//
// Listens: run:begin, enemy:killed, enemy:hit, player:died, offer:picked,
//          armory:done, scrap:add, scrap:spend, arena:ready, shot:result
// Emits:   run:start, run:end, act:transition, act:start, arena:load,
//          wave:intermission, wave:start, wave:cleared, offer:open, armory:open,
//          enemy:spawn, mutator, music, hud:banner, hud:callout, hud:popup,
//          hud:feed, sfx, resume, enemies:clear

const CALLOUTS = { 2: 'DOUBLE KILL', 3: 'TRIPLE KILL', 4: 'QUAD KILL', 5: 'PENTA KILL', 6: 'HEXA KILL', 7: 'RAMPAGE' };

export function createWaves(state, bus) {
  const R = state.run;
  let queue = [];
  let spawnT = 0;
  let spawnedAll = true;
  let isBossWave = false;
  let killTimes = [];
  let intensity = 0;
  let pendingAfterOffer = null;
  let transitionT = 0;
  let transitionStep = 0;
  let clearT = 0;

  const diff = () => R.difficulty;
  // acts past 3 (endless) lap the arenas
  const actDef = (act) => ACTS[(act - 1) % ACTS.length];

  function freshStats() {
    return {
      shotsFired: 0, shotsHit: 0, damageDealt: 0, kills: 0, headshotKills: 0,
      killsBy: {}, scrapEarned: 0, bestChain: 0, maxCombo: 1, grenadesThrown: 0,
      bossTimes: [], startTime: performance.now(), wavesCleared: 0, synergies: 0,
    };
  }

  function begin(difficultyId) {
    const d = DIFFICULTIES[difficultyId] || DIFFICULTIES.normal;
    R.difficulty = d;
    R.act = 1;
    R.wave = 0;
    R.waveState = 'idle';
    R.score = 0;
    R.scrap = 0;
    R.kills = 0;
    R.combo = 1;
    R.comboTimer = 0;
    R.comboChain = 0;
    R.mutator = null;
    R.stats = freshStats();
    R.won = false;
    R.endless = false;
    killTimes = [];
    bus.emit('run:start', { difficulty: d.id });
    bus.emit('arena:load', { id: ACTS[0].arena });
    startAct(1, true);
  }

  function startAct(act, first = false) {
    R.act = act;
    const A = actDef(act);
    state.mode = 'playing';
    bus.emit('act:start', { act, name: A.name, tagline: A.tagline, first });
    bus.emit('hud:banner', { title: act > 3 ? `ENDLESS ${act} — ${A.name}` : `ACT ${act} — ${A.name}`, sub: act > 3 ? 'The machines never stop. Neither do you.' : A.tagline, color: act > 3 ? '#c084fc' : '#ffd36b', big: true });
    startWave(R.wave + 1, 6);
  }

  function waveDef(n) {
    const act = Math.ceil(n / WAVES_PER_ACT);
    const def = actDef(act).waves[(n - 1) % WAVES_PER_ACT];
    if (n <= FINAL_WAVE || def.boss) return def;
    // endless: every lap past wave 30 brings ~12% more robots per lap
    const extra = Math.floor(def.length * 0.12 * Math.ceil((n - FINAL_WAVE) / WAVES_PER_ACT));
    return [...def, ...def.slice(0, extra)];
  }

  function trim(list) {
    const mult = diff().countMult;
    if (mult === 1) return [...list];
    const out = [];
    let kept = 0;
    list.forEach((t, i) => {
      if (kept < Math.round((i + 1) * mult)) { out.push(t); kept++; }
    });
    // overdrive adds extras cycled from the list
    for (let i = 0; out.length < Math.round(list.length * mult); i++) out.push(list[i % list.length]);
    return out;
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function startWave(n, countdown = 4) {
    R.wave = n;
    R.waveState = 'intermission';
    R.countdown = countdown;
    const def = waveDef(n);
    isBossWave = !!def.boss;
    setMutator(null);
    const local = ((n - 1) % WAVES_PER_ACT) + 1;
    if (!isBossWave && n >= 4 && local !== 1 && Math.random() < diff().mutatorChance) {
      const keys = Object.keys(MUTATORS);
      setMutator(keys[Math.floor(Math.random() * keys.length)]);
    }
    bus.emit('wave:intermission', { wave: n, boss: isBossWave, mutator: R.mutator });
    bus.emit('hud:banner', {
      title: `WAVE ${n}`,
      sub: isBossWave ? '⚠ BOSS INCOMING ⚠' : R.mutator ? `${MUTATORS[R.mutator].label} — ${MUTATORS[R.mutator].sub}` : `ACT ${R.act} · ${local}/10`,
      color: isBossWave ? '#ff5555' : R.mutator ? '#c084fc' : '#e8ecf2',
    });
    bus.emit('music', { mood: 'calm', act: R.act });
    bus.emit('sfx', { id: isBossWave ? 'boss_warning' : 'wave_start' });
  }

  function setMutator(m) {
    R.mutator = m;
    bus.emit('mutator', { id: m });
  }

  function launchWave() {
    R.waveState = 'active';
    const def = waveDef(R.wave);
    queue = [];
    if (def.boss) {
      queue.push({ type: def.boss, boss: true });
      for (const t of shuffle(trim(def.escort))) queue.push({ type: t });
    } else {
      for (const t of shuffle(trim(def))) queue.push({ type: t });
    }
    spawnedAll = false;
    spawnT = 0.2;
    bus.emit('wave:start', { wave: R.wave, boss: isBossWave, count: queue.length });
    bus.emit('music', { mood: isBossWave ? 'boss' : 'combat', act: R.act });
  }

  function spawnNext() {
    const item = queue.shift();
    const d = diff();
    const w = R.wave;
    const s = state.stats || {};
    const scale = (k) => 1 + (w - 1) * k * d.waveScale;
    const opts = {
      type: item.type,
      hpMult: scale(0.04) * d.enemyHp * (s.enemyHpMult || 1),
      baseHpMult: d.enemyHp * (s.enemyHpMult || 1),
      dmgMult: scale(0.03),
      accuracy: (1 + w * 0.04 * d.waveScale) * d.accuracy,
      speedMult: d.enemySpeed,
    };
    if (item.boss) {
      opts.hpMult = d.enemyHp * (s.enemyHpMult || 1);
      opts.dmgMult = 1;
      opts.minionHp = scale(0.04) * d.enemyHp * (s.enemyHpMult || 1);
      opts.minionDmg = scale(0.03);
    } else {
      const eliteFrom = d.eliteFrom;
      let chance = w >= eliteFrom ? Math.min(0.22, (0.05 + (w - eliteFrom) * 0.01) * d.eliteChance) : 0;
      if (R.mutator === 'goldrush') chance = Math.max(chance * 3, 0.25);
      if (Math.random() < chance) opts.elite = ELITE_AFFIX_IDS[Math.floor(Math.random() * ELITE_AFFIX_IDS.length)];
    }
    bus.emit('enemy:spawn', opts);
    if (queue.length === 0) spawnedAll = true;
  }

  function waveCleared() {
    R.waveState = 'cleared';
    const bonus = R.wave * 250;
    R.score += bonus;
    R.stats.wavesCleared++;
    bus.emit('wave:cleared', { wave: R.wave, boss: isBossWave, bonus });
    bus.emit('sfx', { id: 'wave_clear' });
    setMutator(null);
    if (R.wave === FINAL_WAVE && !R.endless) {
      endRun(true);
      return;
    }
    bus.emit('hud:popup', { text: `WAVE CLEARED +${bonus}` });
    // let the clear breathe for a beat (game time, so pausing can't lose it)
    clearT = 1.4;
  }

  function openOffer() {
    state.mode = 'offer';
    document.exitPointerLock?.();
    bus.emit('music', { mood: 'shop', act: R.act });
    bus.emit('offer:open', { wave: R.wave, boss: isBossWave, act: R.act });
    pendingAfterOffer = R.wave % WAVES_PER_ACT === 0 ? 'armory' : 'next';
  }

  function endRun(won) {
    if (state.mode === 'over') return;
    R.won = won;
    state.mode = 'over';
    R.waveState = 'idle';
    R.stats.duration = (performance.now() - R.stats.startTime) / 1000;
    R.stats.shotsFired = state.weapons.shots || 0;
    R.stats.shotsHit = state.weapons.hits || 0;
    R.stats.grenadesThrown = state.weapons.thrown || 0;
    R.stats.synergies = state.build?.synergies?.size || 0;
    bus.emit('music', { mood: won ? 'victory' : 'defeat', act: R.act });
    bus.emit('run:end', { won, score: R.score, wave: R.wave, difficulty: diff().id, endless: R.endless });
    document.exitPointerLock?.();
  }

  // ---------- events ----------
  bus.on('run:begin', ({ difficulty }) => begin(difficulty));
  bus.on('player:died', () => endRun(false));
  // victory → keep going
  bus.on('run:endless', () => {
    R.endless = true;
    R.won = false;
    state.mode = 'offer';
    pendingAfterOffer = 'armory';
    isBossWave = true;
    bus.emit('music', { mood: 'shop', act: R.act });
    bus.emit('offer:open', { wave: R.wave, boss: true, act: R.act });
  });
  bus.on('offer:picked', () => {
    if (pendingAfterOffer === 'armory') {
      pendingAfterOffer = 'transition';
      bus.emit('armory:open');
      return;
    }
    resumeNext();
  });
  bus.on('armory:done', () => {
    // act transition
    state.mode = 'transition';
    transitionT = 0;
    transitionStep = 0;
    const next = R.act + 1;
    bus.emit('act:transition', { act: next, name: actDef(next).name, tagline: next > 3 ? `ENDLESS · LAP ${Math.ceil(next / 3)}` : actDef(next).tagline });
    bus.emit('music', { mood: 'transition', act: next });
    bus.emit('enemies:clear');
  });
  function resumeNext() {
    pendingAfterOffer = null;
    state.mode = 'playing';
    bus.emit('resume');
    startWave(R.wave + 1);
  }

  bus.on('scrap:add', ({ amount }) => {
    const v = Math.round(amount);
    R.scrap += v;
    R.stats.scrapEarned += v;
  });
  bus.on('scrap:spend', ({ amount }) => { R.scrap = Math.max(0, R.scrap - amount); });
  bus.on('enemy:hit', ({ amount }) => { R.stats.damageDealt += amount; });

  bus.on('enemy:killed', (k) => {
    if (state.mode !== 'playing' && state.mode !== 'offer') return;
    R.kills++;
    R.stats.kills++;
    const src = ['rifle', 'marksman', 'scattergun', 'arcsmg', 'rail', 'launcher', 'grenade', 'drone', 'mech'].includes(k.source) ? k.source : 'other';
    R.stats.killsBy[src] = (R.stats.killsBy[src] || 0) + 1;
    if (k.source === 'bosswipe' || k.source === 'self') return;
    let pts = k.points || 100;
    const tags = [];
    if (k.elite) { pts *= 2; tags.push('ELITE'); }
    if (k.part === 'head' || k.part === 'weak') { pts *= 1.5; tags.push('HEADSHOT'); R.stats.headshotKills++; }
    if (state.player.airborne) { pts *= 2; tags.push('AIRBORNE'); }
    const s = state.stats || {};
    R.comboChain = R.comboTimer > 0 ? R.comboChain + 1 : 1;
    R.combo = R.comboTimer > 0 ? Math.min(s.comboMax || 5, R.combo + 1) : 1;
    R.comboTimer = 4;
    R.stats.maxCombo = Math.max(R.stats.maxCombo, R.combo);
    R.stats.bestChain = Math.max(R.stats.bestChain, R.comboChain);
    const total = Math.round((pts * R.combo) / 10) * 10;
    R.score += total;
    bus.emit('hud:killfeed', { name: k.enemy.cfg.name, points: total, tags, combo: R.combo, boss: k.boss, elite: k.elite });
    bus.emit('sfx', { id: 'kill', vol: 0.7 });
    const now = performance.now();
    killTimes.push(now);
    while (killTimes.length && now - killTimes[0] > 1800) killTimes.shift();
    if (killTimes.length >= 2) {
      const n = killTimes.length;
      bus.emit('hud:callout', { text: CALLOUTS[n] || 'GODLIKE', level: Math.min(n, 8) });
      bus.emit('sfx', { id: 'callout', level: Math.min(n, 8) });
    }
    if (k.boss) {
      bus.emit('hud:banner', { title: `${k.enemy.cfg.name} DESTROYED`, sub: `+${total}`, color: '#ffd36b' });
      R.stats.bossTimes.push({ name: k.enemy.cfg.name, wave: R.wave });
    }
  });

  return {
    ACTS, DIFFICULTIES,
    begin,
    debug: {
      skipTo(n) {
        // jump straight into wave n (dev tool)
        bus.emit('enemies:clear');
        const act = Math.ceil(n / WAVES_PER_ACT);
        if (act !== R.act) {
          R.act = act;
          bus.emit('arena:load', { id: actDef(act).arena });
        }
        state.mode = 'playing';
        startWave(n, 1);
      },
      winWave() {
        queue = [];
        spawnedAll = true;
        for (const e of state.enemies.list) if (e.alive) e.hp = 0, e.alive = false, e.rig.root.visible = false;
      },
    },
    update(dt) {
      // combo decay runs whenever the game is live
      if (state.mode === 'playing') {
        R.comboTimer = Math.max(0, R.comboTimer - dt);
        if (R.comboTimer === 0) { R.combo = 1; }
      }
      // act transition choreography
      if (state.mode === 'transition') {
        transitionT += dt;
        if (transitionStep === 0 && transitionT > 1.4) {
          transitionStep = 1;
          bus.emit('arena:load', { id: actDef(R.act + 1).arena });
          const s = state.stats || {};
          if (s.secondWindPerAct) bus.emit('secondwind:recharge');
        }
        if (transitionStep === 1 && transitionT > 3.2) {
          transitionStep = 2;
          bus.emit('resume');
          startAct(R.act + 1);
        }
        return;
      }
      if (state.mode !== 'playing') return;

      if (R.waveState === 'intermission') {
        const before = Math.ceil(R.countdown);
        R.countdown -= dt;
        const after = Math.ceil(R.countdown);
        if (after !== before && after <= 3 && after > 0) bus.emit('sfx', { id: 'countdown' });
        if (R.countdown <= 0) launchWave();
      } else if (R.waveState === 'active') {
        spawnT -= dt;
        const cap = diff().cap;
        while (queue.length && spawnT <= 0 && state.enemies.alive < cap) {
          spawnNext();
          spawnT = queue.length > 12 ? 0.35 : 0.55;
        }
        if (spawnT < 0) spawnT = 0;
        if (spawnedAll && queue.length === 0 && state.enemies.alive === 0) waveCleared();
      } else if (R.waveState === 'cleared' && clearT > 0) {
        clearT -= dt;
        if (clearT <= 0 && state.player.alive) openOffer();
      }

      // combat intensity for the music
      const target = R.waveState === 'active'
        ? Math.min(1, state.enemies.alive / 12 + (state.player.sinceHit < 3 ? 0.3 : 0) + (isBossWave ? 0.4 : 0))
        : 0;
      intensity += (target - intensity) * Math.min(1, dt * 0.8);
      R.intensity = intensity;
    },
  };
}
