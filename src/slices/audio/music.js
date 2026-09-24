// Adaptive music: a look-ahead step sequencer (setInterval ~25 ms, notes
// scheduled ~0.12 s ahead on the AudioContext clock) that plays the songs in
// songs.js through the instruments in instruments.js.
//
// A SongPlayer owns one song and a set of layer gains (pad, pulse, bass,
// drums, perc, arp, lead). Moods set layer targets; combat intensity opens up
// the arp/perc/hat density. Changing song (menu <-> act, act -> act)
// crossfades two players; changing mood within a song crossfades layers.
// Arrangement cycles every 32 bars (4 sections of 8) with fills, breakdowns
// and call/response lead phrases so it stays listenable for long sessions.

import * as I from './instruments.js';
import { SONGS, QUALITIES } from './songs.js';

const LOOKAHEAD = 0.12;
const LAYERS = ['pad', 'pulse', 'bass', 'drums', 'perc', 'arp', 'lead'];
const BASE = { pad: 0.9, pulse: 1, bass: 0.3, drums: 0.85, perc: 0.55, arp: 0.6, lead: 0.55 };
const REV = { pad: 0.45, pulse: 0.3, bass: 0, drums: 0.08, perc: 0.18, arp: 0.3, lead: 0.35 };
export const MOODS = ['menu', 'calm', 'combat', 'boss', 'shop', 'victory', 'defeat', 'transition', 'silent'];

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function moodTargets(mood, i) {
  switch (mood) {
    case 'menu': return { pad: 0.9, pulse: 0.3, bass: 0.6, drums: 0.4, perc: 0, arp: 0.7, lead: 0.55 };
    case 'calm': return { pad: 0.8, pulse: 0.6, bass: 0, drums: 0, perc: 0, arp: 0.18, lead: 0 };
    case 'shop': return { pad: 0.6, pulse: 0.45, bass: 0.4, drums: 0.35, perc: 0, arp: 0.3, lead: 0 };
    case 'combat': return {
      pad: 0.5, pulse: 0.35, bass: 0.9, drums: 0.8 + 0.2 * i,
      perc: 0.25 + 0.75 * smooth(0.3, 0.7, i), arp: 0.9 * smooth(0.25, 0.75, i), lead: 0.55,
    };
    case 'boss': return { pad: 0.55, pulse: 0.25, bass: 1, drums: 1, perc: 0.9, arp: 0.8, lead: 0.6 };
    case 'victory': return { pad: 0.7, pulse: 0.5, bass: 0, drums: 0, perc: 0, arp: 0.25, lead: 0 };
    case 'defeat': return { pad: 0.5, pulse: 0, bass: 0, drums: 0, perc: 0, arp: 0, lead: 0 };
    case 'transition': return { pad: 0.45, pulse: 0, bass: 0, drums: 0, perc: 0, arp: 0, lead: 0 };
    default: return { pad: 0, pulse: 0, bass: 0, drums: 0, perc: 0, arp: 0, lead: 0 };
  }
}

// Fold a midi note into [lo, lo + 12).
const fold = (m, lo) => {
  let n = m;
  while (n < lo) n += 12;
  while (n >= lo + 12) n -= 12;
  return n;
};

