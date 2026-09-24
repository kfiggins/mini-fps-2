import * as THREE from 'three';

// Procedural, seamlessly tiling PBR textures generated on a canvas at load.
// Each recipe produces albedo + normal + packed roughness(G)/metalness(B)
// (+ optional emissive / alpha) from a height field. Everything is periodic
// noise so textures tile without seams.

// ---------- periodic noise ----------
function makeLattice(period, seed) {
  const vals = new Float32Array(period * period);
  let s = seed >>> 0;
  for (let i = 0; i < vals.length; i++) {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    vals[i] = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return { period, vals };
}

function lattice(l, x, y) {
  const p = l.period;
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const x0 = ((xi % p) + p) % p, y0 = ((yi % p) + p) % p;
  const x1 = (x0 + 1) % p, y1 = (y0 + 1) % p;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = l.vals[y0 * p + x0], b = l.vals[y0 * p + x1];
  const c = l.vals[y1 * p + x0], d = l.vals[y1 * p + x1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// fbm over [0,1)² that tiles. base = lattice cells across the tile.
function makeFbm(base, octaves, seed) {
  const ls = [];
  for (let i = 0; i < octaves; i++) ls.push(makeLattice(base << i, seed + i * 7919));
  return (u, v) => {
    let sum = 0, amp = 0.5, norm = 0;
    for (let i = 0; i < octaves; i++) {
      const p = ls[i].period;
      sum += lattice(ls[i], u * p, v * p) * amp;
      norm += amp;
      amp *= 0.5;
    }
    return sum / norm;
  };
}

// cellular (worley) noise for pebbles / cracks: one jittered point per grid
// cell, periodic, 3x3 neighbourhood search.
function makeCells(count, seed) {
  const g = Math.max(2, Math.round(Math.sqrt(count)));
  const pts = new Float32Array(g * g * 3);
  let s = seed >>> 0;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < g * g; i++) {
    pts[i * 3] = rnd();
    pts[i * 3 + 1] = rnd();
    pts[i * 3 + 2] = rnd();
  }
  const out = [0, 0, 0];
  return (u, v) => {
    const x = u * g, y = v * g;
    const cx = Math.floor(x), cy = Math.floor(y);
    let d1 = 9, d2 = 9, id = 0;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const gx = cx + ox, gy = cy + oy;
        const wx = ((gx % g) + g) % g, wy = ((gy % g) + g) % g;
        const k = (wy * g + wx) * 3;
        const dx = gx + pts[k] - x, dy = gy + pts[k + 1] - y;
        const d = dx * dx + dy * dy;
        if (d < d1) { d2 = d1; d1 = d; id = pts[k + 2]; } else if (d < d2) d2 = d;
      }
    }
    out[0] = Math.sqrt(d1) / g;
    out[1] = Math.sqrt(d2) / g;
    out[2] = id;
    return out;
  };
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a + (b - a) * t;
const hexRgb = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

// ---------- generator ----------
function toTexture(canvas, srgb) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

function canvas2(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

// recipe: { size, height(u,v) -> 0..1, color(u,v,h) -> [r,g,b] 0..1,
//           rough(u,v,h) -> 0..1, metal(u,v,h) -> 0..1, emissive?(u,v,h) -> [r,g,b],
//           alpha?(u,v,h) -> 0..1, bump }
function generate(recipe) {
  const size = recipe.size || 512;
  const n = size * size;
  const H = new Float32Array(n);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) H[y * size + x] = recipe.height((x + 0.5) / size, (y + 0.5) / size);
  }
  const cA = canvas2(size), cN = canvas2(size), cR = canvas2(size);
  const dA = cA.getContext('2d').createImageData(size, size);
  const dN = cN.getContext('2d').createImageData(size, size);
  const dR = cR.getContext('2d').createImageData(size, size);
  let dE = null, cE = null;
  if (recipe.emissive) {
    cE = canvas2(size);
    dE = cE.getContext('2d').createImageData(size, size);
  }
  const bump = (recipe.bump ?? 2) * (size / 512);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const u = (x + 0.5) / size, v = (y + 0.5) / size;
      const h = H[i];
      const col = recipe.color(u, v, h);
      const o = i * 4;
      dA.data[o] = clamp01(col[0]) * 255;
      dA.data[o + 1] = clamp01(col[1]) * 255;
      dA.data[o + 2] = clamp01(col[2]) * 255;
      dA.data[o + 3] = recipe.alpha ? clamp01(recipe.alpha(u, v, h)) * 255 : 255;
      // normal from height (wrapping central differences)
      const hl = H[y * size + ((x - 1 + size) % size)];
      const hr = H[y * size + ((x + 1) % size)];
      const hu = H[((y - 1 + size) % size) * size + x];
      const hd = H[((y + 1) % size) * size + x];
      let nx = (hl - hr) * bump * 8, ny = (hd - hu) * bump * 8, nz = 1;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      dN.data[o] = (nx * inv * 0.5 + 0.5) * 255;
      dN.data[o + 1] = (ny * inv * 0.5 + 0.5) * 255;
      dN.data[o + 2] = (nz * inv * 0.5 + 0.5) * 255;
      dN.data[o + 3] = 255;
      dR.data[o] = 255;
      dR.data[o + 1] = clamp01(recipe.rough(u, v, h)) * 255;
      dR.data[o + 2] = clamp01(recipe.metal ? recipe.metal(u, v, h) : 0) * 255;
      dR.data[o + 3] = 255;
      if (dE) {
        const e = recipe.emissive(u, v, h);
        dE.data[o] = clamp01(e[0]) * 255;
        dE.data[o + 1] = clamp01(e[1]) * 255;
        dE.data[o + 2] = clamp01(e[2]) * 255;
        dE.data[o + 3] = 255;
      }
    }
  }
  cA.getContext('2d').putImageData(dA, 0, 0);
  cN.getContext('2d').putImageData(dN, 0, 0);
  cR.getContext('2d').putImageData(dR, 0, 0);
  if (dE) cE.getContext('2d').putImageData(dE, 0, 0);
  return {
    map: toTexture(cA, true),
    normalMap: toTexture(cN, false),
    ormMap: toTexture(cR, false),
    emissiveMap: cE ? toTexture(cE, true) : null,
  };
}

