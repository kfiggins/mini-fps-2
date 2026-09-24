import * as THREE from 'three';

// Reusable set dressing. Each prop adds its geometry to the kit batches and,
// where it's meant to be cover, a collider. Props take a `mats` bag so every
// arena can dress them in its own palette.

const cyl = (rt, rb, h, s = 16) => new THREE.CylinderGeometry(rt, rb, h, s);
const sph = (r, w = 12, h = 8) => new THREE.SphereGeometry(r, w, h);

export function barrel(kit, x, z, mat, { y = 0, tipped = false, rim = null } = {}) {
  const h = 1.05, r = 0.34;
  if (tipped) {
    kit.geo(cyl(r, r, h, 18), mat, { x, y: y + r, z, rz: Math.PI / 2 });
    kit.collision.addBox(x - h / 2, y, z - r, x + h / 2, y + 2 * r, z + r, 'metal');
    return;
  }
  kit.geo(cyl(r, r, h, 18), mat, { x, y: y + h / 2, z });
  for (const ry of [0.2, 0.8]) kit.geo(cyl(r + 0.02, r + 0.02, 0.05, 18), rim || mat, { x, y: y + h * ry, z });
  kit.collision.addBox(x - r, y, z - r, x + r, y + h, z + r, 'metal');
}

export function barrelCluster(kit, x, z, mats, rng) {
  const spots = [[0, 0], [0.75, 0.1], [0.3, 0.7], [-0.5, 0.55]];
  const n = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const m = mats.barrels[Math.floor(rng() * mats.barrels.length)];
    barrel(kit, x + spots[i][0], z + spots[i][1], m, { rim: mats.dark });
  }
}

export function crate(kit, x, z, s, mat, { y = 0, ry = 0, trim = null } = {}) {
  kit.box(x, y + s / 2, z, s, s, s, mat, { ry, bevel: 0.05 });
  if (trim) {
    // metal corner trims read as a proper crate at distance
    const t = 0.06;
    const c = Math.cos(ry), sn = Math.sin(ry);
    for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const lx = (ox * (s / 2 - t / 2)), lz = (oz * (s / 2 - t / 2));
      kit.box(x + lx * c + lz * sn, y + s / 2, z - lx * sn + lz * c, t + 0.02, s + 0.02, t + 0.02, trim, { collide: false, bevel: 0.01, ry });
    }
  }
}

export function crateStack(kit, x, z, mats, rng, big = false) {
  const s = big ? 1.4 : 1.1;
  const ry = (rng() - 0.5) * 0.3;
  crate(kit, x, z, s, mats.crate, { ry, trim: mats.dark });
  if (rng() < 0.7) crate(kit, x + (rng() - 0.5) * 0.2, z + (rng() - 0.5) * 0.2, s * 0.85, mats.crate, { y: s, ry: ry + (rng() - 0.5) * 0.6, trim: mats.dark });
  if (rng() < 0.5) crate(kit, x + s * 1.02, z + (rng() - 0.5) * 0.3, s * 0.9, mats.crate, { ry: ry + 0.1, trim: mats.dark });
}

// row of sandbags on a collider (cover height ~1.15)
export function sandbagWall(kit, x0, z0, x1, z1, mat, { layers = 4, y = 0 } = {}) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const ang = Math.atan2(z1 - z0, x1 - x0);
  const bagL = 0.62, bagH = 0.27, bagW = 0.5;
  const n = Math.max(1, Math.round(len / (bagL * 0.95)));
  const bag = new THREE.CapsuleGeometry(bagH / 2, bagL - bagH, 3, 8);
  bag.rotateZ(Math.PI / 2);
  bag.scale(1, 1, bagW / bagH);
  for (let l = 0; l < layers; l++) {
    const off = (l % 2) * 0.5;
    for (let i = 0; i < n - (l % 2); i++) {
      const t = (i + 0.5 + off) / n;
      const px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t;
      kit.geo(bag, mat, {
        x: px, y: y + bagH / 2 + l * bagH * 0.95, z: pz,
        ry: -ang + (Math.sin(i * 7.3 + l) * 0.08), sy: 0.95 + Math.sin(i * 3.1 + l * 2) * 0.05,
      });
    }
  }
  // collider: oriented walls become an AABB per segment chunk
  const h = layers * bagH * 0.95 + 0.05;
  const chunks = Math.max(1, Math.ceil(len / 1.5));
  for (let i = 0; i < chunks; i++) {
    const a = i / chunks, b = (i + 1) / chunks;
    const ax = x0 + (x1 - x0) * a, az = z0 + (z1 - z0) * a;
    const bx = x0 + (x1 - x0) * b, bz = z0 + (z1 - z0) * b;
    const hw = bagW / 2;
    kit.collision.addBox(Math.min(ax, bx) - hw, y, Math.min(az, bz) - hw, Math.max(ax, bx) + hw, y + h, Math.max(az, bz) + hw, 'dirt');
  }
}

