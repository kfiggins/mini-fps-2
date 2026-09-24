import * as THREE from 'three';
import * as T from './textures.js';
import * as P from './props.js';
import { createSky, createHorizon } from './sky.js';

// ACT 1 — DUST OUTPOST. A desert forward base at golden hour.
//   center: two-storey command post (interior stairs to 2F and roof,
//           exterior stair to a 2F balcony)
//   NW + SE: timber watchtowers, two stairways each
//   NE: container yard with a two-high sniper perch
//   W: vehicle depot shed        E: comms platform + satellite dish
//   SW: sandbag trench line      NW-center: crashed helicopter
// Enemies arrive through four gate bays and the corners.

export const OUTPOST = {
  id: 'outpost',
  name: 'DUST OUTPOST',
  half: 42,
};

export function buildOutpost(ctx) {
  const { scene, realScene, renderer, kit, rng } = ctx;
  const updaters = [];

  // ---------- atmosphere ----------
  const sunDir = new THREE.Vector3(0.55, 0.42, 0.38).normalize();
  const sky = createSky(scene, realScene, renderer, {
    top: 0x3f7fc4, horizon: 0xf2d3a4, bottom: 0xc9a26b, ground: 0xb08a5c,
    sunColor: 0xffd9a0, sunDir: sunDir.toArray(), sunSize: 1.4, clouds: 0.32,
    cloudColor: 0xfff1de, haze: 0.7, envIntensity: 0.55,
  });
  realScene.fog = new THREE.Fog(0xe8cfa6, 80, 280);
  realScene.background = new THREE.Color(0xe8cfa6);
  const hemi = new THREE.HemisphereLight(0xcfe0ff, 0xa0845c, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe0b3, 3.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -42; sc.right = 42; sc.top = 42; sc.bottom = -42; sc.near = 1; sc.far = 220;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  createHorizon(scene, { radius: 190, height: 26, color: 0xb98f63, seed: 7, y: -3 });
  createHorizon(scene, { radius: 240, height: 42, color: 0x9f8a86, seed: 3, jag: 1.4, y: -4 });

  // ---------- materials ----------
  const M = {
    sand: T.sand(11, 0xcfa46d),
    dune: T.sand(12, 0xd4aa72),
    concrete: T.concrete(21, 0xbcae96, { panels: 2, tile: 4 }),
    concreteDark: T.concrete(22, 0x8e867a, { panels: 1, tile: 5 }),
    plaza: T.concrete(23, 0xa8a090, { panels: 4, tile: 8 }),
    asphalt: T.asphalt(31, 0x46443f),
    olive: T.metalPanel(41, 0x56613f, { panelsX: 2, panelsY: 1, tile: 2.5 }),
    steel: T.metalPanel(42, 0x4d5157, { panelsX: 1, panelsY: 1, tile: 2, rough: 0.5, paintMetal: 0.4 }),
    contRed: T.corrugated(51, 0x8f3b2a, { ribs: 14, tile: 2.6 }),
    contBlue: T.corrugated(52, 0x2f5f86, { ribs: 14, tile: 2.6 }),
    contTan: T.corrugated(53, 0xa38b5c, { ribs: 14, tile: 2.6 }),
    roof: T.corrugated(54, 0x8b8f93, { ribs: 10, tile: 3 }),
    hazard: T.hazard(61),
    wood: T.wood(71, 0x8d6a42),
    crate: T.wood(72, 0x9a7a4c),
    hescoFab: T.fabric(81, 0xb49a6c),
    sandbag: T.fabric(82, 0xb89e72),
    canvas: T.fabric(83, 0x6f6a45),
    rock: T.rock(91, 0xa4876a),
    rust: T.rust(92),
  };
  M.dark = new THREE.MeshStandardMaterial({ color: 0x2c2e31, roughness: 0.55, metalness: 0.7 });
  M.rubber = new THREE.MeshStandardMaterial({ color: 0x1b1b1c, roughness: 0.9 });
  M.glass = new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.1, metalness: 0.9, envMapIntensity: 1.5 });
  M.bulb = new THREE.MeshStandardMaterial({ color: 0xfff3d6, emissive: 0xffd89a, emissiveIntensity: 4 });
  M.redLight = new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff1a1a, emissiveIntensity: 0 });
  M.net = new THREE.MeshStandardMaterial({ color: 0x5e5a3a, roughness: 1, side: THREE.DoubleSide });
  M.shrub = new THREE.MeshStandardMaterial({ color: 0x6f6a3e, roughness: 1 });
  M.barrels = [
    new THREE.MeshStandardMaterial({ color: 0x3f5a3a, roughness: 0.55, metalness: 0.6 }),
    new THREE.MeshStandardMaterial({ color: 0x8a3524, roughness: 0.5, metalness: 0.6 }),
    new THREE.MeshStandardMaterial({ color: 0x2f4f78, roughness: 0.5, metalness: 0.6 }),
  ];
  for (const m of [M.dark, M.rubber, M.glass, M.net, M.shrub, ...M.barrels]) m.userData.surface = 'metal';
  M.net.userData.surface = 'dirt';

  // ---------- ground ----------
  kit.geo(new THREE.PlaneGeometry(520, 520, 1, 1), M.sand, { rx: -Math.PI / 2, cast: false });
  // dunes beyond the wall
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + rng() * 0.2;
    const r = 70 + rng() * 60;
    const g = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    kit.geo(g, M.dune, {
      x: Math.cos(a) * r, y: -0.2, z: Math.sin(a) * r,
      sx: 18 + rng() * 22, sy: 3 + rng() * 6, sz: 12 + rng() * 16, ry: rng() * 3, cast: false,
    });
  }
  // roads + plaza (visual skins, no collision)
  kit.box(0, 0.015, -24, 7, 0.03, 36, M.asphalt, { collide: false, cast: false, bevel: 0 });
  kit.box(0, 0.015, 24, 7, 0.03, 36, M.asphalt, { collide: false, cast: false, bevel: 0 });
  kit.box(-25, 0.015, 0, 34, 0.03, 7, M.asphalt, { collide: false, cast: false, bevel: 0 });
  kit.box(25, 0.015, 0, 34, 0.03, 7, M.asphalt, { collide: false, cast: false, bevel: 0 });
  kit.box(0, 0.02, 0, 24, 0.04, 20, M.plaza, { collide: false, cast: false, bevel: 0 });
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xd9c27a, roughness: 0.8 });
  lineMat.userData.surface = 'concrete';
  for (let z = -40; z < 40; z += 4) {
    if (Math.abs(z + 1) < 11) continue;
    kit.box(0, 0.035, z + 1, 0.18, 0.01, 2, lineMat, { collide: false, cast: false, bevel: 0 });
  }
  for (let x = -40; x < 40; x += 4) {
    if (Math.abs(x + 1) < 13) continue;
    kit.box(x + 1, 0.035, 0, 2, 0.01, 0.18, lineMat, { collide: false, cast: false, bevel: 0 });
  }

  // ---------- perimeter: HESCO walls with four gates + spawn bays ----------
  const H = 42;
  const gate = 3.6;
  for (const s of [-1, 1]) {
    P.hesco(kit, -H, s * H, -gate, s * H, M.hescoFab, M.dark);
    P.hesco(kit, gate, s * H, H, s * H, M.hescoFab, M.dark);
    P.hesco(kit, s * H, -H, s * H, -gate, M.hescoFab, M.dark);
    P.hesco(kit, s * H, gate, s * H, H, M.hescoFab, M.dark);
  }
  const spawnPoints = [];
  // gate bays: short enclosed pens outside each gap — enemies beam in here
  for (const [nx, nz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    const cx = nx * (H + 4), cz = nz * (H + 4);
    if (nx === 0) {
      P.hesco(kit, -5, nz * (H + 0.8), -5, nz * (H + 7), M.hescoFab, M.dark);
      P.hesco(kit, 5, nz * (H + 0.8), 5, nz * (H + 7), M.hescoFab, M.dark);
      P.hesco(kit, -5.7, nz * (H + 7.7), 5.7, nz * (H + 7.7), M.hescoFab, M.dark);
    } else {
      P.hesco(kit, nx * (H + 0.8), -5, nx * (H + 7), -5, M.hescoFab, M.dark);
      P.hesco(kit, nx * (H + 0.8), 5, nx * (H + 7), 5, M.hescoFab, M.dark);
      P.hesco(kit, nx * (H + 7.7), -5.7, nx * (H + 7.7), 5.7, M.hescoFab, M.dark);
    }
    spawnPoints.push(new THREE.Vector3(cx + nx * 0.5, 0, cz + nz * 0.5));
    // gate frame: striped posts + overhead beam with warning lights
    for (const s of [-1, 1]) {
      const px = nx === 0 ? s * (gate + 0.35) : nx * H;
      const pz = nx === 0 ? nz * H : s * (gate + 0.35);
      kit.box(px, 2.4, pz, 0.7, 4.8, 0.7, M.hazard, { bevel: 0.06 });
    }
    if (nx === 0) kit.box(0, 4.95, nz * H, gate * 2 + 1.4, 0.5, 0.6, M.steel, { collide: false });
    else kit.box(nx * H, 4.95, 0, 0.6, 0.5, gate * 2 + 1.4, M.steel, { collide: false });
  }
  // corners: open breaches in the wall where scouts sneak in
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    spawnPoints.push(new THREE.Vector3(sx * (H - 3.5), 0, sz * (H - 3.5)));
  }

  // ---------- COMMAND POST ----------
  buildCommandPost(kit, M, updaters);

  // ---------- watchtowers ----------
  watchtower(kit, M, -30, -29, [{ dir: '-x' }, { dir: '-z' }]);
  watchtower(kit, M, 30, 29, [{ dir: '+x' }, { dir: '+z' }]);

  // ---------- container yard (NE) ----------
  P.container(kit, 19.5, 0, -32, 'x', M.contTan, M.dark);
  P.container(kit, 26, 0, -32, 'x', M.contRed, M.dark);
  P.container(kit, 26, 2.6, -32, 'x', M.contBlue, M.dark, { doors: false });
  kit.stairs(18, -26.6, '-z', 4.2, 1.4, 0, 2.6, M.steel, { sideMat: M.dark });
  kit.stairs(17.9, -32.3, '+x', 5.05, 1.3, 2.6, 5.2, M.steel, { sideMat: M.dark });
  P.sandbagWall(kit, 24, -30.9, 28.5, -30.9, M.sandbag, { layers: 3, y: 5.2 });
  P.container(kit, 33.5, 0, -24, 'z', M.contBlue, M.dark);
  kit.ramp(32.6, -20.95, 34.4, -16.4, 1, 0, 2.6, false, M.steel);
  P.container(kit, 21, 0, -18.5, 'x', M.contRed, M.dark);
  P.container(kit, 31, 0, -38.2, 'x', M.contTan, M.dark);
  P.container(kit, 36.7, 0, -30, 'z', M.contRed, M.dark);
  P.crateStack(kit, 29, -20, M, rng, true);
  P.barrelCluster(kit, 24.5, -24.5, M, rng);
  P.barrelCluster(kit, 15, -37, M, rng);

  // ---------- vehicle depot (W) ----------
  buildDepot(kit, M, rng);

  // ---------- comms platform (E) ----------
  buildComms(kit, M, updaters);

  // ---------- trench line (SW) ----------
  function sb(x0, z0, x1, z1, layers = 4) { P.sandbagWall(kit, x0, z0, x1, z1, M.sandbag, { layers }); }
  sb(-35, 21, -27, 19.5);
  sb(-27, 19.5, -23, 23);
  sb(-31, 28, -23, 29.5);
  sb(-23, 29.5, -17, 26.5);
  sb(-18.5, 19.5, -12.5, 21.5);
  sb(-37, 33, -30, 34.5);
  // MG nest ring
  for (let i = 0; i < 7; i++) {
    const a0 = (i / 8) * Math.PI * 2 + 0.4, a1 = ((i + 1) / 8) * Math.PI * 2 + 0.4;
    sb(-19 + Math.cos(a0) * 2.4, 35 + Math.sin(a0) * 2.4 - 1, -19 + Math.cos(a1) * 2.4, 35 + Math.sin(a1) * 2.4 - 1, 3);
  }
  P.camoNet(kit, -29, 25, 7, 5, 3.2, M.net, M.dark);
  P.crateStack(kit, -30, 24.5, M, rng);

  // ---------- crashed helicopter (NW-center) ----------
  buildHeli(kit, M, -13, -25, updaters, ctx);

  // ---------- scattered cover ----------
  const jerseys = [
    [-6, -14, 0], [6, -14, 0], [-6, 14, 0], [6, 14, 0],
    [-14, -6, Math.PI / 2], [-14, 6, Math.PI / 2], [14, -6, Math.PI / 2], [14, 6, Math.PI / 2],
    [0, -30, Math.PI / 2], [0, 30, Math.PI / 2], [-30, 0, 0], [21, -9, 0.4],
    [-8, 24, 0.3], [9, -25, -0.25],
  ];
  for (const [x, z, r] of jerseys) P.jersey(kit, x, z, r, M.concreteDark);
  for (const [x, z, big] of [
    [-11, -11, true], [11, 11, true], [11.5, -12, false], [-12, 12, false], [-22, -12, true],
    [22, 13, false], [8, 36, true], [-9, -36, false], [37, 18, true], [-38, -16, false],
    [4, 21, false], [-20, 3.5, false],
  ]) P.crateStack(kit, x, z, M, rng, big);
  for (const [x, z] of [[-17, -16], [17, 17], [-37, 38], [38, -38], [12, 30], [-24, -36], [36, 37], [-7, 38]]) {
    P.barrelCluster(kit, x, z, M, rng);
  }
  P.tire(kit, -16, 11, M.rubber, { stack: 3 });
  P.tire(kit, 17, -10, M.rubber, { stack: 2 });
  P.tire(kit, 18, -8.8, M.rubber, { stack: 1 });
  for (const [x, z, s] of [[-39, -6, 1.2], [39, 11, 1], [-5, -39, 1.1], [26, 39, 1], [-39, 30, 0.9], [15, 39, 0.8]]) {
    P.rockCluster(kit, x, z, M.rock, rng, s);
  }
  for (let i = 0; i < 40; i++) {
    const x = (rng() - 0.5) * 80, z = (rng() - 0.5) * 80;
    if (Math.abs(x) < 13 && Math.abs(z) < 11) continue;
    if (Math.abs(x) < 4 || Math.abs(z) < 4) continue;
    P.shrub(kit, x, z, M.shrub, rng);
  }
  for (const [x, z, r] of [[-5, -9, Math.PI], [5, 9, 0], [-12, -3.8, Math.PI / 2], [12, 3.8, -Math.PI / 2], [4.2, -20, 0], [-4.2, 20, Math.PI]]) {
    P.lampPost(kit, x, z, M.dark, M.bulb, { h: 5, ry: r });
  }
  updaters.push(P.flag(kit, -9.5, 7.5, 7.5, M.dark, 0x3c5a8c));
  updaters.push(P.flag(kit, 36, -8, 6, M.dark, 0x8c3c3c));

  return {
    spawnPoints,
    playerSpawn: { x: 0, z: 33, yaw: 0 },
    sun, sunDir, hemi, sky,
    shadowLights: [sun],
    updaters,
    floorSurface: 'dirt',
    bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
    env: {
      exposure: 1.0, bloom: 0.35, bloomRadius: 0.4, bloomThreshold: 0.92,
      grade: { saturation: 1.1, contrast: 1.07, tint: [1.03, 1.0, 0.95], lift: [0.02, 0.015, 0.0], vignette: 0.3 },
      vmHemi: [0xcfe0ff, 0x8a7050], vmSun: 0xffe8c8, vmEnvIntensity: 0.8,
    },
    music: 1,
  };
}

