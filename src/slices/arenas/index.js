import * as THREE from 'three';
import { CollisionWorld } from '../../core/collide.js';
import { createKit } from './kit.js';
import { buildOutpost, OUTPOST } from './outpost.js';
import { buildRefinery, REFINERY } from './refinery.js';
import { buildReactor, REACTOR } from './reactor.js';

// Arenas slice: builds the current act's arena (visuals + collision),
// publishes state.world, keeps the sun's shadow frustum centred on the
// player and runs ambient animation.
//
// Listens: arena:load { id }
// Emits:   arena:ready (state.world)

const ARENAS = {
  outpost: { def: OUTPOST, build: buildOutpost },
  refinery: { def: REFINERY, build: buildRefinery },
  reactor: { def: REACTOR, build: buildReactor },
};
export const ARENA_ORDER = ['outpost', 'refinery', 'reactor'];

export function createArenas(state, bus) {
  let root = null;
  let info = null;

  function unload() {
    if (!root) return;
    state.scene.remove(root);
    root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        // textures are memoised across loads (see textures.js) — only materials go
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
      }
    });
    if (state.scene.environment) state.scene.environment.dispose();
    root = null;
  }

  function load(id) {
    const entry = ARENAS[id] || ARENAS.outpost;
    unload();
    root = new THREE.Group();
    root.name = `arena-${id}`;
    state.scene.add(root);
    const collision = new CollisionWorld(64, 4);
    const kit = createKit(root, collision);
    let seed = 1234;
    const rng = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const ctx = { scene: root, realScene: state.scene, renderer: state.renderer, kit, rng, emitters: [] };
    info = entry.build(ctx);
    pulseT = 0;
    // one fixed shadow frustum over the whole arena, baked once (render slice)
    if (info.sun) {
      const b = info.bounds;
      const half = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) / 2 + 2;
      const sc = info.sun.shadow.camera;
      sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half;
      sc.near = 1; sc.far = 320;
      sc.updateProjectionMatrix();
      info.sun.target.position.set(0, 0, 0);
      info.sun.position.copy(info.sunDir).multiplyScalar(150);
      info.sun.target.updateMatrixWorld();
      info.sun.updateMatrixWorld();
    }
    base = null;
    kit.finish();

    const floorSurface = info.floorSurface || 'dirt';
    state.world = {
      id,
      name: entry.def.name,
      collision,
      spawnPoints: info.spawnPoints,
      playerSpawn: info.playerSpawn,
      hazards: info.hazards || [],
      jumpPads: info.jumpPads || [],
      emitters: ctx.emitters,
      bounds: info.bounds,
      env: info.env,
      music: info.music,
      shadowLights: info.shadowLights,
      pulse: info.pulse || null,
      // footstep / impact surface of whatever is under (x, feetY, z)
      surfaceAt(x, feetY, z) {
        const list = collision.query(x - 0.2, z - 0.2, x + 0.2, z + 0.2);
        let best = null, bestTop = -Infinity;
        for (const c of list) {
          if (c.maxY > feetY + 0.15 || c.maxY < feetY - 0.4) continue;
          if (c.maxY > bestTop) { bestTop = c.maxY; best = c; }
        }
        return best ? best.tag : floorSurface;
      },
    };
    bus.emit('arena:ready', state.world);
  }

  bus.on('arena:load', ({ id }) => load(id));

  // wave mutators that change the look of the arena
  let base = null;
  function captureBase() {
    const f = state.scene.fog;
    base = {
      fogColor: f.color.getHex(), near: f.near, far: f.far, bg: state.scene.background.getHex(),
      hemi: info.hemi?.intensity ?? 1, sun: info.sun?.intensity ?? 1, env: state.scene.environmentIntensity,
    };
  }
  function applyMutator(id) {
    if (!info) return;
    if (!base) captureBase();
    const f = state.scene.fog;
    f.color.setHex(base.fogColor); f.near = base.near; f.far = base.far;
    state.scene.background.setHex(base.bg);
    if (info.hemi) info.hemi.intensity = base.hemi;
    if (info.sun) info.sun.intensity = base.sun;
    state.scene.environmentIntensity = base.env;
    if (info.sky) info.sky.dome.visible = !(id === 'fog' || id === 'blackout');
    if (id === 'fog') {
      f.color.setHex(0x8a8f96); f.near = 3; f.far = 30;
      state.scene.background.setHex(0x8a8f96);
    } else if (id === 'blackout') {
      if (info.hemi) info.hemi.intensity = base.hemi * 0.18;
      if (info.sun) info.sun.intensity = base.sun * 0.12;
      state.scene.environmentIntensity = base.env * 0.25;
      f.color.setHex(0x05070c); f.near = 20; f.far = 90;
      state.scene.background.setHex(0x05070c);
    }
  }
  bus.on('mutator', ({ id }) => applyMutator(id));

  // ---- the Reactor Core pulse: charge (telegraph) → floor shockwave ----
  let pulseT = 0;
  let charging = -1;
  function updatePulse(dt) {
    const P = info.pulse;
    if (!P) return;
    const live = state.mode === 'playing' && state.run.waveState === 'active';
    if (!live) {
      P.chargeK = Math.max(0, (P.chargeK || 0) - dt);
      charging = -1;
      if (pulseT <= 0) pulseT = P.interval[0] * 0.6;
      return;
    }
    if (charging < 0) {
      pulseT -= dt;
      if (pulseT <= 0) {
        charging = 0;
        bus.emit('sfx', { id: 'reactor_warn', pos: { x: P.x, y: 6, z: P.z } });
        bus.emit('hud:warn', { text: '⚠ REACTOR PULSE — GET OFF THE FLOOR ⚠' });
        bus.emit('hud:banner', { title: 'REACTOR CRITICAL', sub: 'CLIMB OR JUMP THE PULSE', color: '#7ff0ff' });
      }
      return;
    }
    charging += dt;
    P.chargeK = Math.min(1, charging / P.charge);
    if (charging >= P.charge) {
      charging = -1;
      P.chargeK = 0;
      pulseT = P.interval[0] + Math.random() * (P.interval[1] - P.interval[0]);
      bus.emit('sfx', { id: 'reactor_pulse', pos: { x: P.x, y: 2, z: P.z } });
      bus.emit('fx:ring', { pos: { x: P.x, y: 0.05, z: P.z }, radius: P.radius, color: 0x7ff0ff, life: 0.7, grow: true });
      bus.emit('fx:ring', { pos: { x: P.x, y: 0.4, z: P.z }, radius: P.radius * 0.9, color: 0xffffff, life: 0.5, grow: true });
      bus.emit('shake', 0.6);
      bus.emit('aberration', 0.8);
      const pl = state.player;
      const feet = pl.pos.y - pl.eye;
      if (feet < P.below && pl.onGround && Math.hypot(pl.pos.x - P.x, pl.pos.z - P.z) < P.radius) {
        bus.emit('damage:player', { amount: P.dmgPlayer, kind: 'shock', from: { x: P.x, y: 1, z: P.z } });
      }
      for (const e of state.enemies.list) {
        if (!e.alive || e.cfg.fly || e.pos.y >= P.below) continue;
        if (Math.hypot(e.pos.x - P.x, e.pos.z - P.z) > P.radius) continue;
        const amt = e.boss ? Math.round(e.maxHp * 0.04) : P.dmgEnemy;
        bus.emit('damage:enemy', { enemy: e, amount: amt, part: 'body', source: 'reactor', point: e.center, depth: 1, stagger: true });
      }
    }
  }

  const snap = new THREE.Vector3();
  return {
    load,
    update(dt) {
      if (!info) return;
      const p = state.player.pos;
      void p; void snap;
      if (info.sky && state.camera) info.sky.update(dt, state.camera.position);
      for (const u of info.updaters) u(dt);
      updatePulse(dt);
    },
  };
}
