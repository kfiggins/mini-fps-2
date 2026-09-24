import * as THREE from 'three';
import { raySphere } from '../../core/collide.js';

// Mech slice: the 1000-scrap war machine. Towering eye height, dual cannons
// with no reload, boost jets, its own Q/E (rocket barrage, titan stomp).
// Its armour never regenerates — when it dies you eject and it's gone.
//
// Listens: shop:buy (mech), mech:hurt, key, run:start
// Emits:   mech:enter, mech:exit, damage:enemy, explode, fx:*, sfx, shake, hud:*
// Publishes state.mech: { active, hp, maxHp, cds, abilities }

export const MECH = {
  cost: 1000, hp: 1000,
  profile: { eye: 4.2, radius: 1.3, step: 1.2, speed: 8.5, jump: 12 },
  gun: { dmg: 70, splash: 25, splashR: 2, interval: 0.09 },
  rockets: { n: 6, dmg: 120, radius: 4.5, cd: 18 },
  stomp: { dmg: 180, radius: 14, cd: 9 },
};

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _m = new THREE.Vector3();

export function createMech(state, bus) {
  const M = { active: false, hp: 0, maxHp: MECH.hp, cds: { Q: 0, E: 0 }, abilities: { Q: 'ROCKET BARRAGE', E: 'TITAN STOMP' }, maxCds: { Q: MECH.rockets.cd, E: MECH.stomp.cd } };
  state.mech = M;
  let fireCd = 0;
  let side = 1;
  const kick = { l: 0, r: 0 };
  const rockets = [];
  const root = new THREE.Group();
  state.scene.add(root);

  // cockpit cannons in the viewmodel scene
  const mat = new THREE.MeshStandardMaterial({ color: 0x39404d, roughness: 0.4, metalness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x15181d, roughness: 0.5, metalness: 0.6 });
  const glow = new THREE.MeshStandardMaterial({ color: 0x7fd8ff, emissive: 0x7fd8ff, emissiveIntensity: 2.5 });
  function cannon(x) {
    const g = new THREE.Group();
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.9), mat);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.0, 14).rotateX(Math.PI / 2), dark);
    barrel.position.set(0, 0.02, -0.8);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.02, 6, 16), glow);
    ring.position.set(0, 0.02, -0.55);
    g.add(housing, barrel, ring);
    g.position.set(x, -0.55, -1.1);
    g.visible = false;
    state.viewCamera.add(g);
    return g;
  }
  const cannons = { l: cannon(-0.62), r: cannon(0.62) };

  function enter() {
    M.active = true;
    M.hp = MECH.hp;
    M.cds = { Q: 0, E: 0 };
    cannons.l.visible = cannons.r.visible = true;
    bus.emit('mech:enter', MECH.profile);
    const p = state.player.pos;
    bus.emit('fx:ring', { pos: { x: p.x, y: p.y - MECH.profile.eye, z: p.z }, radius: 7, color: 0x7fd8ff, life: 0.5 });
    bus.emit('shake', 0.8);
    bus.emit('sfx', { id: 'mech_enter' });
    bus.emit('hud:banner', { title: 'MECH ONLINE', sub: 'Q ROCKET BARRAGE · E TITAN STOMP', color: '#7fd8ff' });
  }

  function exit(died) {
    if (!M.active) return;
    M.active = false;
    cannons.l.visible = cannons.r.visible = false;
    for (const r of rockets) root.remove(r.mesh);
    rockets.length = 0;
    const p = state.player.pos;
    if (died) {
      bus.emit('explode', { pos: { x: p.x, y: p.y - 2, z: p.z }, radius: 7, damage: 200, source: 'mech', hurtsPlayer: false, scale: 2.4, color: 0xff8833 });
      bus.emit('hud:banner', { title: 'MECH DESTROYED', sub: 'EJECTED', color: '#ff7755' });
    }
    bus.emit('mech:exit', { died });
  }

  function fire() {
    fireCd = MECH.gun.interval;
    const s = side > 0 ? 'r' : 'l';
    side *= -1;
    kick[s] = 1;
    const cam = state.camera;
    cam.getWorldPosition(_o);
    cam.getWorldDirection(_d);
    const col = state.world.collision;
    let maxT = 180;
    if (col.raycast(_o.x, _o.y, _o.z, _d.x, _d.y, _d.z, 180)) maxT = col.hit.t;
    let best = null, bt = maxT, part = 'body';
    for (const e of state.enemies.list) {
      if (!e.alive || e.untargetable) continue;
      for (const h of e.hitboxes) {
        if (h.part === 'shield' || h.r <= 0) continue;
        const t = raySphere(_o.x, _o.y, _o.z, _d.x, _d.y, _d.z, h.x, h.y, h.z, h.r);
        if (t >= 0 && t < bt) { bt = t; best = e; part = h.part; }
      }
    }
    const end = _o.clone().addScaledVector(_d, Math.min(bt, 150));
    const dmgMult = (state.stats?.damageMult || 1) ** 0.5;
    if (best) bus.emit('damage:enemy', { enemy: best, amount: Math.round(MECH.gun.dmg * dmgMult * (part === 'head' || part === 'weak' ? 1.5 : 1)), part, source: 'mech', point: end });
    bus.emit('explode', { pos: end, radius: MECH.gun.splashR, damage: Math.round(MECH.gun.splash * dmgMult), source: 'mech', hurtsPlayer: false, scale: 0.35, color: 0xffcc66, exclude: best });
    _m.set(0, 0.02, -1.3);
    cannons[s].localToWorld(_m);
    state.viewCamera.worldToLocal(_m);
    cam.localToWorld(_m);
    bus.emit('fx:tracer', { from: _m.clone(), to: end, color: 0xffcc66, width: 3 });
    bus.emit('light', { pos: _m, color: 0xffbb66, intensity: 20, dist: 10, life: 0.07 });
    bus.emit('sfx', { id: 'mech_shot' });
    if (best) bus.emit('sfx', { id: 'hit', vol: 0.4 });
  }

  function castRockets() {
    const targets = state.enemies.list.filter((e) => e.alive && !e.untargetable);
    if (!targets.length) return false;
    const p = state.player.pos;
    targets.sort((a, b) => a.pos.distanceTo(p) - b.pos.distanceTo(p));
    for (let i = 0; i < MECH.rockets.n; i++) {
      const t = targets[i % targets.length];
      const mesh = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.6, 8).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd8dde5, emissive: 0xff5533, emissiveIntensity: 1.5 }));
      mesh.position.set(p.x + (i % 2 ? 1 : -1) * 1.2, p.y - 0.5, p.z);
      root.add(mesh);
      rockets.push({ mesh, target: t, v: new THREE.Vector3((Math.random() - 0.5) * 8, 16 + i, (Math.random() - 0.5) * 8), phase: 0.35 + i * 0.05, life: 6 });
    }
    bus.emit('sfx', { id: 'mech_rockets' });
  }

  function castStomp() {
    const p = state.player;
    const feet = { x: p.pos.x, y: p.pos.y - p.eye, z: p.pos.z };
    bus.emit('fx:ring', { pos: feet, radius: 0.5, color: 0xffaa44, life: 0.001 });
    bus.emit('explode', { pos: { ...feet, y: feet.y + 0.5 }, radius: MECH.stomp.radius, damage: MECH.stomp.dmg, source: 'mech', hurtsPlayer: false, scale: 2.2, color: 0xffaa44 });
    bus.emit('shake', 1);
    bus.emit('sfx', { id: 'mech_stomp' });
  }

  bus.on('shop:buy', ({ item }) => { if (item === 'mech' && !M.active) enter(); });
  bus.on('mech:hurt', ({ amount }) => {
    if (!M.active) return;
    M.hp -= amount;
    bus.emit('player:hurt', { amount: 0, absorbed: amount, kind: 'mech', from: null });
    if (M.hp <= 0) exit(true);
  });
  bus.on('key', ({ code }) => {
    if (!M.active || state.mode !== 'playing') return;
    const slot = code === 'KeyQ' ? 'Q' : code === 'KeyE' ? 'E' : null;
    if (!slot || M.cds[slot] > 0) return;
    const ok = slot === 'Q' ? castRockets() : castStomp();
    if (ok !== false) M.cds[slot] = M.maxCds[slot];
  });
  bus.on('run:start', () => exit(false));

  let stepAcc = 0;
  return {
    MECH,
    update(dt) {
      if (!M.active) return;
      M.cds.Q = Math.max(0, M.cds.Q - dt);
      M.cds.E = Math.max(0, M.cds.E - dt);
      fireCd -= dt;
      if (state.mode === 'playing' && state.input?.fire && fireCd <= 0) fire();
      for (const k of ['l', 'r']) {
        kick[k] = Math.max(0, kick[k] - dt * 8);
        const c = cannons[k];
        const p = state.player;
        const bob = Math.sin((p.bob || 0) * 0.5) * 0.03;
        c.position.z = -1.1 + kick[k] * 0.15;
        c.position.y = -0.55 + (k === 'l' ? bob : -bob);
      }
      const p = state.player;
      const hs = Math.hypot(p.vel.x, p.vel.z);
      if (p.onGround && hs > 2) {
        stepAcc += dt * hs;
        if (stepAcc > 5) {
          stepAcc = 0;
          bus.emit('sfx', { id: 'mech_step' });
          bus.emit('shake', 0.12);
        }
      }
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.life -= dt;
        r.phase -= dt;
        if (r.phase <= 0 && r.target.alive) {
          _d.copy(r.target.center).sub(r.mesh.position).normalize().multiplyScalar(30);
          r.v.lerp(_d, Math.min(1, dt * 4));
        } else r.v.y -= 14 * dt;
        r.mesh.position.addScaledVector(r.v, dt);
        r.mesh.lookAt(_m.copy(r.mesh.position).add(r.v));
        bus.emit('fx:trail', { pos: r.mesh.position, color: 0xff8844 });
        const rp = r.mesh.position;
        const hit = r.target.alive && rp.distanceTo(r.target.center) < 1.4;
        if (r.life <= 0 || hit || !state.world.collision.segmentClear(rp.x, rp.y, rp.z, rp.x + r.v.x * dt, rp.y + r.v.y * dt, rp.z + r.v.z * dt)) {
          bus.emit('explode', { pos: rp.clone(), radius: MECH.rockets.radius, damage: MECH.rockets.dmg, source: 'mech', hurtsPlayer: false, scale: 1.3, color: 0xff8833 });
          root.remove(r.mesh);
          rockets.splice(i, 1);
        }
      }
    },
  };
}