// Two-storey command post. Interior stairs: 1F→2F along the east wall,
// 2F→roof along the west wall. Exterior stair on the east face to a 2F balcony.
function buildCommandPost(kit, M, updaters) {
  const X = 8, Z = 6, T = 0.4;
  const F2 = 3.9, ROOF = 7.8;
  const win1 = (c, w = 2) => ({ c, w, y0: 1.1, y1: 2.5 });
  const win2 = (c, w = 2) => ({ c, w, y0: F2 + 1.1, y1: F2 + 2.5 });
  const door = (c, w = 2.6) => ({ c, w, y0: 0, y1: 2.7 });
  // walls run the full height 0..ROOF
  kit.wall('x', Z - T / 2, -X, X, 0, ROOF, T, M.concrete, [door(0), win1(-5), win1(5), win2(-5), win2(0), win2(5)]);
  kit.wall('x', -Z + T / 2, -X, X, 0, ROOF, T, M.concrete, [door(0), win1(5), win2(0), win2(5)]);
  kit.wall('z', -X + T / 2, -Z + T, Z - T, 0, ROOF, T, M.concrete, [door(0, 2.4), win1(-3.2, 1.8), win1(3.5, 1.8), win2(4, 1.6)]);
  kit.wall('z', X - T / 2, -Z + T, Z - T, 0, ROOF, T, M.concrete, [win1(-4.6, 1.2), { c: 3.3, w: 1.6, y0: F2, y1: F2 + 2.4 }, win2(-3.5, 1.8)]);
  // floor slabs with stairwell holes
  const inX = X - T, inZ = Z - T;
  kit.slab(-inX, F2 - 0.3, -inZ, 6.0, F2, inZ, M.concreteDark);
  kit.slab(6.0, F2 - 0.3, -inZ, inX, F2, -4.2, M.concreteDark);
  kit.slab(6.0, F2 - 0.3, 2.0, inX, F2, inZ, M.concreteDark);
  kit.slab(-6.0, ROOF - 0.3, -inZ, inX, ROOF, inZ, M.concreteDark);
  kit.slab(-inX, ROOF - 0.3, -inZ, -6.0, ROOF, -4.2, M.concreteDark);
  kit.slab(-inX, ROOF - 0.3, 2.0, -6.0, ROOF, inZ, M.concreteDark);
  // interior stairs
  kit.stairs(6.8, -4.2, '+z', 6.2, 1.5, 0, F2, M.concreteDark);
  kit.stairs(-6.8, -4.2, '+z', 6.2, 1.5, F2, ROOF, M.concreteDark);
  // railings around the holes (thin, bullet-transparent visuals + low colliders)
  kit.slab(5.85, F2, -4.2, 6.0, F2 + 1.0, 2.0, M.dark, { bevel: 0.02 });
  kit.slab(-6.0, ROOF, -4.2, -5.85, ROOF + 1.0, 2.0, M.dark, { bevel: 0.02 });
  kit.slab(-inX, ROOF, -4.35, -5.85, ROOF + 1.0, -4.2, M.dark, { bevel: 0.02 });
  // parapet with a gap on each side for movement
  const py0 = ROOF, py1 = ROOF + 1.0;
  kit.wall('x', Z - T / 2, -X, X, py0, py1, T, M.concrete, [{ c: -2.5, w: 1.4, y0: py0, y1: py1 }]);
  kit.wall('x', -Z + T / 2, -X, X, py0, py1, T, M.concrete, [{ c: 2.5, w: 1.4, y0: py0, y1: py1 }]);
  kit.wall('z', -X + T / 2, -Z + T, Z - T, py0, py1, T, M.concrete);
  kit.wall('z', X - T / 2, -Z + T, Z - T, py0, py1, T, M.concrete);
  // exterior balcony + stair (east face)
  kit.slab(X, F2 - 0.3, 2.0, X + 2.4, F2, 4.6, M.steel);
  for (const [bx, bz] of [[X + 2.2, 2.2], [X + 2.2, 4.4]]) kit.box(bx, (F2 - 0.3) / 2, bz, 0.25, F2 - 0.3, 0.25, M.dark);
  kit.slab(X + 2.3, F2, 2.0, X + 2.4, F2 + 1.0, 4.6, M.dark, { bevel: 0.01 });
  kit.slab(X, F2, 1.9, X + 2.4, F2 + 1.0, 2.0, M.dark, { bevel: 0.01 });
  kit.stairs(X + 1.2, 10.6, '-z', 6.0, 1.6, 0, F2, M.steel, { sideMat: M.dark });
  // ground-floor furniture (cover)
  kit.box(-3, 0.45, -3.5, 2.2, 0.9, 1, M.steel);
  kit.box(-3, 0.45, 3.2, 2.2, 0.9, 1, M.steel);
  kit.box(3, 0.9, -5.2, 2.4, 1.8, 0.5, M.olive);
  kit.box(2.5, 0.5, 2.5, 1, 1, 1, M.crate);
  // 2F: bunks / crates
  kit.box(1.5, F2 + 0.5, -4.8, 3, 1.0, 1, M.olive);
  kit.box(-2.5, F2 + 0.55, 3.8, 1.1, 1.1, 1.1, M.crate);
  kit.box(3.5, F2 + 0.45, 0, 1, 0.9, 2.2, M.steel);
  // roof: AC units, sandbag nest, antenna
  kit.box(3.5, ROOF + 0.6, -3, 1.6, 1.2, 1.2, M.steel);
  kit.box(3.5, ROOF + 0.6, 3.2, 1.6, 1.2, 1.2, M.steel);
  P.sandbagWall(kit, -2, -2.2, 1.5, -2.2, M.sandbag, { layers: 3, y: ROOF });
  kit.geo(new THREE.CylinderGeometry(0.05, 0.08, 7, 6), M.dark, { x: 6.8, y: ROOF + 3.5, z: -4.8 });
  kit.box(6.8, ROOF + 7, -4.8, 0.15, 0.15, 0.15, M.redLight, { collide: false, cast: false, bevel: 0 });
  let t = 0;
  updaters.push((dt) => {
    t += dt;
    M.redLight.emissiveIntensity = (t % 1.6) < 0.25 ? 6 : 0.2;
  });
  // exterior dressing: awning over the south door, AC boxes, signage stripe
  kit.slab(-2, 2.8, Z, 2, 2.95, Z + 1.6, M.roof, { collide: false });
  kit.box(-6.5, 1.2, Z + 0.45, 1.2, 0.9, 0.5, M.steel, { collide: false });
  kit.slab(-X, 3.55, Z - 0.02, X, 3.95, Z + 0.02, M.hazard, { collide: false, cast: false, bevel: 0 });
  kit.slab(-X, 3.55, -Z - 0.02, X, 3.95, -Z + 0.02, M.hazard, { collide: false, cast: false, bevel: 0 });
}

