// Sound-effect player + every recipe. Recipes are plain functions that stack
// layers onto a Voice (see voice.js): a transient click, a tonal body, a sub
// thump and a filtered tail, plus reverb/echo sends. The player handles
// pitch jitter, per-id and global voice caps (oldest is stolen), spatial
// routing, and cleanup of finished voices.

import { Voice } from './voice.js';
import { CULL_DISTANCE } from './spatial.js';

const MAX_VOICES = 48;
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const rnd = (a, b) => a + Math.random() * (b - a);

// ---------------------------------------------------------------------------
// Layer helpers

function click(v, vol = 0.3, at = 0, f = 3500, dur = 0.012) {
  v.noise({ type: 'highpass', f, dur, vol, at });
}
function thump(v, f, f2, dur, vol, at = 0, sweep = dur * 0.5) {
  v.tone({ f, f2, dur, vol, at, sweep });
}
function ring(v, fs, dur, vol, at = 0) {
  for (let i = 0; i < fs.length; i++) v.tone({ f: fs[i], dur: dur * (1 - i * 0.12), vol: vol / (1 + i * 0.6), at });
}
function sparks(v, dur, vol, at = 0, f = 3000) {
  v.noise({ color: 'crackle', type: 'highpass', f, dur, vol, at, a: 0.004, rate: rnd(0.9, 1.3) });
}
function whoosh(v, f, f2, dur, vol, at = 0, q = 1.3) {
  v.noise({ color: 'pink', type: 'bandpass', f, f2, q, a: dur * 0.4, dur: dur * 0.6, vol, at, sweep: dur });
}
function chord(v, notes, o) {
  for (let i = 0; i < notes.length; i++) v.tone({ ...o, f: hz(notes[i]), at: (o.at || 0) + (o.strum || 0) * i });
}
function stack(v, notes, o) {
  // detuned saw pair per note → wide brassy chord
  for (const n of notes) {
    v.tone({ ...o, f: hz(n), detune: -8 });
    v.tone({ ...o, f: hz(n), detune: 8 });
  }
}
function bell(v, f, dur, vol, at = 0) {
  v.tone({ f, dur, vol, at });
  v.tone({ f: f * 2.76, dur: dur * 0.5, vol: vol * 0.3, at });
  v.tone({ f: f * 5.4, dur: dur * 0.2, vol: vol * 0.12, at });
}
function servo(v, f, f2, dur, vol, at = 0) {
  v.tone({ type: 'sawtooth', f, f2, dur, vol, at, a: 0.01, lp: 1800, curve: 'lin' });
}

// ---------------------------------------------------------------------------
// Recipes: { max voices, pitch jitter, reverb send, echo send, gain trim, fn(v, p) }

const R = {};
const def = (id, cfg, fn) => { R[id] = { max: 4, jit: 0.04, rev: 0.1, echo: 0, gain: 1, ...cfg, fn }; };

