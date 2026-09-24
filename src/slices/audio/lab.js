// Audio lab (dev only, loaded by /audio-lab.html): buttons for every sfx id,
// music mood/act switching, an intensity slider, a spatial orbit test, and
// offline analysis (renders each sound through the real engine in an
// OfflineAudioContext and reports peak/RMS). Exposed as window.__lab for
// headless verification.

import * as THREE from 'three';
import { createBus } from '../../core/bus.js';
import { createState } from '../../core/state.js';
import { createAudio } from './index.js';
import { createEngine } from './engine.js';
import { createSpatial } from './spatial.js';
import { createSfx, SFX_IDS } from './sfx.js';
import { createMusic, MOODS } from './music.js';

const GROUPS = {
  Weapons: ['rifle', 'marksman', 'scattergun', 'arcsmg', 'rail_charge', 'rail_fire', 'launcher', 'dry_fire', 'reload_start', 'reload_end', 'weapon_switch', 'shell', 'grenade_throw', 'grenade_bounce', 'explosion', 'explosion_small', 'ads_in'],
  Hits: ['hit', 'headshot', 'kill', 'shield_hit', 'impact', 'whiz'],
  Player: ['footstep', 'jump', 'land', 'hurt', 'hurt_heavy', 'heartbeat', 'death', 'armor_hit', 'armor_break', 'heal', 'pickup_scrap', 'pickup_grenade', 'pickup_health', 'jetpack', 'double_jump', 'dash', 'jump_pad'],
  Enemies: ['enemy_rifle', 'enemy_heavy', 'sniper_charge', 'sniper_fire', 'melee_swipe', 'enemy_step', 'boss_step', 'enemy_death', 'enemy_spawn', 'wasp_dive', 'flame', 'lob', 'orb_volley', 'missile_launch', 'artillery_warn', 'shockwave', 'summon', 'mender_beam', 'boss_roar', 'boss_enrage', 'teleport', 'laser_charge', 'laser_fire'],
  UI: ['ui_hover', 'ui_click', 'card_flip', 'card_pick', 'card_legendary', 'card_cursed', 'reroll', 'buy', 'deny', 'wave_start', 'wave_clear', 'boss_warning', 'callout', 'synergy', 'bounty_complete', 'bounty_fail', 'act_clear', 'countdown', 'victory', 'defeat'],
  Abilities: ['grapple_fire', 'grapple_pull', 'bubble_up', 'bubble_break', 'heal_field', 'missile_home', 'nova', 'laser_sweep', 'overclock', 'mech_enter', 'mech_shot', 'mech_step', 'mech_stomp', 'mech_rockets', 'drone_shot', 'collector', 'reactor_warn', 'reactor_pulse', 'lava_sizzle'],
};
// Ids that are positional in-game (the lab plays them in front of the listener).
const POSITIONAL = new Set([...GROUPS.Enemies, 'shell', 'grenade_bounce', 'explosion', 'explosion_small', 'shield_hit', 'impact', 'whiz', 'drone_shot', 'collector', 'reactor_warn', 'reactor_pulse']);
const VARIANTS = {
  impact: [{ surface: 'metal' }, { surface: 'concrete' }, { surface: 'dirt' }],
  footstep: [{ surface: 'dirt' }, { surface: 'metal' }, { surface: 'concrete' }],
  callout: [2, 3, 4, 5, 6, 7, 8].map((level) => ({ level })),
};

// ---- live rig ----
const bus = createBus();
const state = createState();
state.camera = new THREE.PerspectiveCamera(78, 16 / 9, 0.1, 500);
state.camera.position.set(0, 1.7, 0);
state.camera.updateMatrixWorld();
const audio = createAudio(state, bus);

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  state.time += dt;
  audio.update(dt);
  const vc = document.getElementById('voices');
  if (vc) vc.textContent = String(audio.voiceCount);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function frontPos(dist = 8) {
  const p = new THREE.Vector3(0.35, 0, -1).normalize().multiplyScalar(dist);
  return { x: p.x, y: 1.7, z: p.z };
}

function emit(id, extra = {}) {
  bus.emit('audio:unlock');
  const spatialOn = document.getElementById('posToggle')?.checked ?? true;
  const dist = Number(document.getElementById('dist')?.value ?? 8);
  const p = { id, ...extra };
  if (spatialOn && POSITIONAL.has(id) && !p.pos) p.pos = frontPos(dist);
  bus.emit('sfx', p);
}

function setMusic(mood, act) {
  bus.emit('audio:unlock');
  bus.emit('music', { mood, act });
  const el = document.getElementById('nowPlaying');
  if (el) el.textContent = `${mood} / act ${act}`;
}

let orbitTimer = null;
function orbit(seconds = 6) {
  bus.emit('audio:unlock');
  clearInterval(orbitTimer);
  const t0 = performance.now();
  orbitTimer = setInterval(() => {
    const t = (performance.now() - t0) / 1000;
    if (t > seconds) { clearInterval(orbitTimer); return; }
    const a = t * 1.3;
    bus.emit('sfx', { id: 'enemy_rifle', pos: { x: Math.sin(a) * 10, y: 1.7, z: -Math.cos(a) * 10 } });
  }, 140);
}