// Concrete jersey barrier (tapered). Collides as a box.
export function jersey(kit, x, z, ry, mat) {
  const shape = new THREE.Shape();
  shape.moveTo(-0.32, 0);
  shape.lineTo(0.32, 0);
  shape.lineTo(0.22, 0.28);
  shape.lineTo(0.12, 0.85);
  shape.lineTo(-0.12, 0.85);
  shape.lineTo(-0.22, 0.28);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: 2.8, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 });
  g.translate(0, 0, -1.4);
  kit.geo(g, mat, { x, y: 0, z, ry });
  const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry));
  const hw = (0.64 * c + 2.8 * s) / 2, hd = (0.64 * s + 2.8 * c) / 2;
  kit.collision.addBox(x - hw, 0, z - hd, x + hw, 0.88, z + hd, 'concrete');
}

// HESCO barrier run: wire-mesh sand boxes. Big perimeter blocks.
export function hesco(kit, x0, z0, x1, z1, mat, frame, { h = 2.6 } = {}) {
  const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  const len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
  const n = Math.max(1, Math.round(len / 1.5));
  const cell = len / n;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    const w = alongX ? cell - 0.04 : 1.4, d = alongX ? 1.4 : cell - 0.04;
    kit.box(x, h / 2, z, w, h, d, mat, { collide: false, bevel: 0.12 });
    // mesh frame posts
    for (const s of [-1, 1]) {
      const px = alongX ? x + s * (cell / 2 - 0.03) : x + 0.72 * s;
      const pz = alongX ? z + 0.72 * s : z + s * (cell / 2 - 0.03);
      kit.box(px, h / 2, pz, 0.05, h + 0.02, 0.05, frame, { collide: false, bevel: 0.01, cast: false });
    }
  }
  const minX = Math.min(x0, x1) - (alongX ? 0 : 0.7), maxX = Math.max(x0, x1) + (alongX ? 0 : 0.7);
  const minZ = Math.min(z0, z1) - (alongX ? 0.7 : 0), maxZ = Math.max(z0, z1) + (alongX ? 0.7 : 0);
  kit.collision.addBox(minX, 0, minZ, maxX, h, maxZ, 'dirt');
}

// ISO shipping container. dir 'x' = long axis along x. Walkable roof.
export function container(kit, x, y, z, dir, mat, trim, { doors = true } = {}) {
  const L = 6.1, H = 2.6, W = 2.44;
  const w = dir === 'x' ? L : W, d = dir === 'x' ? W : L;
  kit.box(x, y + H / 2, z, w, H, d, mat, { bevel: 0.03 });
  // corner castings + top/bottom rails
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      kit.box(x + sx * (w / 2 - 0.09), y + H / 2, z + sz * (d / 2 - 0.09), 0.2, H + 0.02, 0.2, trim, { collide: false, bevel: 0.02 });
    }
  }
  for (const yy of [0.08, H - 0.08]) {
    if (dir === 'x') {
      for (const sz of [-1, 1]) kit.box(x, y + yy, z + sz * (d / 2 - 0.02), w - 0.1, 0.16, 0.1, trim, { collide: false, bevel: 0.02 });
    } else {
      for (const sx of [-1, 1]) kit.box(x + sx * (w / 2 - 0.02), y + yy, z, 0.1, 0.16, d - 0.1, trim, { collide: false, bevel: 0.02 });
    }
  }
  if (doors) {
    // door bars on one end
    const ex = dir === 'x' ? x + w / 2 + 0.02 : x;
    const ez = dir === 'x' ? z : z + d / 2 + 0.02;
    for (const o of [-0.8, -0.3, 0.3, 0.8]) {
      kit.box(dir === 'x' ? ex : ex + o, y + H / 2, dir === 'x' ? ez + o : ez, dir === 'x' ? 0.05 : 0.06, H - 0.4, dir === 'x' ? 0.06 : 0.05, trim, { collide: false, bevel: 0.01, cast: false });
    }
  }
}

export function tire(kit, x, z, mat, { y = 0, stack = 1 } = {}) {
  const g = new THREE.TorusGeometry(0.36, 0.16, 8, 16);
  for (let i = 0; i < stack; i++) kit.geo(g, mat, { x: x + Math.sin(i * 2) * 0.05, y: y + 0.16 + i * 0.3, z, rx: Math.PI / 2 });
  kit.collision.addBox(x - 0.52, y, z - 0.52, x + 0.52, y + stack * 0.3 + 0.05, z + 0.52, 'dirt');
}