// Timber watchtower: platform at 5m, sandbagged rail, tin roof.
function watchtower(kit, M, cx, cz, stairs) {
  const S = 2.3, TOP = 5.0, RH = 1.05;
  kit.slab(cx - S, TOP - 0.3, cz - S, cx + S, TOP, cz + S, M.wood);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    kit.box(cx + sx * (S - 0.2), (TOP - 0.3) / 2, cz + sz * (S - 0.2), 0.34, TOP - 0.3, 0.34, M.wood);
    kit.box(cx + sx * (S - 0.12), TOP + 1.5, cz + sz * (S - 0.12), 0.14, 3.0, 0.14, M.wood);
  }
  // cross bracing (visual)
  for (const s of [-1, 1]) {
    const len = Math.hypot(2 * S, TOP - 0.5);
    const ang = Math.atan2(TOP - 0.5, 2 * S);
    kit.box(cx, TOP / 2, cz + s * (S - 0.2), len, 0.12, 0.08, M.wood, { collide: false, ry: 0 });
    kit.geo(new THREE.BoxGeometry(len, 0.12, 0.08), M.wood, { x: cx, y: TOP / 2 - 0.2, z: cz + s * (S - 0.2), rz: ang * s });
    kit.geo(new THREE.BoxGeometry(len, 0.12, 0.08), M.wood, { x: cx + s * (S - 0.2), y: TOP / 2 - 0.2, z: cz, ry: Math.PI / 2, rz: ang * s });
  }
  kit.slab(cx - S - 0.3, TOP + 2.95, cz - S - 0.3, cx + S + 0.3, TOP + 3.1, cz + S + 0.3, M.roof);
  // rails with openings where stairs arrive
  const open = new Set(stairs.map((s) => s.dir));
  const railX = (z, gapAt) => {
    const ops = gapAt !== null ? [{ c: gapAt, w: 1.7, y0: TOP, y1: TOP + RH }] : [];
    kit.wall('x', z, cx - S, cx + S, TOP, TOP + RH, 0.3, M.sandbag, ops);
  };
  const railZ = (x, gapAt) => {
    const ops = gapAt !== null ? [{ c: gapAt, w: 1.7, y0: TOP, y1: TOP + RH }] : [];
    kit.wall('z', x, cz - S + 0.3, cz + S - 0.3, TOP, TOP + RH, 0.3, M.sandbag, ops);
  };
  railX(cz - S + 0.15, open.has('+z') ? cx + 1.1 : null);
  railX(cz + S - 0.15, open.has('-z') ? cx - 1.1 : null);
  railZ(cx - S + 0.15, open.has('+x') ? cz - 1.1 : null);
  railZ(cx + S - 0.15, open.has('-x') ? cz + 1.1 : null);
  const len = 8.2;
  for (const { dir } of stairs) {
    // stairs arrive at the rail opening, running away from the tower
    if (dir === '-x') kit.stairs(cx + S + len, cz + 1.1, '-x', len, 1.5, 0, TOP, M.wood, { sideMat: M.dark });
    if (dir === '+x') kit.stairs(cx - S - len, cz - 1.1, '+x', len, 1.5, 0, TOP, M.wood, { sideMat: M.dark });
    if (dir === '-z') kit.stairs(cx - 1.1, cz + S + len, '-z', len, 1.5, 0, TOP, M.wood, { sideMat: M.dark });
    if (dir === '+z') kit.stairs(cx + 1.1, cz - S - len, '+z', len, 1.5, 0, TOP, M.wood, { sideMat: M.dark });
  }
}