// ---------- recipes ----------
// Every recipe returns a THREE.MeshStandardMaterial; `scale` = metres per tile
// (the kit writes world-space UVs, so the material sets its own repeat).
function standard(tex, opts = {}) {
  const m = new THREE.MeshStandardMaterial({
    map: tex.map,
    normalMap: tex.normalMap,
    roughnessMap: tex.ormMap,
    metalnessMap: tex.ormMap,
    roughness: 1,
    metalness: opts.metalness ?? 1,
    normalScale: new THREE.Vector2(opts.normal ?? 1, opts.normal ?? 1),
    envMapIntensity: opts.env ?? 1,
    color: opts.color ?? 0xffffff,
  });
  if (tex.emissiveMap) {
    m.emissiveMap = tex.emissiveMap;
    m.emissive = new THREE.Color(0xffffff);
    m.emissiveIntensity = opts.emissiveIntensity ?? 2;
  }
  if (opts.alphaTest) {
    m.alphaTest = opts.alphaTest;
    m.side = THREE.DoubleSide;
  }
  m.userData.tileMeters = opts.tile ?? 4;
  m.userData.surface = opts.surface ?? 'metal';
  return m;
}

function sandImpl(seed = 1, base = 0xc9a26b) {
  const f = makeFbm(4, 6, seed);
  const macro = makeFbm(2, 3, seed + 21);
  const ripple = makeFbm(2, 3, seed + 50);
  const grit = makeCells(1600, seed + 3);
  const [br, bg, bb] = hexRgb(base);
  const tex = generate({
    height: (u, v) => {
      // wind ripples bent by noise + fine grit
      const r = Math.sin((v * 9 + u * 2 + ripple(u, v) * 4) * Math.PI * 2) * 0.5 + 0.5;
      const [d1] = grit(u, v);
      return f(u, v) * 0.55 + r * 0.2 + smooth(0.004, 0.0, d1) * 0.08;
    },
    color: (u, v, h) => {
      const m = macro(u, v);
      const k = 0.86 + (f(u, v) - 0.5) * 0.18 + (h - 0.5) * 0.1 + (m - 0.5) * 0.16;
      const [d1, , id] = grit(u, v);
      const g = smooth(0.004, 0.0, d1) * (id - 0.5) * 0.3;
      return [br * (k + g), bg * (k + g * 0.9), bb * (k + g * 0.8)];
    },
    rough: (u, v, h) => 0.94 - h * 0.06,
    bump: 1.1,
  });
  return standard(tex, { metalness: 1, tile: 7, env: 0.35, surface: 'dirt', normal: 0.8 });
}

