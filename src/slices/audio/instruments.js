// Music instruments: tiny one-shot synth voices the sequencer schedules ahead
// on the AudioContext clock. Each creates a few nodes, schedules its own stop
// and is garbage-collected afterwards. Noise comes from the engine's shared
// pre-rendered buffers.

export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function env(g, t, a, hold, dec, vol) {
  const p = g.gain;
  p.value = 0; // no one-sample blip at gain 1 before the first event
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(vol, t + a);
  if (hold > 0) p.setValueAtTime(vol, t + a + hold);
  const e = t + a + hold + dec;
  p.exponentialRampToValueAtTime(0.0001, e);
  return e + 0.01;
}

function osc(ctx, type, f, t, stop, dest, detune = 0) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (detune) o.detune.value = detune;
  o.connect(dest);
  o.start(t);
  o.stop(stop);
  return o;
}

function noiseSrc(eng, color, t, stop, dest, rate = 1) {
  const s = eng.ctx.createBufferSource();
  s.buffer = eng.buffers[color];
  s.loop = true;
  s.playbackRate.value = rate;
  s.connect(dest);
  s.start(t, Math.random() * 1.5);
  s.stop(stop);
  return s;
}

function biquad(ctx, type, f, q, dest) {
  const b = ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  b.connect(dest);
  return b;
}

// ---- drums ----------------------------------------------------------------

export function kick(eng, dest, t, vol = 1, punch = 1) {
  const ctx = eng.ctx;
  const g = ctx.createGain();
  g.connect(dest);
  const end = env(g, t, 0.002, 0.02, 0.32, vol * 0.9);
  const o = osc(ctx, 'sine', 150 * punch, t, end, g);
  o.frequency.exponentialRampToValueAtTime(46, t + 0.1);
  const cg = ctx.createGain();
  cg.connect(dest);
  const cend = env(cg, t, 0.001, 0, 0.012, vol * 0.25);
  const c = osc(ctx, 'triangle', 1400, t, cend, cg);
  c.frequency.exponentialRampToValueAtTime(300, t + 0.012);
}

export function snare(eng, dest, t, vol = 1, bright = 1) {
  const ctx = eng.ctx;
  const g = ctx.createGain();
  g.connect(dest);
  const end = env(g, t, 0.001, 0, 0.16, vol * 0.55);
  noiseSrc(eng, 'white', t, end, biquad(ctx, 'bandpass', 2200 * bright, 0.6, g));
  const tg = ctx.createGain();
  tg.connect(dest);
  const tend = env(tg, t, 0.001, 0, 0.08, vol * 0.35);
  const o = osc(ctx, 'triangle', 200, t, tend, tg);
  o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
}

export function clap(eng, dest, t, vol = 1) {
  const ctx = eng.ctx;
  const bp = biquad(ctx, 'bandpass', 1300, 0.9, dest);
  for (let i = 0; i < 3; i++) {
    const g = ctx.createGain();
    g.connect(bp);
    const tt = t + i * 0.011;
    const e = env(g, tt, 0.001, 0, i === 2 ? 0.18 : 0.012, vol * 0.9);
    noiseSrc(eng, 'white', tt, e, g);
  }
}

export function hat(eng, dest, t, vol = 1, open = false) {
  const ctx = eng.ctx;
  const g = ctx.createGain();
  g.connect(dest);
  const end = env(g, t, 0.001, 0, open ? 0.22 : 0.035, vol * 0.3);
  noiseSrc(eng, 'white', t, end, biquad(ctx, 'highpass', 7500, 0.7, g));
}

export function shaker(eng, dest, t, vol = 1) {
  const ctx = eng.ctx;
  const g = ctx.createGain();
  g.connect(dest);
  const end = env(g, t, 0.012, 0, 0.04, vol * 0.35);
  noiseSrc(eng, 'white', t, end, biquad(ctx, 'bandpass', 6500, 1.2, g));
}

