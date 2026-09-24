// Bounties slice: an optional challenge on most waves. Complete it before the
// wave ends for bonus scrap. Adds a decision layer to every wave ("do I
// chase headshots or play safe?") without ever punishing you for ignoring it.
//
// Listens: wave:intermission, wave:start, wave:cleared, enemy:killed,
//          player:hurt, run:start, run:end
// Emits:   scrap:add, sfx, hud:feed, hud:banner
// Publishes state.run.bounty: { id, text, progress, goal, done, failed, reward }

const BOUNTIES = [
  { id: 'headhunter', text: (n) => `Get ${n} headshot kills`, goal: (w) => 3 + Math.floor(w / 5), count: (k) => k.part === 'head' || k.part === 'weak' },
  { id: 'aerial', text: (n) => `Get ${n} kills while airborne`, goal: (w) => 2 + Math.floor(w / 8), count: (k, s) => s.player.airborne },
  { id: 'close', text: (n) => `Get ${n} kills within 7m`, goal: (w) => 3 + Math.floor(w / 6), count: (k, s) => dist(k, s) < 7 },
  { id: 'long', text: (n) => `Get ${n} kills from 30m+`, goal: (w) => 3 + Math.floor(w / 6), count: (k, s) => dist(k, s) > 30 },
  { id: 'boom', text: (n) => `Get ${n} explosive kills`, goal: (w) => 2 + Math.floor(w / 8), count: (k) => ['grenade', 'launcher', 'explosive', 'missile', 'decoy', 'wasp'].includes(k.source) },
  { id: 'untouchable', text: (n) => `Take less than ${n} damage`, goal: (w) => 45 + w * 2, damage: true },
  { id: 'speed', text: (n) => `Clear the wave in ${n}s`, goal: (w, count) => Math.round(18 + count * 2.6), timed: true },
  { id: 'combo', text: (n) => `Reach a ×${n} combo`, goal: () => 4, combo: true },
];

function dist(k, s) {
  const p = s.player.pos;
  return Math.hypot(k.pos.x - p.x, k.pos.z - p.z);
}

export function createBounties(state, bus) {
  let b = null;
  let timer = 0;

  function set(v) {
    b = v;
    state.run.bounty = v;
  }

  bus.on('run:start', () => set(null));
  bus.on('run:end', () => set(null));
  bus.on('wave:intermission', ({ wave, boss }) => {
    set(null);
    if (boss || wave < 2) return;
    const pick = BOUNTIES[Math.floor(Math.random() * BOUNTIES.length)];
    set({ id: pick.id, def: pick, text: '', progress: 0, goal: 0, done: false, failed: false, reward: Math.round(35 + wave * 6), pending: true });
  });
  bus.on('wave:start', ({ wave, count }) => {
    if (!b) return;
    b.goal = b.def.goal(wave, count);
    b.text = b.def.text(b.goal);
    b.pending = false;
    timer = 0;
    if (b.def.timed) b.progress = b.goal;
    bus.emit('hud:feed', { text: `BOUNTY: ${b.text} (+${b.reward} scrap)`, color: '#ffd36b' });
  });
  bus.on('enemy:killed', (k) => {
    if (!b || b.pending || b.done || b.failed || b.def.damage || b.def.timed) return;
    if (b.def.combo) {
      if (state.run.combo >= b.goal) complete();
      else b.progress = state.run.combo;
      return;
    }
    if (k.source === 'bosswipe' || k.source === 'self') return;
    if (b.def.count(k, state)) {
      b.progress++;
      if (b.progress >= b.goal) complete();
    }
  });
  bus.on('player:hurt', ({ amount }) => {
    if (!b || b.pending || !b.def.damage || b.failed) return;
    b.progress += amount;
    if (b.progress >= b.goal) fail();
  });
  bus.on('wave:cleared', () => {
    if (!b || b.pending) return;
    if (b.def.damage || b.def.timed) {
      if (!b.failed) complete();
    } else if (!b.done) fail(true);
  });

  function complete() {
    if (b.done || b.failed) return;
    b.done = true;
    bus.emit('scrap:add', { amount: b.reward, reason: 'bounty' });
    bus.emit('sfx', { id: 'bounty_complete' });
    bus.emit('hud:feed', { text: `BOUNTY COMPLETE +${b.reward} SCRAP`, color: '#ffd36b' });
  }
  function fail(quiet) {
    if (b.done || b.failed) return;
    b.failed = true;
    if (!quiet) bus.emit('sfx', { id: 'bounty_fail' });
  }

  return {
    update(dt) {
      if (!b || b.pending || state.mode !== 'playing') return;
      if (b.def.timed && !b.done && !b.failed && state.run.waveState === 'active') {
        timer += dt;
        b.progress = Math.max(0, Math.ceil(b.goal - timer));
        if (timer >= b.goal) fail();
      }
    },
  };
}
