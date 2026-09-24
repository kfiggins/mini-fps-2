import * as THREE from 'three';

// Abilities slice: active skills bound to Q / E (earned from upgrade cards).
// Grapple, dash and jetpack-friendly skills are built for vertical maps.
//
// Listens: ability:assign, key, run:start, shield:hit, arena:ready
// Emits:   player:velocity, heal, damage:enemy, explode, enemies:freeze,
//          fx:*, sfx, shake, hud:feed
// Publishes state.abilityDefs, state.abilities: { slots, cds, overclock,
//           shield: {x,y,z,r} | null, decoy: {x,y,z} | null }

export const ABILITIES = {
  healfield: { id: 'healfield', icon: '💚', name: 'Healing Field', tier: 'uncommon', cd: 20, desc: 'Drop a zone that heals 14/s while you stand in it (8s).' },
  dash: { id: 'dash', icon: '💨', name: 'Blink Dash', tier: 'uncommon', cd: 3.5, desc: 'Burst in the direction you\'re moving. Briefly untouchable.' },
  grapple: { id: 'grapple', icon: '🪝', name: 'Grapple Claw', tier: 'rare', cd: 3, desc: 'Fire a claw where you aim — a fast pull that flings you up over the ledge.' },
  bubble: { id: 'bubble', icon: '🫧', name: 'Bubble Shield', tier: 'rare', cd: 26, desc: 'A dome that blocks enemy fire (250 HP, 8s). You shoot out freely.' },
  homing: { id: 'homing', icon: '🚀', name: 'Homing Missile', tier: 'rare', cd: 10, desc: 'A missile that dives onto the enemy nearest your crosshair.' },
  decoy: { id: 'decoy', icon: '👤', name: 'Hologram Decoy', tier: 'rare', cd: 22, desc: 'Project a decoy enemies shoot at for 6s — then it detonates.' },
  nova: { id: 'nova', icon: '❄️', name: 'Stasis Nova', tier: 'rare', cd: 30, desc: 'Freeze every enemy for 7s (bosses 2s).' },
  sweeplaser: { id: 'sweeplaser', icon: '🔴', name: 'Sweep Laser', tier: 'legendary', cd: 24, desc: 'A laser sweeps your view — heavy damage to every enemy in sight.' },
  overclock: { id: 'overclock', icon: '⚙️', name: 'Overclock', tier: 'legendary', cd: 30, desc: '6s: +60% fire rate, instant reloads, +20% move speed.' },
};

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _t = new THREE.Vector3();