// ===== Weapons (player, 2D) =====
def('rifle', { gain: 0.75, max: 4, rev: 0.13, echo: 0.04 }, (v) => {
  click(v, 0.5, 0, 3200, 0.01);
  v.noise({ type: 'bandpass', f: 2600, f2: 900, q: 0.9, dur: 0.055, vol: 0.9 });
  v.tone({ type: 'square', f: 210, f2: 70, dur: 0.07, vol: 0.2, lp: 1600, sweep: 0.05 });
  thump(v, 105, 42, 0.1, 0.65);
  v.noise({ color: 'pink', type: 'lowpass', f: 1400, f2: 350, dur: 0.18, vol: 0.2, at: 0.008 });
  v.tone({ type: 'triangle', f: 2300, f2: 1900, dur: 0.018, vol: 0.03, at: 0.045 });
});
def('marksman', { max: 2, jit: 0.02, rev: 0.35, echo: 0.4 }, (v) => {
  click(v, 0.9, 0, 1500, 0.02);
  v.noise({ type: 'bandpass', f: 1800, f2: 280, q: 0.7, dur: 0.28, vol: 1.1 });
  v.tone({ type: 'sawtooth', f: 170, f2: 45, dur: 0.26, vol: 0.18, shape: 'soft', lp: 1400, sweep: 0.15 });
  thump(v, 80, 28, 0.5, 0.95, 0, 0.3);
  v.noise({ color: 'brown', type: 'lowpass', f: 700, f2: 160, dur: 1.3, vol: 0.4, at: 0.02, sweep: 1 });
  v.noise({ color: 'pink', type: 'bandpass', f: 900, f2: 300, dur: 0.9, vol: 0.12, at: 0.06, a: 0.05 });
});
def('scattergun', { max: 3, jit: 0.03, rev: 0.25, echo: 0.22 }, (v) => {
  click(v, 0.7, 0, 2500, 0.015);
  v.noise({ color: 'pink', type: 'lowpass', f: 3500, f2: 260, dur: 0.38, vol: 1.0, sweep: 0.25 });
  v.tone({ type: 'sawtooth', f: 120, f2: 38, dur: 0.22, vol: 0.18, shape: 'soft', lp: 900, sweep: 0.15 });
  thump(v, 70, 30, 0.38, 0.95, 0, 0.25);
  v.noise({ color: 'brown', type: 'lowpass', f: 500, f2: 150, dur: 0.7, vol: 0.3, at: 0.03 });
  for (let i = 0; i < 4; i++) click(v, 0.12, rnd(0.004, 0.03), 4000, 0.006);
});
def('arcsmg', { max: 5, jit: 0.06, rev: 0.08 }, (v) => {
  v.tone({ type: 'square', f: 1500, f2: 320, dur: 0.05, vol: 0.12, bp: 2200, q: 1.2, sweep: 0.04 });
  v.tone({ type: 'sawtooth', f: 3400, f2: 900, dur: 0.035, vol: 0.06, sweep: 0.03 });
  v.noise({ color: 'crackle', type: 'highpass', f: 3500, dur: 0.035, vol: 0.5 });
  click(v, 0.25, 0, 5000, 0.008);
  thump(v, 190, 80, 0.05, 0.45);
});
def('rail_charge', { max: 2, jit: 0, rev: 0.2 }, (v) => {
  const g = v.tone({ type: 'sawtooth', f: 180, f2: 2200, dur: 0.12, hold: 0.7, a: 0.05, vol: 0.09, bp: 600, bp2: 4000, q: 3, fsweep: 0.8, sweep: 0.8 });
  v.tremolo(g, 10, 0.04, 0, 0.9, 40);
  v.tone({ f: 420, f2: 4800, a: 0.1, hold: 0.6, dur: 0.1, vol: 0.07, sweep: 0.8 });
  v.noise({ type: 'highpass', f: 2000, f2: 8000, a: 0.7, dur: 0.1, vol: 0.08, sweep: 0.8 });
  v.tone({ f: 60, f2: 90, a: 0.4, hold: 0.3, dur: 0.1, vol: 0.25 });
});
def('rail_fire', { max: 2, jit: 0.02, rev: 0.4, echo: 0.35 }, (v) => {
  click(v, 1.0, 0, 1200, 0.03);
  v.noise({ type: 'bandpass', f: 3500, f2: 500, q: 0.8, dur: 0.4, vol: 0.9 });
  v.tone({ type: 'sawtooth', f: 1900, f2: 60, dur: 0.38, vol: 0.14, shape: 'hard', lp: 3000, sweep: 0.3 });
  v.tone({ type: 'square', f: 5200, f2: 200, dur: 0.16, vol: 0.05, sweep: 0.14 });
  sparks(v, 0.5, 0.35, 0.01, 2500);
  thump(v, 85, 25, 0.65, 1.0, 0, 0.4);
  v.noise({ color: 'pink', type: 'lowpass', f: 900, f2: 200, dur: 1.3, vol: 0.25, at: 0.03 });
});
def('launcher', { max: 3, rev: 0.2 }, (v) => {
  thump(v, 130, 48, 0.16, 0.9);
  v.noise({ type: 'lowpass', f: 700, dur: 0.08, vol: 0.7 });
  click(v, 0.3, 0, 2000, 0.015);
  whoosh(v, 700, 2600, 0.5, 0.35, 0.03);
  v.noise({ color: 'brown', type: 'lowpass', f: 400, dur: 0.3, vol: 0.3, at: 0.02 });
});
def('dry_fire', { max: 2, jit: 0.03, rev: 0.03 }, (v) => {
  click(v, 0.35, 0, 2500, 0.01);
  v.tone({ type: 'square', f: 1800, f2: 1500, dur: 0.015, vol: 0.04, lp: 3000 });
  click(v, 0.15, 0.05, 3500, 0.008);
});
def('reload_start', { max: 2, jit: 0.03, rev: 0.05 }, (v) => {
  v.noise({ type: 'bandpass', f: 3000, q: 1.5, dur: 0.015, vol: 0.5 });
  v.noise({ type: 'bandpass', f: 1500, f2: 900, dur: 0.08, vol: 0.2, at: 0.02, a: 0.01 });
  v.tone({ type: 'triangle', f: 320, f2: 200, dur: 0.05, vol: 0.2, at: 0.075 });
  click(v, 0.2, 0.08, 2000, 0.01);
});
def('reload_end', { max: 2, jit: 0.03, rev: 0.06 }, (v) => {
  v.noise({ type: 'bandpass', f: 1200, q: 1.2, dur: 0.035, vol: 0.55 });
  v.tone({ f: 230, f2: 150, dur: 0.06, vol: 0.3 });
  v.noise({ type: 'bandpass', f: 2400, f2: 1600, dur: 0.06, vol: 0.35, at: 0.17, a: 0.01 });
  click(v, 0.45, 0.27, 3200, 0.014);
  v.tone({ type: 'triangle', f: 2800, dur: 0.06, vol: 0.04, at: 0.27 });
  v.tone({ f: 180, f2: 120, dur: 0.05, vol: 0.2, at: 0.27 });
});
def('weapon_switch', { max: 2, jit: 0.03, rev: 0.05 }, (v) => {
  v.noise({ type: 'bandpass', f: 1000, f2: 2200, a: 0.03, dur: 0.1, vol: 0.18 });
  click(v, 0.3, 0.12, 3000, 0.014);
  v.tone({ type: 'triangle', f: 1700, dur: 0.04, vol: 0.05, at: 0.125 });
  v.tone({ f: 200, f2: 140, dur: 0.05, vol: 0.18, at: 0.12 });
});
def('shell', { max: 6, jit: 0.1, rev: 0.06 }, (v) => {
  const f = rnd(3800, 4600);
  for (let i = 0; i < 3; i++) {
    const at = [0, 0.085, 0.15][i];
    const k = [1, 0.55, 0.28][i];
    v.tone({ f, dur: 0.07, vol: 0.12 * k, at });
    v.tone({ f: f * 1.47, dur: 0.045, vol: 0.06 * k, at });
    click(v, 0.08 * k, at, 6000, 0.004);
  }
});
def('grenade_throw', { max: 2, rev: 0.05 }, (v) => {
  click(v, 0.2, 0, 4000, 0.008);
  v.tone({ f: 3000, dur: 0.03, vol: 0.05 });
  whoosh(v, 500, 1800, 0.25, 0.4, 0.05);
});
def('grenade_bounce', { max: 4, jit: 0.08, rev: 0.12 }, (v) => {
  v.tone({ type: 'triangle', f: 520, f2: 360, dur: 0.07, vol: 0.35 });
  v.noise({ type: 'bandpass', f: 1500, dur: 0.03, vol: 0.4 });
  v.tone({ f: 1900, dur: 0.12, vol: 0.05 });
});
def('explosion', { max: 4, jit: 0.05, rev: 0.45, echo: 0.2 }, (v) => {
  click(v, 1.0, 0, 800, 0.03);
  v.noise({ color: 'pink', type: 'lowpass', f: 4000, f2: 280, dur: 0.7, vol: 1.1, sweep: 0.5 });
  thump(v, 72, 22, 1.1, 1.0, 0, 0.6);
  v.tone({ type: 'sawtooth', f: 95, f2: 30, dur: 0.5, vol: 0.12, shape: 'hard', lp: 700, sweep: 0.35 });
  v.noise({ color: 'brown', type: 'lowpass', f: 350, f2: 120, dur: 2.2, vol: 0.55, at: 0.02, sweep: 2 });
  sparks(v, 0.9, 0.2, 0.08, 2000);
});
def('explosion_small', { max: 4, jit: 0.07, rev: 0.3, echo: 0.08 }, (v) => {
  click(v, 0.7, 0, 1200, 0.02);
  v.noise({ color: 'pink', type: 'lowpass', f: 3500, f2: 400, dur: 0.4, vol: 0.8, sweep: 0.3 });
  thump(v, 95, 35, 0.5, 0.8, 0, 0.3);
  v.noise({ color: 'brown', type: 'lowpass', f: 400, dur: 0.9, vol: 0.3, at: 0.02 });
  sparks(v, 0.4, 0.12, 0.05, 2500);
});
def('ads_in', { max: 2, jit: 0.05, rev: 0.02 }, (v) => {
  v.noise({ type: 'bandpass', f: 1300, f2: 900, a: 0.02, dur: 0.07, vol: 0.1 });
  v.tone({ type: 'triangle', f: 2200, dur: 0.02, vol: 0.025, at: 0.05 });
  click(v, 0.06, 0.05, 4000, 0.006);
});

// ===== Hits =====
def('hit', { max: 3, jit: 0.02, rev: 0.02 }, (v) => {
  v.tone({ f: 1900, dur: 0.04, vol: 0.2 });
  v.tone({ type: 'square', f: 3800, dur: 0.012, vol: 0.025 });
  click(v, 0.12, 0, 5000, 0.008);
});
def('headshot', { max: 3, jit: 0.015, rev: 0.12 }, (v) => {
  v.noise({ type: 'bandpass', f: 2500, q: 1, dur: 0.04, vol: 0.45 });
  thump(v, 180, 90, 0.06, 0.3);
  bell(v, 2350, 0.4, 0.18, 0.005);
  v.tone({ f: 1760, dur: 0.25, vol: 0.06, at: 0.005 });
});
def('kill', { gain: 0.8, max: 3, jit: 0.02, rev: 0.12 }, (v) => {
  thump(v, 150, 55, 0.14, 0.55);
  v.noise({ type: 'bandpass', f: 1800, dur: 0.05, vol: 0.35 });
  v.fm({ f: 600, ratio: 1.41, index: 1.5, index2: 0.1, dur: 0.12, vol: 0.08 });
  v.tone({ type: 'triangle', f: 880, dur: 0.18, vol: 0.12, at: 0.03 });
  v.tone({ type: 'triangle', f: 1320, dur: 0.22, vol: 0.1, at: 0.07 });
});
def('shield_hit', { max: 4, jit: 0.05, rev: 0.2 }, (v) => {
  v.tone({ f: 1200, f2: 1900, dur: 0.14, vol: 0.2, sweep: 0.1 });
  v.tone({ type: 'triangle', f: 2500, dur: 0.16, vol: 0.07, vib: { rate: 38, depth: 120 } });
  v.noise({ type: 'highpass', f: 6000, dur: 0.03, vol: 0.12 });
  v.fm({ f: 900, ratio: 3.5, index: 1, index2: 0.1, dur: 0.1, vol: 0.06 });
});
def('impact', { max: 8, jit: 0.08, rev: 0.08 }, (v, p) => {
  const s = p.surface || 'concrete';
  if (s === 'metal') {
    v.noise({ type: 'bandpass', f: 3200, dur: 0.03, vol: 0.5 });
    ring(v, [rnd(2400, 2900), rnd(3700, 4100)], 0.12, 0.1);
    if (Math.random() < 0.3) v.tone({ f: 3200, f2: 1600, dur: 0.22, vol: 0.05, at: 0.01 });
  } else if (s === 'dirt') {
    v.noise({ color: 'pink', type: 'lowpass', f: 1000, dur: 0.07, vol: 0.5 });
    thump(v, 130, 70, 0.05, 0.25);
    v.noise({ color: 'crackle', type: 'bandpass', f: 1800, dur: 0.12, vol: 0.12, at: 0.01 });
  } else {
    v.noise({ type: 'bandpass', f: 1700, q: 0.9, dur: 0.05, vol: 0.55 });
    v.noise({ color: 'brown', type: 'lowpass', f: 900, dur: 0.1, vol: 0.2 });
    v.noise({ color: 'crackle', type: 'highpass', f: 2500, dur: 0.1, vol: 0.1, at: 0.01 });
  }
});
def('whiz', { max: 3, jit: 0.1, rev: 0.05 }, (v) => {
  v.noise({ type: 'bandpass', f: 3200, f2: 1100, q: 3, a: 0.035, dur: 0.12, vol: 0.5, sweep: 0.15 });
  v.tone({ f: 1500, f2: 850, a: 0.03, dur: 0.12, vol: 0.03 });
});