function buildDepot(kit, M, rng) {
  const x0 = -38.5, x1 = -25.5, z0 = 4, z1 = 16, top = 5.4;
  for (const x of [x0 + 0.3, (x0 + x1) / 2, x1 - 0.3]) {
    for (const z of [z0 + 0.3, z1 - 0.3]) kit.box(x, top / 2, z, 0.4, top, 0.4, M.steel);
  }
  kit.slab(x0 - 0.3, top, z0 - 0.4, x1 + 0.4, top + 0.25, z1 + 0.4, M.roof);
  kit.slab(x0 - 0.4, 0, z0, x0, top, z1, M.roof);
  // truck
  const tx = -31.5, tz = 10;
  kit.box(tx, 1.55, tz - 3.1, 2.3, 2.1, 2.2, M.olive); // cab
  kit.box(tx, 2.05, tz - 3.9, 2.0, 0.9, 0.08, M.glass, { collide: false, cast: false });
  kit.box(tx, 1.05, tz + 0.9, 2.4, 0.5, 5.2, M.olive); // bed floor
  kit.box(tx, 2.2, tz + 0.9, 2.45, 1.9, 5.0, M.canvas, { bevel: 0.25 }); // canvas cover
  kit.box(tx, 0.55, tz - 1, 2.0, 0.35, 8, M.dark, { collide: false });
  for (const wz of [tz - 3.1, tz + 0.3, tz + 2.2]) {
    for (const s of [-1, 1]) kit.geo(new THREE.CylinderGeometry(0.52, 0.52, 0.4, 16), M.rubber, { x: tx + s * 1.1, y: 0.52, z: wz, rz: Math.PI / 2 });
  }
  kit.collision.addBox(tx - 1.25, 0, tz - 4.2, tx + 1.25, 1.3, tz + 3.4, 'metal');
  // fuel tanks on stands
  for (const z of [6.5, 13.5]) {
    kit.geo(new THREE.CylinderGeometry(0.9, 0.9, 3.4, 20), M.rust, { x: -36.4, y: 1.5, z, rx: Math.PI / 2 });
    kit.box(-36.4, 0.35, z - 1.1, 1.4, 0.7, 0.2, M.dark, { collide: false });
    kit.box(-36.4, 0.35, z + 1.1, 1.4, 0.7, 0.2, M.dark, { collide: false });
    kit.collision.addBox(-37.3, 0, z - 1.7, -35.5, 2.4, z + 1.7, 'metal');
  }
  kit.box(-27.2, 0.5, 14.3, 2.6, 1.0, 1.0, M.steel); // workbench
  P.barrelCluster(kit, -27, 5.5, M, rng);
  P.tire(kit, -34, 15, M.rubber, { stack: 4 });
}