function concreteImpl(seed = 2, base = 0x9a968c, opts = {}) {
  const f = makeFbm(4, 6, seed);
  const stains = makeFbm(2, 4, seed + 9);
  const pits = makeCells(900, seed + 1);
  const panels = opts.panels ?? 2;
  const [br, bg, bb] = hexRgb(base);
  const tex = generate({
    height: (u, v) => {
      const pu = (u * panels) % 1, pv = (v * panels) % 1;
      const seam = Math.min(pu, 1 - pu, pv, 1 - pv);
      const [d1] = pits(u, v);
      return 0.7 + f(u, v) * 0.14 - smooth(0.008, 0.0, seam) * 0.45 - smooth(0.003, 0, d1) * 0.07;
    },
    color: (u, v, h) => {
      const s = stains(u, v);
      const k = 0.9 + (f((u * 2) % 1, (v * 2) % 1) - 0.5) * 0.16 - smooth(0.5, 0.85, s) * 0.12;
      const pu = (u * panels) % 1, pv = (v * panels) % 1;
      const seam = Math.min(pu, 1 - pu, pv, 1 - pv);
      const dark = smooth(0.012, 0.0, seam) * 0.25;
      const c = k * (0.92 + h * 0.1) - dark;
      return [br * c, bg * c, bb * c];
    },
    rough: (u, v, h) => 0.86 + (1 - h) * 0.08,
    bump: 1.2,
  });
  return standard(tex, { metalness: 1, tile: opts.tile ?? 4, env: 0.5, surface: 'concrete' });
}

// painted steel panels with rivets, edge wear and scratches
function metalPanelImpl(seed = 3, base = 0x5d6b52, opts = {}) {
  const f = makeFbm(4, 5, seed);
  const wear = makeFbm(8, 4, seed + 4);
  const scratch = makeFbm(16, 2, seed + 8);
  const nx = opts.panelsX ?? 2, ny = opts.panelsY ?? 2;
  const [br, bg, bb] = hexRgb(base);
  const paintMask = (u, v) => {
    const pu = (u * nx) % 1, pv = (v * ny) % 1;
    const edge = Math.min(pu, 1 - pu, pv, 1 - pv);
    return smooth(0.68, 0.78, wear(u, v) + smooth(0.05, 0, edge) * 0.3);
  };
  const tex = generate({
    height: (u, v) => {
      const pu = (u * nx) % 1, pv = (v * ny) % 1;
      const edge = Math.min(pu, 1 - pu, pv, 1 - pv);
      let h = 0.6 - smooth(0.01, 0.0, edge) * 0.5 + f(u, v) * 0.05;
      // rivets along panel edges
      const ru = (pu * 8) % 1, rv = (pv * 8) % 1;
      if (edge < 0.05 && edge > 0.015) {
        const d = Math.hypot(ru - 0.5, (Math.min(pu, 1 - pu) < Math.min(pv, 1 - pv) ? (pv * 8) % 1 : (pu * 8) % 1) - 0.5);
        h += smooth(0.35, 0.1, d) * 0.12 * (edge > 0.02 ? 1 : 0);
        void rv;
      }
      return h - paintMask(u, v) * 0.04;
    },
    color: (u, v, h) => {
      const bare = paintMask(u, v);
      const k = 0.85 + f(u, v) * 0.25;
      const s = smooth(0.62, 0.7, scratch(u, v)) * 0.4;
      const paint = [br * k, bg * k, bb * k];
      const steel = [0.42 + s, 0.42 + s, 0.44 + s];
      return [mix(paint[0], steel[0], bare), mix(paint[1], steel[1], bare), mix(paint[2], steel[2], bare)].map((c) => c * (0.85 + h * 0.2));
    },
    rough: (u, v) => mix(opts.rough ?? 0.62, 0.38, paintMask(u, v)),
    metal: (u, v) => mix(opts.paintMetal ?? 0.15, 0.95, paintMask(u, v)),
    bump: 1.5,
  });
  return standard(tex, { tile: opts.tile ?? 3, env: 1 });
}