// ===== Player (2D) =====
def('footstep', { max: 2, jit: 0.08, rev: 0.03 }, (v, p) => {
  const s = p.surface || 'dirt';
  if (s === 'metal') {
    v.tone({ type: 'triangle', f: 190, f2: 150, dur: 0.05, vol: 0.14 });
    v.noise({ type: 'bandpass', f: 2600, dur: 0.03, vol: 0.14 });
    ring(v, [1100 * rnd(0.95, 1.05), 1680], 0.08, 0.025, 0.004);
  } else if (s === 'concrete') {
    v.noise({ type: 'bandpass', f: 1100, q: 0.9, dur: 0.045, vol: 0.2 });
    thump(v, 95, 60, 0.04, 0.16);
    click(v, 0.05, 0, 5000, 0.006);
  } else {
    v.noise({ color: 'pink', type: 'lowpass', f: 800, dur: 0.07, vol: 0.28 });
    v.noise({ color: 'crackle', type: 'bandpass', f: 2200, dur: 0.06, vol: 0.06, at: 0.01 });
    thump(v, 80, 55, 0.04, 0.1);
  }
});
def('jump', { max: 2, jit: 0.05, rev: 0.03 }, (v) => {
  v.noise({ type: 'bandpass', f: 900, f2: 1300, a: 0.01, dur: 0.08, vol: 0.14 });
  v.tone({ f: 170, f2: 260, dur: 0.08, vol: 0.1 });
});
def('land', { max: 2, jit: 0.05, rev: 0.05 }, (v) => {
  thump(v, 115, 42, 0.13, 0.55);
  v.noise({ color: 'pink', type: 'lowpass', f: 900, dur: 0.08, vol: 0.35 });
  v.noise({ type: 'bandpass', f: 3000, dur: 0.05, vol: 0.07, at: 0.02 });
});
def('hurt', { max: 2, jit: 0.05, rev: 0.06 }, (v) => {
  v.tone({ type: 'square', f: 230, f2: 110, dur: 0.12, vol: 0.12, lp: 1200 });
  v.noise({ type: 'bandpass', f: 800, dur: 0.1, vol: 0.4 });
  thump(v, 85, 45, 0.1, 0.45);
});
def('hurt_heavy', { max: 2, jit: 0.04, rev: 0.1 }, (v) => {
  v.tone({ type: 'sawtooth', f: 200, f2: 70, dur: 0.22, vol: 0.12, lp: 1000, shape: 'soft' });
  v.noise({ color: 'pink', type: 'bandpass', f: 700, f2: 300, dur: 0.18, vol: 0.55 });
  thump(v, 70, 30, 0.25, 0.7);
  v.tone({ f: 3600, a: 0.02, dur: 0.7, vol: 0.02, at: 0.05 }); // faint ear ring
});
def('heartbeat', { max: 1, jit: 0.02, rev: 0 }, (v) => {
  v.tone({ f: 62, f2: 40, dur: 0.12, vol: 0.55, lp: 200 });
  v.tone({ f: 58, f2: 38, dur: 0.1, vol: 0.4, at: 0.17, lp: 200 });
});
def('death', { max: 1, jit: 0, rev: 0.45 }, (v) => {
  thump(v, 90, 25, 0.9, 0.8);
  v.tone({ type: 'sawtooth', f: 320, f2: 40, dur: 1.4, vol: 0.12, lp: 1100, lp2: 180, sweep: 1.4 });
  v.tone({ type: 'sawtooth', f: 240, f2: 30, dur: 1.5, vol: 0.1, lp: 900, lp2: 150, sweep: 1.5, detune: 12 });
  v.noise({ color: 'brown', type: 'lowpass', f: 600, f2: 100, a: 0.05, dur: 1.5, vol: 0.4 });
  v.tone({ f: 3000, a: 0.1, dur: 1.2, vol: 0.02 });
});
def('armor_hit', { max: 3, jit: 0.06, rev: 0.1 }, (v) => {
  v.tone({ type: 'square', f: 700, f2: 500, dur: 0.06, vol: 0.12, lp: 2000 });
  ring(v, [1900 * rnd(0.97, 1.03), 2850], 0.16, 0.06);
  v.noise({ type: 'bandpass', f: 2000, dur: 0.04, vol: 0.35 });
  thump(v, 110, 60, 0.06, 0.3);
});
def('armor_break', { max: 1, jit: 0.02, rev: 0.3 }, (v) => {
  sparks(v, 0.45, 0.55, 0, 2000);
  v.noise({ type: 'highpass', f: 3000, dur: 0.25, vol: 0.25 });
  v.tone({ f: 2600, f2: 1000, dur: 0.3, vol: 0.08 });
  for (let i = 0; i < 4; i++) v.tone({ f: rnd(2800, 5200), dur: 0.12, vol: 0.05, at: 0.03 + i * 0.05 });
  thump(v, 120, 45, 0.2, 0.55);
});
def('heal', { max: 2, jit: 0.01, rev: 0.3 }, (v) => {
  chord(v, [72, 76, 79, 84], { strum: 0.06, dur: 0.4, a: 0.01, vol: 0.08 });
  v.noise({ type: 'highpass', f: 6000, a: 0.1, dur: 0.3, vol: 0.05 });
});
def('pickup_scrap', { max: 4, jit: 0.03, rev: 0.12 }, (v) => {
  v.tone({ type: 'square', f: 1318, dur: 0.06, vol: 0.06, lp: 5000 });
  v.tone({ f: 1318, dur: 0.06, vol: 0.12 });
  v.tone({ type: 'square', f: 1976, dur: 0.18, vol: 0.05, at: 0.055, lp: 6000 });
  v.tone({ f: 1976, dur: 0.2, vol: 0.12, at: 0.055 });
});
def('pickup_grenade', { max: 2, jit: 0.02, rev: 0.1 }, (v) => {
  v.noise({ type: 'bandpass', f: 1800, dur: 0.03, vol: 0.35 });
  v.tone({ type: 'triangle', f: 700, dur: 0.1, vol: 0.12 });
  v.tone({ type: 'triangle', f: 1050, dur: 0.14, vol: 0.12, at: 0.06 });
  v.tone({ f: 2400, dur: 0.1, vol: 0.04, at: 0.06 });
});
def('pickup_health', { max: 2, jit: 0.01, rev: 0.2 }, (v) => {
  v.tone({ f: 660, f2: 990, dur: 0.12, vol: 0.14, sweep: 0.06 });
  v.tone({ type: 'triangle', f: 990, f2: 1320, dur: 0.22, vol: 0.12, at: 0.08, sweep: 0.05 });
  v.noise({ type: 'highpass', f: 7000, a: 0.04, dur: 0.2, vol: 0.05 });
});
def('jetpack', { max: 3, jit: 0.05, rev: 0.02 }, (v) => {
  // overlapping bursts (emitted every ~0.12s) sum into a continuous roar
  v.noise({ color: 'brown', type: 'lowpass', f: 700, a: 0.05, hold: 0.07, dur: 0.12, vol: 0.3 });
  v.noise({ color: 'pink', type: 'bandpass', f: 1400, q: 0.8, a: 0.05, hold: 0.07, dur: 0.1, vol: 0.14 });
  v.noise({ color: 'crackle', type: 'highpass', f: 3000, a: 0.03, hold: 0.06, dur: 0.08, vol: 0.06 });
});
def('double_jump', { max: 2, jit: 0.04, rev: 0.06 }, (v) => {
  whoosh(v, 700, 2000, 0.16, 0.35);
  v.tone({ f: 300, f2: 620, dur: 0.12, vol: 0.08 });
  v.noise({ color: 'brown', type: 'lowpass', f: 500, dur: 0.14, vol: 0.4 });
});
def('dash', { max: 2, jit: 0.04, rev: 0.06 }, (v) => {
  v.noise({ color: 'pink', type: 'bandpass', f: 2600, f2: 600, q: 1, a: 0.012, dur: 0.22, vol: 0.55 });
  thump(v, 95, 50, 0.1, 0.35);
});
def('jump_pad', { gain: 0.75, max: 2, jit: 0.03, rev: 0.2 }, (v) => {
  v.tone({ f: 120, f2: 520, dur: 0.35, vol: 0.4, sweep: 0.3, vib: { rate: 18, depth: 20 } });
  v.noise({ color: 'pink', type: 'lowpass', f: 400, f2: 1800, a: 0.02, dur: 0.3, vol: 0.45 });
  thump(v, 65, 45, 0.3, 0.6);
});

