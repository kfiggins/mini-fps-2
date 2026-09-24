// Audio slice entry point. Listens on the bus for `audio:unlock`, `sfx` and
// `music`; each frame syncs the listener to the camera, applies volume
// settings, ducks music while paused and feeds combat intensity to the music.
// Everything is synthesized — no asset files.
//
//   const audio = createAudio(state, bus);
//   bus.emit('audio:unlock');                 // inside a click handler
//   bus.emit('sfx', { id: 'rifle' });
//   bus.emit('sfx', { id: 'explosion', pos: { x, y, z } });
//   bus.emit('music', { mood: 'combat', act: 1 });
//   audio.update(dt);                         // every frame

import { createEngine } from './engine.js';
import { createSpatial } from './spatial.js';
import { createSfx } from './sfx.js';
import { createMusic } from './music.js';

export function createAudio(state, bus) {
  let ctx = null;
  let eng = null;
  let spatial = null;
  let sfx = null;
  let music = null;
  let pendingMusic = null;

  function init() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    ctx = new Ctx({ latencyHint: 'interactive' });
    eng = createEngine(ctx);
    spatial = createSpatial(ctx);
    sfx = createSfx(eng, spatial, { dev: !!import.meta.env?.DEV });
    music = createMusic(eng);
    applySettings();
    if (pendingMusic) music.set(pendingMusic.mood, pendingMusic.act);
  }

  function applySettings() {
    const v = state.settings?.volume || { master: 0.8, sfx: 0.9, music: 0.55 };
    eng.setVolumes(v.master ?? 0.8, v.sfx ?? 0.9, v.music ?? 0.55, state.mode === 'paused');
  }

  bus.on('audio:unlock', () => {
    if (!ctx) init();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  });

  // The victory/defeat fanfare exists both as an sfx and as a music stinger;
  // if both fire together only the first one plays (they'd clash in key).
  const lastFanfare = { victory: -99, defeat: -99 };
  function fanfareClaimed(kind) {
    const now = ctx.currentTime;
    if (now - lastFanfare[kind] < 2.5) return true;
    lastFanfare[kind] = now;
    return false;
  }

  bus.on('sfx', (p) => {
    if (!sfx || !p || !p.id) return;
    if ((p.id === 'victory' || p.id === 'defeat') && fanfareClaimed(p.id)) return;
    sfx.play(p);
  });

  bus.on('music', (p) => {
    if (!p) return;
    pendingMusic = { mood: p.mood, act: p.act ?? pendingMusic?.act };
    if (!music) return;
    const fanfare = (p.mood === 'victory' || p.mood === 'defeat') && music.mood !== p.mood;
    music.set(p.mood, p.act, { stinger: fanfare ? !fanfareClaimed(p.mood) : true });
  });

  return {
    update(dt) {
      if (!eng) return;
      spatial.update(state.camera);
      applySettings();
      music.update(dt, state.run?.intensity ?? 0);
      sfx.update();
    },
    // Debug / lab introspection (not part of the gameplay contract).
    get context() { return ctx; },
    get voiceCount() { return sfx ? sfx.voiceCount : 0; },
    dispose() {
      if (music) music.dispose();
      if (ctx) ctx.close();
      ctx = eng = spatial = sfx = music = null;
    },
  };
}
