import * as THREE from 'three';
import * as T from './textures.js';
import * as P from './props.js';
import { createSky, createHorizon } from './sky.js';

// ACT 3 — REACTOR CORE. A neon facility at night around a live reactor.
//   centre: the reactor column on a 1.5m dais; dais jump pads launch you
//           onto the ring
//   ring:   a square catwalk loop at 6m, four pinwheel stairways up
//   NW: glass control room (2 floors)   NE: coolant tank cluster
//   SE: server-rack corridors (CQB)     SW: hangar pad with a dropship
// THE PULSE: during waves the reactor charges (warnings + light) then a
// shockwave sweeps the ground floor. Get above 1m or jump it. It shreds
// robots on the floor too — bait them.

export const REACTOR = { id: 'reactor', name: 'REACTOR CORE', half: 42 };
const G = 26;

function pad(x, z, tx, ty, tz, y = 0) {
  const dx = tx - x, dz = tz - z;
  const dist = Math.hypot(dx, dz);
  const Tf = Math.min(1.6, Math.max(1.05, dist / 10));
  ty += 1.1;
  return {
    x, y, z, r: 1.1, toX: tx, toY: ty - 1.1, toZ: tz,
    vx: dx / Tf, vy: (ty - y + 0.5 * G * Tf * Tf) / Tf, vz: dz / Tf, color: 0xff2bd6,
  };
}