function corrugatedImpl(seed = 4, base = 0x8a8f94, opts = {}) {
  const f = makeFbm(4, 5, seed);
  const rust = makeFbm(4, 5, seed + 3);
  const ribs = opts.ribs ?? 12;
  const [br, bg, bb] = hexRgb(base);
  const tex = generate({
    height: (u) => 0.5 + Math.sin(u * ribs * Math.PI * 2) * 0.45,
    color: (u, v, h) => {
      const r = smooth(0.55, 0.75, rust(u, v) + (1 - v) * 0.08);
      const k = 0.8 + f(u, v) * 0.3 + h * 0.1;
      return [mix(br * k, 0.42, r), mix(bg * k, 0.22, r), mix(bb * k, 0.1, r)];
    },
    rough: (u, v) => mix(0.5, 0.9, smooth(0.55, 0.75, rust(u, v))),
    metal: (u, v) => mix(0.85, 0.2, smooth(0.55, 0.75, rust(u, v))),
    bump: 2.2,
  });
  return standard(tex, { tile: opts.tile ?? 3 });
}

function hazardImpl(seed = 5) {
  const f = makeFbm(4, 5, seed);
  const wear = makeFbm(8, 4, seed + 1);
  const tex = generate({
    height: (u, v) => 0.5 + f(u, v) * 0.1,
    color: (u, v) => {
      const stripe = ((u + v) * 4) % 1 < 0.5;
      const w = smooth(0.55, 0.72, wear(u, v));
      const k = 0.85 + f(u, v) * 0.2;
      const c = stripe ? [0.95 * k, 0.72 * k, 0.08] : [0.08, 0.08, 0.08];
      return [mix(c[0], 0.35, w), mix(c[1], 0.34, w), mix(c[2], 0.33, w)];
    },
    rough: () => 0.55,
    metal: (u, v) => smooth(0.55, 0.72, wear(u, v)) * 0.8,
    bump: 0.8,
  });
  return standard(tex, { tile: 2 });
}

function woodImpl(seed = 6, base = 0x8a6a42) {
  const grain = makeFbm(2, 5, seed);
  const f = makeFbm(8, 4, seed + 2);
  const [br, bg, bb] = hexRgb(base);
  const planks = 4;
  const tex = generate({
    height: (u, v) => {
      const pv = (v * planks) % 1;
      const seam = Math.min(pv, 1 - pv);
      return 0.6 - smooth(0.03, 0, seam) * 0.5 + grain(u, v) * 0.1;
    },
    color: (u, v) => {
      const plank = Math.floor(v * planks);
      const g = Math.sin((u * 40 + grain(u, (v + plank * 0.13) % 1) * 12) * 1.3) * 0.5 + 0.5;
      const k = 0.7 + g * 0.2 + f(u, v) * 0.2 + (plank % 2) * 0.06;
      return [br * k, bg * k, bb * k];
    },
    rough: () => 0.8,
    bump: 1.2,
  });
  return standard(tex, { metalness: 1, tile: 2, env: 0.4, surface: 'wood' });
}