// ===== Enemies (positional) =====
def('enemy_rifle', { max: 6, jit: 0.06, rev: 0.18 }, (v) => {
  v.noise({ type: 'bandpass', f: 1900, f2: 800, q: 0.9, dur: 0.045, vol: 0.7 });
  v.tone({ type: 'square', f: 950, f2: 240, dur: 0.06, vol: 0.09, lp: 2500 });
  v.tone({ type: 'sawtooth', f: 2100, f2: 600, dur: 0.05, vol: 0.04 });
  thump(v, 125, 55, 0.07, 0.45);
  v.noise({ color: 'pink', type: 'lowpass', f: 900, dur: 0.15, vol: 0.18, at: 0.01 });
});
def('enemy_heavy', { max: 3, jit: 0.05, rev: 0.35, echo: 0.15 }, (v) => {
  click(v, 0.6, 0, 1200, 0.02);
  thump(v, 80, 28, 0.55, 0.95, 0, 0.3);
  v.noise({ color: 'pink', type: 'lowpass', f: 1600, f2: 200, dur: 0.45, vol: 0.8 });
  v.tone({ type: 'sawtooth', f: 140, f2: 40, dur: 0.3, vol: 0.12, shape: 'soft', lp: 700 });
});
def('sniper_charge', { max: 2, jit: 0.01, rev: 0.15 }, (v) => {
  v.tone({ type: 'sawtooth', f: 110, a: 0.6, dur: 0.4, vol: 0.12, lp: 500, lp2: 2500, fsweep: 1 });
  v.tone({ type: 'sawtooth', f: 111.5, a: 0.6, dur: 0.4, vol: 0.12, lp: 500, lp2: 2500, fsweep: 1 });
  const g = v.tone({ f: 1200, f2: 2400, a: 0.3, hold: 0.5, dur: 0.2, vol: 0.06, sweep: 1 });
  v.tremolo(g, 8, 0.03, 0, 1, 30);
  v.tone({ f: 3000, dur: 0.05, vol: 0.1, at: 0.95 });
});
def('sniper_fire', { max: 2, jit: 0.03, rev: 0.35, echo: 0.3 }, (v) => {
  click(v, 0.8, 0, 1400, 0.025);
  v.tone({ type: 'sawtooth', f: 2600, f2: 200, dur: 0.2, vol: 0.1, sweep: 0.15 });
  v.noise({ type: 'bandpass', f: 2200, f2: 500, dur: 0.2, vol: 0.6 });
  thump(v, 90, 35, 0.3, 0.7);
  v.noise({ color: 'brown', type: 'lowpass', f: 600, f2: 200, dur: 1, vol: 0.25, at: 0.02 });
});
def('melee_swipe', { max: 3, jit: 0.06, rev: 0.08 }, (v) => {
  v.noise({ color: 'pink', type: 'bandpass', f: 1300, f2: 400, a: 0.04, dur: 0.16, vol: 0.55, sweep: 0.2 });
  servo(v, 300, 520, 0.12, 0.06);
});
def('enemy_step', { max: 6, jit: 0.1, rev: 0.05 }, (v) => {
  v.noise({ type: 'bandpass', f: 1500, dur: 0.03, vol: 0.22 });
  thump(v, 140, 80, 0.04, 0.2);
  servo(v, 420, 600, 0.06, 0.03);
});
def('boss_step', { max: 3, jit: 0.04, rev: 0.35 }, (v) => {
  thump(v, 58, 26, 0.65, 1.0, 0, 0.35);
  v.noise({ color: 'brown', type: 'lowpass', f: 450, dur: 0.45, vol: 0.7 });
  v.tone({ type: 'square', f: 180, f2: 120, dur: 0.15, vol: 0.1, lp: 900 });
  ring(v, [620, 930], 0.3, 0.05, 0.005);
  v.noise({ type: 'highpass', f: 3000, a: 0.05, dur: 0.3, vol: 0.07, at: 0.12 });
});
def('enemy_death', { max: 4, jit: 0.08, rev: 0.25 }, (v) => {
  sparks(v, 0.5, 0.45, 0, 3000);
  servo(v, 900, 60, 0.7, 0.1);
  v.noise({ type: 'bandpass', f: 900, q: 0.8, dur: 0.12, vol: 0.6 });
  thump(v, 125, 45, 0.16, 0.55);
  for (let i = 0; i < 3; i++) v.tone({ f: rnd(1500, 3500), dur: 0.06, vol: 0.05, at: 0.15 + i * 0.12 + rnd(0, 0.03) });
  v.fm({ f: 300, ratio: 2.7, index: 3, index2: 0.2, dur: 0.18, vol: 0.06, at: 0.02 });
});
def('enemy_spawn', { max: 4, jit: 0.04, rev: 0.4 }, (v) => {
  v.tone({ f: 200, f2: 1600, a: 0.1, hold: 0.3, dur: 0.1, vol: 0.1, sweep: 0.5 });
  v.tone({ type: 'sawtooth', f: 100, f2: 400, a: 0.2, hold: 0.2, dur: 0.1, vol: 0.06, lp: 1200, sweep: 0.5 });
  v.noise({ type: 'highpass', f: 5000, a: 0.3, dur: 0.25, vol: 0.12 });
  click(v, 0.5, 0.5, 1500, 0.05);
  thump(v, 140, 50, 0.2, 0.5, 0.5);
});
def('wasp_dive', { max: 3, jit: 0.05, rev: 0.15 }, (v) => {
  v.tone({ type: 'sawtooth', f: 1400, f2: 480, a: 0.15, dur: 0.65, vol: 0.12, bp: 2800, bp2: 1000, q: 3, fsweep: 0.8, sweep: 0.8, vib: { rate: 30, depth: 45 } });
  v.noise({ type: 'bandpass', f: 2200, f2: 900, a: 0.3, dur: 0.5, vol: 0.15 });
});
def('flame', { max: 4, jit: 0.06, rev: 0.08 }, (v) => {
  v.noise({ color: 'brown', type: 'lowpass', f: 1000, a: 0.04, hold: 0.12, dur: 0.18, vol: 0.55 });
  v.noise({ color: 'pink', type: 'bandpass', f: 1800, q: 0.7, a: 0.04, hold: 0.1, dur: 0.15, vol: 0.2 });
  sparks(v, 0.3, 0.2, 0.02, 2500);
});
def('lob', { max: 4, jit: 0.06, rev: 0.3 }, (v) => {
  thump(v, 115, 45, 0.22, 0.8);
  v.noise({ type: 'lowpass', f: 700, dur: 0.12, vol: 0.5 });
  v.tone({ f: 420, f2: 200, dur: 0.05, vol: 0.1 });
});
def('orb_volley', { max: 3, jit: 0.04, rev: 0.2 }, (v) => {
  for (let i = 0; i < 3; i++) {
    const at = i * 0.07;
    v.tone({ f: 950, f2: 300, dur: 0.12, vol: 0.14, at });
    v.tone({ type: 'triangle', f: 1900, f2: 600, dur: 0.08, vol: 0.05, at });
    v.noise({ type: 'bandpass', f: 1000, dur: 0.05, vol: 0.18, at });
  }
});
def('missile_launch', { max: 3, jit: 0.05, rev: 0.3 }, (v) => {
  v.noise({ type: 'bandpass', f: 1500, dur: 0.04, vol: 0.6 });
  thump(v, 110, 50, 0.1, 0.4);
  v.noise({ color: 'brown', type: 'lowpass', f: 2000, f2: 500, a: 0.02, dur: 0.8, vol: 0.5 });
  v.noise({ color: 'pink', type: 'bandpass', f: 1200, f2: 2200, a: 0.05, dur: 0.6, vol: 0.12 });
  v.tone({ f: 1200, f2: 1800, a: 0.1, dur: 0.5, vol: 0.03 });
});
def('artillery_warn', { max: 3, jit: 0.03, rev: 0.2 }, (v) => {
  v.tone({ f: 2400, f2: 700, a: 0.1, hold: 0.8, dur: 0.3, vol: 0.12, curve: 'lin', vib: { rate: 6, depth: 25 } });
  v.noise({ type: 'bandpass', f: 2400, f2: 700, q: 6, a: 0.1, hold: 0.8, dur: 0.3, vol: 0.12 });
});
def('shockwave', { max: 2, jit: 0.04, rev: 0.45, echo: 0.15 }, (v) => {
  click(v, 0.7, 0, 1000, 0.03);
  thump(v, 70, 24, 0.9, 1.0, 0, 0.5);
  v.noise({ color: 'pink', type: 'lowpass', f: 1500, f2: 100, dur: 0.7, vol: 0.8, sweep: 0.6 });
  v.noise({ color: 'crackle', type: 'lowpass', f: 3000, dur: 0.6, vol: 0.2, at: 0.05 });
});
def('summon', { max: 2, jit: 0.02, rev: 0.5 }, (v) => {
  v.tone({ type: 'sawtooth', f: 110, a: 0.4, dur: 0.6, vol: 0.1, lp: 300, lp2: 3000, fsweep: 0.8 });
  v.tone({ type: 'sawtooth', f: 165, a: 0.4, dur: 0.6, vol: 0.08, lp: 300, lp2: 3000, fsweep: 0.8, detune: 10 });
  v.tone({ f: 400, f2: 1600, a: 0.2, dur: 0.7, vol: 0.06 });
  bell(v, 1760, 0.4, 0.08, 0.8);
});
def('mender_beam', { max: 2, jit: 0.03, rev: 0.2 }, (v) => {
  v.tone({ f: 700, a: 0.1, hold: 0.2, dur: 0.2, vol: 0.1, vib: { rate: 7, depth: 60 } });
  v.tone({ type: 'triangle', f: 1400, a: 0.1, hold: 0.2, dur: 0.2, vol: 0.04, vib: { rate: 7, depth: 120 } });
  v.noise({ type: 'highpass', f: 6000, a: 0.1, dur: 0.3, vol: 0.04 });
});
def('boss_roar', { max: 1, jit: 0.03, rev: 0.55 }, (v) => {
  const drive = v.shaper('soft', v.filter('lowpass', 400, 1.5, 1800, 0.6), 1);
  for (const [f, d] of [[72, 0], [72, 14], [108, -9], [36, 0]]) {
    const o = v.ctx.createOscillator();
    o.type = 'sawtooth';
    o.detune.value = d;
    const t = v.t0;
    o.frequency.setValueAtTime(v.hz(f * 0.9), t);
    o.frequency.linearRampToValueAtTime(v.hz(f * 1.2), t + 0.5);
    o.frequency.linearRampToValueAtTime(v.hz(f * 0.8), t + 1.6);
    const g = v.ctx.createGain();
    const end = v._env(g, 0, 0.12, 0.9, 0.6, 0.14);
    o.connect(g);
    g.connect(drive);
    v._track(o, { start: t, stop: end });
  }
  v.noise({ color: 'brown', type: 'lowpass', f: 600, a: 0.1, hold: 0.8, dur: 0.6, vol: 0.4 });
  thump(v, 60, 30, 0.8, 0.6);
});
def('boss_enrage', { max: 1, jit: 0.02, rev: 0.5 }, (v) => {
  R.boss_roar.fn(v, {});
  v.tone({ type: 'sawtooth', f: 200, f2: 820, a: 0.3, hold: 0.5, dur: 0.4, vol: 0.06, shape: 'hard', lp: 2500, sweep: 1 });
  thump(v, 50, 22, 1.2, 0.7, 0.9);
});
def('teleport', { max: 3, jit: 0.04, rev: 0.3 }, (v) => {
  v.tone({ f: 1600, f2: 200, dur: 0.25, vol: 0.14, sweep: 0.22 });
  v.noise({ type: 'highpass', f: 8000, f2: 1500, dur: 0.2, vol: 0.2 });
  thump(v, 300, 80, 0.12, 0.35, 0.2);
});
def('laser_charge', { max: 2, jit: 0.01, rev: 0.2 }, (v) => {
  v.tone({ type: 'sawtooth', f: 80, f2: 400, a: 0.4, hold: 0.3, dur: 0.1, vol: 0.12, lp: 300, lp2: 3000, fsweep: 0.8, sweep: 0.8 });
  const g = v.tone({ f: 800, f2: 3200, a: 0.3, hold: 0.4, dur: 0.1, vol: 0.06, sweep: 0.8 });
  v.tremolo(g, 6, 0.03, 0, 0.8, 30);
});
def('laser_fire', { max: 2, jit: 0.02, rev: 0.3 }, (v) => {
  click(v, 0.6, 0, 1500, 0.02);
  const drive = v.shaper('soft', v.filter('lowpass', 3000, 0.7), 1);
  v.tone({ type: 'sawtooth', f: 180, a: 0.01, hold: 0.6, dur: 0.3, vol: 0.12, dest: drive });
  v.tone({ type: 'sawtooth', f: 181.5, a: 0.01, hold: 0.6, dur: 0.3, vol: 0.12, dest: drive });
  v.tone({ type: 'square', f: 360, a: 0.01, hold: 0.6, dur: 0.3, vol: 0.05, dest: drive });
  v.noise({ color: 'crackle', type: 'highpass', f: 3000, a: 0.01, hold: 0.6, dur: 0.3, vol: 0.15 });
  thump(v, 60, 45, 0.9, 0.45);
});