function buildComms(kit, M, updaters) {
  const x0 = 25.5, x1 = 38, z0 = -5, z1 = 7, h = 1.4;
  kit.slab(x0, 0, z0, x1, h, z1, M.concreteDark, { bevel: 0.08 });
  kit.stairs(x0 - 3.4, 1, '+x', 3.4, 2.2, 0, h, M.concreteDark);
  kit.stairs(32, z1 + 3.2, '-z', 3.2, 2, 0, h, M.concreteDark);
  kit.stairs(31, z0 - 3.2, '+z', 3.2, 2, 0, h, M.concreteDark);
  // dish pedestal + rotating dish
  kit.geo(new THREE.CylinderGeometry(1.0, 1.3, 2.2, 20), M.steel, { x: 33.5, y: h + 1.1, z: 1.5 });
  kit.collision.addBox(32.3, h, 0.3, 34.7, h + 2.2, 2.7, 'metal');
  const dish = new THREE.Group();
  const dishMat = new THREE.MeshStandardMaterial({ color: 0xd8d8d2, roughness: 0.45, metalness: 0.3, side: THREE.DoubleSide });
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(3.4, 32, 12, 0, Math.PI * 2, 0, 0.75), dishMat);
  bowl.rotation.x = Math.PI;
  bowl.position.y = 3.2;
  const feed = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6), M.dark);
  feed.position.y = 1.4;
  dish.add(bowl, feed);
  dish.rotation.set(-0.9, 0, 0);
  const pivot = new THREE.Group();
  pivot.position.set(33.5, h + 2.4, 1.5);
  pivot.add(dish);
  kit.add(pivot, { cast: true });
  bowl.castShadow = true;
  updaters.push((dt) => { pivot.rotation.y += dt * 0.08; });
  // lattice mast
  const mx = 36.6, mz = -3.6, mh = 16;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    kit.geo(new THREE.CylinderGeometry(0.05, 0.08, mh, 6), M.dark, { x: mx + sx * 0.45, y: h + mh / 2, z: mz + sz * 0.45 });
  }
  for (let y = 1; y < mh; y += 1.6) {
    kit.box(mx, h + y, mz - 0.45, 0.9, 0.05, 0.05, M.dark, { collide: false, cast: false, bevel: 0 });
    kit.box(mx, h + y, mz + 0.45, 0.9, 0.05, 0.05, M.dark, { collide: false, cast: false, bevel: 0 });
  }
  kit.collision.addBox(mx - 0.6, h, mz - 0.6, mx + 0.6, h + mh, mz + 0.6, 'metal');
  kit.box(mx, h + mh + 0.1, mz, 0.2, 0.2, 0.2, M.redLight, { collide: false, cast: false, bevel: 0 });
  // generators (cover on the platform)
  kit.box(28, h + 0.7, -3.4, 1.8, 1.4, 1.1, M.olive);
  kit.box(28.5, h + 0.7, 5.4, 1.1, 1.4, 1.8, M.olive);
  kit.box(36.2, h + 0.55, 5.2, 1.6, 1.1, 1.2, M.steel);
  // edge rails (visual)
  for (const z of [z0 + 0.05, z1 - 0.05]) kit.box((x0 + x1) / 2, h + 0.5, z, x1 - x0, 0.05, 0.05, M.dark, { collide: false, cast: false, bevel: 0 });
}