function fabricImpl(seed = 7, base = 0xa89066) {
  const f = makeFbm(4, 5, seed);
  const [br, bg, bb] = hexRgb(base);
  const tex = generate({
    size: 256,
    height: (u, v) => {
      const wv = Math.sin(u * 128 * Math.PI) * Math.sin(v * 128 * Math.PI);
      return 0.5 + wv * 0.15 + f(u, v) * 0.3;
    },
    color: (u, v, h) => {
      const k = 0.78 + f(u, v) * 0.3 + h * 0.1;
      return [br * k, bg * k, bb * k];
    },
    rough: () => 0.95,
    bump: 1.2,
  });
  return standard(tex, { metalness: 1, tile: 1.5, env: 0.3, surface: 'dirt' });
}

function rockImpl(seed = 8, base = 0x8c7a66) {
  const f = makeFbm(4, 7, seed);
  const cr = makeCells(40, seed + 1);
  const [br, bg, bb] = hexRgb(base);
  const tex = generate({
    height: (u, v) => {
      const [d1, d2] = cr(u, v);
      return f(u, v) * 0.7 + smooth(0.0, 0.05, d2 - d1) * 0.3;
    },
    color: (u, v, h) => {
      const k = 0.6 + h * 0.5;
      return [br * k, bg * k, bb * k];
    },
    rough: () => 0.9,
    bump: 2.5,
  });
  return standard(tex, { metalness: 1, tile: 4, env: 0.4, surface: 'concrete' });
}

function asphaltImpl(seed = 9, base = 0x3a3a3c) {
  const f = makeFbm(8, 5, seed);
  const patch = makeFbm(2, 4, seed + 2);
  const cracks = makeCells(14, seed + 5);
  const crackMask = makeFbm(4, 3, seed + 7);
  const grit = makeCells(2500, seed + 11);
  const [br, bg, bb] = hexRgb(base);
  const tex = generate({
    height: (u, v) => {
      const [d1, d2] = cracks(u, v);
      const crack = smooth(0.004, 0, d2 - d1) * smooth(0.55, 0.7, crackMask(u, v));
      const [g1] = grit(u, v);
      return 0.6 + f(u, v) * 0.2 - crack * 0.35 + smooth(0.003, 0, g1) * 0.05;
    },
    color: (u, v, h) => {
      const k = 0.85 + (f(u, v) - 0.5) * 0.3 + (patch(u, v) - 0.5) * 0.25;
      const [g1, , id] = grit(u, v);
      const g = smooth(0.004, 0, g1) * (id * 0.6);
      return [br * (k + g) * (0.8 + h * 0.3), bg * (k + g) * (0.8 + h * 0.3), bb * (k + g) * (0.8 + h * 0.3)];
    },
    rough: () => 0.9,
    bump: 1.2,
  });
  return standard(tex, { metalness: 1, tile: 8, env: 0.3, surface: 'concrete' });
}

// walkable steel grating: alpha-tested holes
function gratingImpl(seed = 10, base = 0x5a5f66) {
  const f = makeFbm(4, 4, seed);
  const [br, bg, bb] = hexRgb(base);
  const bars = 24;
  const tex = generate({
    size: 256,
    height: (u, v) => {
      const a = Math.abs(((u * bars) % 1) - 0.5), b = Math.abs(((v * bars * 0.5) % 1) - 0.5);
      return a > 0.32 || b > 0.4 ? 1 : 0.2;
    },
    color: (u, v) => {
      const k = 0.8 + f(u, v) * 0.3;
      return [br * k, bg * k, bb * k];
    },
    alpha: (u, v, h) => (h > 0.5 ? 1 : 0),
    rough: () => 0.5,
    metal: () => 0.9,
    bump: 1,
  });
  return standard(tex, { tile: 2, alphaTest: 0.5 });
}