export function tom(eng, dest, t, vol = 1, f = 110) {
  const ctx = eng.ctx;
  const g = ctx.createGain();
  g.connect(dest);
  const end = env(g, t, 0.002, 0, 0.3, vol * 0.7);
  const o = osc(ctx, 'sine', f * 1.7, t, end, g);
  o.frequency.exponentialRampToValueAtTime(f, t + 0.12);
  const ng = ctx.createGain();
  ng.connect(dest);
  const ne = env(ng, t, 0.001, 0, 0.05, vol * 0.2);
  noiseSrc(eng, 'pink', t, ne, biquad(ctx, 'bandpass', 900, 1, ng));
}

// Industrial metallic hit: inharmonic square pair through a resonant bandpass.
export function clank(eng, dest, t, vol = 1, f = 330) {
  const ctx = eng.ctx;
  const g = ctx.createGain();
  g.connect(dest);
  const end = env(g, t, 0.001, 0, 0.2, vol * 0.5);
  const bp = biquad(ctx, 'bandpass', 2400, 3, g);
  osc(ctx, 'square', f, t, end, bp);
  osc(ctx, 'square', f * 1.483, t, end, bp);
  osc(ctx, 'square', f * 2.137, t, end, bp);
}

export function crash(eng, dest, t, vol = 1) {
  const ctx = eng.ctx;
  const g = ctx.createGain();
  g.connect(dest);
  const end = env(g, t, 0.002, 0, 1.6, vol * 0.2);
  noiseSrc(eng, 'white', t, end, biquad(ctx, 'highpass', 4500, 0.5, g));
}

// ---- tonal ----------------------------------------------------------------

// style: 'drive' (act 1), 'grind' (act 2, distorted), 'wave' (act 3), 'sub' (menu)
export function bass(eng, dest, t, midi, len, style, vol = 1, drive = 0) {
  const ctx = eng.ctx;
  const f = mtof(midi);
  const g = ctx.createGain();
  g.connect(dest);
  const rel = style === 'sub' ? 0.5 : 0.08;
  const trim = { drive: 0.75, grind: 1.3, wave: 0.9, sub: 0.5 }[style];
  const end = env(g, t, 0.004, Math.max(0, len - 0.06), rel, vol * trim);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = style === 'wave' ? 4 : 2;
  const open = { drive: 1300, grind: 1100, wave: 2200, sub: 400 }[style] + drive * 800;
  lp.frequency.setValueAtTime(open, t);
  lp.frequency.exponentialRampToValueAtTime(style === 'sub' ? 250 : 260, t + Math.min(0.25, len + 0.05));
  if (style === 'grind' || drive > 0) {
    const ws = ctx.createWaveShaper();
    ws.curve = eng.curves[style === 'grind' ? 'hard' : 'soft'];
    const pre = ctx.createGain();
    pre.gain.value = 0.6;
    lp.connect(pre);
    pre.connect(ws);
    const post = biquad(ctx, 'lowpass', 1800, 0.7, g);
    const pg = ctx.createGain();
    pg.gain.value = 0.45;
    ws.connect(pg);
    pg.connect(post);
  } else {
    lp.connect(g);
  }
  if (style === 'sub') {
    osc(ctx, 'sine', f, t, end, lp);
    osc(ctx, 'triangle', f * 2, t, end, lp);
  } else {
    osc(ctx, 'sawtooth', f, t, end, lp, -6);
    osc(ctx, style === 'grind' ? 'square' : 'sawtooth', f, t, end, lp, 7);
    // clean sub keeps the low end solid under the filter/drive
    const sg = ctx.createGain();
    sg.gain.value = 0.7;
    sg.connect(g);
    osc(ctx, 'sine', f, t, end, sg);
  }
}

// Sustained detuned-saw chord into a shared (layer-level) filter.
export function pad(eng, dest, t, midis, len, vol = 1, type = 'sawtooth') {
  const ctx = eng.ctx;
  const g = ctx.createGain();
  g.connect(dest);
  const a = Math.min(0.8, len * 0.3);
  const end = env(g, t, a, Math.max(0, len - a), 1.2, vol * 0.075);
  for (const m of midis) {
    const f = mtof(m);
    osc(ctx, type, f, t, end, g, -9);
    osc(ctx, type, f, t, end, g, 9);
  }
}

