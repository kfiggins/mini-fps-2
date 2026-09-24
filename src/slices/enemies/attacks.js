import * as THREE from 'three';
import { raySphere } from '../../core/collide.js';

// Everything enemies throw at the player: hitscan bursts (with visible
// tracers and near-miss whizzes), sniper lasers, orbs, homing missiles,
// mortar globs that leave burning ground, artillery telegraphs, boss slam
// shockwaves and flamethrower cones. The player's Bubble Shield
// (state.abilities.shield) eats anything that enters it first.

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();

export function createAttacks(state, bus, scene) {
  const orbs = [];
  const missiles = [];
  const globs = [];
  const strikes = [];
  const waves = [];
  const patches = [];

  const orbGeo = new THREE.SphereGeometry(0.28, 14, 10);
  const orbCore = new THREE.SphereGeometry(0.14, 10, 8);
  const missileGeo = new THREE.ConeGeometry(0.12, 0.6, 8);
  missileGeo.rotateX(Math.PI / 2);
  const globGeo = new THREE.IcosahedronGeometry(0.3, 1);
  const ringGeo = new THREE.RingGeometry(0.92, 1, 48);
  ringGeo.rotateX(-Math.PI / 2);
  const discGeo = new THREE.CircleGeometry(1, 40);
  discGeo.rotateX(-Math.PI / 2);
  const laserGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
  laserGeo.rotateX(Math.PI / 2);
  laserGeo.translate(0, 0, 0.5);

  const glowMat = (color, opacity = 1) => {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
    m.toneMapped = false;
    return m;
  };

  function playerChest(out) {
    const p = state.player;
    return out.set(p.pos.x, p.pos.y - (p.inMech ? 1.6 : 0.4), p.pos.z);
  }
  const playerR = () => (state.player.inMech ? 1.4 : 0.5);

  // Does the segment enter the player's bubble shield before `maxT`?
  function shieldT(o, d, maxT) {
    const sh = state.abilities?.shield;
    if (!sh) return -1;
    const dx = o.x - sh.x, dy = o.y - sh.y, dz = o.z - sh.z;
    if (dx * dx + dy * dy + dz * dz < sh.r * sh.r) return -1; // fired from inside
    const t = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, sh.x, sh.y, sh.z, sh.r);
    return t >= 0 && t < maxT ? t : -1;
  }

  function hurt(amount, kind, from, source) {
    bus.emit('damage:player', { amount, kind, from: { x: from.x, y: from.y, z: from.z }, source });
  }

  // ---- hitscan shot from a muzzle along a direction ----
  function hitscan(e, muzzle, dir, dmg, kind = 'shot', color = 0xff7a5c) {
    const col = state.world.collision;
    let maxT = 90;
    if (col.raycast(muzzle.x, muzzle.y, muzzle.z, dir.x, dir.y, dir.z, 90)) maxT = col.hit.t;
    const chest = playerChest(_c);
    const st = shieldT(muzzle, dir, maxT);
    let endT = maxT;
    let hitPlayer = false;
    if (st >= 0) {
      endT = st;
      bus.emit('shield:hit', { amount: dmg, point: { x: muzzle.x + dir.x * st, y: muzzle.y + dir.y * st, z: muzzle.z + dir.z * st } });
    } else {
      const t = raySphere(muzzle.x, muzzle.y, muzzle.z, dir.x, dir.y, dir.z, chest.x, chest.y, chest.z, playerR());
      if (t >= 0 && t < maxT) {
        hitPlayer = true;
        endT = t;
        hurt(dmg, kind, muzzle, e);
      } else {
        // near miss whiz
        const toP = _b.set(chest.x - muzzle.x, chest.y - muzzle.y, chest.z - muzzle.z);
        const along = toP.dot(dir);
        if (along > 0 && along < maxT) {
          _a.copy(dir).multiplyScalar(along).add(muzzle);
          if (_a.distanceTo(chest) < 2.2) bus.emit('sfx', { id: 'whiz', pos: { x: _a.x, y: _a.y, z: _a.z }, vol: 0.7 });
        }
      }
    }
    const end = { x: muzzle.x + dir.x * endT, y: muzzle.y + dir.y * endT, z: muzzle.z + dir.z * endT };
    bus.emit('fx:tracer', { from: { x: muzzle.x, y: muzzle.y, z: muzzle.z }, to: end, color, width: kind === 'sniper' ? 2.5 : kind === 'heavy' ? 2 : 1.2, enemy: true });
    if (!hitPlayer && st < 0 && endT < maxT + 0.01 && maxT < 90) {
      bus.emit('fx:impact', { pos: end, normal: { x: col.hit.nx, y: col.hit.ny, z: col.hit.nz }, surface: 'metal', small: true });
    }
    bus.emit('light', { pos: muzzle, color: 0xff8855, intensity: 6, dist: 6, life: 0.06 });
    return hitPlayer;
  }

  function orb(e, from, dir, cfg) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(orbGeo, glowMat(e.rig.mats.glow.color, 0.45)));
    g.add(new THREE.Mesh(orbCore, glowMat(0xffffff, 0.9)));
    g.position.copy(from);
    scene.add(g);
    orbs.push({ mesh: g, v: dir.clone().multiplyScalar(cfg.speed), life: 6, dmg: cfg.dmg, src: e });
  }

  function missile(e, from, cfg) {
    const m = new THREE.Mesh(missileGeo, new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xff5522, emissiveIntensity: 2 }));
    m.position.copy(from);
    scene.add(m);
    const v = new THREE.Vector3((Math.random() - 0.5) * 6, 9 + Math.random() * 3, (Math.random() - 0.5) * 6);
    missiles.push({ mesh: m, v, life: 7, dmg: cfg.dmg, radius: cfg.radius, arm: 0.5, src: e });
    bus.emit('sfx', { id: 'missile_launch', pos: from });
  }

  function glob(e, from, target, cfg) {
    const m = new THREE.Mesh(globGeo, new THREE.MeshStandardMaterial({ color: 0x3a1a08, emissive: 0xff6a1a, emissiveIntensity: 2.5 }));
    m.position.copy(from);
    scene.add(m);
    // ballistic arc that lands on the target in ~1.3s
    const T = 1.1 + Math.random() * 0.4;
    const g = 16;
    const v = new THREE.Vector3((target.x - from.x) / T, (target.y - from.y + 0.5 * g * T * T) / T, (target.z - from.z) / T);
    globs.push({ mesh: m, v, g, cfg, src: e, life: T + 1 });
    bus.emit('sfx', { id: 'lob', pos: from });
  }

  function patch(x, y, z, dps, r, t) {
    const m = new THREE.Mesh(discGeo, glowMat(0xff5a1a, 0.55));
    m.scale.setScalar(r);
    m.position.set(x, y + 0.05, z);
    scene.add(m);
    const ring = new THREE.Mesh(ringGeo, glowMat(0xffb040, 0.8));
    ring.scale.setScalar(r);
    ring.position.set(x, y + 0.06, z);
    scene.add(ring);
    patches.push({ mesh: m, ring, x, y, z, dps, r, t, max: t, tick: 0 });
  }

  function strike(x, y, z, dmg, radius, telegraph, src) {
    const disc = new THREE.Mesh(discGeo, glowMat(0xff2a1a, 0.18));
    disc.scale.setScalar(radius);
    disc.position.set(x, y + 0.05, z);
    const ring = new THREE.Mesh(ringGeo, glowMat(0xff3a2a, 0.9));
    ring.position.set(x, y + 0.07, z);
    ring.scale.setScalar(radius);
    scene.add(disc, ring);
    strikes.push({ disc, ring, x, y, z, dmg, radius, t: telegraph, max: telegraph, src });
  }

  function shockwave(e, cfg) {
    const p = e.pos;
    const ring = new THREE.Mesh(ringGeo, glowMat(e.rig.mats.glow.color, 0.9));
    ring.position.set(p.x, p.y + 0.1, p.z);
    scene.add(ring);
    waves.push({ ring, t: 0, dur: 0.45, radius: cfg.radius });
    bus.emit('sfx', { id: 'shockwave', pos: p });
    bus.emit('shake', 0.4);
    bus.emit('fx:burst', { pos: { x: p.x, y: p.y + 0.3, z: p.z }, color: 0xc8a070, count: 40, speed: 9, life: 0.8, smoke: true });
    const pl = state.player;
    const feet = pl.pos.y - pl.eye;
    const d = Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z);
    if (pl.onGround && d < cfg.radius && Math.abs(feet - p.y) < 2) {
      hurt(cfg.dmg, 'shock', p, e);
      // knock the player away from the slam
      const k = 9 / Math.max(1, d);
      bus.emit('player:velocity', { x: (pl.pos.x - p.x) * k * 0.4, y: 6, z: (pl.pos.z - p.z) * k * 0.4 });
    }
  }

  // continuous flamethrower: damage while the player is in the cone
  function flame(e, muzzle, dir, cfg, dt) {
    bus.emit('fx:flame', { pos: muzzle, dir, range: cfg.range });
    const chest = playerChest(_c);
    const to = _a.copy(chest).sub(muzzle);
    const d = to.length();
    if (d > cfg.range) return;
    to.divideScalar(d);
    if (to.dot(dir) < 0.88) return;
    const st = shieldT(muzzle, to, d);
    if (st >= 0) return bus.emit('shield:hit', { amount: cfg.dps * dt, point: chest });
    if (!state.world.collision.segmentClear(muzzle.x, muzzle.y, muzzle.z, chest.x, chest.y, chest.z)) return;
    e.flameAcc = (e.flameAcc || 0) + cfg.dps * dt;
    if (e.flameAcc >= 4) {
      hurt(e.flameAcc, 'burn', muzzle, e);
      e.flameAcc = 0;
    }
  }

  function explodeAt(pos, dmg, radius, src, color = 0xff6a2a) {
    bus.emit('explode', { pos: { x: pos.x, y: pos.y, z: pos.z }, radius, damage: 0, playerDamage: dmg, hurtsPlayer: true, hurtsEnemies: false, scale: radius / 3.5, color, sourceEnemy: src, enemy: true });
  }

  function stepProj(p, dt, gravity) {
    const col = state.world.collision;
    if (gravity) p.v.y -= gravity * dt;
    const sp = p.v.length();
    const len = sp * dt;
    _a.copy(p.v).divideScalar(sp || 1);
    const pos = p.mesh.position;
    // shield
    const st = shieldT(pos, _a, len);
    if (st >= 0) return 'shield';
    // player
    const chest = playerChest(_c);
    const pt = raySphere(pos.x, pos.y, pos.z, _a.x, _a.y, _a.z, chest.x, chest.y, chest.z, playerR() + 0.2);
    if (pt >= 0 && pt <= len) { pos.addScaledVector(_a, pt); return 'player'; }
    if (col.raycast(pos.x, pos.y, pos.z, _a.x, _a.y, _a.z, len, true)) {
      pos.set(col.hit.x, col.hit.y, col.hit.z);
      return 'world';
    }
    pos.addScaledVector(p.v, dt);
    return null;
  }

  function remove(list, i) {
    const p = list[i];
    scene.remove(p.mesh);
    if (p.mesh.material?.dispose) p.mesh.material.dispose();
    list.splice(i, 1);
  }

  return {
    hitscan, orb, missile, glob, patch, strike, shockwave, flame, explodeAt,

    clear() {
      for (const l of [orbs, missiles, globs]) while (l.length) remove(l, 0);
      for (const s of strikes) scene.remove(s.disc, s.ring);
      for (const w of waves) scene.remove(w.ring);
      for (const p of patches) scene.remove(p.mesh, p.ring);
      strikes.length = waves.length = patches.length = 0;
    },

    update(dt) {
      const pl = state.player;
      const chest = playerChest(new THREE.Vector3());
      for (let i = orbs.length - 1; i >= 0; i--) {
        const o = orbs[i];
        o.life -= dt;
        o.mesh.rotation.y += dt * 4;
        const r = stepProj(o, dt, 0);
        if (r === 'player') hurt(o.dmg, 'orb', o.mesh.position, o.src);
        if (r === 'shield') bus.emit('shield:hit', { amount: o.dmg, point: o.mesh.position.clone() });
        if (r || o.life <= 0) {
          bus.emit('fx:burst', { pos: o.mesh.position.clone(), color: 0xff66ff, count: 12, speed: 4, life: 0.3 });
          remove(orbs, i);
        }
      }
      for (let i = missiles.length - 1; i >= 0; i--) {
        const m = missiles[i];
        m.life -= dt;
        m.arm -= dt;
        // homing — loses lock when the player breaks line of sight
        const p = m.mesh.position;
        if (m.arm <= 0) {
          const see = state.world.collision.segmentClear(p.x, p.y, p.z, chest.x, chest.y, chest.z);
          if (see) {
            _b.copy(chest).sub(p).normalize().multiplyScalar(19);
            m.v.lerp(_b, Math.min(1, dt * 2.2));
          }
        } else {
          m.v.y -= 10 * dt;
        }
        m.mesh.lookAt(_c.copy(p).add(m.v));
        bus.emit('fx:trail', { pos: p, color: 0xff7733 });
        const r = stepProj(m, dt, 0);
        if (r === 'shield') bus.emit('shield:hit', { amount: m.dmg, point: p.clone() });
        if (r || m.life <= 0) {
          if (r !== 'shield') explodeAt(p, m.dmg, m.radius, m.src);
          remove(missiles, i);
        }
      }
      for (let i = globs.length - 1; i >= 0; i--) {
        const g = globs[i];
        g.life -= dt;
        g.mesh.rotation.x += dt * 5;
        const r = stepProj(g, dt, g.g);
        if (r === 'shield') bus.emit('shield:hit', { amount: g.cfg.dmg, point: g.mesh.position.clone() });
        if (r || g.life <= 0) {
          const p = g.mesh.position;
          if (r !== 'shield') {
            explodeAt(p, g.cfg.dmg, 2.4, g.src, 0xff7a1a);
            const floorY = state.world.collision.groundHeight(p.x, p.z, 0.1, p.y + 0.5, 0.6);
            patch(p.x, floorY, p.z, g.cfg.patchDps, g.cfg.patchR, g.cfg.patchT);
          }
          remove(globs, i);
        }
      }
      for (let i = strikes.length - 1; i >= 0; i--) {
        const s = strikes[i];
        s.t -= dt;
        const k = 1 - s.t / s.max;
        s.ring.scale.setScalar(s.radius * (1 - k * 0.85));
        s.disc.material.opacity = 0.12 + k * 0.3;
        if (s.t <= 0) {
          explodeAt({ x: s.x, y: s.y + 0.4, z: s.z }, s.dmg, s.radius, s.src, 0xff5522);
          scene.remove(s.disc, s.ring);
          strikes.splice(i, 1);
        }
      }
      for (let i = waves.length - 1; i >= 0; i--) {
        const w = waves[i];
        w.t += dt;
        const k = w.t / w.dur;
        w.ring.scale.setScalar(0.5 + k * w.radius);
        w.ring.material.opacity = 0.9 * (1 - k);
        if (k >= 1) {
          scene.remove(w.ring);
          waves.splice(i, 1);
        }
      }
      const feet = pl.pos.y - pl.eye;
      for (let i = patches.length - 1; i >= 0; i--) {
        const p = patches[i];
        p.t -= dt;
        p.tick -= dt;
        const fade = Math.min(1, p.t / 0.6);
        p.mesh.material.opacity = 0.5 * fade * (0.85 + Math.sin(state.time * 8 + i) * 0.15);
        p.ring.material.opacity = 0.8 * fade;
        if (Math.random() < dt * 6) bus.emit('fx:ember', { pos: { x: p.x + (Math.random() - 0.5) * p.r, y: p.y + 0.1, z: p.z + (Math.random() - 0.5) * p.r } });
        if (p.tick <= 0 && Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z) < p.r && Math.abs(feet - p.y) < 0.6 && !pl.inMech) {
          p.tick = 0.3;
          hurt(p.dps * 0.3, 'burn', { x: p.x, y: p.y, z: p.z }, null);
        }
        if (p.t <= 0) {
          scene.remove(p.mesh, p.ring);
          patches.splice(i, 1);
        }
      }
    },

    // sniper laser visuals
    makeLaser(color) {
      const m = new THREE.Mesh(laserGeo, glowMat(color, 0.8));
      m.visible = false;
      scene.add(m);
      return m;
    },
    aimLaser(laser, from, to, width, color) {
      laser.visible = true;
      laser.position.copy(from);
      laser.lookAt(to);
      const len = from.distanceTo(to);
      laser.scale.set(width, width, len);
      laser.material.color.setHex(color);
    },
  };
}