function buildHeli(kit, M, x, z, updaters, ctx) {
  const ry = 0.6;
  const c = Math.cos(ry), s = Math.sin(ry);
  const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  // fuselage
  const body = new THREE.CapsuleGeometry(1.25, 3.6, 6, 16);
  body.rotateX(Math.PI / 2);
  kit.geo(body, M.olive, { x, y: 1.2, z, ry, rz: 0.18, sy: 0.95 });
  const [tx, tz] = at(0, 4.6);
  const tail = new THREE.CylinderGeometry(0.25, 0.5, 5, 10);
  tail.rotateX(Math.PI / 2);
  kit.geo(tail, M.olive, { x: tx, y: 1.0, z: tz, ry: ry + 0.15, rz: 0.1 });
  const [fx, fz] = at(0, 7.1);
  kit.box(fx, 1.6, fz, 0.12, 1.4, 0.9, M.olive, { collide: false, ry: ry + 0.15 });
  // canopy glass
  const [gx, gz] = at(0, -2.2);
  kit.geo(new THREE.SphereGeometry(1.0, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.glass, { x: gx, y: 1.5, z: gz, ry, rx: -0.9 });
  // broken rotor blades
  kit.box(x + 0.5, 0.15, z + 3.5, 7, 0.08, 0.35, M.dark, { collide: false, ry: 1.4 });
  kit.box(x - 3, 0.12, z - 1.5, 5, 0.08, 0.35, M.dark, { collide: false, ry: -0.3 });
  kit.geo(new THREE.CylinderGeometry(0.2, 0.2, 0.8, 10), M.dark, { x, y: 2.6, z, rz: 0.3 });
  // colliders: fuselage block + tail
  const hw = 1.25;
  kit.collision.addBox(x - 2.4, 0, z - 2.4, x + 2.4, 2.3, z + 2.4, 'metal');
  kit.collision.addBox(tx - 1, 0, tz - 1, tx + 1, 1.4, tz + 1, 'metal');
  void hw;
  ctx.emitters.push({ type: 'smoke', x: x + 0.4, y: 2.2, z: z - 0.5, rate: 6 });
  ctx.emitters.push({ type: 'fire', x: x + 0.2, y: 1.8, z: z - 0.3, rate: 10 });
  void updaters;
}