// ===== UI (2D) =====
def('ui_hover', { max: 2, jit: 0, rev: 0 }, (v) => {
  v.tone({ f: 1800, dur: 0.03, vol: 0.05 });
});
def('ui_click', { max: 2, jit: 0, rev: 0.03 }, (v) => {
  v.tone({ type: 'triangle', f: 1100, f2: 850, dur: 0.045, vol: 0.18 });
  click(v, 0.08, 0, 4000, 0.008);
});
def('card_flip', { max: 3, jit: 0.04, rev: 0.05 }, (v) => {
  v.noise({ type: 'bandpass', f: 2500, f2: 1200, a: 0.005, dur: 0.08, vol: 0.28 });
  v.tone({ f: 600, f2: 900, dur: 0.05, vol: 0.06 });
});
def('card_pick', { max: 2, jit: 0, rev: 0.2 }, (v) => {
  thump(v, 160, 70, 0.1, 0.4);
  v.noise({ type: 'bandpass', f: 2000, dur: 0.04, vol: 0.25 });
  chord(v, [72, 79, 84], { type: 'triangle', dur: 0.35, vol: 0.09, strum: 0.02 });
});
def('card_legendary', { max: 1, jit: 0, rev: 0.45 }, (v) => {
  [72, 76, 79, 84].forEach((n, i) => v.tone({ type: 'sawtooth', f: hz(n), dur: 0.25, vol: 0.06, at: i * 0.08, lp: 3000 }));
  stack(v, [60, 64, 67, 72, 76], { type: 'sawtooth', at: 0.32, a: 0.02, hold: 0.4, dur: 0.9, vol: 0.03, lp: 2800 });
  bell(v, hz(96), 1.0, 0.06, 0.32);
  v.noise({ type: 'highpass', f: 7000, a: 0.3, dur: 0.8, vol: 0.05, at: 0.2 });
  thump(v, 90, 40, 0.5, 0.5, 0.32);
});
def('card_cursed', { max: 1, jit: 0, rev: 0.55 }, (v) => {
  v.tone({ type: 'sawtooth', f: 55, a: 0.15, hold: 0.3, dur: 0.9, vol: 0.14, lp: 500 });
  v.tone({ type: 'sawtooth', f: 58.3, a: 0.15, hold: 0.3, dur: 0.9, vol: 0.14, lp: 500 });
  bell(v, 440, 1.0, 0.07, 0.05);
  bell(v, 622, 1.0, 0.05, 0.05);
  v.noise({ color: 'brown', type: 'lowpass', f: 400, a: 0.5, dur: 0.3, vol: 0.25 });
  thump(v, 50, 30, 0.6, 0.5, 0.05);
});
def('reroll', { max: 1, jit: 0, rev: 0.1 }, (v) => {
  for (let i = 0; i < 9; i++) {
    v.tone({ type: 'square', f: 1200 + i * 100, dur: 0.02, vol: 0.04, at: i * 0.035, lp: 4000 });
    click(v, 0.06, i * 0.035, 5000, 0.004);
  }
  bell(v, 1568, 0.2, 0.12, 0.33);
});
def('buy', { max: 2, jit: 0, rev: 0.15 }, (v) => {
  v.noise({ type: 'bandpass', f: 3000, dur: 0.02, vol: 0.25 });
  v.tone({ f: 1318, dur: 0.08, vol: 0.12 });
  v.tone({ f: 1760, dur: 0.3, vol: 0.12, at: 0.07 });
  v.tone({ type: 'square', f: 1760, dur: 0.12, vol: 0.03, at: 0.07, lp: 5000 });
});
def('deny', { max: 1, jit: 0, rev: 0.05 }, (v) => {
  for (const at of [0, 0.19]) {
    v.tone({ type: 'square', f: 140, a: 0.005, hold: 0.1, dur: 0.05, vol: 0.08, at, lp: 1200 });
    v.tone({ type: 'square', f: 147, a: 0.005, hold: 0.1, dur: 0.05, vol: 0.08, at, lp: 1200 });
  }
});
def('wave_start', { max: 1, jit: 0, rev: 0.4 }, (v) => {
  stack(v, [50, 57, 62], { type: 'sawtooth', a: 0.02, hold: 0.2, dur: 0.5, vol: 0.05, lp: 1500 });
  thump(v, 100, 40, 0.3, 0.6);
  v.noise({ type: 'highpass', f: 5000, dur: 0.8, vol: 0.09 });
  v.noise({ type: 'bandpass', f: 1200, dur: 0.06, vol: 0.3 });
});
def('wave_clear', { max: 1, jit: 0, rev: 0.35 }, (v) => {
  [72, 76, 79, 84].forEach((n, i) => v.tone({ type: 'triangle', f: hz(n), dur: 0.3, vol: 0.12, at: i * 0.07 }));
  bell(v, hz(88), 0.6, 0.05, 0.28);
  v.noise({ type: 'highpass', f: 7000, a: 0.1, dur: 0.4, vol: 0.04, at: 0.2 });
});
def('boss_warning', { max: 1, jit: 0, rev: 0.35 }, (v) => {
  const lp = v.filter('lowpass', 2200, 0.7);
  for (const [type, mul, vol] of [['sawtooth', 1, 0.08], ['square', 0.5, 0.05]]) {
    const o = v.ctx.createOscillator();
    o.type = type;
    const t = v.t0;
    o.frequency.setValueAtTime(v.hz(400 * mul), t);
    for (let i = 0; i < 4; i++) {
      o.frequency.linearRampToValueAtTime(v.hz(800 * mul), t + i * 0.5 + 0.25);
      o.frequency.linearRampToValueAtTime(v.hz(400 * mul), t + i * 0.5 + 0.5);
    }
    const g = v.ctx.createGain();
    const end = v._env(g, 0, 0.05, 1.8, 0.2, vol);
    o.connect(g);
    g.connect(lp);
    v._track(o, { start: t, stop: end });
  }
  thump(v, 60, 30, 0.8, 0.6);
});
def('callout', { max: 1, jit: 0, rev: 0.3 }, (v, p) => {
  const lvl = Math.max(2, Math.min(8, p.level || 2));
  const base = 67 + (lvl - 2) * 2;
  const steps = [0, 4, 7, 12, 16, 19, 24];
  const n = Math.min(lvl, 7);
  const dt = 0.07 - lvl * 0.004;
  for (let i = 0; i < n; i++) v.tone({ type: 'square', f: hz(base + steps[i]), dur: 0.12, vol: 0.05, at: i * dt, lp: 3500 });
  const endAt = n * dt;
  stack(v, [base, base + 4, base + 7, base + 12], { type: 'sawtooth', at: endAt, a: 0.01, hold: 0.1, dur: 0.4 + lvl * 0.05, vol: 0.022 + lvl * 0.002, lp: 3000 });
  if (lvl >= 4) thump(v, 110, 45, 0.3, 0.3 + lvl * 0.04, endAt);
  if (lvl >= 6) v.noise({ type: 'highpass', f: 6000, a: 0.05, dur: 0.6, vol: 0.06, at: endAt });
});
def('synergy', { max: 1, jit: 0, rev: 0.45 }, (v) => {
  stack(v, [74, 78, 81], { type: 'sawtooth', a: 0.005, dur: 0.14, vol: 0.035, lp: 3000 });
  stack(v, [67, 71, 74, 79, 83], { type: 'sawtooth', at: 0.18, a: 0.02, hold: 0.3, dur: 0.8, vol: 0.03, lp: 3200 });
  thump(v, 100, 40, 0.4, 0.55, 0.18);
  bell(v, hz(91), 0.8, 0.05, 0.18);
  v.noise({ type: 'highpass', f: 7000, a: 0.2, dur: 0.6, vol: 0.05, at: 0.18 });
});
def('bounty_complete', { max: 1, jit: 0, rev: 0.3 }, (v) => {
  [84, 88, 91].forEach((n, i) => bell(v, hz(n), 0.4, 0.1, i * 0.09));
  R.pickup_scrap.fn(v, {});
});
def('bounty_fail', { max: 1, jit: 0, rev: 0.25 }, (v) => {
  [69, 68, 64].forEach((n, i) => v.tone({ type: 'triangle', f: hz(n), dur: i === 2 ? 0.5 : 0.18, vol: 0.14, at: i * 0.18, lp: 2000 }));
});
def('act_clear', { max: 1, jit: 0, rev: 0.5 }, (v) => {
  for (const at of [0, 0.16, 0.32]) stack(v, [62, 66, 69], { type: 'sawtooth', at, a: 0.005, dur: 0.1, vol: 0.03, lp: 2500 });
  stack(v, [62, 66, 69, 74, 78], { type: 'sawtooth', at: 0.5, a: 0.03, hold: 0.8, dur: 1.2, vol: 0.028, lp: 3000 });
  for (const at of [0, 0.16, 0.32, 0.5]) thump(v, 95, 45, 0.3, 0.5, at);
  bell(v, hz(90), 1.2, 0.05, 0.5);
});
def('countdown', { max: 1, jit: 0, rev: 0.08 }, (v) => {
  v.tone({ f: 1000, dur: 0.06, vol: 0.14 });
  click(v, 0.1, 0, 4000, 0.006);
});
def('victory', { max: 1, jit: 0, rev: 0.5 }, (v) => {
  [60, 64, 67, 72].forEach((n, i) => stack(v, [n, n + 12], { type: 'sawtooth', at: i * 0.14, a: 0.01, dur: 0.18, vol: 0.03, lp: 3000 }));
  stack(v, [60, 64, 67, 72, 76, 79], { type: 'sawtooth', at: 0.6, a: 0.05, hold: 1.0, dur: 1.5, vol: 0.022, lp: 3200 });
  thump(v, 90, 40, 0.8, 0.6, 0.6);
  bell(v, hz(96), 1.5, 0.05, 0.6);
  v.noise({ type: 'highpass', f: 6500, a: 0.2, dur: 1.2, vol: 0.05, at: 0.6 });
});
def('defeat', { max: 1, jit: 0, rev: 0.55 }, (v) => {
  const o = { type: 'sawtooth', a: 0.05, hold: 0.8, dur: 1.4, vol: 0.035, lp: 1400, lp2: 300, fsweep: 2 };
  for (const n of [57, 60, 64, 45]) {
    v.tone({ ...o, f: hz(n), f2: hz(n) * 0.8, sweep: 2.2 });
    v.tone({ ...o, f: hz(n), f2: hz(n) * 0.8, sweep: 2.2, detune: 10 });
  }
  thump(v, 55, 25, 1.4, 0.7);
});