export function buildReactor(ctx) {
  const { scene, realScene, renderer, kit, rng } = ctx;
  const updaters = [];
  const emitters = ctx.emitters;

  // ---------- atmosphere: night, stars, moonlight ----------
  const sunDir = new THREE.Vector3(0.35, 0.72, -0.45).normalize();
  const sky = createSky(scene, realScene, renderer, {
    top: 0x060818, horizon: 0x2a2060, bottom: 0x0c0a1a, ground: 0x2a2a44,
    sunColor: 0x9fb8ff, sunDir: sunDir.toArray(), sunSize: 0.6, clouds: 0.18,
    cloudColor: 0x404a90, stars: 1.2, haze: 0.5, envIntensity: 0.7, horizonPow: 0.45,
  });
  realScene.fog = new THREE.Fog(0x0b0c1c, 45, 170);
  realScene.background = new THREE.Color(0x0b0c1c);
  const hemi = new THREE.HemisphereLight(0x8090e0, 0x302c40, 2.3);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xb8c8ff, 1.8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -44; sc.right = 44; sc.top = 44; sc.bottom = -44; sc.near = 1; sc.far = 240;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  createHorizon(scene, { radius: 200, height: 40, color: 0x0e1024, seed: 21, jag: 0.6, y: -3 });

  // ---------- materials ----------
  const M = {
    floor: T.techPanel(301, 0x505a6c, 0x19e6ff, { panels: 2, tile: 6, glowAmount: 0.3, emissiveIntensity: 1.0 }),
    wall: T.techPanel(302, 0x444c5e, 0xff2bd6, { panels: 2, tile: 4, glowAmount: 0.45, emissiveIntensity: 1.2 }),
    panel: T.metalPanel(303, 0x5a6478, { panelsX: 2, panelsY: 2, tile: 2.5, rough: 0.4, paintMetal: 0.4 }),
    dark: T.metalPanel(304, 0x404858, { panelsX: 1, panelsY: 1, tile: 2, rough: 0.45, paintMetal: 0.4 }),
    white: T.metalPanel(305, 0xb8bec8, { panelsX: 2, panelsY: 1, tile: 3, rough: 0.35, paintMetal: 0.3 }),
    hazard: T.hazard(306),
    grating: T.grating(307, 0x4a5260),
    crate: T.metalPanel(308, 0x2e4a5a, { panelsX: 1, panelsY: 1, tile: 1.5 }),
  };
  M.cyan = new THREE.MeshStandardMaterial({ color: 0x0a2830, emissive: 0x19e6ff, emissiveIntensity: 3 });
  M.magenta = new THREE.MeshStandardMaterial({ color: 0x300a28, emissive: 0xff2bd6, emissiveIntensity: 3 });
  M.core = new THREE.MeshStandardMaterial({ color: 0xbff8ff, emissive: 0x7ff0ff, emissiveIntensity: 4, transparent: true, opacity: 0.95 });
  M.glass = new THREE.MeshStandardMaterial({ color: 0x3aa8ff, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.18, envMapIntensity: 2, side: THREE.DoubleSide, depthWrite: false });
  M.black = new THREE.MeshStandardMaterial({ color: 0x323846, roughness: 0.45, metalness: 0.5 });
  M.barrels = [M.cyan, M.panel, M.dark].map(() => new THREE.MeshStandardMaterial({ color: 0x2a3444, roughness: 0.4, metalness: 0.7 }));
  for (const m of [M.cyan, M.magenta, M.core, M.glass, M.black, ...M.barrels]) m.userData.surface = 'metal';
  const mats = { ...M, crate: M.crate, dark: M.black, barrels: M.barrels };
  const lamp = (x, y, z, color, intensity, dist) => {
    const l = new THREE.PointLight(color, intensity, dist, 2);
    l.position.set(x, y, z);
    scene.add(l);
    return l;
  };
  const strip = (x, y, z, w, h, d, mat = M.cyan) => kit.box(x, y, z, w, h, d, mat, { collide: false, cast: false, bevel: 0 });

  // ---------- ground + perimeter ----------
  kit.geo(new THREE.PlaneGeometry(400, 400), M.floor, { rx: -Math.PI / 2, cast: false });
  const H = 42, WH = 8, gw = 3.6;
  const spawnPoints = [];
  for (const [ax, sgn] of [['x', -1], ['x', 1], ['z', -1], ['z', 1]]) {
    const at = sgn * H;
    for (const [a, b] of [[-H - 0.5, -gw], [gw, H + 0.5]]) {
      if (ax === 'x') kit.slab(a, 0, at - 0.6, b, WH, at + 0.6, M.wall, { bevel: 0.08 });
      else kit.slab(at - 0.6, 0, a, at + 0.6, WH, b, M.wall, { bevel: 0.08 });
    }
    // top trim glow
    if (ax === 'x') strip(0, WH + 0.05, at - sgn * 0.62, 2 * H, 0.1, 0.1, M.magenta);
    else strip(at - sgn * 0.62, WH + 0.05, 0, 0.1, 0.1, 2 * H, M.magenta);
    // gate bay (sealed pen behind the gap)
    const d = 6.5, w = gw + 0.6;
    if (ax === 'x') {
      kit.slab(-w - 0.5, 0, Math.min(at, at + sgn * d), -w, WH, Math.max(at, at + sgn * d), M.wall);
      kit.slab(w, 0, Math.min(at, at + sgn * d), w + 0.5, WH, Math.max(at, at + sgn * d), M.wall);
      kit.slab(-w - 0.5, 0, at + sgn * d - (sgn > 0 ? 0 : 0.5), w + 0.5, WH, at + sgn * d + (sgn > 0 ? 0.5 : 0), M.wall);
      spawnPoints.push(new THREE.Vector3(0, 0, at + sgn * d / 2));
      kit.collision.addBox(-70, WH, at - 0.6, 70, 70, at + 0.6, 'barrier');
      for (const s of [-1, 1]) kit.box(s * (gw + 0.25), WH / 2, at, 0.5, WH, 1.4, M.hazard, { collide: false });
      strip(0, WH - 0.6, at - sgn * 0.75, gw * 2, 0.15, 0.1, M.cyan);
    } else {
      kit.slab(Math.min(at, at + sgn * d), 0, -w - 0.5, Math.max(at, at + sgn * d), WH, -w, M.wall);
      kit.slab(Math.min(at, at + sgn * d), 0, w, Math.max(at, at + sgn * d), WH, w + 0.5, M.wall);
      kit.slab(at + sgn * d - (sgn > 0 ? 0 : 0.5), 0, -w - 0.5, at + sgn * d + (sgn > 0 ? 0.5 : 0), WH, w + 0.5, M.wall);
      spawnPoints.push(new THREE.Vector3(at + sgn * d / 2, 0, 0));
      kit.collision.addBox(at - 0.6, WH, -70, at + 0.6, 70, 70, 'barrier');
      for (const s of [-1, 1]) kit.box(at, WH / 2, s * (gw + 0.25), 1.4, WH, 0.5, M.hazard, { collide: false });
      strip(at - sgn * 0.75, WH - 0.6, 0, 0.1, 0.15, gw * 2, M.cyan);
    }
  }
  // corner teleport pads (extra spawns) + capacitor pylons behind them
  const coilLights = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = sx * 36.5, z = sz * 36.5;
    kit.geo(new THREE.CylinderGeometry(1.8, 2, 0.2, 24), M.dark, { x, y: 0.1, z, cast: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.6, 32), M.magenta);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.22, z);
    kit.add(ring);
    spawnPoints.push(new THREE.Vector3(x, 0, z));
    const px = sx * 40, pz = sz * 40;
    kit.geo(new THREE.CylinderGeometry(0.7, 1.1, 14, 10), M.dark, { x: px, y: 7, z: pz });
    for (let i = 0; i < 5; i++) kit.geo(new THREE.TorusGeometry(1.1 - i * 0.05, 0.12, 6, 20), M.magenta, { x: px, y: 3 + i * 2.2, z: pz, rx: Math.PI / 2, cast: false });
    kit.geo(new THREE.SphereGeometry(1.1, 16, 12), M.core, { x: px, y: 14.8, z: pz, cast: false });
    coilLights.push(lamp(px, 15, pz, 0xff2bd6, 8, 26));
  }

  // ---------- CENTRE: reactor + dais ----------
  const DY = 1.5, DH = 8, R = 3.6;
  kit.slab(-DH, 0, -DH, DH, DY, DH, M.panel, { bevel: 0.1 });
  for (const [x, z, dir] of [[0, -DH - 2.6, '+z'], [0, DH + 2.6, '-z'], [-DH - 2.6, 0, '+x'], [DH + 2.6, 0, '-x']]) {
    kit.stairs(x, z, dir, 2.6, 3.2, 0, DY, M.dark);
  }
  strip(0, DY + 0.01, -DH + 0.15, 2 * DH, 0.02, 0.12);
  strip(0, DY + 0.01, DH - 0.15, 2 * DH, 0.02, 0.12);
  strip(-DH + 0.15, DY + 0.01, 0, 0.12, 0.02, 2 * DH);
  strip(DH - 0.15, DY + 0.01, 0, 0.12, 0.02, 2 * DH);
  // the column: a glass core inside a caged housing, rising into the sky
  const core = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.55, R * 0.55, 44, 24, 1, true), M.core);
  core.position.set(0, DY + 22, 0);
  kit.add(core);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    kit.geo(new THREE.BoxGeometry(0.6, 44, 0.6), M.black, { x: Math.cos(a) * R, y: DY + 22, z: Math.sin(a) * R, cast: false });
  }
  const bands = [];
  for (let i = 0; i < 9; i++) {
    const b = new THREE.Mesh(new THREE.TorusGeometry(R + 0.1, 0.18, 8, 36), M.cyan.clone());
    b.rotation.x = Math.PI / 2;
    b.position.set(0, DY + 1.5 + i * 4.5, 0);
    kit.add(b);
    bands.push(b);
  }
  kit.geo(new THREE.CylinderGeometry(R + 0.8, R + 1.2, 2.2, 32), M.dark, { y: DY + 1.1 });
  kit.collision.addBox(-R - 1, DY, -(R + 1) * 0.72, R + 1, 60, (R + 1) * 0.72, 'nowalk');
  kit.collision.addBox(-(R + 1) * 0.72, DY, -R - 1, (R + 1) * 0.72, 60, R + 1, 'nowalk');
  const coreLight = lamp(0, 8, 0, 0x7ff0ff, 28, 55);
  // cover on the dais
  for (const [x, z] of [[-6, -6], [6, 6], [6, -6], [-6, 6]]) kit.box(x, DY + 0.6, z, 1.4, 1.2, 1.4, M.panel);

  // ---------- the ring catwalk (6m) ----------
  const RY = 6, RO = 17, RI = 14;
  kit.slab(-RO, RY - 0.35, -RO, RO, RY, -RI, M.panel);
  kit.slab(-RO, RY - 0.35, RI, RO, RY, RO, M.panel);
  kit.slab(-RO, RY - 0.35, -RI, -RI, RY, RI, M.panel);
  kit.slab(RI, RY - 0.35, -RI, RO, RY, RI, M.panel);
  for (const p of [-RO + 0.4, 0, RO - 0.4]) {
    for (const q of [-RO + 0.4, RO - 0.4]) {
      kit.box(p, (RY - 0.35) / 2, q, 0.5, RY - 0.35, 0.5, M.black);
      kit.box(q, (RY - 0.35) / 2, p, 0.5, RY - 0.35, 0.5, M.black);
    }
  }
  // edge glow + low inner rail (outer edge is open: drop down or get knocked off)
  strip(0, RY - 0.18, -RO - 0.02, 2 * RO, 0.08, 0.05);
  strip(0, RY - 0.18, RO + 0.02, 2 * RO, 0.08, 0.05);
  strip(-RO - 0.02, RY - 0.18, 0, 0.05, 0.08, 2 * RO);
  strip(RO + 0.02, RY - 0.18, 0, 0.05, 0.08, 2 * RO);
  const railOps = (c) => [{ c, w: 3, y0: RY, y1: RY + 1 }];
  kit.wall('x', -RI + 0.1, -RI, RI, RY, RY + 1, 0.2, M.black, railOps(0));
  kit.wall('x', RI - 0.1, -RI, RI, RY, RY + 1, 0.2, M.black, railOps(0));
  kit.wall('z', -RI + 0.1, -RI + 0.2, RI - 0.2, RY, RY + 1, 0.2, M.black, railOps(0));
  kit.wall('z', RI - 0.1, -RI + 0.2, RI - 0.2, RY, RY + 1, 0.2, M.black, railOps(0));
  // pinwheel stairways: each runs alongside an outer edge, rising to the corner-ward end
  kit.stairs(9, -18.3, '-x', 10, 2.6, 0, RY, M.dark, { sideMat: M.black, open: true });
  kit.stairs(18.3, 9, '-z', 10, 2.6, 0, RY, M.dark, { sideMat: M.black, open: true });
  kit.stairs(-9, 18.3, '+x', 10, 2.6, 0, RY, M.dark, { sideMat: M.black, open: true });
  kit.stairs(-18.3, -9, '+z', 10, 2.6, 0, RY, M.dark, { sideMat: M.black, open: true });

  // ---------- jump pads: dais → ring, ground → ring ----------
  const jumpPads = [
    pad(0, -6.3, 0, RY, -15.5, DY), pad(0, 6.3, 0, RY, 15.5, DY),
    pad(-6.3, 0, -15.5, RY, 0, DY), pad(6.3, 0, 15.5, RY, 0, DY),
    pad(-24, -24, -15.5, RY, -15.5), pad(24, 24, 15.5, RY, 15.5),
  ];
  const padMat = new THREE.MeshStandardMaterial({ color: 0x300a28, emissive: 0xff2bd6, emissiveIntensity: 2.4 });
  for (const p of jumpPads) {
    kit.geo(new THREE.CylinderGeometry(1.2, 1.35, 0.25, 24), M.black, { x: p.x, y: p.y + 0.12, z: p.z });
    const glow = new THREE.Mesh(new THREE.RingGeometry(0.55, 1.05, 32), padMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(p.x, p.y + 0.26, p.z);
    kit.add(glow);
    kit.collision.addBox(p.x - 1.2, p.y, p.z - 1.2, p.x + 1.2, p.y + 0.25, p.z + 1.2, 'metal');
    p.y += 0.25;
  }
  let padT = 0;
  updaters.push((dt) => { padT += dt; padMat.emissiveIntensity = 2 + Math.sin(padT * 5) * 0.8; });

  // ---------- NW: control room (2 floors, glass walls) ----------
  {
    const x0 = -36, x1 = -24, z0 = -34, z1 = -24, F2 = 3.6, TOP = 7.2, t = 0.3;
    const win = (c, y, w = 2.2) => ({ c, w, y0: y + 0.9, y1: y + 2.9 });
    kit.wall('x', z1 - t / 2, x0, x1, 0, TOP, t, M.white, [{ c: -30, w: 2.4, y0: 0, y1: 2.6 }, win(-34, 0), win(-26, 0), win(-30, F2, 5)]);
    kit.wall('x', z0 + t / 2, x0, x1, 0, TOP, t, M.white, [win(-30, 0, 4), win(-30, F2, 6)]);
    kit.wall('z', x0 + t / 2, z0 + t, z1 - t, 0, TOP, t, M.white, [win(-29, F2, 4)]);
    kit.wall('z', x1 - t / 2, z0 + t, z1 - t, 0, TOP, t, M.white, [{ c: -32.6, w: 2, y0: 0, y1: 2.6 }, win(-29, F2, 4)]);
    // glass panes (visual) in the upper windows
    kit.box(-30, F2 + 1.9, z1 - t / 2, 5, 2, 0.05, M.glass, { collide: false, cast: false, bevel: 0 });
    kit.box(-30, F2 + 1.9, z0 + t / 2, 6, 2, 0.05, M.glass, { collide: false, cast: false, bevel: 0 });
    kit.slab(x0 + t, F2 - 0.3, z0 + t, -26, F2, z1 - t, M.dark);
    kit.slab(-26, F2 - 0.3, z0 + t, x1 - t, F2, -31.5, M.dark);
    kit.stairs(-24.9 - 0.6, -25.3, '-z', 6.2, 1.5, 0, F2, M.dark, { sideMat: M.black, open: true });
    kit.slab(x0 - 0.2, TOP - 0.3, z0 - 0.2, x1 + 0.2, TOP, z1 + 0.2, M.white);
    // consoles
    for (const [x, z] of [[-33, -31], [-31, -31], [-33, -27], [-29.5, -27]]) {
      kit.box(x, 0.55, z, 1.4, 1.1, 0.8, M.dark);
      strip(x, 1.12, z - 0.2, 1.2, 0.02, 0.3);
    }
    kit.box(-32, F2 + 0.55, -30, 3, 1.1, 1, M.dark);
    strip(-32, F2 + 1.12, -30.3, 2.8, 0.02, 0.3, M.magenta);
    lamp(-30, 2.8, -29, 0x7ff0ff, 4, 11);
    lamp(-30, F2 + 2.6, -29, 0xff5ad6, 4, 11);
  }

  // ---------- NE: coolant tanks ----------
  for (const [x, z, r, h] of [[27, -30, 2.6, 5], [33, -24, 2.2, 4.2], [34, -33, 2, 3.4], [25, -22.5, 1.6, 2.4]]) {
    kit.geo(new THREE.CylinderGeometry(r, r, h, 28), M.white, { x, y: h / 2, z });
    kit.geo(new THREE.CylinderGeometry(r * 0.3, r * 0.3, h + 0.02, 16), M.cyan, { x, y: h / 2, z: z + r * 0.72, cast: false });
    kit.geo(new THREE.TorusGeometry(r + 0.02, 0.08, 6, 28), M.cyan, { x, y: h - 0.3, z, rx: Math.PI / 2, cast: false });
    kit.collision.addBox(x - r, 0, z - r * 0.72, x + r, h, z + r * 0.72, 'metal');
    kit.collision.addBox(x - r * 0.72, 0, z - r, x + r * 0.72, h, z + r, 'metal');
    emitters.push({ type: 'steam', x, y: h + 0.2, z, rate: 0.8 });
  }
  lamp(29, 6, -28, 0x7ff0ff, 6, 18);

  // ---------- SE: server-rack corridors ----------
  for (let i = 0; i < 5; i++) {
    const z = 20 + i * 3.8;
    const gapAt = i % 2 === 0 ? 30 : 23;
    for (const [a, b] of [[20, gapAt - 1.6], [gapAt + 1.6, 38]]) {
      if (b - a < 1) continue;
      kit.box((a + b) / 2, 1.5, z, b - a, 3, 1.1, M.black);
      strip((a + b) / 2, 2.7, z - 0.57, b - a - 0.2, 0.06, 0.02, i % 2 ? M.magenta : M.cyan);
      strip((a + b) / 2, 0.4, z - 0.57, b - a - 0.2, 0.04, 0.02, M.cyan);
    }
  }
  lamp(29, 3.5, 27.6, 0x19e6ff, 6, 14);

  // ---------- SW: hangar pad + dropship ----------
  {
    const px = -28, pz = 28, S = 7, PY = 2;
    kit.slab(px - S, 0, pz - S, px + S, PY, pz + S, M.panel, { bevel: 0.1 });
    kit.stairs(px + S + 3.5, pz, '-x', 3.5, 3, 0, PY, M.dark);
    kit.stairs(px, pz - S - 3.5, '+z', 3.5, 3, 0, PY, M.dark);
    const ring = new THREE.Mesh(new THREE.RingGeometry(4.2, 4.6, 48), M.cyan);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(px, PY + 0.02, pz);
    kit.add(ring);
    // dropship: fuselage + wings + engines (cover on the pad)
    const body = new THREE.CapsuleGeometry(1.5, 5, 6, 16).rotateX(Math.PI / 2);
    kit.geo(body, M.white, { x: px, y: PY + 1.9, z: pz + 0.5, sx: 1.2, sy: 0.9 });
    kit.box(px, PY + 1.9, pz + 1.5, 9, 0.25, 2.2, M.dark);
    for (const s of [-1, 1]) {
      kit.geo(new THREE.CylinderGeometry(0.6, 0.75, 2.2, 16).rotateX(Math.PI / 2), M.dark, { x: px + s * 4.2, y: PY + 1.7, z: pz + 2 });
      kit.geo(new THREE.CircleGeometry(0.55, 16), M.cyan, { x: px + s * 4.2, y: PY + 1.7, z: pz + 3.12 });
      kit.box(px + s * 1.2, PY + 0.5, pz + 0.5, 0.2, 1, 0.2, M.black, { collide: false });
    }
    kit.geo(new THREE.SphereGeometry(1.1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.glass, { x: px, y: PY + 2.5, z: pz - 2.4, rx: -1.1 });
    kit.collision.addBox(px - 1.8, PY, pz - 3.5, px + 1.8, PY + 3, pz + 4.5, 'metal');
    kit.collision.addBox(px - 4.8, PY + 1.3, pz + 0.4, px + 4.8, PY + 2.1, pz + 3.2, 'metal');
    lamp(px, PY + 5, pz, 0x7ff0ff, 5, 16);
  }

  // ---------- scattered cover ----------
  for (const [x, z, w, d] of [[-24, -6, 1.2, 5], [24, 6, 1.2, 5], [-6, 26, 5, 1.2], [6, -26, 5, 1.2],
    [-12, -26, 3, 1.2], [12, 26, 3, 1.2], [-30, 8, 1.2, 3], [30, -8, 1.2, 3], [-20, 34, 3, 1.2], [20, -36, 3, 1.2]]) {
    kit.box(x, 0.8, z, w, 1.6, d, M.panel);
    strip(x, 1.62, z, w - 0.2, 0.02, d - 0.2, M.cyan);
  }
  for (const [x, z] of [[-10, 30], [10, -30], [-34, -8], [34, 12], [-4, 38], [4, -38], [-38, 20], [38, -18]]) P.crateStack(kit, x, z, mats, rng, rng() < 0.4);
  // light posts
  for (const [x, z] of [[-22, -22], [22, 22], [22, -22], [-22, 22]]) {
    kit.box(x, 3, z, 0.25, 6, 0.25, M.black);
    kit.box(x, 6.1, z, 0.8, 0.2, 0.8, M.cyan, { collide: false });
  }
  emitters.push({ type: 'motes', x: 0, y: 1, z: 0, rate: 12, spread: 30, color: 0x7ff0ff });

  // ---------- THE PULSE ----------
  const pulse = { x: 0, z: 0, radius: 36, interval: [34, 44], charge: 4, dmgPlayer: 38, dmgEnemy: 300, below: 1.0 };
  let coreGlow = 0;
  updaters.push((dt) => {
    coreGlow += dt;
    const k = pulse.chargeK || 0;
    M.core.emissiveIntensity = 3.5 + Math.sin(coreGlow * 2) * 0.5 + k * 8;
    coreLight.intensity = 22 + Math.sin(coreGlow * 2) * 4 + k * 60;
    for (let i = 0; i < bands.length; i++) {
      const b = bands[i];
      b.position.y = DY + 1.5 + ((i * 4.5 + coreGlow * (3 + k * 20)) % 40);
      b.material.emissiveIntensity = 2.5 + k * 6;
      b.material.emissive.setHex(k > 0.01 ? 0xff5a2a : 0x19e6ff);
    }
    for (const l of coilLights) l.intensity = 6 + Math.sin(coreGlow * 7 + l.position.x) * 2;
  });

  return {
    spawnPoints,
    playerSpawn: { x: 0, z: 35, yaw: 0 },
    sun, sunDir, hemi, sky,
    shadowLights: [sun],
    jumpPads, updaters, pulse,
    floorSurface: 'metal',
    bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
    env: {
      exposure: 1.2, bloom: 0.55, bloomRadius: 0.5, bloomThreshold: 0.82,
      grade: { saturation: 1.15, contrast: 1.08, tint: [0.98, 1.0, 1.05], lift: [0.01, 0.015, 0.035], vignette: 0.4 },
      vmHemi: [0x6a78d8, 0x1a1a28], vmSun: 0xb0c4ff, vmEnvIntensity: 0.6,
    },
    music: 3,
  };
}