// ---- offline analysis ----
function stats(buf) {
  let peak = 0;
  let peakAt = 0;
  let sum = 0;
  let n = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const a = Math.abs(d[i]);
      if (a > peak) {
        peak = a;
        peakAt = i / buf.sampleRate;
      }
      sum += d[i] * d[i];
      n++;
    }
  }
  return { peak, peakAt, rms: Math.sqrt(sum / n) };
}

// Sounds start at 0.5 s: Chrome's compressor starts fully clamped and needs
// a moment to release, which would otherwise squash the first transient.
async function renderSfx(id, params = {}, { dynamics = true, seconds = 4.5 } = {}) {
  const sr = 44100;
  const off = new OfflineAudioContext(2, Math.floor(sr * seconds), sr);
  const eng = createEngine(off, { dynamics });
  if (dynamics) eng.setVolumesNow(0.8, 0.9, 0.55);
  else eng.setVolumesNow(1, 1, 1);
  const sp = createSpatial(off);
  const sfx = createSfx(eng, sp);
  const p = { id, ...params };
  if (POSITIONAL.has(id) && !p.pos) p.pos = { x: 1.5, y: 0, z: -6 };
  sfx.play(p, 0.5);
  const buf = await off.startRendering();
  return stats(buf);
}

async function analyzeAll() {
  const out = [];
  for (const id of SFX_IDS) {
    const variants = VARIANTS[id] || [{}];
    for (const v of variants) {
      const game = await renderSfx(id, v);
      const raw = await renderSfx(id, v, { dynamics: false });
      out.push({ id: id + (v.surface ? ':' + v.surface : v.level ? ':' + v.level : ''), peak: +game.peak.toFixed(3), rms: +game.rms.toFixed(4), rawPeak: +raw.peak.toFixed(3) });
    }
  }
  return out;
}

// Worst case: rifle 7/s + arcsmg 12/s + ~28 enemy rifles/s + explosions and
// deaths for 3 s, fired on the offline clock via suspend() so voice caps and
// stealing behave exactly like live play.
async function stress() {
  const sr = 44100;
  const off = new OfflineAudioContext(2, sr * 5, sr);
  const eng = createEngine(off);
  eng.setVolumesNow(1, 1, 1);
  const sp = createSpatial(off);
  const sfx = createSfx(eng, sp);
  let maxVoices = 0;
  const quantum = 128 / sr;
  for (let k = 0; k < 3 * 84; k++) {
    const t = Math.round((k / 84 + 0.01) / quantum) * quantum;
    off.suspend(t).then(() => {
      if (k % 12 === 0) sfx.play({ id: 'rifle' });
      if (k % 7 === 0) sfx.play({ id: 'arcsmg' });
      if (k % 3 === 0) sfx.play({ id: 'enemy_rifle', pos: { x: Math.sin(k) * 8, y: 0, z: Math.cos(k) * 8 } });
      if (k % 40 === 0) sfx.play({ id: 'explosion', pos: { x: 3, y: 0, z: -5 } });
      if (k % 20 === 0) sfx.play({ id: 'enemy_death', pos: { x: -4, y: 0, z: -3 } });
      if (k % 10 === 0) sfx.play({ id: 'shell', pos: { x: 0.3, y: -1, z: -0.5 } });
      if (k % 9 === 0) sfx.play({ id: 'hit' });
      if (k === 120) for (const id of SFX_IDS) sfx.play({ id }); // global cap check
      maxVoices = Math.max(maxVoices, sfx.voiceCount);
      off.resume();
    });
  }
  const buf = await off.startRendering();
  return { ...stats(buf), maxVoices };
}

async function renderMusic(mood, act, seconds = 10, solo = null, bar = 0) {
  const sr = 44100;
  const off = new OfflineAudioContext(2, sr * seconds, sr);
  const eng = createEngine(off);
  eng.setVolumesNow(0.8, 0.9, 0.55);
  const music = createMusic(eng, { manual: true });
  music.update(0, mood === 'boss' ? 1 : 0.8);
  music.set(mood, act);
  music.snap();
  if (solo) music.solo(solo);
  if (bar) music.skipTo(bar);
  music.scheduleUntil(seconds - 0.5);
  const buf = await off.startRendering();
  return stats(buf);
}

async function analyzeMusic() {
  const out = [];
  for (const act of [1, 2, 3]) {
    for (const mood of MOODS) {
      if (mood === 'menu' && act > 1) continue;
      const s = await renderMusic(mood, act);
      out.push({ mood, act, peak: +s.peak.toFixed(3), rms: +s.rms.toFixed(4) });
    }
  }
  return out;
}

