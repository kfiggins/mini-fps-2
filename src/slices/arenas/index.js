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
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          for (const k of ['map', 'normalMap', 'roughnessMap', 'emissiveMap', 'alphaMap']) m[k]?.dispose?.();
          m.dispose();
        }
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
      if (p && info.sun) {
        // keep the shadow frustum on the player, snapped to texels (no shimmer)
        const texel = (info.sun.shadow.camera.right - info.sun.shadow.camera.left) / info.sun.shadow.mapSize.x;
        snap.set(Math.round(p.x / texel) * texel, 0, Math.round(p.z / texel) * texel);
        info.sun.target.position.copy(snap);
        info.sun.position.copy(snap).addScaledVector(info.sunDir, 110);
      }
      if (info.sky && state.camera) info.sky.update(dt, state.camera.position);
      for (const u of info.updaters) u(dt);
      updatePulse(dt);
    },
  };
}