class SongPlayer {
  constructor(eng, key, start) {
    const ctx = eng.ctx;
    this.eng = eng;
    this.ctx = ctx;
    this.key = key;
    this.song = SONGS[key];
    this.spb = 60 / this.song.bpm / 4; // seconds per 16th
    this.next = start;
    this.stepIdx = 0;
    this.mood = 'silent';
    this.intensity = 0;
    this.hold = 0;
    this.silentSince = start;
    this.dead = false;
    this.targets = moodTargets('silent', 0);
    this.lastSet = {};
    this.bar = { chord: null, prevChord: null };

    this.out = ctx.createGain();
    this.out.gain.setValueAtTime(0, start);
    this.out.gain.linearRampToValueAtTime(1, start + 1.8);
    this.out.connect(eng.music.in);
    // reverb send bus follows the same fade as `out`
    this.revG = ctx.createGain();
    this.revG.gain.setValueAtTime(0, start);
    this.revG.gain.linearRampToValueAtTime(1, start + 1.8);
    this.revG.connect(eng.music.rev);

    // pump (sidechain-style ducking on kicks) for pad/pulse/arp
    this.pump = ctx.createGain();
    this.pump.connect(this.out);

    this.layer = {};
    for (const name of LAYERS) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(name === 'pad' || name === 'pulse' || name === 'arp' ? this.pump : this.out);
      if (REV[name] > 0) {
        const s = ctx.createGain();
        s.gain.value = REV[name];
        g.connect(s);
        s.connect(this.revG);
      }
      this.layer[name] = g;
    }
    // pad filter (shared by all pad voices)
    this.padLp = ctx.createBiquadFilter();
    this.padLp.type = 'lowpass';
    this.padLp.frequency.value = this.song.padCut;
    this.padLp.Q.value = 0.8;
    this.padLp.connect(this.layer.pad);
    // tempo-synced dotted-eighth delay on arp + lead
    this.delay = ctx.createDelay(2);
    this.delay.delayTime.value = this.spb * 3;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const dlp = ctx.createBiquadFilter();
    dlp.type = 'lowpass';
    dlp.frequency.value = 2200;
    this.delay.connect(dlp);
    dlp.connect(fb);
    fb.connect(this.delay);
    this.dIn = ctx.createGain();
    this.dIn.gain.value = 0.3;
    this.dIn.connect(this.delay);
    dlp.connect(this.layer.arp);
    this.arpIn = ctx.createGain();
    this.arpIn.connect(this.layer.arp);
    this.arpIn.connect(this.dIn);
    this.leadIn = ctx.createGain();
    this.leadIn.connect(this.layer.lead);
    this.leadIn.connect(this.dIn);
  }

  setMood(mood, now) {
    this.mood = mood;
    this.apply(now, true);
  }

  // Push layer targets to the gains (cheap; skips unchanged values).
  apply(now, force = false) {
    const t = now < this.hold ? moodTargets('silent', 0) : moodTargets(this.mood, this.intensity);
    const tc = force ? 0.6 : 0.8;
    let any = false;
    for (const name of LAYERS) {
      const v = t[name] * BASE[name];
      if (v > 0.001) any = true;
      if (force || Math.abs((this.lastSet[name] ?? -1) - v) > 0.02) {
        this.lastSet[name] = v;
        this.layer[name].gain.setTargetAtTime(v, now, tc);
      }
    }
    this.targets = t;
    if (any) this.silentSince = Infinity;
    else if (this.silentSince === Infinity) this.silentSince = now;
    // darker pad for boss/defeat
    const cut = this.song.padCut * (this.mood === 'boss' ? 0.7 : this.mood === 'defeat' ? 0.45 : this.mood === 'shop' ? 0.8 : 1);
    if (cut !== this._cut) {
      this._cut = cut;
      this.padLp.frequency.setTargetAtTime(cut, now, 0.5);
    }
  }

  update(now, intensity) {
    if (Math.abs(intensity - this.intensity) > 0.02 || (this.hold && now >= this.hold)) {
      this.intensity = intensity;
      if (this.hold && now >= this.hold) {
        this.hold = 0;
        this.apply(now, true);
        return;
      }
      this.apply(now);
    }
  }

  fadeOut(now, dur) {
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setValueAtTime(this.out.gain.value, now);
    this.out.gain.linearRampToValueAtTime(0, now + dur);
    this.revG.gain.cancelScheduledValues(now);
    this.revG.gain.setValueAtTime(this.revG.gain.value, now);
    this.revG.gain.linearRampToValueAtTime(0, now + dur);
    this.deadAt = now + dur + 0.3;
  }

  destroy() {
    this.dead = true;
    this.out.disconnect();
    this.revG.disconnect();
  }

  on(name) {
    return this.targets[name] > 0.001 || this.layer[name].gain.value > 0.003;
  }

  scheduleUntil(tEnd, now) {
    // idle: nothing audible for a while -> stop generating notes
    if (now - this.silentSince > 4) {
      this.next = Math.max(this.next, now);
      return;
    }
    // background tab / stalled timer: skip ahead instead of bursting
    if (this.next < now - 0.1) this.next = now + 0.05;
    while (this.next < tEnd) {
      this.step(this.stepIdx, this.next);
      this.next += this.spb;
      this.stepIdx++;
    }
  }

  chordAt(bar) {
    const s = this.song;
    const cyc = bar % 32;
    const section = cyc >> 3;
    const prog = this.mood === 'boss' && s.progs.boss ? s.progs.boss : section % 2 === 0 ? s.progs.a : s.progs.b;
    const [root, q] = prog[bar % prog.length];
    return { root: s.key + root, iv: QUALITIES[q], id: root + q, prog, idx: bar % prog.length };
  }

  tone(chord, idx, lo) {
    const r = fold(chord.root, lo);
    const n = chord.iv.length;
    const oct = Math.floor(idx / n);
    return r + chord.iv[idx - oct * n] + 12 * oct;
  }

  onBar(bar, t) {
    const s = this.song;
    const barDur = this.spb * 16;
    const chord = this.chordAt(bar);
    const cyc = bar % 32;
    const section = cyc >> 3;
    const prev = this.bar.chord;
    this.bar = {
      n: bar, cyc, section, chord,
      fill: cyc % 8 === 7,
      breakdown: this.mood === 'combat' && section === 2 && cyc < 20 && this.intensity < 0.6,
      leadOn: section === 1 || section === 3,
      variant: section >= 2 ? 'b' : 'a',
      motif: s.motifs[((cyc >> 1) & 3) === 3 ? (1 + (bar >> 5)) % s.motifs.length : 0],
      motifStart: bar - (bar % 2),
    };
    if (this.mood === 'menu' && section === 0 && bar < 32) this.bar.leadOn = false;

    // Pad: retrigger on chord change, held across repeated chords.
    if (this.on('pad') && (!prev || prev.id !== chord.id || cyc % 8 === 0 || bar >= (this.padEnd ?? 0))) {
      let run = 1;
      while (run < 2 && chord.idx + run < chord.prog.length && (cyc + run) % 8 !== 0) {
        const [r, q] = chord.prog[chord.idx + run];
        if (s.key + r !== chord.root || QUALITIES[q] !== chord.iv) break;
        run++;
      }
      const notes = chord.iv.map((iv) => fold(chord.root + iv, 55));
      notes.push(fold(chord.root, 43)); // low root anchors the pad
      this.padEnd = bar + run;
      I.pad(this.eng, this.padLp, t, notes, run * barDur - 0.05, 1);
    }
    // crash on section starts when drums are up
    if (cyc % 8 === 0 && this.on('drums') && this.targets.drums > 0.5 && bar > 0) {
      I.crash(this.eng, this.layer.drums, t, 0.9);
    }
  }

  step(n, t) {
    const s = this.song;
    const st = n % 16;
    if (st === 0) this.onBar(Math.floor(n / 16), t);
    const b = this.bar;
    const chord = b.chord;
    const eng = this.eng;
    const mood = this.mood;
    const hi = mood === 'boss' || (mood === 'combat' && this.intensity > 0.7);

    // ---- drums ----
    if (this.on('drums')) {
      const d = mood === 'shop' ? SHOP_DRUMS : s.drums;
      const inFill = b.fill && st >= 12 && mood !== 'shop';
      const kc = d.kick[st];
      if (kc !== '.' && !(b.breakdown && st !== 0)) {
        I.kick(eng, this.layer.drums, t, kc === 'X' ? 1 : kc === 'o' ? 0.5 : 0.9);
        if ((s.pump || mood === 'boss') && this.targets.drums > 0.2) {
          const p = this.pump.gain;
          p.setValueAtTime(0.55, t);
          p.setTargetAtTime(1, t + 0.02, this.spb * 0.9);
        }
      }
      const sc = inFill ? d.fill.snare[st - 12] : d.snare[st];
      if (sc && sc !== '.' && !b.breakdown) {
        const vel = (sc === 'X' ? 1 : sc === 'o' ? 0.35 : 0.8) * (inFill ? 0.6 + (st - 12) * 0.12 : 1);
        if (s.snareKind === 'clap') I.clap(eng, this.layer.drums, t, vel);
        else I.snare(eng, this.layer.drums, t, vel, mood === 'boss' ? 0.8 : 1);
      }
      const hp = hi ? d.hat16 : d.hat;
      const hc = hp[st];
      if (hc !== '.') I.hat(eng, this.layer.drums, t, hc === 'X' ? 0.9 : hc === 'o' ? 0.4 : 0.65, hc === 'O');
    }
    // ---- perc (toms / clanks / shakers) ----
    if (s.percKind && this.on('perc') && mood !== 'shop' && b.section > 0) {
      const inFill = b.fill && st >= 12;
      const pc = inFill ? s.drums.fill.perc[st - 12] : s.drums.perc[st];
      if (pc && pc !== '.') {
        const vel = pc === 'o' ? 0.5 : 0.85;
        if (s.percKind === 'tom') {
          const f = { h: 150, m: 115, l: 85, x: 100 }[pc] || 100;
          I.tom(eng, this.layer.perc, t, vel, f);
        } else if (s.percKind === 'clank') {
          I.clank(eng, this.layer.perc, t, vel, pc === 'h' ? 520 : 330);
        } else {
          I.shaker(eng, this.layer.perc, t, vel);
        }
      }
    }
    // ---- bass ----
    if (this.on('bass')) {
      const pat = mood === 'boss' ? s.bass.b : s.bass[b.variant];
      let off = pat[st];
      if (b.breakdown || mood === 'shop') off = st === 0 || st === 8 ? 0 : null;
      if (off !== null && off !== undefined) {
        const root = fold(chord.root, s.key - 5) + s.bassOct;
        const gate = mood === 'shop' ? 6 : s.bassGate;
        I.bass(eng, this.layer.bass, t, root + off, this.spb * gate, s.bassStyle, 0.55, mood === 'boss' ? 1 : 0);
      }
    }
    // ---- pulse (8ths) ----
    if (this.on('pulse') && st % 2 === 0 && !(mood === 'calm' && b.section === 2)) {
      const idx = s.pulse[st >> 1];
      if (idx !== null) {
        I.pluck(eng, this.layer.pulse, t, this.tone(chord, idx, 60), this.spb * 1.6, 2.4, s.pulseType, s.pulseType === 'sine' ? 1500 : 1200);
      }
    }
    // ---- arp (16ths) ----
    if (this.on('arp')) {
      const pat = s.arp[b.variant];
      const idx = pat[st];
      const sparse = mood === 'calm' || mood === 'shop' || mood === 'victory';
      if (idx !== null && (!sparse || st % 4 === 0)) {
        const bright = s.arpBright * (0.7 + 0.5 * this.intensity);
        I.pluck(eng, this.arpIn, t, this.tone(chord, idx, 57), this.spb * (sparse ? 3 : 1.2), 2.8, s.arpType, bright);
      }
    }
    // ---- lead motif ----
    if (this.on('lead') && b.leadOn && b.motif) {
      const local = (b.n - b.motifStart) * 16 + st;
      for (const [ms, idx, len] of b.motif) {
        if (ms === local) {
          const m = this.tone(chord, idx, 62);
          I.lead(eng, this.leadIn, t, m, this.spb * len * 0.95, s.leadStyle, 0.8);
        }
      }
    }
  }
}

