import * as THREE from 'three';
import { raySphere } from '../../core/collide.js';
import { WEAPONS, STARTING_SLOTS, GRENADE } from './defs.js';
import { Viewmodel } from './viewmodel.js';

// Weapons slice: firing, hit detection (world + enemy hitboxes), damage
// math, proc effects, ADS/zoom, reloads (holstered guns reload themselves),
// weapon swaps, grenades and launcher shells.
//
// Listens: run:start, key, keyup, wheel, enemy:killed, weapon:give,
//          player:landed, pickup, shop:buy, mech:enter, mech:exit, build:changed
// Emits:   damage:enemy, explode, recoil, sfx, light, fx:tracer, fx:impact,
//          fx:beam, shot:result, hud:feed
// Reads:   state.stats, state.enemies.list, state.abilities, state.player

const LONGSHOT = 25;
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _m = new THREE.Vector3();
const _end = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _tmp = new THREE.Vector3();

export function createWeapons(state, bus) {
  const W = state.weapons;
  state.weaponDefs = WEAPONS;
  const vm = new Viewmodel(state.viewScene, state.viewCamera);
  let fireCd = 0;
  let reloadT = 0;
  let reloadDur = 1;
  let adsT = 0;
  let shotCounter = 0;
  let charge = 0;
  let chargeSfx = false;
  let bloom = 0; // accumulated spread from sustained fire
  let firedThisPress = false;
  const holster = {}; // weapon id -> seconds holstered
  const grenadesLive = [];
  const shells = [];

  // shared meshes
  const grenadeGeo = new THREE.SphereGeometry(0.11, 12, 10);
  const grenadeMat = new THREE.MeshStandardMaterial({ color: 0x2f3b2a, roughness: 0.5, metalness: 0.5, emissive: 0xff3322, emissiveIntensity: 0.6 });
  const shellGeo = new THREE.CapsuleGeometry(0.06, 0.12, 4, 8);
  shellGeo.rotateX(Math.PI / 2);
  const shellMat = new THREE.MeshStandardMaterial({ color: 0x4a4032, roughness: 0.5, metalness: 0.6, emissive: 0xffa62b, emissiveIntensity: 1.2 });

  const weapon = () => WEAPONS[W.current];
  const stats = () => state.stats || {};

  function magSize(id = W.current) {
    const w = WEAPONS[id];
    const s = stats();
    return Math.max(1, Math.round(w.mag * (s.magMult || 1)) + (s.magFlat || 0));
  }

  function resetRun() {
    W.slots = [...STARTING_SLOTS];
    W.current = W.slots[0];
    W.ammo = {};
    for (const id of Object.keys(WEAPONS)) W.ammo[id] = WEAPONS[id].mag;
    W.grenades = 1;
    W.grenadeMax = GRENADE.max;
    W.grenadeCharge = -1;
    W.shots = W.hits = W.thrown = 0;
    W.reloading = false;
    W.ads = 0;
    W.scoped = false;
    W.charge = 0;
    fireCd = 0;
    shotCounter = 0;
    for (const g of grenadesLive) state.scene.remove(g.mesh);
    for (const g of shells) state.scene.remove(g.mesh);
    grenadesLive.length = 0;
    shells.length = 0;
    vm.equip(W.current, true);
    vm.setGold(false);
  }

  function switchTo(id) {
    if (!id || id === W.current || state.player.inMech) return;
    holster[W.current] = 0;
    W.current = id;
    W.reloading = false;
    vm.reloadP = -1;
    charge = 0;
    fireCd = Math.max(fireCd, 0.26);
    vm.equip(id);
    bus.emit('sfx', { id: 'weapon_switch' });
  }

  function startReload() {
    if (W.reloading || W.ammo[W.current] >= magSize() || state.player.inMech) return;
    const s = stats();
    if (state.abilities?.overclock) {
      W.ammo[W.current] = magSize();
      bus.emit('sfx', { id: 'reload_end' });
      return;
    }
    W.reloading = true;
    reloadDur = weapon().reload / (s.reloadMult || 1);
    reloadT = 0;
    charge = 0;
    bus.emit('sfx', { id: 'reload_start' });
  }

  // ---- damage math ----
  function shotDamage(w, part, dist, enemy) {
    const s = stats();
    let dmg = part === 'head' || part === 'weak' ? w.head * (s.headshotMult || 1) : w.body;
    dmg *= (s.damageMult || 1) * (s.tempDamage || 1) * ((s.weaponMult && s.weaponMult[w.id]) || 1);
    if (dist > LONGSHOT) dmg *= (s.longshotMult || 1) * (part === 'head' ? s.longHeadMult || 1 : 1);
    if (enemy.hp < enemy.maxHp * 0.3) dmg *= s.executionerMult || 1;
    if (enemy.boss) dmg *= s.bossSlayer || 1;
    if (w.bigGame && (enemy.boss || enemy.elite)) dmg *= w.bigGame;
    const feet = state.player.pos.y - state.player.eye;
    if (feet - enemy.pos.y > 1.5) dmg *= s.highGround || 1;
    if (w.falloff) {
      const [near, far, min] = w.falloff;
      if (dist > near) dmg *= Math.max(min, 1 - ((dist - near) / (far - near)) * (1 - min));
    }
    // Execution synergy: headshots finish off weakened non-bosses
    if (s.executeHeadshot && part === 'head' && !enemy.boss && enemy.hp < enemy.maxHp * 0.3) dmg = Math.max(dmg, enemy.hp + 1);
    return Math.max(1, Math.round(dmg));
  }

  // nearest living enemy to a point (excluding a set)
  function nearestEnemy(x, y, z, range, exclude) {
    let best = null, bd = range * range;
    for (const e of state.enemies.list) {
      if (!e.alive || exclude?.has(e)) continue;
      const dx = e.center.x - x, dy = e.center.y - y, dz = e.center.z - z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // ray vs enemy hitboxes, sorted by distance, stopping at maxT
  function rayEnemies(o, d, maxT, out) {
    out.length = 0;
    for (const e of state.enemies.list) {
      if (!e.alive || e.untargetable) continue;
      const b = e.bound;
      if (raySphere(o.x, o.y, o.z, d.x, d.y, d.z, b.x, b.y, b.z, b.r) < 0) continue;
      let bestT = Infinity, bestPart = null;
      for (const h of e.hitboxes) {
        const t = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, h.x, h.y, h.z, h.r);
        if (t >= 0 && t < bestT) { bestT = t; bestPart = h.part; }
      }
      if (bestT < maxT) out.push({ e, t: bestT, part: bestPart });
    }
    out.sort((a, b) => a.t - b.t);
    return out;
  }
  const hitsBuf = [];

  // proc effects that ride on a hit (scaled off the hit's damage)
  function procs(w, enemy, dmg, point, seen) {
    const s = stats();
    if (w.arc) {
      let from = enemy;
      const hit = new Set(seen);
      for (let n = 0; n < (s.arcChains || 1); n++) {
        const t = nearestEnemy(from.center.x, from.center.y, from.center.z, w.arc.range, hit);
        if (!t) break;
        hit.add(t);
        bus.emit('fx:arc', { from: from.center, to: t.center, color: 0x66e0ff });
        bus.emit('damage:enemy', { enemy: t, amount: Math.round(dmg * w.arc.frac), part: 'body', source: w.id, point: t.center, depth: 1 });
        from = t;
      }
    }
    if (s.ricochet) {
      const t = nearestEnemy(enemy.center.x, enemy.center.y, enemy.center.z, 10, seen);
      if (t) {
        bus.emit('fx:tracer', { from: point, to: t.center, color: 0xffe08a });
        bus.emit('damage:enemy', { enemy: t, amount: Math.round(dmg * 0.5 * s.ricochet), part: 'body', source: 'ricochet', point: t.center, depth: 1 });
      }
    }
    if (s.explosive) {
      bus.emit('explode', {
        pos: point, radius: 2.6 * (s.blastRadius || 1), damage: Math.round(dmg * 0.4 * s.explosive), source: 'explosive',
        hurtsPlayer: false, scale: 0.45, color: 0xff8833, exclude: enemy,
      });
    }
  }

  function fire() {
    const w = weapon();
    const s = stats();
    const cam = state.camera;
    cam.updateMatrixWorld(true);
    cam.getWorldPosition(_o);
    cam.getWorldDirection(_d);
    vm.muzzleWorld(_m);
    cam.localToWorld(_m);

    shotCounter++;
    const free = s.doubleTap && shotCounter % (s.doubleTapEvery || 4) === 0;
    if (!free) W.ammo[W.current]--;
    W.shots = (W.shots || 0) + 1;

    const recoilMul = 1 - adsT * 0.35;
    bus.emit('recoil', { pitch: w.recoil[0] * recoilMul, yaw: (Math.random() - 0.5) * 2 * w.recoil[1] * recoilMul });
    vm.kick(w.recoil[0] * 1.3, (Math.random() - 0.5) * w.recoil[1] * 4, 0.5 + w.recoil[0] * 6);
    if (w.pump || w.bolt) vm.pumpT = 1.4;
    if (w.projectile) vm.pumpT = 1;
    vm.ejectCasing(w.casing);
    bus.emit('sfx', { id: w.sound });
    bus.emit('light', { pos: _m, color: w.id === 'arcsmg' ? 0x66ddff : w.id === 'rail' ? 0xa88bff : 0xffb060, intensity: 14, dist: 8, life: 0.07 });
    if (w.id === 'marksman' || w.id === 'rail' || w.id === 'scattergun') bus.emit('shake', 0.12);

    if (w.projectile) {
      launchShell(w, _o, _d);
      return;
    }

    // spread: base + movement + sustained-fire bloom, tightened by ADS
    const moving = Math.min(1, Math.hypot(state.player.vel.x, state.player.vel.z) / 7);
    const hip = w.spread + w.moveSpread * moving + bloom + (state.player.onGround ? 0 : 0.02);
    const spread = (adsT > 0.5 ? (w.adsSpread ?? w.spread * 0.15) + bloom * 0.3 : hip) * (w.id === 'scattergun' ? s.scatterChoke || 1 : 1);
    bloom = Math.min(0.03, bloom + w.spread * 0.35);
    _right.setFromMatrixColumn(cam.matrixWorld, 0);
    _up.setFromMatrixColumn(cam.matrixWorld, 1);

    const col = state.world.collision;
    const pierce = (w.pierce || 0) + (s.pierce || 0) + ((s.weaponPierce && s.weaponPierce[w.id]) || 0);
    let anyHit = false, anyHead = false, anyKill = false;
    const seen = new Set();
    let firstImpact = null;
    let totalDealt = 0;
    const stagger = !!w.stagger;
    for (let p = 0; p < w.pellets; p++) {
      const dir = _tmp.copy(_d);
      if (spread > 0) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * spread;
        dir.addScaledVector(_right, Math.cos(a) * r).addScaledVector(_up, Math.sin(a) * r).normalize();
      }
      let maxT = 220;
      let worldHit = false;
      let nx = 0, ny = 1, nz = 0, surface = 'concrete';
      if (col.raycast(_o.x, _o.y, _o.z, dir.x, dir.y, dir.z, 220)) {
        maxT = col.hit.t;
        worldHit = true;
        nx = col.hit.nx; ny = col.hit.ny; nz = col.hit.nz;
        surface = col.hit.c ? col.hit.c.tag : state.world.surfaceAt?.(col.hit.x, col.hit.y, col.hit.z) || 'dirt';
      }
      const hits = rayEnemies(_o, dir, maxT, hitsBuf);
      let endT = maxT;
      let pierced = 0;
      for (const h of hits) {
        const e = h.e;
        const point = { x: _o.x + dir.x * h.t, y: _o.y + dir.y * h.t, z: _o.z + dir.z * h.t };
        if (h.part === 'shield') {
          // energy shields eat the round unless it pierces
          bus.emit('damage:enemy', { enemy: e, amount: shotDamage(w, 'body', h.t, e), part: 'shield', source: w.id, point, dir: { x: dir.x, y: dir.y, z: dir.z } });
          if (pierced >= pierce) { endT = h.t; break; }
          pierced++;
          continue;
        }
        const dmg = shotDamage(w, h.part, h.t, e);
        const first = !seen.has(e);
        seen.add(e);
        const res = { killed: false };
        bus.emit('damage:enemy', {
          enemy: e, amount: dmg, part: h.part, source: w.id, point,
          dir: { x: dir.x, y: dir.y, z: dir.z }, stagger, result: res,
        });
        totalDealt += dmg;
        anyHit = true;
        if (h.part === 'head' || h.part === 'weak') anyHead = true;
        if (res.killed) anyKill = true;
        if (first) procs(w, e, dmg, point, seen);
        if (pierced >= pierce) { endT = h.t; break; }
        pierced++;
      }
      _end.copy(_o).addScaledVector(dir, Math.min(endT, 150));
      if (endT === maxT && worldHit) {
        const ip = { x: _end.x, y: _end.y, z: _end.z };
        bus.emit('fx:impact', { pos: ip, normal: { x: nx, y: ny, z: nz }, surface, small: w.pellets > 1 });
        if (!firstImpact) firstImpact = ip;
        if (p === 0 && Math.random() < 0.35) bus.emit('sfx', { id: 'impact', pos: ip, surface, vol: 0.5 });
      }
      if (w.tracer && (p % 2 === 0 || w.pellets === 1)) {
        if (w.id === 'rail') bus.emit('fx:beam', { from: _m.clone(), to: _end.clone(), color: w.tracer });
        else bus.emit('fx:tracer', { from: _m.clone(), to: _end.clone(), color: w.tracer, width: w.id === 'marksman' ? 2 : 1 });
      }
    }
    // explosive rounds also pop on bare walls
    if (s.explosive && !anyHit && firstImpact) {
      const base = shotDamage(w, 'body', 10, { hp: 1, maxHp: 1, pos: { y: 0 } });
      bus.emit('explode', { pos: firstImpact, radius: 2.6 * (s.blastRadius || 1), damage: Math.round(base * 0.4 * s.explosive), source: 'explosive', hurtsPlayer: false, scale: 0.45, color: 0xff8833 });
    }
    if (anyHit) {
      W.hits = (W.hits || 0) + 1;
      bus.emit('shot:result', { head: anyHead, kill: anyKill, dealt: totalDealt });
      // a whisper of hit-stop sells headshot kills
      if (anyHead && anyKill) bus.emit('hitstop', { duration: 0.045, scale: 0.15 });
      bus.emit('sfx', { id: anyHead ? 'headshot' : 'hit', vol: anyHead ? 0.9 : 0.6 });
    }
  }

  function launchShell(w, o, d) {
    const mesh = new THREE.Mesh(shellGeo, shellMat);
    mesh.position.copy(o).addScaledVector(d, 0.8);
    mesh.position.y -= 0.12;
    state.scene.add(mesh);
    const v = d.clone().multiplyScalar(w.projectile.speed);
    v.y += 2;
    shells.push({ mesh, v, life: 4, w, arm: 0.05 });
  }

  function explodeShell(sh, directEnemy) {
    const w = sh.w;
    const s = stats();
    const mult = (s.damageMult || 1) * (s.tempDamage || 1) * ((s.weaponMult && s.weaponMult[w.id]) || 1);
    if (directEnemy) {
      bus.emit('damage:enemy', { enemy: directEnemy, amount: Math.round(w.projectile.dmg * 0.5 * mult), part: 'body', source: w.id, point: directEnemy.center });
    }
    bus.emit('explode', {
      pos: sh.mesh.position.clone(), radius: w.projectile.radius * (s.blastRadius || 1) * (s.launcherRadius || 1),
      damage: Math.round(w.projectile.dmg * mult), source: w.id, hurtsPlayer: false, scale: 1.2, color: 0xffaa33,
    });
    state.scene.remove(sh.mesh);
  }

  // ---- grenades ----
  function throwGrenade(power, cluster = false, from = null, vel = null) {
    const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
    let v;
    if (from) {
      mesh.position.copy(from);
      v = vel;
    } else {
      const cam = state.camera;
      cam.getWorldPosition(_o);
      cam.getWorldDirection(_d);
      mesh.position.copy(_o).addScaledVector(_d, 0.5);
      mesh.position.y -= 0.2;
      const speed = GRENADE.minSpeed + (GRENADE.maxSpeed - GRENADE.minSpeed) * power;
      v = _d.clone().multiplyScalar(speed);
      v.y += 3.5 + speed * 0.08;
      v.x += state.player.vel.x * 0.5;
      v.z += state.player.vel.z * 0.5;
      bus.emit('sfx', { id: 'grenade_throw' });
      W.thrown = (W.thrown || 0) + 1;
    }
    mesh.castShadow = true;
    state.scene.add(mesh);
    grenadesLive.push({ mesh, v, fuse: cluster ? 0.9 + Math.random() * 0.3 : GRENADE.fuse, cluster, bounces: 0 });
  }

  function explodeGrenade(g) {
    const s = stats();
    const mult = s.grenadeDmgMult || 1;
    bus.emit('explode', {
      pos: g.mesh.position.clone(),
      radius: (g.cluster ? GRENADE.clusterRadius : GRENADE.radius) * (s.blastRadius || 1),
      damage: Math.round((g.cluster ? GRENADE.clusterDamage : GRENADE.damage) * mult * (s.tempDamage || 1)),
      source: 'grenade', hurtsPlayer: false, scale: g.cluster ? 0.9 : 1.6, color: 0xffaa22,
    });
    state.scene.remove(g.mesh);
    if (!g.cluster && s.clusterBombs) {
      const n = s.clusterCount || 3;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random();
        throwGrenade(0, true, g.mesh.position.clone().setY(g.mesh.position.y + 0.3), new THREE.Vector3(Math.cos(a) * 5, 6, Math.sin(a) * 5));
      }
    }
  }

  // integrate a ballistic body against the world; returns true on contact
  function stepBody(b, dt, gravity, bounce) {
    const col = state.world.collision;
    b.v.y -= gravity * dt;
    const sp = b.v.length();
    const stepLen = sp * dt;
    if (stepLen > 1e-5) {
      _d.copy(b.v).divideScalar(sp);
      const p = b.mesh.position;
      if (col.raycast(p.x, p.y, p.z, _d.x, _d.y, _d.z, stepLen + 0.1, true)) {
        if (!bounce) {
          p.set(col.hit.x - _d.x * 0.1, col.hit.y - _d.y * 0.1, col.hit.z - _d.z * 0.1);
          return true;
        }
        // reflect with damping
        const n = _tmp.set(col.hit.nx, col.hit.ny, col.hit.nz);
        p.set(col.hit.x + n.x * 0.12, col.hit.y + n.y * 0.12, col.hit.z + n.z * 0.12);
        b.v.addScaledVector(n, -2 * b.v.dot(n)).multiplyScalar(0.45);
        if (n.y > 0.7 && Math.abs(b.v.y) < 1.5) b.v.y = 0;
        b.bounces++;
        if (sp > 3) bus.emit('sfx', { id: 'grenade_bounce', pos: { x: p.x, y: p.y, z: p.z }, vol: Math.min(1, sp / 12) });
        return false;
      }
      p.addScaledVector(b.v, dt);
    }
    return false;
  }

  function touchingEnemy(p, r) {
    for (const e of state.enemies.list) {
      if (!e.alive) continue;
      for (const h of e.hitboxes) {
        const dx = h.x - p.x, dy = h.y - p.y, dz = h.z - p.z;
        if (dx * dx + dy * dy + dz * dz < (h.r + r) ** 2) return e;
      }
    }
    return null;
  }

  // ---- events ----
  bus.on('run:start', resetRun);
  bus.on('key', ({ code }) => {
    if (state.mode !== 'playing') return;
    if (code === 'KeyR') startReload();
    if (code === 'Digit1') switchTo(W.slots[0]);
    if (code === 'Digit2') switchTo(W.slots[1]);
    if (code === 'KeyG' && W.grenades > 0 && W.grenadeCharge < 0 && !state.player.inMech) W.grenadeCharge = 0;
    if (code === 'Mouse0') firedThisPress = false;
  });
  bus.on('keyup', ({ code }) => {
    if (code === 'KeyG' && W.grenadeCharge >= 0) {
      const power = Math.min(1, W.grenadeCharge / GRENADE.chargeTime);
      W.grenadeCharge = -1;
      if (state.mode === 'playing' && W.grenades > 0) {
        W.grenades--;
        throwGrenade(power);
      }
    }
  });
  bus.on('wheel', ({ dir }) => {
    if (state.mode !== 'playing') return;
    const i = W.slots.indexOf(W.current);
    switchTo(W.slots[(i + (dir > 0 ? 1 : W.slots.length - 1)) % W.slots.length]);
  });
  bus.on('player:landed', ({ speed }) => vm.landing(speed));
  bus.on('enemy:killed', ({ source }) => {
    const s = stats();
    if (s.killAmmo && source === W.current) {
      W.ammo[W.current] = Math.min(magSize(), W.ammo[W.current] + Math.max(1, Math.round(magSize() * s.killAmmo)));
    }
  });
  bus.on('pickup', ({ type }) => {
    if (type === 'grenade') W.grenades = Math.min(W.grenadeMax, W.grenades + 1);
  });
  bus.on('shop:buy', ({ item }) => {
    if (item === 'grenade') W.grenades = Math.min(W.grenadeMax, W.grenades + 1);
  });
  bus.on('weapon:give', ({ id, slot }) => {
    const old = W.slots[slot];
    W.slots[slot] = id;
    W.ammo[id] = magSize(id);
    if (W.current === old) {
      W.current = id;
      vm.equip(id);
    }
    bus.emit('hud:feed', { text: `${WEAPONS[id].name} EQUIPPED`, color: '#ffd36b' });
  });
  bus.on('mech:enter', () => { vm.root.visible = false; W.grenadeCharge = -1; });
  bus.on('mech:exit', () => { vm.root.visible = true; });
  bus.on('build:changed', ({ owned }) => vm.setGold(owned.has('goldengun')));

  return {
    WEAPONS,
    magSize,
    update(dt) {
      if (!state.world) return;
      const s = stats();
      const w = weapon();
      const inp = state.input || {};
      const p = state.player;
      const inMech = p.inMech;
      W.mag = magSize();
      W.grenadeMax = GRENADE.max + (s.grenadeMaxBonus || 0);
      W.ammo[W.current] = Math.min(W.ammo[W.current], W.mag);

      // holstered guns reload themselves in the background
      for (const id of W.slots) {
        if (id === W.current) { holster[id] = 0; continue; }
        if (W.ammo[id] >= magSize(id)) continue;
        holster[id] = (holster[id] || 0) + dt;
        if (holster[id] >= WEAPONS[id].reload / (s.reloadMult || 1)) {
          W.ammo[id] = magSize(id);
          holster[id] = 0;
        }
      }

      fireCd -= dt;
      bloom = Math.max(0, bloom - dt * 0.05);
      if (W.reloading) {
        reloadT += dt;
        vm.reloadP = Math.min(1, reloadT / reloadDur);
        if (reloadT >= reloadDur * 0.82 && !W._endSfx) {
          W._endSfx = true;
          bus.emit('sfx', { id: 'reload_end' });
        }
        if (reloadT >= reloadDur) {
          W.reloading = false;
          W._endSfx = false;
          vm.reloadP = -1;
          W.ammo[W.current] = W.mag;
        }
      }

      const canAct = state.mode === 'playing' && p.alive && !inMech;
      const wantAds = canAct && inp.aim && !p.sprinting && !s.noAds;
      adsT += ((wantAds ? 1 : 0) - adsT) * Math.min(1, dt * 13);
      W.ads = adsT;
      W.scoped = !!w.scope && adsT > 0.62;
      state.fovScale = inMech ? 1.06 : (1 + (w.zoom - 1) * adsT) * (p.sprinting ? 1.05 : 1);

      // firing
      const rate = (s.fireRateMult || 1) * (s.tempFireRate || 1) * ((s.weaponRate && s.weaponRate[w.id]) || 1) * (state.abilities?.overclock ? 1.6 : 1);
      if (canAct && inp.fire && !W.reloading && fireCd <= 0 && !(p.sprinting && adsT < 0.1 && false)) {
        if (W.ammo[W.current] <= 0) {
          if (!firedThisPress) bus.emit('sfx', { id: 'dry_fire' });
          firedThisPress = true;
          startReload();
        } else if (w.charge) {
          if (!chargeSfx) { bus.emit('sfx', { id: 'rail_charge' }); chargeSfx = true; }
          charge = Math.min(1, charge + dt / (w.charge / (Math.sqrt(rate) * (s.railCharge || 1))));
          if (charge >= 1) {
            fire();
            charge = 0;
            chargeSfx = false;
            fireCd = w.interval / rate;
          }
        } else if (w.auto || !firedThisPress) {
          fire();
          firedThisPress = true;
          fireCd = w.interval / rate;
          if (W.ammo[W.current] <= 0) startReload();
        }
      } else if (!inp.fire) {
        firedThisPress = false;
        if (charge > 0) charge = Math.max(0, charge - dt * 2);
        chargeSfx = false;
      }
      W.charge = charge;
      W.reloadP = W.reloading ? Math.min(1, reloadT / reloadDur) : 0;
      W.spread = (w.spread + w.moveSpread * Math.min(1, Math.hypot(p.vel.x, p.vel.z) / 7) + bloom + (p.onGround ? 0 : 0.02)) * (1 - adsT * 0.8);

      // grenade charge
      if (W.grenadeCharge >= 0) W.grenadeCharge += dt;

      // live grenades
      for (let i = grenadesLive.length - 1; i >= 0; i--) {
        const g = grenadesLive[i];
        g.fuse -= dt;
        stepBody(g, dt, 22, true);
        g.mesh.rotation.x += dt * 9;
        grenadeMat.emissiveIntensity = 0.4 + (Math.sin(state.time * 20) * 0.5 + 0.5) * 1.5;
        if (g.fuse <= 0 || (!g.cluster && touchingEnemy(g.mesh.position, 0.15))) {
          explodeGrenade(g);
          grenadesLive.splice(i, 1);
        }
      }
      // launcher shells
      for (let i = shells.length - 1; i >= 0; i--) {
        const sh = shells[i];
        sh.life -= dt;
        sh.arm -= dt;
        const hitWorld = stepBody(sh, dt, sh.w.projectile.gravity, false);
        sh.mesh.lookAt(_tmp.copy(sh.mesh.position).add(sh.v));
        bus.emit('fx:trail', { pos: sh.mesh.position, color: 0xffa040 });
        const direct = sh.arm <= 0 ? touchingEnemy(sh.mesh.position, 0.2) : null;
        if (hitWorld || direct || sh.life <= 0) {
          explodeShell(sh, direct);
          shells.splice(i, 1);
        }
      }

      vm.update({
        dt,
        ads: adsT,
        scoped: W.scoped,
        sprint: p.sprinting && !W.reloading,
        speed: p.onGround ? Math.hypot(p.vel.x, p.vel.z) : 0,
        onGround: p.onGround,
        lookX: inp.frameLookX || 0,
        lookY: inp.frameLookY || 0,
        bob: p.bob || 0,
        charge,
      });
    },
  };
}
