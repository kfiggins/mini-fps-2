import * as THREE from 'three';
import { ParticleSystem } from './particles.js';

// FX slice: all short-lived visuals. Particles (additive glow + soft smoke),
// tracers, beams, lightning arcs, heal tethers, bullet-hole and scorch
// decals, explosions, spawn columns, telegraph rings, ambient emitters.
// Explosions are also where the boom sound is triggered, so every
// `explode` (gameplay) and `fx:explosion` (cosmetic) looks and sounds alike.
//
// Listens: fx:burst, fx:impact, fx:tracer, fx:beam, fx:arc, fx:heal, fx:explosion,
//          explode, fx:beam, fx:jet, fx:trail, fx:flame, fx:ember, fx:smoke,
//          fx:ring, arena:ready
// Emits:   sfx, light, shake

const SURFACE = {
  metal: { spark: [1, 0.8, 0.45], dust: [0.35, 0.35, 0.36] },
  concrete: { spark: [1, 0.85, 0.6], dust: [0.62, 0.6, 0.55] },
  dirt: { spark: [1, 0.8, 0.5], dust: [0.72, 0.6, 0.42] },
  wood: { spark: [1, 0.8, 0.5], dust: [0.5, 0.38, 0.25] },
  shield: { spark: [0.4, 0.8, 1], dust: [0.3, 0.6, 1] },
};