const SHOP_DRUMS = {
  kick: 'x.......x.......',
  snare: '............o...',
  hat: '..o...o...o...o.',
  hat16: '..o...o...o...o.',
  perc: '................',
  fill: { snare: '....', perc: '....' },
};

// ---------------------------------------------------------------------------

export function createMusic(eng, { manual = false } = {}) {
  const ctx = eng.ctx;
  let cur = null;
  const fading = [];
  let mood = 'silent';
  let act = 1;
  let intensity = 0;

  function songFor(m, a) {
    return m === 'menu' ? 'menu' : 'act' + a;
  }

  function scheduleUntil(tEnd) {
    const now = ctx.currentTime;
    if (cur) cur.scheduleUntil(tEnd, now);
    for (let i = fading.length - 1; i >= 0; i--) {
      const p = fading[i];
      if (now > p.deadAt) {
        p.destroy();
        fading.splice(i, 1);
      } else {
        p.scheduleUntil(tEnd, now);
      }
    }
  }

  function tick() {
    scheduleUntil(ctx.currentTime + LOOKAHEAD);
  }

  function stinger(kind, t) {
    const s = cur ? cur.song : SONGS.act1;
    const k = s.key + 12;
    const dest = eng.music.in;
    if (kind === 'victory') {
      const I_ = [k, k + 4, k + 7, k + 12];
      const IV = [k + 5, k + 9, k + 12, k + 17];
      const V = [k + 7, k + 11, k + 14, k + 19];
      I.brassChord(eng, dest, t, I_, 0.12, 1);
      I.brassChord(eng, dest, t + 0.2, IV, 0.12, 1);
      I.brassChord(eng, dest, t + 0.4, V, 0.12, 1);
      I.brassChord(eng, dest, t + 0.62, [k - 12, ...I_, k + 16], 1.6, 1.1);
      for (let i = 0; i < 6; i++) I.tom(eng, dest, t + 0.62 + i * 0.05, 0.4 + i * 0.1, 80);
      I.kick(eng, dest, t + 0.62, 1);
      I.crash(eng, dest, t + 0.62, 1.2);
    } else {
      const m = [k, k + 3, k + 7];
      I.brassChord(eng, dest, t, m, 0.5, 0.8);
      I.brassChord(eng, dest, t + 0.6, [k - 1, k + 2, k + 6], 0.5, 0.7);
      I.brassChord(eng, dest, t + 1.2, [k - 12, k - 5, k, k + 3], 1.8, 0.8);
      I.tom(eng, dest, t, 1, 60);
      I.tom(eng, dest, t + 0.6, 0.9, 55);
      I.tom(eng, dest, t + 1.2, 1, 45);
    }
  }

  function set(m, a, { stinger: withStinger = true } = {}) {
    if (!MOODS.includes(m)) return;
    if (a === 1 || a === 2 || a === 3) act = a;
    const now = ctx.currentTime;
    const prevMood = mood;
    mood = m;
    if (m === 'silent') {
      if (cur) cur.setMood('silent', now);
      return;
    }
    const key = songFor(m, act);
    if (!cur || cur.key !== key) {
      if (cur) {
        cur.fadeOut(now, 2.5);
        fading.push(cur);
      }
      cur = new SongPlayer(eng, key, now + 0.08);
      cur.intensity = intensity;
    }
    if ((m === 'victory' || m === 'defeat') && prevMood !== m) {
      if (withStinger) stinger(m, now + 0.08);
      cur.hold = now + (m === 'victory' ? 2.6 : 3.2);
    }
    if (m === 'transition' && prevMood !== m) I.riser(eng, eng.music.in, now + 0.05, 3);
    cur.setMood(m, now);
  }

  const timer = manual ? null : setInterval(tick, 25);

  return {
    set,
    update(dt, inten) {
      intensity = Math.max(0, Math.min(1, inten || 0));
      if (cur) cur.update(ctx.currentTime, intensity);
    },
    // Offline rendering / tests: schedule everything up to time t now.
    scheduleUntil,
    // Offline helper: jump layers straight to their targets.
    snap() {
      if (!cur) return;
      for (const name of LAYERS) cur.layer[name].gain.value = cur.lastSet[name] ?? 0;
      for (const g of [cur.out.gain, cur.revG.gain]) {
        g.cancelScheduledValues(0);
        g.value = 1;
      }
    },
    // Offline helper: mute every layer except `name` (after snap()).
    skipTo(bar) {
      if (cur) cur.stepIdx = bar * 16;
    },
    solo(name) {
      if (!cur) return;
      for (const l of LAYERS) if (l !== name) cur.layer[l].gain.value = 0;
    },
    get mood() { return mood; },
    get act() { return act; },
    dispose() {
      if (timer) clearInterval(timer);
    },
  };
}