export function pluck(eng, dest, t, midi, len, vol = 1, type = 'triangle', bright = 2500) {
  const ctx = eng.ctx;
  const g = ctx.createGain();
  g.connect(dest);
  const end = env(g, t, 0.003, 0, Math.max(0.08, len), vol * 0.16);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 1.5;
  lp.frequency.setValueAtTime(bright, t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(300, bright * 0.25), t + len);
  lp.connect(g);
  osc(ctx, type, mtof(midi), t, end, lp);
}

// style: 'twang' (act 1), 'metal' (act 2), 'super' (act 3), 'soft' (menu)
export function lead(eng, dest, t, midi, len, style, vol = 1) {
  const ctx = eng.ctx;
  const f = mtof(midi);
  const g = ctx.createGain();
  g.connect(dest);
  const end = env(g, t, style === 'soft' ? 0.04 : 0.006, Math.max(0, len - 0.05), style === 'twang' ? 0.25 : 0.18, vol * 0.16);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = style === 'twang' ? 6 : 1;
  const top = { twang: 3200, metal: 2400, super: 3600, soft: 1800 }[style];
  lp.frequency.setValueAtTime(top, t);
  lp.frequency.exponentialRampToValueAtTime(top * (style === 'twang' ? 0.25 : 0.6), t + len + 0.1);
  lp.connect(g);
  // vibrato that fades in on longer notes
  const vib = ctx.createOscillator();
  vib.frequency.value = 5.5;
  const vg = ctx.createGain();
  vg.gain.setValueAtTime(0, t);
  vg.gain.linearRampToValueAtTime(f * 0.012, t + Math.max(0.2, len));
  vib.connect(vg);
  vib.start(t);
  vib.stop(end);
  const add = (type, det, bend) => {
    const o = osc(ctx, type, bend ? f * 0.97 : f, t, end, lp, det);
    if (bend) o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
    vg.connect(o.frequency);
  };
  if (style === 'twang') {
    add('sawtooth', 0, true);
    add('square', 5, true);
  } else if (style === 'metal') {
    add('square', -4);
    add('sawtooth', 4);
  } else if (style === 'super') {
    add('sawtooth', -12);
    add('sawtooth', 0);
    add('sawtooth', 12);
  } else {
    add('triangle', 0);
    add('sine', 3);
  }
}

// ---- one-shots --------------------------------------------------------------

export function riser(eng, dest, t, dur = 3) {
  const ctx = eng.ctx;
  const g = ctx.createGain();
  g.connect(dest);
  g.gain.value = 0;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5, t + dur);
  g.gain.linearRampToValueAtTime(0, t + dur + 0.08);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 2;
  bp.frequency.setValueAtTime(300, t);
  bp.frequency.exponentialRampToValueAtTime(6000, t + dur);
  bp.connect(g);
  noiseSrc(eng, 'white', t, t + dur + 0.1, bp);
  const lp = biquad(ctx, 'lowpass', 2500, 1, g);
  const og = ctx.createGain();
  og.gain.value = 0.25;
  og.connect(lp);
  for (const det of [-10, 10]) {
    const o = osc(ctx, 'sawtooth', 110, t, t + dur + 0.1, og, det);
    o.frequency.exponentialRampToValueAtTime(880, t + dur);
  }
  crash(eng, dest, t + dur, 1.2);
  kick(eng, dest, t + dur, 0.8);
}

export function brassChord(eng, dest, t, midis, len, vol = 1) {
  const ctx = eng.ctx;
  const g = ctx.createGain();
  g.connect(dest);
  const end = env(g, t, 0.02, len, 0.5, vol * 0.05);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(600, t);
  lp.frequency.exponentialRampToValueAtTime(3000, t + 0.06);
  lp.frequency.exponentialRampToValueAtTime(1500, t + len + 0.3);
  lp.connect(g);
  for (const m of midis) {
    osc(ctx, 'sawtooth', mtof(m), t, end, lp, -7);
    osc(ctx, 'sawtooth', mtof(m), t, end, lp, 7);
  }
}