export function rockCluster(kit, x, z, mat, rng, scale = 1) {
  const n = 2 + Math.floor(rng() * 3);
  let maxR = 0;
  for (let i = 0; i < n; i++) {
    const r = (0.6 + rng() * 0.9) * scale;
    const g = new THREE.IcosahedronGeometry(r, 1);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const f = 0.8 + Math.sin(p.getX(k) * 3.1 + i) * 0.1 + Math.cos(p.getZ(k) * 2.3 + i * 2) * 0.12;
      p.setXYZ(k, p.getX(k) * f, p.getY(k) * f * 0.7, p.getZ(k) * f);
    }
    g.computeVertexNormals();
    const ox = (rng() - 0.5) * 1.6 * scale, oz = (rng() - 0.5) * 1.6 * scale;
    kit.geo(g, mat, { x: x + ox, y: r * 0.25, z: z + oz, ry: rng() * 6 });
    maxR = Math.max(maxR, Math.hypot(ox, oz) + r * 0.8);
  }
  const hs = maxR * 0.6;
  kit.collision.addBox(x - hs, 0, z - hs, x + hs, 1.0 * scale, z + hs, 'concrete');
}

// Lamp post with an emissive head (no real light — bloom sells it)
export function lampPost(kit, x, z, pole, bulb, { h = 5, ry = 0 } = {}) {
  kit.geo(cyl(0.07, 0.1, h, 10), pole, { x, y: h / 2, z });
  const ax = Math.cos(ry), az = -Math.sin(ry);
  kit.box(x + ax * 0.45, h, z + az * 0.45, 0.9, 0.08, 0.08, pole, { collide: false, bevel: 0.02, ry });
  kit.box(x + ax * 0.85, h - 0.08, z + az * 0.85, 0.36, 0.12, 0.2, pole, { collide: false, bevel: 0.03, ry });
  kit.box(x + ax * 0.85, h - 0.15, z + az * 0.85, 0.3, 0.04, 0.15, bulb, { collide: false, bevel: 0.01, cast: false, ry });
  kit.collision.addBox(x - 0.12, 0, z - 0.12, x + 0.12, h, z + 0.12, 'metal');
}

// Camouflage net on four poles — shade that doesn't block bullets.
export function camoNet(kit, x, z, w, d, h, netMat, pole) {
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    kit.geo(cyl(0.05, 0.05, h, 6), pole, { x: x + (sx * w) / 2, y: h / 2, z: z + (sz * d) / 2 });
    kit.collision.addBox(x + (sx * w) / 2 - 0.08, 0, z + (sz * d) / 2 - 0.08, x + (sx * w) / 2 + 0.08, h, z + (sz * d) / 2 + 0.08, 'metal');
  }
  const g = new THREE.PlaneGeometry(w + 0.6, d + 0.6, 10, 10);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i), py = p.getY(i);
    const edge = Math.max(Math.abs(px) / ((w + 0.6) / 2), Math.abs(py) / ((d + 0.6) / 2));
    p.setZ(i, -Math.pow(1 - edge, 0.5) * 0.35 + Math.sin(px * 2.1) * 0.06 + Math.cos(py * 1.7) * 0.06 - (edge > 0.9 ? 0.25 : 0));
  }
  g.computeVertexNormals();
  kit.geo(g, netMat, { x, y: h, z, rx: -Math.PI / 2, cast: true });
}

// Waving flag on a pole (animated mesh; returns an updater)
export function flag(kit, x, z, h, pole, color) {
  kit.geo(cyl(0.05, 0.06, h, 8), pole, { x, y: h / 2, z });
  kit.collision.addBox(x - 0.1, 0, z - 0.1, x + 0.1, h, z + 0.1, 'metal');
  const g = new THREE.PlaneGeometry(1.8, 1.1, 16, 6);
  g.translate(0.9, 0, 0);
  const base = Float32Array.from(g.attributes.position.array);
  const m = new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.9 });
  const mesh = kit.add(new THREE.Mesh(g, m), { cast: true });
  mesh.position.set(x + 0.05, h - 0.6, z);
  let t = Math.random() * 10;
  return (dt) => {
    t += dt;
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const bx = base[i * 3], by = base[i * 3 + 1];
      const k = bx / 1.8;
      p.setZ(i, Math.sin(bx * 3 - t * 6 + by * 0.8) * 0.18 * k + Math.sin(bx * 7 - t * 9) * 0.04 * k);
    }
    p.needsUpdate = true;
    g.computeVertexNormals();
  };
}

export function shrub(kit, x, z, mat, rng) {
  const n = 5 + Math.floor(rng() * 5);
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2, r = rng() * 0.35;
    const g = new THREE.ConeGeometry(0.04, 0.5 + rng() * 0.5, 4);
    kit.geo(g, mat, { x: x + Math.cos(a) * r, y: 0.25, z: z + Math.sin(a) * r, rx: (rng() - 0.5) * 0.9, rz: (rng() - 0.5) * 0.9, cast: false });
  }
}