// ===== Abilities / gear =====
def('grapple_fire', { max: 2, rev: 0.1 }, (v) => {
  v.noise({ type: 'bandpass', f: 1500, dur: 0.04, vol: 0.5 });
  thump(v, 150, 70, 0.06, 0.35);
  v.noise({ type: 'bandpass', f: 3000, f2: 5500, q: 4, a: 0.02, dur: 0.28, vol: 0.2 });
  v.tone({ type: 'sawtooth', f: 2200, f2: 3200, dur: 0.25, vol: 0.02 });
});
def('grapple_pull', { max: 2, rev: 0.08 }, (v) => {
  servo(v, 220, 620, 0.5, 0.1);
  for (let i = 0; i < 10; i++) click(v, 0.1, i * 0.04, 3000, 0.006);
});
def('bubble_up', { max: 2, jit: 0.02, rev: 0.35 }, (v) => {
  v.tone({ f: 200, f2: 800, dur: 0.4, vol: 0.18, sweep: 0.3 });
  v.tone({ type: 'triangle', f: 400, f2: 1600, dur: 0.4, vol: 0.06, sweep: 0.3 });
  v.noise({ type: 'highpass', f: 5000, a: 0.2, dur: 0.3, vol: 0.06 });
  chord(v, [76, 83, 88], { a: 0.02, dur: 0.5, vol: 0.04, at: 0.25 });
});
def('bubble_break', { max: 2, jit: 0.03, rev: 0.3 }, (v) => {
  sparks(v, 0.5, 0.5, 0, 3000);
  for (let i = 0; i < 5; i++) v.tone({ f: rnd(2000, 5000), dur: 0.15, vol: 0.05, at: i * 0.04 });
  v.tone({ f: 800, f2: 200, dur: 0.3, vol: 0.12 });
});
def('heal_field', { max: 2, jit: 0.01, rev: 0.45 }, (v) => {
  chord(v, [67, 71, 74, 79], { a: 0.2, hold: 0.2, dur: 0.6, vol: 0.06 });
  v.noise({ type: 'highpass', f: 6000, a: 0.3, dur: 0.5, vol: 0.05 });
});
def('missile_home', { max: 4, jit: 0.05, rev: 0.15 }, (v) => {
  v.tone({ type: 'square', f: 1760, dur: 0.035, vol: 0.05, lp: 5000 });
  v.tone({ type: 'square', f: 1760, dur: 0.035, vol: 0.05, at: 0.08, lp: 5000 });
  v.noise({ type: 'bandpass', f: 1200, f2: 2400, a: 0.02, dur: 0.35, vol: 0.35 });
  v.noise({ color: 'brown', type: 'lowpass', f: 800, dur: 0.3, vol: 0.3 });
});
def('nova', { max: 1, jit: 0.02, rev: 0.55 }, (v) => {
  v.noise({ type: 'highpass', f: 4000, a: 0.005, dur: 0.6, vol: 0.35 });
  for (let i = 0; i < 6; i++) v.tone({ f: rnd(2000, 5000), dur: 0.3, vol: 0.05, at: 0.02 + i * 0.05 });
  thump(v, 90, 35, 0.5, 0.8);
  v.tone({ f: 3000, f2: 300, dur: 0.4, vol: 0.08 });
  v.fm({ f: 1200, ratio: 3.01, index: 2, index2: 0.1, dur: 0.6, vol: 0.05 });
});
def('laser_sweep', { max: 2, jit: 0.02, rev: 0.2 }, (v) => {
  const drive = v.shaper('soft', v.filter('lowpass', 2500, 0.7), 1);
  v.tone({ type: 'sawtooth', f: 300, a: 0.03, hold: 0.45, dur: 0.25, vol: 0.1, dest: drive });
  v.tone({ type: 'sawtooth', f: 302, a: 0.03, hold: 0.45, dur: 0.25, vol: 0.1, dest: drive });
  v.noise({ type: 'bandpass', f: 1000, f2: 4000, a: 0.05, hold: 0.4, dur: 0.25, vol: 0.2 });
  v.tone({ f: 100, a: 0.03, hold: 0.45, dur: 0.25, vol: 0.3 });
});
def('overclock', { max: 1, jit: 0, rev: 0.3 }, (v) => {
  v.tone({ type: 'sawtooth', f: 110, f2: 440, dur: 0.6, vol: 0.12, lp: 400, lp2: 4000, fsweep: 0.6, sweep: 0.6, curve: 'lin', a: 0.05 });
  v.tone({ f: 220, f2: 880, dur: 0.6, vol: 0.1, a: 0.05 });
  v.noise({ type: 'highpass', f: 1500, dur: 0.05, vol: 0.45, at: 0.62 });
  thump(v, 140, 50, 0.2, 0.5, 0.62);
  stack(v, [69, 76, 81], { type: 'sawtooth', at: 0.62, a: 0.01, dur: 0.5, vol: 0.03, lp: 3000 });
});
def('mech_enter', { max: 1, jit: 0, rev: 0.3 }, (v) => {
  v.noise({ type: 'highpass', f: 2500, a: 0.02, dur: 0.4, vol: 0.15 });
  for (const at of [0.1, 0.35]) {
    thump(v, 120, 55, 0.12, 0.6, at);
    v.noise({ type: 'bandpass', f: 900, dur: 0.04, vol: 0.4, at });
  }
  servo(v, 300, 900, 0.5, 0.07, 0.05);
  v.tone({ f: 55, a: 0.3, hold: 0.2, dur: 0.3, vol: 0.35, at: 0.3 });
  chord(v, [81, 88], { dur: 0.3, vol: 0.06, at: 0.75 });
});
def('mech_shot', { gain: 0.8, max: 4, jit: 0.04, rev: 0.2, echo: 0.1 }, (v) => {
  click(v, 0.6, 0, 1800, 0.015);
  thump(v, 115, 40, 0.17, 0.85);
  v.noise({ type: 'bandpass', f: 1500, f2: 400, dur: 0.12, vol: 0.7 });
  v.tone({ type: 'sawtooth', f: 200, f2: 60, dur: 0.1, vol: 0.1, shape: 'soft', lp: 1200 });
  v.noise({ color: 'pink', type: 'lowpass', f: 900, dur: 0.3, vol: 0.2, at: 0.01 });
});
def('mech_step', { max: 2, jit: 0.05, rev: 0.15 }, (v) => {
  thump(v, 72, 35, 0.25, 0.7);
  v.noise({ type: 'lowpass', f: 500, dur: 0.12, vol: 0.4 });
  servo(v, 180, 260, 0.15, 0.06);
  v.tone({ type: 'square', f: 400, dur: 0.04, vol: 0.06, lp: 1500 });
});
def('mech_stomp', { max: 1, jit: 0.03, rev: 0.4, echo: 0.1 }, (v) => {
  R.boss_step.fn(v, {});
  R.shockwave.fn(v, {});
});
def('mech_rockets', { max: 2, jit: 0.03, rev: 0.2 }, (v) => {
  for (let i = 0; i < 4; i++) {
    const at = i * 0.08;
    v.noise({ type: 'bandpass', f: 1400, dur: 0.04, vol: 0.4, at });
    thump(v, 120, 60, 0.06, 0.3, at);
    v.noise({ color: 'pink', type: 'bandpass', f: 900, f2: 2400, a: 0.03, dur: 0.3, vol: 0.12, at });
  }
});
def('drone_shot', { max: 4, jit: 0.06, rev: 0.1 }, (v) => {
  v.tone({ f: 1800, f2: 600, dur: 0.08, vol: 0.14 });
  v.tone({ type: 'square', f: 900, f2: 300, dur: 0.05, vol: 0.03, lp: 3000 });
  click(v, 0.12, 0, 5000, 0.01);
});
def('collector', { max: 2, jit: 0.05, rev: 0.1 }, (v) => {
  v.tone({ f: 600, f2: 1300, dur: 0.15, vol: 0.1 });
  v.noise({ type: 'bandpass', f: 2000, f2: 3000, dur: 0.1, vol: 0.1 });
  v.tone({ f: 2000, dur: 0.05, vol: 0.05, at: 0.12 });
});
def('reactor_warn', { max: 1, jit: 0, rev: 0.4 }, (v) => {
  for (let i = 0; i < 3; i++) {
    const k = Math.pow(1.12, i);
    v.tone({ type: 'square', f: 440 * k, f2: 880 * k, a: 0.02, hold: 0.25, dur: 0.12, vol: 0.07, at: i * 0.5, lp: 2000, curve: 'lin', sweep: 0.37 });
    v.tone({ type: 'sawtooth', f: 220 * k, f2: 440 * k, a: 0.02, hold: 0.25, dur: 0.12, vol: 0.04, at: i * 0.5, lp: 1500, curve: 'lin', sweep: 0.37 });
  }
  v.tone({ f: 55, a: 0.3, hold: 0.9, dur: 0.3, vol: 0.3 });
});
def('reactor_pulse', { max: 1, jit: 0, rev: 0.55, echo: 0.2 }, (v) => {
  click(v, 1.0, 0, 1000, 0.03);
  thump(v, 55, 20, 1.5, 1.0, 0, 0.8);
  v.tone({ type: 'sawtooth', f: 800, f2: 50, dur: 1.0, vol: 0.12, shape: 'hard', lp: 3000, lp2: 300, sweep: 0.8 });
  v.noise({ color: 'pink', type: 'lowpass', f: 5000, f2: 200, dur: 1.2, vol: 0.9, sweep: 1 });
  sparks(v, 1.0, 0.3, 0.02, 2000);
  v.fm({ f: 220, ratio: 1.5, index: 4, index2: 0.2, dur: 1.2, vol: 0.08 });
});
def('lava_sizzle', { max: 2, jit: 0.08, rev: 0.1 }, (v) => {
  v.noise({ color: 'crackle', type: 'highpass', f: 2000, a: 0.05, dur: 0.45, vol: 0.3 });
  v.noise({ type: 'highpass', f: 5000, a: 0.05, dur: 0.35, vol: 0.08 });
  for (let i = 0; i < 3; i++) v.tone({ f: rnd(250, 350), f2: rnd(500, 700), dur: 0.03, vol: 0.08, at: rnd(0, 0.35) });
});