function decalTexture(kind) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  if (kind === 'hole') {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.18, 'rgba(10,8,6,0.95)');
    g.addColorStop(0.35, 'rgba(30,25,20,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  } else {
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 28;
      const g = ctx.createRadialGradient(32 + Math.cos(a) * r * 0.4, 32 + Math.sin(a) * r * 0.4, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(10,8,6,0.22)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createFx(state, bus) {
  const scene = state.scene;
  const glow = new ParticleSystem(scene, 9000, true);
  const smoke = new ParticleSystem(scene, 3000, false);
  let T = 0; // fx clock

  const col = new THREE.Color();
  function spark(x, y, z, vx, vy, vz, r, g, b, life, size, gravity = -14, drag = 1.5, a = 1) {
    glow.emit({ x, y, z, vx, vy, vz, r, g, b, a, life, size0: size, size1: size * 0.3, gravity, drag }, T);
  }
  function puff(x, y, z, vx, vy, vz, r, g, b, life, s0, s1, a = 0.6, gravity = 0.6, drag = 2) {
    smoke.emit({ x, y, z, vx, vy, vz, r, g, b, a, life, size0: s0, size1: s1, gravity, drag }, T);
  }
  const rnd = (a) => (Math.random() - 0.5) * 2 * a;

  // ---- pooled line-ish meshes ----
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0, 0.5);
  function pool(n, make) {
    const items = [];
    for (let i = 0; i < n; i++) items.push(make());
    let c = 0;
    return { items, next() { const it = items[c]; c = (c + 1) % n; return it; } };
  }
  const additive = (color, opacity = 1) => {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
    m.toneMapped = false;
    return m;
  };
  const tracers = pool(80, () => {
    const m = new THREE.Mesh(boxGeo, additive(0xffffff));
    m.visible = false;
    m.frustumCulled = false;
    scene.add(m);
    return { mesh: m, life: 0, max: 0.07, width: 0.02, len: 1, speed: 0, from: new THREE.Vector3(), dir: new THREE.Vector3() };
  });
  const beams = pool(12, () => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 10, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5), additive(0xffffff));
    m.visible = false;
    m.frustumCulled = false;
    scene.add(m);
    return { mesh: m, life: 0, max: 0.3, width: 0.08 };
  });
  const arcGeoPts = 10;
  const arcs = pool(24, () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(arcGeoPts * 3), 3));
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x88eeff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    l.visible = false;
    l.frustumCulled = false;
    scene.add(l);
    return { line: l, life: 0, max: 0.12 };
  });
  const ringGeo = new THREE.RingGeometry(0.9, 1, 64).rotateX(-Math.PI / 2);
  const rings = pool(16, () => {
    const m = new THREE.Mesh(ringGeo, additive(0xffaa44));
    m.visible = false;
    scene.add(m);
    return { mesh: m, life: 0, max: 0.5, r0: 1, r1: 1, shrink: false };
  });
  const colGeo = new THREE.CylinderGeometry(0.5, 0.7, 1, 16, 1, true);
  colGeo.translate(0, 0.5, 0);
  const columns = pool(16, () => {
    const m = new THREE.Mesh(colGeo, additive(0x9fd8ff, 0.6));
    m.visible = false;
    scene.add(m);
    return { mesh: m, life: 0, max: 0.6, h: 6 };
  });

  // ---- decals (instanced) ----
  function decalPool(n, tex, size, blending) {
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, blending });
    const g = new THREE.PlaneGeometry(1, 1);
    const im = new THREE.InstancedMesh(g, mat, n);
    im.count = 0;
    im.frustumCulled = false;
    im.renderOrder = 1;
    scene.add(im);
    return { im, n, cursor: 0, size };
  }
  const holes = decalPool(260, decalTexture('hole'), 0.14);
  const scorches = decalPool(40, decalTexture('scorch'), 1);
  const _mat = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _up = new THREE.Vector3(0, 0, 1);
  const _n = new THREE.Vector3();
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3();
  function decal(pool, pos, normal, size) {
    _n.set(normal.x, normal.y, normal.z).normalize();
    _q.setFromUnitVectors(_up, _n);
    const spin = new THREE.Quaternion().setFromAxisAngle(_up, Math.random() * Math.PI * 2);
    _q.multiply(spin);
    _p.set(pos.x + _n.x * 0.01, pos.y + _n.y * 0.01, pos.z + _n.z * 0.01);
    _mat.compose(_p, _q, _s.set(size, size, size));
    pool.im.setMatrixAt(pool.cursor, _mat);
    pool.cursor = (pool.cursor + 1) % pool.n;
    pool.im.count = Math.min(pool.n, Math.max(pool.im.count, pool.cursor === 0 ? pool.n : pool.cursor));
    pool.im.instanceMatrix.needsUpdate = true;
  }

  // ---- composite effects ----
  function burst({ pos, color = 0xffcc88, count = 10, speed = 4, life = 0.4, smoke: sm = false }) {
    col.setHex(color);
    for (let i = 0; i < count; i++) {
      spark(pos.x, pos.y, pos.z, rnd(speed), rnd(speed) + speed * 0.3, rnd(speed), col.r, col.g, col.b, life * (0.5 + Math.random() * 0.7), 0.08 + Math.random() * 0.06);
    }
    if (sm) {
      for (let i = 0; i < count / 3; i++) puff(pos.x + rnd(1), pos.y, pos.z + rnd(1), rnd(2), 1 + Math.random(), rnd(2), 0.55, 0.5, 0.42, 1.2, 0.8, 2.6, 0.35);
    }
  }

  function impact({ pos, normal, surface = 'concrete', small = false }) {
    const sfc = SURFACE[surface] || SURFACE.concrete;
    const n = small ? 3 : 7;
    for (let i = 0; i < n; i++) {
      const s = 4 + Math.random() * 5;
      spark(pos.x, pos.y, pos.z,
        normal.x * s * 0.6 + rnd(s * 0.6), normal.y * s * 0.6 + rnd(s * 0.6) + 1, normal.z * s * 0.6 + rnd(s * 0.6),
        sfc.spark[0], sfc.spark[1], sfc.spark[2], 0.18 + Math.random() * 0.2, 0.05, -18, 1);
    }
    const [dr, dg, db] = sfc.dust;
    for (let i = 0; i < (small ? 1 : 2); i++) {
      puff(pos.x, pos.y, pos.z, normal.x * 1.5 + rnd(0.5), normal.y * 1.5 + rnd(0.5) + 0.3, normal.z * 1.5 + rnd(0.5), dr, dg, db, 0.7 + Math.random() * 0.4, 0.15, 0.7, 0.45, 0.3, 3);
    }
    if (surface !== 'shield') decal(holes, pos, normal, holes.size * (0.8 + Math.random() * 0.5));
  }

  function tracer({ from, to, color = 0xffd98a, width = 1, enemy = false }) {
    const t = tracers.next();
    t.from.set(from.x, from.y, from.z);
    t.dir.set(to.x - from.x, to.y - from.y, to.z - from.z);
    const dist = t.dir.length();
    if (dist < 0.3) return;
    t.dir.divideScalar(dist);
    t.dist = dist;
    // a travelling streak: bright head, sweeps from muzzle to impact
    t.len = Math.min(dist, enemy ? 4 : 6);
    t.speed = enemy ? 140 : 320;
    t.travel = 0;
    t.width = 0.012 * width * (enemy ? 1.6 : 1);
    t.life = dist / t.speed + 0.04;
    t.max = t.life;
    t.mesh.material.color.setHex(color);
    t.mesh.material.opacity = 1;
    t.mesh.visible = true;
  }

  function beam({ from, to, color = 0x9f7bff, width = 1 }) {
    const b = beams.next();
    b.mesh.position.set(from.x, from.y, from.z);
    b.mesh.lookAt(to.x, to.y, to.z);
    const len = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    b.width = 0.05 * width;
    b.mesh.scale.set(b.width, b.width, len);
    b.mesh.material.color.setHex(color);
    b.life = b.max = 0.35;
    b.mesh.visible = true;
    col.setHex(color);
    for (let i = 0; i < Math.min(60, len * 1.5); i++) {
      const k = Math.random();
      spark(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k, from.z + (to.z - from.z) * k,
        rnd(0.8), rnd(0.8), rnd(0.8), col.r, col.g, col.b, 0.3 + Math.random() * 0.3, 0.1, 0, 2);
    }
  }

  function arc({ from, to, color = 0x88eeff }) {
    const a = arcs.next();
    const arr = a.line.geometry.attributes.position.array;
    for (let i = 0; i < arcGeoPts; i++) {
      const k = i / (arcGeoPts - 1);
      const j = i === 0 || i === arcGeoPts - 1 ? 0 : 0.35;
      arr[i * 3] = from.x + (to.x - from.x) * k + rnd(j);
      arr[i * 3 + 1] = from.y + (to.y - from.y) * k + rnd(j);
      arr[i * 3 + 2] = from.z + (to.z - from.z) * k + rnd(j);
    }
    a.line.geometry.attributes.position.needsUpdate = true;
    a.line.material.color.setHex(color);
    a.life = a.max = 0.12;
    a.line.visible = true;
    col.setHex(color);
    for (let i = 0; i < 4; i++) spark(to.x, to.y, to.z, rnd(3), rnd(3), rnd(3), col.r, col.g, col.b, 0.2, 0.08);
  }

  function heal({ from, to }) {
    for (let i = 0; i < 3; i++) {
      const k = Math.random();
      spark(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k, from.z + (to.z - from.z) * k, rnd(0.3), 0.6, rnd(0.3), 0.25, 1, 0.5, 0.4, 0.12, 0, 1);
    }
  }

  function explosion({ pos, color = 0xff8833, scale = 1, harmless = false, radius, enemy }) {
    const s = scale;
    col.setHex(color);
    // fireball core
    for (let i = 0; i < 30 * s; i++) {
      const v = 3 + Math.random() * 5;
      spark(pos.x, pos.y, pos.z, rnd(v) * s, rnd(v) * s + 1.5, rnd(v) * s,
        1, 0.55 + Math.random() * 0.3, 0.2, 0.35 + Math.random() * 0.35, 0.9 * s, 0.2 * s, 2, 3);
    }
    // coloured energy
    for (let i = 0; i < 16 * s; i++) {
      const v = 5 + Math.random() * 6;
      spark(pos.x, pos.y, pos.z, rnd(v) * s, rnd(v) * s + 2, rnd(v) * s, col.r, col.g, col.b, 0.5, 0.35 * s, 0.05, -4, 2);
    }
    // hot sparks
    for (let i = 0; i < 30 * s; i++) {
      const v = 8 + Math.random() * 10;
      spark(pos.x, pos.y, pos.z, rnd(v), Math.random() * v, rnd(v), 1, 0.8, 0.4, 0.5 + Math.random() * 0.6, 0.06, -18, 0.8);
    }
    // smoke
    for (let i = 0; i < 14 * s; i++) {
      puff(pos.x + rnd(0.6 * s), pos.y + rnd(0.4 * s), pos.z + rnd(0.6 * s), rnd(2.5) * s, 1 + Math.random() * 2.5, rnd(2.5) * s,
        0.2, 0.18, 0.16, 1.6 + Math.random() * 1.2, 1.2 * s, 3.8 * s, 0.55, 0.8, 1.2);
    }
    const r = rings.next();
    r.mesh.position.set(pos.x, pos.y + 0.05, pos.z);
    r.mesh.material.color.setHex(0xffc080);
    r.r0 = 0.3; r.r1 = (radius || 3) * 1.1; r.life = r.max = 0.35; r.shrink = false;
    r.mesh.visible = true;
    bus.emit('light', { pos, color: 0xff9944, intensity: 60 * s, dist: 14 * s, life: 0.3 });
    // scorch mark on whatever is below
    const w = state.world;
    if (w) {
      const g = w.collision.groundHeight(pos.x, pos.z, 0.1, pos.y + 0.2, 1.5);
      if (pos.y - g < 1.6) decal(scorches, { x: pos.x, y: g, z: pos.z }, { x: 0, y: 1, z: 0 }, (radius || 3) * 0.9);
    }
    // camera shake + sound by distance
    const pp = state.player.pos;
    const d = Math.hypot(pp.x - pos.x, pp.y - pos.y, pp.z - pos.z);
    bus.emit('shake', Math.min(0.8, (s * 0.9) / Math.max(1, d / 5)));
    if (!enemy || true) bus.emit('sfx', { id: s > 0.8 ? 'explosion' : 'explosion_small', pos: { x: pos.x, y: pos.y, z: pos.z }, vol: Math.min(1, 0.5 + s * 0.3) });
    void harmless;
  }

  function beamColumn({ pos, color = 0x9fd8ff, height = 6 }) {
    const c = columns.next();
    c.mesh.position.set(pos.x, pos.y, pos.z);
    c.mesh.material.color.setHex(color);
    c.h = height;
    c.life = c.max = 0.7;
    c.mesh.visible = true;
    col.setHex(color);
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2;
      spark(pos.x + Math.cos(a) * 0.8, pos.y + Math.random() * height, pos.z + Math.sin(a) * 0.8, -Math.cos(a) * 1.5, rnd(1), -Math.sin(a) * 1.5, col.r, col.g, col.b, 0.6, 0.1, 0, 1);
    }
  }

  function ring({ pos, radius, color = 0xffaa44, life = 0.6 }) {
    const r = rings.next();
    r.mesh.position.set(pos.x, pos.y + 0.08, pos.z);
    r.mesh.material.color.setHex(color);
    r.r0 = radius; r.r1 = radius * 0.2; r.life = r.max = life; r.shrink = true;
    r.mesh.visible = true;
  }

  bus.on('fx:burst', burst);
  bus.on('fx:impact', impact);
  bus.on('fx:tracer', tracer);
  bus.on('fx:beam', (o) => (o.from ? beam(o) : beamColumn(o)));
  bus.on('fx:arc', arc);
  bus.on('fx:heal', heal);
  bus.on('fx:explosion', explosion);
  bus.on('explode', (ex) => explosion({ pos: ex.pos, color: ex.color, scale: ex.scale ?? ex.radius / 3.5, radius: ex.radius, enemy: ex.enemy }));
  bus.on('fx:ring', ring);
  bus.on('fx:jet', ({ pos }) => {
    for (let i = 0; i < 5; i++) spark(pos.x + rnd(0.15), pos.y, pos.z + rnd(0.15), rnd(0.6), -6 - Math.random() * 3, rnd(0.6), 1, 0.6, 0.25, 0.25, 0.25, 0, 3);
    puff(pos.x, pos.y - 0.3, pos.z, rnd(0.5), -2, rnd(0.5), 0.6, 0.6, 0.6, 0.8, 0.3, 1.2, 0.25, 0.8, 2);
  });
  bus.on('fx:trail', ({ pos, color = 0xff7733 }) => {
    col.setHex(color);
    spark(pos.x, pos.y, pos.z, rnd(0.3), rnd(0.3), rnd(0.3), col.r, col.g, col.b, 0.25, 0.22, 0, 1);
    if (Math.random() < 0.6) puff(pos.x, pos.y, pos.z, rnd(0.3), 0.3, rnd(0.3), 0.4, 0.4, 0.42, 0.9, 0.2, 0.9, 0.4, 0.3, 1);
  });
  bus.on('fx:flame', ({ pos, dir, range }) => {
    for (let i = 0; i < 4; i++) {
      const v = range * (1.6 + Math.random());
      spark(pos.x, pos.y, pos.z, dir.x * v + rnd(1.2), dir.y * v + rnd(1.2) + 0.5, dir.z * v + rnd(1.2), 1, 0.45 + Math.random() * 0.3, 0.1, 0.45, 0.25, 1.3, 2, 1.8);
    }
    if (Math.random() < 0.4) puff(pos.x + dir.x * range * 0.7, pos.y + 0.5, pos.z + dir.z * range * 0.7, rnd(1), 1.5, rnd(1), 0.2, 0.18, 0.16, 1, 0.8, 2.2, 0.35, 0.8, 1);
  });
  bus.on('fx:ember', ({ pos }) => spark(pos.x, pos.y, pos.z, rnd(0.4), 1.5 + Math.random() * 1.5, rnd(0.4), 1, 0.5, 0.12, 0.8 + Math.random() * 0.6, 0.07, 0.5, 0.5));
  bus.on('fx:smoke', ({ pos, size = 1 }) => puff(pos.x, pos.y, pos.z, rnd(0.3), 0.8, rnd(0.3), 0.18, 0.17, 0.16, 1.5, 0.3 * size, 1.4 * size, 0.4, 0.8, 1));
  bus.on('arena:ready', () => {
    holes.im.count = 0; holes.cursor = 0;
    scorches.im.count = 0; scorches.cursor = 0;
  });

  const _dir = new THREE.Vector3();
  const _size = new THREE.Vector2();
  return {
    update(dt) {
      T += dt;
      // ambient emitters from the arena (smoke stacks, burning wrecks, steam)
      const em = state.world?.emitters || [];
      for (const e of em) {
        e.acc = (e.acc || 0) + dt * e.rate;
        while (e.acc >= 1) {
          e.acc -= 1;
          if (e.type === 'smoke') puff(e.x + rnd(0.3), e.y, e.z + rnd(0.3), rnd(0.3) + 0.4, 1.2 + Math.random(), rnd(0.3), 0.16, 0.15, 0.14, 3.5, 0.6, 3.5, 0.45, 0.5, 0.3);
          else if (e.type === 'steam') puff(e.x + rnd(0.2), e.y, e.z + rnd(0.2), rnd(0.3), 2 + Math.random(), rnd(0.3), 0.85, 0.85, 0.85, 2, 0.3, 2.5, 0.25, 0.4, 0.6);
          else if (e.type === 'fire') spark(e.x + rnd(0.4), e.y, e.z + rnd(0.4), rnd(0.3), 1.8 + Math.random() * 1.2, rnd(0.3), 1, 0.45 + Math.random() * 0.3, 0.1, 0.5 + Math.random() * 0.3, 0.45, 0.1, 2, 1);
          else if (e.type === 'sparks') spark(e.x, e.y, e.z, rnd(2), Math.random() * 2, rnd(2), 1, 0.8, 0.4, 0.8, 0.05, -14, 0.5);
          else if (e.type === 'motes') {
            const c = e.color ? col.setHex(e.color) : col.setRGB(0.4, 0.9, 1);
            spark(e.x + rnd(e.spread || 10), e.y + Math.random() * 4, e.z + rnd(e.spread || 10), rnd(0.2), 0.3, rnd(0.2), c.r, c.g, c.b, 3, 0.06, 0, 0.2);
          }
        }
      }
      // tracers: a streak that flies from the muzzle to the impact
      for (const t of tracers.items) {
        if (t.life <= 0) continue;
        t.life -= dt;
        if (t.life <= 0) { t.mesh.visible = false; continue; }
        t.travel += t.speed * dt;
        const head = Math.min(t.dist, t.travel);
        const tail = Math.max(0, head - t.len);
        t.mesh.position.copy(t.from).addScaledVector(t.dir, tail);
        _dir.copy(t.from).addScaledVector(t.dir, head);
        t.mesh.lookAt(_dir);
        t.mesh.scale.set(t.width, t.width, Math.max(0.01, head - tail));
        if (t.travel >= t.dist) t.mesh.material.opacity = Math.max(0, t.life / 0.04);
      }
      for (const b of beams.items) {
        if (b.life <= 0) continue;
        b.life -= dt;
        const k = Math.max(0, b.life / b.max);
        b.mesh.material.opacity = k;
        b.mesh.scale.x = b.mesh.scale.y = b.width * (0.4 + k);
        if (b.life <= 0) b.mesh.visible = false;
      }
      for (const a of arcs.items) {
        if (a.life <= 0) continue;
        a.life -= dt;
        a.line.material.opacity = Math.max(0, a.life / a.max);
        if (a.life <= 0) a.line.visible = false;
      }
      for (const r of rings.items) {
        if (r.life <= 0) continue;
        r.life -= dt;
        const k = 1 - Math.max(0, r.life / r.max);
        const rad = r.r0 + (r.r1 - r.r0) * (r.shrink ? k * k : 1 - (1 - k) * (1 - k));
        r.mesh.scale.setScalar(Math.max(0.01, rad));
        r.mesh.material.opacity = r.shrink ? 0.4 + k * 0.6 : 1 - k;
        if (r.life <= 0) r.mesh.visible = false;
      }
      for (const c of columns.items) {
        if (c.life <= 0) continue;
        c.life -= dt;
        const k = Math.max(0, c.life / c.max);
        c.mesh.scale.set(k, c.h * (1.2 - k * 0.2), k);
        c.mesh.material.opacity = k * 0.6;
        if (c.life <= 0) c.mesh.visible = false;
      }
      state.renderer.getDrawingBufferSize(_size);
      glow.update(T, _size.y, state.camera.fov);
      smoke.update(T, _size.y, state.camera.fov);
    },
  };
}