export function createAbilities(state, bus) {
  state.abilityDefs = ABILITIES;
  const A = { slots: { Q: null, E: null }, cds: { Q: 0, E: 0 }, overclock: false, shield: null, decoy: null };
  state.abilities = A;
  const root = new THREE.Group();
  state.scene.add(root);

  let grapple = null;
  let heal = null;
  let shield = null;
  let decoy = null;
  let laser = null;
  let overclockT = 0;
  const missiles = [];

  const glass = (color, opacity) => new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: 0.6, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false,
  });
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 6).rotateX(Math.PI / 2).translate(0, 0, 0.5), new THREE.MeshStandardMaterial({ color: 0xd8dde5, metalness: 0.9, roughness: 0.3 }));
  rope.visible = false;
  root.add(rope);
  const claw = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 6), new THREE.MeshStandardMaterial({ color: 0x8a8f96, metalness: 0.9, roughness: 0.3 }));
  claw.visible = false;
  root.add(claw);

  function scaleDmg(base) {
    const s = state.stats || {};
    return Math.round(base * (s.damageMult || 1) * (1 + (state.run.wave - 1) * 0.035));
  }

  function clearAll() {
    grapple = null;
    rope.visible = claw.visible = false;
    for (const o of [heal, shield, decoy]) if (o?.mesh) root.remove(o.mesh);
    heal = shield = decoy = null;
    if (laser) { root.remove(laser.mesh); laser = null; }
    for (const m of missiles) root.remove(m.mesh);
    missiles.length = 0;
    overclockT = 0;
    A.shield = null;
    A.decoy = null;
    A.overclock = false;
  }

  function camRay() {
    const cam = state.camera;
    cam.getWorldPosition(_o);
    cam.getWorldDirection(_d);
  }

  const casts = {
    healfield() {
      const p = state.player;
      const y = p.pos.y - p.eye;
      const mesh = new THREE.Group();
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 0.8, 40, 1, true), glass(0x3dd68c, 0.25));
      cyl.position.y = 0.4;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(4, 40).rotateX(-Math.PI / 2), glass(0x3dd68c, 0.12));
      disc.position.y = 0.03;
      mesh.add(cyl, disc);
      mesh.position.set(p.pos.x, y, p.pos.z);
      root.add(mesh);
      if (heal) root.remove(heal.mesh);
      heal = { mesh, x: p.pos.x, y, z: p.pos.z, t: 8 };
      bus.emit('sfx', { id: 'heal_field' });
    },
    dash() {
      const p = state.player;
      let dx = p.vel.x, dz = p.vel.z;
      let l = Math.hypot(dx, dz);
      if (l < 1) { dx = -Math.sin(p.yaw); dz = -Math.cos(p.yaw); l = 1; }
      bus.emit('player:velocity', { x: (dx / l) * 24, y: 3, z: (dz / l) * 24, mode: 'set' });
      bus.emit('player:invuln', { t: 0.25 });
      bus.emit('sfx', { id: 'dash' });
      bus.emit('aberration', 0.6);
      bus.emit('fx:burst', { pos: { x: p.pos.x, y: p.pos.y - 1, z: p.pos.z }, color: 0x9fd8ff, count: 18, speed: 4, life: 0.35 });
    },
    grapple() {
      camRay();
      const col = state.world.collision;
      if (!col.raycast(_o.x, _o.y, _o.z, _d.x, _d.y, _d.z, 55, true) || col.hit.c === null && col.hit.t > 45) {
        bus.emit('sfx', { id: 'deny' });
        return false;
      }
      const h = col.hit;
      const anchor = new THREE.Vector3(h.x, h.y, h.z);
      // aim above AND past the mark so grabbing a wall edge carries you onto the roof
      const past = new THREE.Vector3(anchor.x - _o.x, 0, anchor.z - _o.z);
      if (past.lengthSq() > 0.01) past.normalize().multiplyScalar(2.4);
      grapple = { anchor, target: anchor.clone().add(past).add(new THREE.Vector3(0, 2.6, 0)), t: 1.6, lastD: Infinity, fly: 0.12 };
      bus.emit('sfx', { id: 'grapple_fire' });
    },
    bubble() {
      const p = state.player;
      if (shield) root.remove(shield.mesh);
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(4, 32, 20), glass(0x7fd8ff, 0.18));
      const c = { x: p.pos.x, y: p.pos.y - p.eye + 1.4, z: p.pos.z };
      mesh.position.set(c.x, c.y, c.z);
      root.add(mesh);
      shield = { mesh, ...c, r: 4, hp: 250, maxHp: 250, t: 8 };
      A.shield = { x: c.x, y: c.y, z: c.z, r: 4 };
      bus.emit('sfx', { id: 'bubble_up' });
    },
    homing() {
      camRay();
      let best = null, bestScore = 0.3;
      for (const e of state.enemies.list) {
        if (!e.alive || e.untargetable) continue;
        _t.copy(e.center).sub(_o);
        const d = _t.length();
        if (d > 80) continue;
        const score = _t.divideScalar(d).dot(_d) + (e.boss ? 0.1 : 0);
        if (score > bestScore) { bestScore = score; best = e; }
      }
      if (!best) { bus.emit('sfx', { id: 'deny' }); return false; }
      const mesh = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.6, 8).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd8dde5, emissive: 0xff5533, emissiveIntensity: 1.5 }));
      mesh.position.copy(_o).addScaledVector(_d, 0.8);
      root.add(mesh);
      missiles.push({ mesh, target: best, v: new THREE.Vector3(_d.x * 6, 14, _d.z * 6), phase: 0.4, life: 6 });
      bus.emit('sfx', { id: 'missile_home' });
    },
    decoy() {
      camRay();
      const col = state.world.collision;
      let x = _o.x + _d.x * 8, z = _o.z + _d.z * 8;
      if (col.raycast(_o.x, _o.y, _o.z, _d.x, 0, _d.z, 8, false)) { x = col.hit.x - _d.x; z = col.hit.z - _d.z; }
      const feet = state.player.pos.y - state.player.eye;
      const y = col.groundHeight(x, z, 0.2, feet + 1, 1.2);
      const mesh = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.1, 4, 12), glass(0x66e0ff, 0.35));
      body.position.y = 0.9;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), glass(0x66e0ff, 0.45));
      head.position.y = 1.75;
      mesh.add(body, head);
      mesh.position.set(x, y, z);
      root.add(mesh);
      if (decoy) root.remove(decoy.mesh);
      decoy = { mesh, x, y, z, t: 6 };
      A.decoy = { x, y: y + 1.7, z };
      bus.emit('sfx', { id: 'teleport' });
    },
    nova() {
      const p = state.player;
      const s = state.stats || {};
      bus.emit('enemies:freeze', { duration: 7 * (s.novaMult || 1), bossDuration: 2 * (s.novaMult || 1) });
      bus.emit('fx:ring', { pos: { x: p.pos.x, y: p.pos.y - p.eye, z: p.pos.z }, radius: 0.5, color: 0x7fd8ff, life: 0.001 });
      bus.emit('fx:burst', { pos: p.pos.clone(), color: 0x9fe6ff, count: 80, speed: 14, life: 0.8 });
      bus.emit('shake', 0.5);
      bus.emit('aberration', 1);
      bus.emit('sfx', { id: 'nova' });
      bus.emit('hud:feed', { text: 'STASIS — ENEMIES FROZEN', color: '#7fd8ff' });
    },
    sweeplaser() {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 8).rotateX(Math.PI / 2).translate(0, 0, 0.5), glass(0xff3355, 0.9));
      mesh.material.blending = THREE.AdditiveBlending;
      root.add(mesh);
      laser = { mesh, t: 0, dur: 1.1, arc: Math.PI * 0.62, baseYaw: state.player.yaw, hit: new Set() };
      bus.emit('sfx', { id: 'laser_sweep' });
    },
    overclock() {
      overclockT = 6;
      bus.emit('sfx', { id: 'overclock' });
      bus.emit('hud:feed', { text: 'OVERCLOCKED', color: '#ffd36b' });
    },
  };

  function cast(slot) {
    const id = A.slots[slot];
    if (!id || A.cds[slot] > 0 || state.player.inMech || !state.player.alive) {
      if (id && A.cds[slot] > 0) bus.emit('sfx', { id: 'deny', vol: 0.4 });
      return;
    }
    const ok = casts[id]();
    if (ok === false) return;
    const s = state.stats || {};
    let cd = ABILITIES[id].cd * (s.abilityCdMult || 1);
    if (id === 'grapple' && s.grappleCd) cd *= s.grappleCd;
    A.cds[slot] = cd;
    A.maxCds = A.maxCds || {};
    A.maxCds[slot] = cd;
  }

  bus.on('ability:assign', ({ slot, id }) => {
    A.slots[slot] = id;
    A.cds[slot] = 0;
  });
  bus.on('key', ({ code }) => {
    if (state.mode !== 'playing') return;
    if (code === 'KeyQ') cast('Q');
    if (code === 'KeyE') cast('E');
  });
  bus.on('shield:hit', ({ amount, point }) => {
    if (!shield) return;
    shield.hp -= amount;
    bus.emit('fx:burst', { pos: point, color: 0x7fd8ff, count: 6, speed: 3, life: 0.25 });
    const f = Math.max(0, shield.hp / shield.maxHp);
    shield.mesh.material.opacity = 0.4;
    shield.mesh.material.color.setRGB(0.5 + (1 - f) * 0.5, 0.85 * f + 0.3 * (1 - f), f + 0.3 * (1 - f));
    shield.mesh.material.emissive.copy(shield.mesh.material.color);
    if (shield.hp <= 0) {
      bus.emit('fx:explosion', { pos: shield.mesh.position.clone(), color: 0x7fd8ff, scale: 1, harmless: true });
      bus.emit('sfx', { id: 'bubble_break' });
      root.remove(shield.mesh);
      shield = null;
      A.shield = null;
      bus.emit('hud:feed', { text: 'SHIELD DOWN', color: '#7fd8ff' });
    }
  });
  bus.on('run:start', () => {
    clearAll();
    A.slots = { Q: null, E: null };
    A.cds = { Q: 0, E: 0 };
  });
  bus.on('arena:ready', clearAll);

  return {
    ABILITIES,
    cast,
    update(dt) {
      const p = state.player;
      A.cds.Q = Math.max(0, A.cds.Q - dt);
      A.cds.E = Math.max(0, A.cds.E - dt);
      overclockT = Math.max(0, overclockT - dt);
      A.overclock = overclockT > 0;

      if (grapple) {
        const g = grapple;
        g.t -= dt;
        const hand = _t.set(p.pos.x, p.pos.y - 0.35, p.pos.z);
        rope.visible = claw.visible = true;
        rope.position.copy(hand);
        rope.lookAt(g.anchor);
        rope.scale.set(1, 1, hand.distanceTo(g.anchor));
        claw.position.copy(g.anchor);
        if (g.fly > 0) {
          g.fly -= dt; // claw in flight
        } else {
          if (!g.pulled) { g.pulled = true; bus.emit('sfx', { id: 'grapple_pull' }); }
          _d.copy(g.target).sub(p.pos);
          const d = _d.length();
          const passed = d > g.lastD + 0.02;
          g.lastD = Math.min(g.lastD, d);
          if (g.t <= 0 || d < 1.6 || passed) {
            _d.divideScalar(d || 1);
            bus.emit('player:velocity', { x: _d.x * 13, y: Math.max(0, p.vel.y * 0.25) + 7.5, z: _d.z * 13, mode: 'set' });
            grapple = null;
            rope.visible = claw.visible = false;
          } else {
            _d.divideScalar(d);
            bus.emit('player:velocity', { x: _d.x * 34, y: _d.y * 34 + 2.5, z: _d.z * 34, mode: 'set' });
          }
        }
      }

      if (heal) {
        heal.t -= dt;
        heal.mesh.rotation.y += dt * 0.6;
        heal.mesh.children[0].material.opacity = 0.2 + Math.sin(heal.t * 6) * 0.06;
        if (Math.hypot(p.pos.x - heal.x, p.pos.z - heal.z) < 4 && Math.abs(p.pos.y - p.eye - heal.y) < 2) {
          bus.emit('heal', { amount: 14 * dt });
          if (Math.random() < dt * 10) bus.emit('fx:burst', { pos: { x: p.pos.x + (Math.random() - 0.5), y: p.pos.y - 1.2, z: p.pos.z + (Math.random() - 0.5) }, color: 0x3dff8a, count: 1, speed: 1, life: 0.6 });
        }
        if (heal.t <= 0) { root.remove(heal.mesh); heal = null; }
      }

      if (shield) {
        shield.t -= dt;
        shield.mesh.material.opacity = Math.max(0.14, shield.mesh.material.opacity - dt * 0.8);
        shield.mesh.rotation.y += dt * 0.3;
        if (shield.t <= 0) { root.remove(shield.mesh); shield = null; A.shield = null; }
      }

      if (decoy) {
        decoy.t -= dt;
        decoy.mesh.rotation.y += dt * 2;
        decoy.mesh.children.forEach((c) => { c.material.opacity = 0.3 + Math.sin(state.time * 20) * 0.08; });
        if (decoy.t <= 0) {
          bus.emit('explode', { pos: { x: decoy.x, y: decoy.y + 1, z: decoy.z }, radius: 4.5, damage: scaleDmg(110), source: 'decoy', hurtsPlayer: false, scale: 1.2, color: 0x66e0ff });
          root.remove(decoy.mesh);
          decoy = null;
          A.decoy = null;
        }
      }

      for (let i = missiles.length - 1; i >= 0; i--) {
        const m = missiles[i];
        m.life -= dt;
        m.phase -= dt;
        if (m.phase <= 0 && m.target.alive) {
          _d.copy(m.target.center).sub(m.mesh.position).normalize().multiplyScalar(32);
          m.v.lerp(_d, Math.min(1, dt * 4));
        } else m.v.y -= 12 * dt;
        m.mesh.position.addScaledVector(m.v, dt);
        m.mesh.lookAt(_t.copy(m.mesh.position).add(m.v));
        bus.emit('fx:trail', { pos: m.mesh.position, color: 0xffaa66 });
        const mp = m.mesh.position;
        let boom = m.life <= 0;
        if (!boom && m.target.alive && mp.distanceTo(m.target.center) < 1.3) boom = true;
        if (!boom && !state.world.collision.segmentClear(mp.x, mp.y, mp.z, mp.x + m.v.x * dt, mp.y + m.v.y * dt, mp.z + m.v.z * dt)) boom = true;
        if (boom) {
          if (m.target.alive && mp.distanceTo(m.target.center) < 2) {
            bus.emit('damage:enemy', { enemy: m.target, amount: scaleDmg(120), part: 'body', source: 'missile', point: m.target.center, depth: 1 });
          }
          bus.emit('explode', { pos: mp.clone(), radius: 3.5, damage: scaleDmg(70), source: 'missile', hurtsPlayer: false, scale: 1.1, color: 0xff8833 });
          root.remove(m.mesh);
          missiles.splice(i, 1);
        }
      }

      if (laser) {
        const L = laser;
        L.t += dt;
        const k = Math.min(1, L.t / L.dur);
        const yaw = L.baseYaw + L.arc / 2 - L.arc * k;
        const cam = state.camera;
        cam.getWorldPosition(_o);
        cam.getWorldDirection(_d);
        const dir = new THREE.Vector3(-Math.sin(yaw), _d.y * 0.4, -Math.cos(yaw)).normalize();
        const col = state.world.collision;
        const endD = col.raycast(_o.x, _o.y, _o.z, dir.x, dir.y, dir.z, 75) ? col.hit.t : 75;
        L.mesh.position.set(_o.x, _o.y - 0.25, _o.z);
        L.mesh.lookAt(_o.x + dir.x * endD, _o.y + dir.y * endD, _o.z + dir.z * endD);
        L.mesh.scale.set(1, 1, endD);
        for (const e of state.enemies.list) {
          if (!e.alive || L.hit.has(e.id) || e.untargetable) continue;
          const rx = e.center.x - _o.x, rz = e.center.z - _o.z;
          const ey = Math.atan2(-rx, -rz);
          let delta = L.baseYaw + L.arc / 2 - ey;
          delta = Math.atan2(Math.sin(delta), Math.cos(delta));
          if (delta < 0 || delta > L.arc * k || Math.hypot(rx, rz) > 75) continue;
          if (!col.segmentClear(_o.x, _o.y, _o.z, e.center.x, e.center.y, e.center.z)) continue;
          L.hit.add(e.id);
          bus.emit('fx:beam', { from: { x: _o.x, y: _o.y - 0.25, z: _o.z }, to: e.center.clone(), color: 0xff3355, width: 0.6 });
          bus.emit('damage:enemy', { enemy: e, amount: scaleDmg(140), part: 'body', source: 'laser', point: e.center, depth: 1 });
        }
        if (k >= 1) { root.remove(L.mesh); laser = null; }
      }
    },
  };
}