// dark tech panel with glowing seams (reactor)
function techPanelImpl(seed = 11, base = 0x1c2230, glow = 0x19e6ff, opts = {}) {
  const f = makeFbm(4, 5, seed);
  const [br, bg, bb] = hexRgb(base);
  const [gr, gg, gb] = hexRgb(glow);
  const nx = opts.panels ?? 2;
  const seamF = (u, v) => {
    const pu = (u * nx) % 1, pv = (v * nx) % 1;
    return Math.min(pu, 1 - pu, pv, 1 - pv);
  };
  const tex = generate({
    height: (u, v) => {
      const s = seamF(u, v);
      const inner = Math.min(Math.abs(((u * nx) % 1) - 0.5), Math.abs(((v * nx) % 1) - 0.5));
      return 0.6 - smooth(0.02, 0, s) * 0.5 + smooth(0.02, 0.0, Math.abs(inner - 0.3)) * 0.1 + f(u, v) * 0.04;
    },
    color: (u, v, h) => {
      const k = 0.8 + f(u, v) * 0.3;
      return [br * k * (0.7 + h * 0.5), bg * k * (0.7 + h * 0.5), bb * k * (0.7 + h * 0.5)];
    },
    emissive: (u, v) => {
      const s = seamF(u, v);
      const g = smooth(0.012, 0.0, s) * (opts.glowAmount ?? 1);
      return [gr * g, gg * g, gb * g];
    },
    rough: (u, v) => 0.35 + f(u, v) * 0.25,
    metal: () => 0.85,
    bump: 1.4,
  });
  return standard(tex, { tile: opts.tile ?? 4, emissiveIntensity: opts.emissiveIntensity ?? 3 });
}

function rustImpl(seed = 12, base = 0x6b3b22) {
  const f = makeFbm(4, 7, seed);
  const g = makeFbm(8, 4, seed + 1);
  const [br, bg, bb] = hexRgb(base);
  const tex = generate({
    height: (u, v) => f(u, v) * 0.8 + g(u, v) * 0.2,
    color: (u, v, h) => {
      const k = 0.6 + h * 0.6;
      const dark = smooth(0.6, 0.3, g(u, v));
      return [br * k * (1 - dark * 0.4), bg * k * (1 - dark * 0.5), bb * k * (1 - dark * 0.5)];
    },
    rough: (u, v, h) => 0.75 + h * 0.2,
    metal: (u, v, h) => 0.3 + (1 - h) * 0.3,
    bump: 2,
  });
  return standard(tex, { tile: 3 });
}

// Animated molten metal: scrolling fbm in the shader, strongly emissive so
// bloom makes it glow. Returns a material with an `update(dt)` in userData.
export function lava(color = 0xff6a1a) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) } },
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      varying vec3 vW;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += noise(p) * a; p *= 2.1; a *= 0.5; } return s; }
      void main() {
        vec2 p = vW.xz * 0.35;
        float n = fbm(p + vec2(uTime * 0.08, uTime * 0.03));
        float n2 = fbm(p * 2.3 - vec2(uTime * 0.05, -uTime * 0.07) + n);
        float crust = smoothstep(0.55, 0.75, n2);
        vec3 hot = uColor * (1.1 + n * 1.6);
        vec3 col = mix(hot, vec3(0.08, 0.03, 0.02), crust * 0.85);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  mat.toneMapped = true;
  mat.userData.surface = 'dirt';
  mat.userData.tileMeters = 4;
  mat.userData.update = (dt) => { mat.uniforms.uTime.value += dt; };
  return mat;
}

// Texture generation is the slow part of building an arena, so each recipe
// is memoised by its arguments: later loads clone the material and share
// the already-generated textures (arena unloads never dispose them).
const memo = new Map();
function cached(name, impl) {
  return (...args) => {
    const key = `${name}|${JSON.stringify(args)}`;
    let m = memo.get(key);
    if (!m) {
      m = impl(...args);
      memo.set(key, m);
    }
    const c = m.clone();
    c.userData = { ...m.userData };
    return c;
  };
}
export const sand = cached('sand', sandImpl);
export const concrete = cached('concrete', concreteImpl);
export const metalPanel = cached('metalPanel', metalPanelImpl);
export const corrugated = cached('corrugated', corrugatedImpl);
export const hazard = cached('hazard', hazardImpl);
export const wood = cached('wood', woodImpl);
export const fabric = cached('fabric', fabricImpl);
export const rock = cached('rock', rockImpl);
export const asphalt = cached('asphalt', asphaltImpl);
export const grating = cached('grating', gratingImpl);
export const techPanel = cached('techPanel', techPanelImpl);
export const rust = cached('rust', rustImpl);