// Fire every id (and variant) + every mood through the live bus.
async function smokeLive() {
  bus.emit('audio:unlock');
  for (const id of SFX_IDS) {
    for (const v of VARIANTS[id] || [{}]) emit(id, v);
    emit(id, { pos: { x: 5, y: 1, z: -5 } });
    await new Promise((r) => setTimeout(r, 15));
  }
  bus.emit('sfx', { id: 'definitely_not_a_sound' });
  for (const act of [1, 2, 3]) {
    for (const mood of MOODS) {
      setMusic(mood, act);
      state.run.intensity = Math.random();
      await new Promise((r) => setTimeout(r, 120));
    }
  }
  state.mode = 'paused';
  await new Promise((r) => setTimeout(r, 200));
  state.mode = 'playing';
  return { voices: audio.voiceCount, ctxState: audio.context?.state };
}

window.__lab = { bus, state, audio, emit, setMusic, orbit, renderSfx, renderMusic, analyzeAll, analyzeMusic, stress, smokeLive, ids: SFX_IDS, groups: GROUPS };

// ---- UI ----
function el(tag, attrs = {}, text) {
  const e = document.createElement(tag);
  Object.assign(e, attrs);
  if (text !== undefined) e.textContent = text;
  return e;
}

function buildUi() {
  const root = document.getElementById('app');
  if (!root) return;

  const top = el('section');
  top.append(el('h2', {}, 'Mix'));
  const row = el('div', { className: 'row' });
  const slider = (label, min, max, step, value, on) => {
    const wrap = el('label', {}, label + ' ');
    const s = el('input', { type: 'range', min, max, step, value });
    s.addEventListener('input', () => on(Number(s.value)));
    wrap.append(s);
    row.append(wrap);
    return s;
  };
  slider('master', 0, 1, 0.01, state.settings.volume.master, (v) => { state.settings.volume.master = v; });
  slider('sfx', 0, 1, 0.01, state.settings.volume.sfx, (v) => { state.settings.volume.sfx = v; });
  slider('music', 0, 1, 0.01, state.settings.volume.music, (v) => { state.settings.volume.music = v; });
  slider('intensity', 0, 1, 0.01, 0, (v) => { state.run.intensity = v; });
  const pause = el('label', {}, 'paused ');
  const pc = el('input', { type: 'checkbox' });
  pc.addEventListener('change', () => { state.mode = pc.checked ? 'paused' : 'playing'; });
  pause.append(pc);
  row.append(pause);
  const pos = el('label', {}, 'positional ');
  pos.append(el('input', { type: 'checkbox', id: 'posToggle', checked: true }));
  row.append(pos);
  const dl = el('label', {}, 'distance ');
  dl.append(el('input', { type: 'range', id: 'dist', min: 1, max: 100, step: 1, value: 8 }));
  row.append(dl);
  row.append(el('span', { className: 'muted' }, 'voices: '), el('span', { id: 'voices' }, '0'));
  top.append(row);
  const orbitBtn = el('button', {}, 'Spatial test: enemy_rifle orbit');
  orbitBtn.onclick = () => orbit();
  top.append(orbitBtn);
  root.append(top);

  const ms = el('section');
  ms.append(el('h2', {}, 'Music'), el('p', { className: 'muted' }, 'Now: '));
  ms.lastChild.append(el('span', { id: 'nowPlaying' }, 'silent'));
  for (const act of [1, 2, 3]) {
    const r = el('div', { className: 'row' });
    r.append(el('strong', {}, `Act ${act}`));
    for (const mood of MOODS) {
      const b = el('button', {}, mood);
      b.onclick = () => setMusic(mood, act);
      r.append(b);
    }
    ms.append(r);
  }
  root.append(ms);

  for (const [name, ids] of Object.entries(GROUPS)) {
    const s = el('section');
    s.append(el('h2', {}, name));
    const r = el('div', { className: 'grid' });
    for (const id of ids) {
      for (const v of VARIANTS[id] || [{}]) {
        const label = id + (v.surface ? ` (${v.surface})` : v.level ? ` ${v.level}` : '');
        const b = el('button', {}, label);
        b.onclick = () => emit(id, v);
        if (id === 'ui_hover') b.onmouseenter = () => emit(id);
        r.append(b);
      }
    }
    s.append(r);
    root.append(s);
  }

  const an = el('section');
  an.append(el('h2', {}, 'Analysis'));
  const pre = el('pre', { id: 'report' });
  const ab = el('button', {}, 'Analyze all sfx (offline)');
  ab.onclick = async () => {
    pre.textContent = 'rendering…';
    const r = await analyzeAll();
    pre.textContent = r.map((x) => `${x.id.padEnd(22)} peak ${x.peak.toFixed(3)}  raw ${x.rawPeak.toFixed(3)}  rms ${x.rms.toFixed(4)}`).join('\n');
  };
  const mb = el('button', {}, 'Analyze music (offline)');
  mb.onclick = async () => {
    pre.textContent = 'rendering…';
    const r = await analyzeMusic();
    pre.textContent = r.map((x) => `act ${x.act} ${x.mood.padEnd(11)} peak ${x.peak.toFixed(3)}  rms ${x.rms.toFixed(4)}`).join('\n');
  };
  an.append(ab, mb, pre);
  root.append(an);
}

buildUi();
