import { injectMenuStyles } from './styles.js';

// Menu slice: title screen (live arena flyover behind it), difficulty,
// settings (persisted), codex, pause, intermission shell, act transitions,
// death / victory screens with run stats, best scores, unlocks.
//
// Listens: input:unlocked, resume, run:end, act:transition, act:start,
//          armory:done, offer:open, armory:open
// Emits:   audio:unlock, run:begin, quality:changed, music, sfx, arena:load

const SETTINGS_KEY = 'mfps2-settings';
const BEST_KEY = 'mfps2-best';
const UNLOCK_KEY = 'mfps2-unlocks';
const PROGRESS_KEY = 'mfps2-progress';

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function save(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage blocked */ }
}

export function createMenu(state, bus, { lock, unlock }) {
  injectMenuStyles();
  Object.assign(state.settings, load(SETTINGS_KEY, {}));
  const unlocks = load(UNLOCK_KEY, { overdrive: false });
  const best = load(BEST_KEY, {});
  const progress = load(PROGRESS_KEY, { maxAct: 1, won: false });
  const opUnlocked = (op) => !op.unlock || (op.unlock.act && progress.maxAct >= op.unlock.act) || (op.unlock.win && progress.won);
  const operatorList = () => Object.values(state.operators || {});
  const el = document.getElementById('menu');
  const inter = document.getElementById('intermission');
  const fade = document.getElementById('fade');
  let screen = 'title';
  let modal = null;
  let orbit = 0;
  let unlockedT = 0;

  const diffs = () => [
    { id: 'easy', label: 'EASY', desc: 'Kids & new recruits. Tougher you, weaker robots.' },
    { id: 'normal', label: 'NORMAL', desc: 'The real game. Build smart or die trying.' },
    { id: 'overdrive', label: 'OVERDRIVE', desc: unlocks.overdrive ? 'Everything hits harder. Elites everywhere.' : '🔒 Beat NORMAL to unlock.', locked: !unlocks.overdrive },
  ];

  function titleHtml() {
    const d = state.settings.difficulty;
    const b = best[d];
    return `
      <div class="t-wrap">
        <div class="t-logo"><span class="t-mini">MINI</span><span class="t-fps">FPS</span><span class="t-two">2</span></div>
        <div class="t-tag">A ROGUELIKE ARENA SHOOTER · 3 ACTS · 30 WAVES</div>
        <button class="t-play" data-act="play">DEPLOY</button>
        <div class="t-diffs">${diffs().map((x) => `
          <button class="t-diff${x.id === d ? ' sel' : ''}${x.locked ? ' locked' : ''}" data-diff="${x.id}">
            <b>${x.label}</b><span>${x.desc}</span></button>`).join('')}</div>
        <div class="t-ops">${operatorList().map((o) => {
          const open = opUnlocked(o);
          const sel = (state.settings.operator || 'vanguard') === o.id;
          return `<button class="t-op${sel ? ' sel' : ''}${open ? '' : ' locked'}" data-op="${o.id}">
            <span class="op-icon">${open ? o.icon : '🔒'}</span><b>${o.name}</b><span>${open ? o.desc : o.unlock.text}</span></button>`;
        }).join('')}</div>
        <div class="t-best">${b ? `BEST · ${b.score.toLocaleString()} pts · wave ${b.wave}${b.won ? ' · 🏆 CLEARED' : ''}` : 'NO RECORD YET ON THIS DIFFICULTY'}</div>
        <div class="t-row">
          <button class="t-btn" data-act="how">HOW TO PLAY</button>
          <button class="t-btn" data-act="codex">CODEX</button>
          <button class="t-btn" data-act="settings">SETTINGS</button>
        </div>
      </div>`;
  }

  function pauseHtml() {
    const R = state.run;
    return `
      <div class="p-wrap">
        <div class="p-title">PAUSED</div>
        <div class="p-sub">ACT ${R.act} · WAVE ${R.wave} · ${R.score.toLocaleString()} PTS · ⬡ ${R.scrap}</div>
        <button class="t-play" data-act="resume">RESUME</button>
        <div class="t-row">
          <button class="t-btn" data-act="settings">SETTINGS</button>
          <button class="t-btn" data-act="how">CONTROLS</button>
          <button class="t-btn" data-act="codex">CODEX</button>
          <button class="t-btn danger" data-act="quit">QUIT RUN</button>
        </div>
        ${buildSummary()}
      </div>`;
  }

  function buildSummary() {
    const owned = state.build?.owned;
    if (!owned || !owned.size) return '';
    const cards = state.codex.cards();
    const tiers = state.codex.tiers;
    const chips = [...owned.entries()].map(([id, n]) => {
      const c = cards.find((x) => x.id === id);
      if (!c) return '';
      return `<span class="chip" style="--c:${tiers[c.tier].color}">${c.icon || ''} ${c.name}${n > 1 ? ` ×${n}` : ''}</span>`;
    }).join('');
    const syn = [...(state.build.synergies || [])].map((id) => {
      const s = state.codex.synergies.find((x) => x.id === id);
      return `<span class="chip syn">⚡ ${s.name}</span>`;
    }).join('');
    return `<div class="build-chips">${chips}${syn}</div>`;
  }

  function overHtml(won) {
    const R = state.run;
    const s = R.stats;
    const acc = s.shotsFired ? Math.round((s.shotsHit / s.shotsFired) * 100) : 0;
    const d = R.difficulty.id;
    const b = best[d] || { score: 0 };
    const mins = Math.floor(s.duration / 60), secs = Math.round(s.duration % 60);
    const kills = Object.entries(s.killsBy).sort((a, b2) => b2[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ');
    return `
      <div class="o-wrap ${won ? 'won' : 'lost'}">
        <div class="o-title">${won ? 'VICTORY' : 'K.I.A.'}</div>
        <div class="o-sub">${won ? `ALL 30 WAVES CLEARED ON ${R.difficulty.label}` : R.endless ? `ENDLESS · FELL ON WAVE ${R.wave}` : `FELL ON WAVE ${R.wave} · ACT ${R.act}`}</div>
        <div class="o-score">${R.score.toLocaleString()}<span>${R.score >= b.score ? ' · NEW BEST!' : ` · best ${b.score.toLocaleString()}`}</span></div>
        ${won && d === 'normal' && !unlocks._justOverdrive ? '' : ''}
        ${unlocks._justOverdrive ? '<div class="o-unlock">🔓 OVERDRIVE DIFFICULTY UNLOCKED</div>' : ''}
        <div class="o-stats">
          <div><span>KILLS</span><b>${s.kills}</b></div>
          <div><span>ACCURACY</span><b>${acc}%</b></div>
          <div><span>HEADSHOT KILLS</span><b>${s.headshotKills}</b></div>
          <div><span>DAMAGE</span><b>${Math.round(s.damageDealt).toLocaleString()}</b></div>
          <div><span>BEST CHAIN</span><b>${s.bestChain} (×${s.maxCombo})</b></div>
          <div><span>SCRAP EARNED</span><b>${s.scrapEarned}</b></div>
          <div><span>SYNERGIES</span><b>${s.synergies}</b></div>
          <div><span>TIME</span><b>${mins}:${String(secs).padStart(2, '0')}</b></div>
        </div>
        <div class="o-kills">${kills}</div>
        ${buildSummary()}
        <div class="t-row">
          ${won ? '<button class="t-play small endless" data-act="endless">GO ENDLESS</button>' : ''}
          <button class="${won ? 't-btn' : 't-play small'}" data-act="again">RUN IT BACK</button>
          <button class="t-btn" data-act="menu">MAIN MENU</button>
        </div>
      </div>`;
  }

  function howHtml() {
    const rows = [
      ['Mouse', 'Aim'], ['Left click', 'Fire (hold for automatics / charge the Rail Lancer)'], ['Right click', 'Aim down sights / scope'],
      ['W A S D', 'Move'], ['Shift', 'Sprint'], ['Space', 'Jump · double jump with Rocket Boots · hold in air for jetpack'],
      ['R', 'Reload (your holstered gun reloads itself)'], ['1 / 2 / wheel', 'Swap weapons — faster than reloading'],
      ['G (hold)', 'Charge & throw a grenade'], ['Q / E', 'Abilities (earned from cards)'], ['Esc', 'Pause'],
    ];
    return `<div class="m-title">HOW TO PLAY</div>
      <div class="how-grid">${rows.map(([k, v]) => `<kbd>${k}</kbd><span>${v}</span>`).join('')}</div>
      <div class="how-notes">
        <p><b>Survive 3 acts × 10 waves.</b> Wave 5 of every act brings a mini-boss, wave 10 the act boss. Bosses expose a glowing core in phase 2 — shoot it.</p>
        <p><b>Build your run.</b> After each wave pick 1 card. Stack upgrades, find <span class="gold">synergies</span> (pairs of cards that unlock bonus powers), gamble on <span class="purple">cursed</span> cards. Between acts the Armory offers new weapons.</p>
        <p><b>Scrap</b> drops from robots: spend it on rerolls, armor, drones, a jetpack — or save 1000 for the MECH.</p>
        <p><b>Bounties</b> are optional wave challenges for bonus scrap. Get up high: robots can reach you anywhere, but height is still power.</p>
      </div>`;
  }

  function settingsHtml() {
    const s = state.settings;
    const slider = (key, label, min, max, step, val, fmt) => `
      <label class="set-row"><span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${val}" data-set="${key}"><b>${fmt(val)}</b></label>`;
    return `<div class="m-title">SETTINGS</div>
      ${slider('sensitivity', 'Mouse sensitivity', 0.2, 3, 0.05, s.sensitivity, (v) => Number(v).toFixed(2))}
      ${slider('fov', 'Field of view', 65, 100, 1, s.fov, (v) => `${v}°`)}
      ${slider('volume.master', 'Master volume', 0, 1, 0.05, s.volume.master, (v) => `${Math.round(v * 100)}%`)}
      ${slider('volume.sfx', 'Effects volume', 0, 1, 0.05, s.volume.sfx, (v) => `${Math.round(v * 100)}%`)}
      ${slider('volume.music', 'Music volume', 0, 1, 0.05, s.volume.music, (v) => `${Math.round(v * 100)}%`)}
      <div class="set-row"><span>Graphics quality</span><div class="seg-btns">${['low', 'medium', 'high'].map((q) => `<button data-quality="${q}" class="${s.quality === q ? 'sel' : ''}">${q.toUpperCase()}</button>`).join('')}</div></div>
      <div class="set-row"><span>Damage numbers</span><div class="seg-btns">${['on', 'off'].map((q) => `<button data-dmgnum="${q}" class="${(s.damageNumbers ? 'on' : 'off') === q ? 'sel' : ''}">${q.toUpperCase()}</button>`).join('')}</div></div>`;
  }

  function codexHtml(tab = 'cards') {
    const cx = state.codex;
    const disc = cx.discovered;
    let body = '';
    if (tab === 'cards') {
      for (const tier of ['common', 'uncommon', 'rare', 'legendary', 'cursed']) {
        const list = cx.cards().filter((c) => c.tier === tier);
        const found = list.filter((c) => disc.has(c.id)).length;
        body += `<div class="cx-head" style="color:${cx.tiers[tier].color}">${cx.tiers[tier].label} <span>${found}/${list.length}</span></div><div class="cx-grid">`;
        for (const c of list) {
          const known = disc.has(c.id);
          body += `<div class="cx-item${known ? '' : ' unk'}" style="--c:${cx.tiers[tier].color}"><b>${known ? `${c.icon || ''} ${c.name}` : '???'}</b><span>${known ? c.desc : 'Pick this card in a run to reveal it.'}</span></div>`;
        }
        body += '</div>';
      }
    } else {
      const found = cx.synergies.filter((s) => disc.has(`syn-${s.id}`)).length;
      body += `<div class="cx-head" style="color:#ffd36b">SYNERGIES <span>${found}/${cx.synergies.length}</span></div><div class="cx-grid">`;
      const nameOf = (id) => {
        if (id.startsWith('w-')) return state.weaponDefs?.[id.slice(2)]?.name || id;
        return cx.cards().find((c) => c.id === id)?.name || id;
      };
      for (const s of cx.synergies) {
        const known = disc.has(`syn-${s.id}`);
        // ingredient hints show once you've discovered either card
        const hint = s.needs.map((n) => (disc.has(n) ? nameOf(n) : '???')).join(' + ');
        body += `<div class="cx-item${known ? '' : ' unk'}" style="--c:#ffd36b"><b>${known ? `⚡ ${s.name}` : '???'}</b><span>${known ? s.desc : ''}</span><i>${hint}</i></div>`;
      }
      body += '</div>';
    }
    return `<div class="m-title">CODEX</div>
      <div class="seg-btns tabs"><button data-codex="cards" class="${tab === 'cards' ? 'sel' : ''}">CARDS</button><button data-codex="syn" class="${tab === 'syn' ? 'sel' : ''}">SYNERGIES</button></div>
      <div class="cx-body">${body}</div>`;
  }

  function openModal(kind, arg) {
    modal = kind;
    const m = document.getElementById('modal');
    m.innerHTML = `<div class="modal-card">${kind === 'how' ? howHtml() : kind === 'settings' ? settingsHtml() : codexHtml(arg)}<button class="t-btn close" data-act="close">CLOSE</button></div>`;
    m.classList.remove('hidden');
  }
  function closeModal() {
    modal = null;
    document.getElementById('modal').classList.add('hidden');
    save(SETTINGS_KEY, state.settings);
  }

  function render() {
    if (screen === 'title') el.innerHTML = titleHtml();
    else if (screen === 'pause') el.innerHTML = pauseHtml();
    else if (screen === 'over') el.innerHTML = overHtml(state.run.won);
    else el.innerHTML = '';
    el.classList.toggle('hidden', screen === 'none');
    el.dataset.screen = screen;
  }

  function startRun() {
    bus.emit('audio:unlock');
    bus.emit('sfx', { id: 'ui_click' });
    screen = 'none';
    render();
    const op = state.operators?.[state.settings.operator];
    bus.emit('run:begin', { difficulty: state.settings.difficulty, operator: op && opUnlocked(op) ? op.id : 'vanguard' });
    lock();
  }

  // ---------- clicks ----------
  document.addEventListener('click', (e) => {
    const t = e.target.closest('button, [data-act]');
    if (!t) {
      // clicking the game while "playing" but unlocked resumes
      if (state.mode === 'playing' && !state.input.locked && screen === 'none' && !state.autopilot) lock();
      return;
    }
    if (t.closest('#intermission')) return;
    bus.emit('audio:unlock');
    const act = t.dataset.act;
    if (t.dataset.diff) {
      if (t.classList.contains('locked')) { bus.emit('sfx', { id: 'deny' }); return; }
      state.settings.difficulty = t.dataset.diff;
      save(SETTINGS_KEY, state.settings);
      bus.emit('sfx', { id: 'ui_click' });
      render();
      return;
    }
    if (t.dataset.op) {
      if (t.classList.contains('locked')) { bus.emit('sfx', { id: 'deny' }); return; }
      state.settings.operator = t.dataset.op;
      save(SETTINGS_KEY, state.settings);
      bus.emit('sfx', { id: 'ui_click' });
      render();
      return;
    }
    if (t.dataset.quality) {
      state.settings.quality = t.dataset.quality;
      state.settings.qualityAuto = false;
      bus.emit('quality:changed');
      openModal('settings');
      return;
    }
    if (t.dataset.dmgnum) {
      state.settings.damageNumbers = t.dataset.dmgnum === 'on';
      openModal('settings');
      return;
    }
    if (t.dataset.codex) { openModal('codex', t.dataset.codex); return; }
    if (!act) return;
    bus.emit('sfx', { id: 'ui_click' });
    if (act === 'play' || act === 'again') startRun();
    else if (act === 'endless') {
      screen = 'none';
      render();
      bus.emit('run:endless');
    }
    else if (act === 'resume') {
      screen = 'none';
      render();
      state.mode = 'playing';
      lock();
    } else if (act === 'quit' || act === 'menu') {
      screen = 'title';
      state.mode = 'menu';
      bus.emit('enemies:clear');
      bus.emit('arena:load', { id: 'outpost' });
      bus.emit('music', { mood: 'menu', act: 1 });
      render();
    } else if (act === 'how' || act === 'settings' || act === 'codex') openModal(act);
    else if (act === 'close') closeModal();
  });
  document.addEventListener('input', (e) => {
    const k = e.target.dataset?.set;
    if (!k) return;
    const v = Number(e.target.value);
    if (k.startsWith('volume.')) state.settings.volume[k.slice(7)] = v;
    else state.settings[k] = v;
    const b = e.target.parentElement.querySelector('b');
    if (b) b.textContent = k === 'fov' ? `${v}°` : k === 'sensitivity' ? v.toFixed(2) : `${Math.round(v * 100)}%`;
  });
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && modal) closeModal();
  });

  // ---------- flow events ----------
  bus.on('input:unlocked', () => {
    if (state.mode !== 'playing' || state.autopilot) return;
    state.mode = 'paused';
    screen = 'pause';
    render();
    bus.emit('sfx', { id: 'ui_click', vol: 0.5 });
  });
  bus.on('resume', () => {
    screen = 'none';
    render();
    lock();
  });
  bus.on('armory:done', () => lock());
  bus.on('run:end', ({ won, score, wave, difficulty }) => {
    const prev = best[difficulty];
    if (!prev || score > prev.score) best[difficulty] = { score, wave, won: won || prev?.won };
    else if (won) prev.won = true;
    save(BEST_KEY, best);
    unlocks._justOverdrive = false;
    if (won && !progress.won) {
      progress.won = true;
      save(PROGRESS_KEY, progress);
    }
    if (won && difficulty === 'normal' && !unlocks.overdrive) {
      unlocks.overdrive = true;
      unlocks._justOverdrive = true;
      save(UNLOCK_KEY, { overdrive: true });
    }
    // let the death / victory land before the stats slide in
    setTimeout(() => {
      screen = 'over';
      render();
      unlock();
    }, won ? 2200 : 1600);
  });
  bus.on('act:transition', ({ act, name, tagline }) => {
    fade.innerHTML = `<div class="act-card"><div class="act-n">ACT ${act}</div><div class="act-name">${name}</div><div class="act-tag">${tagline}</div></div>`;
    fade.classList.add('on');
  });
  bus.on('act:start', ({ act }) => {
    if (act > progress.maxAct) {
      progress.maxAct = act;
      save(PROGRESS_KEY, progress);
      const newly = operatorList().filter((o) => o.unlock?.act === act);
      for (const o of newly) bus.emit('hud:feed', { text: `🔓 OPERATOR UNLOCKED: ${o.name}`, color: '#c084fc' });
    }
    fade.classList.remove('on');
  });

  render();
  bus.emit('music', { mood: 'menu', act: 1 });

  return {
    screen: () => screen,
    // title-screen flyover camera
    updateCamera(dt) {
      orbit += dt * 0.06;
      const cam = state.camera;
      const r = 30;
      cam.position.set(Math.cos(orbit) * r, 13 + Math.sin(orbit * 0.7) * 2, Math.sin(orbit) * r);
      cam.lookAt(0, 3, 0);
    },
    update(dt) {
      // playing without the mouse captured (a lock the browser refused) → pause
      if (state.mode === 'playing' && !state.input.locked && !state.autopilot && screen === 'none') {
        unlockedT += dt;
        if (unlockedT > 0.6) {
          unlockedT = 0;
          state.mode = 'paused';
          screen = 'pause';
          render();
        }
      } else unlockedT = 0;
      const showInter = state.mode === 'offer';
      if (inter.classList.contains('hidden') === showInter) inter.classList.toggle('hidden', !showInter);
    },
  };
}