export const RECIPES = R;
export const SFX_IDS = Object.keys(R);

// ---------------------------------------------------------------------------
// Player

export function createSfx(eng, spatial, { maxVoices = MAX_VOICES, dev = true } = {}) {
  const ctx = eng.ctx;
  const voices = [];
  const warned = new Set();

  function cleanup(now) {
    for (let i = voices.length - 1; i >= 0; i--) {
      const v = voices[i];
      if (v.end < now - 0.05) {
        v.disconnect();
        voices.splice(i, 1);
      }
    }
  }

  function live(id) {
    let n = 0;
    let oldest = null;
    for (const v of voices) {
      if (v.dead || (id && v.id !== id)) continue;
      n++;
      if (!oldest || v.t0 < oldest.t0) oldest = v;
    }
    return { n, oldest };
  }

  function play(p, when) {
    const r = R[p.id];
    if (!r) {
      if (dev && !warned.has(p.id)) {
        warned.add(p.id);
        console.warn(`[audio] unknown sfx id: ${p.id}`);
      }
      return null;
    }
    const now = ctx.currentTime;
    cleanup(now);

    let dist = 0;
    const pos = p.pos;
    const spatialOn = pos && spatial && Number.isFinite(pos.x);
    if (spatialOn) {
      dist = spatial.distanceTo(pos);
      if (dist > CULL_DISTANCE) return null;
    }

    const own = live(p.id);
    if (own.n >= r.max) own.oldest.kill(now);
    const all = live(null);
    if (all.n >= maxVoices) all.oldest.kill(now);

    const jit = r.jit ? 1 + (Math.random() * 2 - 1) * r.jit : 1;
    const pitch = (p.pitch || 1) * jit;
    const t0 = (when ?? now) + 0.005;
    const v = new Voice(eng, p.id, t0, pitch);
    v.out.gain.value = (p.vol ?? 1) * r.gain;

    let revAmt = r.rev;
    let echoAmt = r.echo;
    if (spatialOn) {
      const { att, far } = spatial.attach(v, pos, dist, eng.sfx.dry);
      // far sounds: quieter dry, relatively more reverb
      const wet = Math.sqrt(att);
      revAmt = (r.rev + 0.18 * far + 0.04) * wet;
      echoAmt = r.echo * wet;
    } else {
      v.out.connect(eng.sfx.dry);
    }

    r.fn(v, p);

    if (revAmt > 0.001) {
      const s = ctx.createGain();
      s.gain.value = revAmt;
      v.out.connect(s);
      s.connect(eng.sfx.rev);
      v.extra.push(s);
    }
    if (echoAmt > 0.001) {
      const s = ctx.createGain();
      s.gain.value = echoAmt;
      v.out.connect(s);
      s.connect(eng.sfx.echo);
      v.extra.push(s);
    }
    voices.push(v);
    return v;
  }

  return {
    play,
    update() {
      cleanup(ctx.currentTime);
    },
    // voices currently sounding (excludes stolen/finished ones awaiting cleanup)
    get voiceCount() {
      const now = ctx.currentTime;
      let n = 0;
      for (const v of voices) if (!v.dead && v.end > now) n++;
      return n;
    },
  };
}
