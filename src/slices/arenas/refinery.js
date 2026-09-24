import * as THREE from 'three';
import * as T from './textures.js';
import * as P from './props.js';
import { createSky, createHorizon } from './sky.js';

// ACT 2 — THE REFINERY. An industrial yard at dusk, lit by molten metal.
//   centre: the crane deck (3.5m) — four stairways, a glowing crucible on
//           top, a pillared hall underneath
//   north:  a molten channel across the whole map with three bridges
//           (jumpable; enemies take the bridges) — the Tank Farm (NE, 7m
//           catwalks between tank tops via a two-flight stair tower) and
//           the Pump House (NW, two storeys + roof) sit beyond it
//   south:  the Loading Dock (SE, raised dock + warehouse shed) and the
//           Slag Pits (SW, pour platform between lava pools)
//   high line: a gantry walkway at 8.5m, reached by jump pads
// Jump pads are nav links, so robots use them too.

export const REFINERY = { id: 'refinery', name: 'THE REFINERY', half: 44 };

const G = 26; // gravity (matches core)

function pad(x, z, tx, ty, tz, y = 0) {
  const dx = tx - x, dz = tz - z;
  const dist = Math.hypot(dx, dz);
  const Tf = Math.min(1.6, Math.max(1.05, dist / 10));
  ty += 1.1; // arrive a little above the ledge and drop onto it
  return {
    x, y, z, r: 1.1, toX: tx, toY: ty, toZ: tz,
    vx: dx / Tf, vy: (ty - y + 0.5 * G * Tf * Tf) / Tf, vz: dz / Tf,
    color: 0x44ddff,
  };
}

export function buildRefinery(ctx) {
  const { scene, realScene, renderer, kit, rng } = ctx;
  const updaters = [];
  const hazards = [];
  const emitters = ctx.emitters;

  // ---------- atmosphere: dusk ----------
  const sunDir = new THREE.Vector3(-0.72, 0.26, -0.22).normalize();
  const sky = createSky(scene, realScene, renderer, {
    top: 0x0e1430, horizon: 0xc8603c, bottom: 0x1a1418, ground: 0x221a18,
    sunColor: 0xff9a5a, sunDir: sunDir.toArray(), sunSize: 2.2, clouds: 0.42,
    cloudColor: 0xd89a86, haze: 0.45, envIntensity: 0.5, horizonPow: 0.3,
  });
  realScene.fog = new THREE.Fog(0x2c2630, 50, 200);
  realScene.background = new THREE.Color(0x2c2630);
  const hemi = new THREE.HemisphereLight(0x6f86c8, 0x3a2a24, 1.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb286, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -44; sc.right = 44; sc.top = 44; sc.bottom = -44; sc.near = 1; sc.far = 240;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  createHorizon(scene, { radius: 190, height: 34, color: 0x2a2226, seed: 11, jag: 1.8, y: -3 });

  // ---------- materials ----------
  const M = {
    floor: T.concrete(201, 0x6d6860, { panels: 4, tile: 6 }),
    concrete: T.concrete(202, 0x8a847a, { panels: 2, tile: 4 }),
    steel: T.metalPanel(203, 0x4a5058, { panelsX: 2, panelsY: 2, tile: 2.5, rough: 0.5, paintMetal: 0.5 }),
    steelDark: T.metalPanel(204, 0x30343a, { panelsX: 1, panelsY: 1, tile: 2, rough: 0.55, paintMetal: 0.6 }),
    wallA: T.corrugated(205, 0x4f5f66, { ribs: 12, tile: 3 }),
    wallB: T.corrugated(206, 0x7a4e38, { ribs: 12, tile: 3 }),
    tank: T.metalPanel(207, 0xa8a49a, { panelsX: 3, panelsY: 2, tile: 3, rough: 0.5, paintMetal: 0.2 }),
    rust: T.rust(208),
    hazard: T.hazard(209),
    grating: T.grating(210, 0x5a5f66),
    crate: T.wood(211, 0x7a5c3a),
    rock: T.rock(212, 0x5a4a44),
    lava: T.lava(0xff6a1a),
  };
  updaters.push((dt) => M.lava.userData.update(dt));
  M.dark = new THREE.MeshStandardMaterial({ color: 0x1e2024, roughness: 0.5, metalness: 0.75 });
  M.pipe = new THREE.MeshStandardMaterial({ color: 0x6b6f75, roughness: 0.35, metalness: 0.9 });
  M.pipeRed = new THREE.MeshStandardMaterial({ color: 0x8a2a1e, roughness: 0.45, metalness: 0.6 });
  M.sodium = new THREE.MeshStandardMaterial({ color: 0xffd8a0, emissive: 0xffa040, emissiveIntensity: 5 });
  M.redLight = new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff1a1a, emissiveIntensity: 3 });
  M.molten = new THREE.MeshStandardMaterial({ color: 0xff8a2a, emissive: 0xff5a10, emissiveIntensity: 4 });
  M.barrels = [
    new THREE.MeshStandardMaterial({ color: 0x8a6a1e, roughness: 0.5, metalness: 0.6 }),
    new THREE.MeshStandardMaterial({ color: 0x2f4f78, roughness: 0.5, metalness: 0.6 }),
    new THREE.MeshStandardMaterial({ color: 0x5a2a24, roughness: 0.5, metalness: 0.6 }),
  ];
  for (const m of [M.dark, M.pipe, M.pipeRed, ...M.barrels]) m.userData.surface = 'metal';
  const mats = { ...M, crate: M.crate, dark: M.dark, barrels: M.barrels };

  const lamp = (x, y, z, color, intensity, dist) => {
    const l = new THREE.PointLight(color, intensity, dist, 2);
    l.position.set(x, y, z);
    scene.add(l);
    return l;
  };

  // ---------- ground ----------
  kit.geo(new THREE.PlaneGeometry(420, 420), M.floor, { rx: -Math.PI / 2, cast: false });

  // ---------- perimeter: corrugated walls, gates, spawn bays ----------
  const H = 44, WH = 7, gateW = 3.6;
  const gates = { N: [0, -14], S: [0, 12], W: [0], E: [0] };
  function wallRun(axis, at, gapsAt, mat) {
    let cursor = -H - 0.5;
    const segs = [...gapsAt].sort((a, b) => a - b);
    for (const g of [...segs, H + 0.5 + gateW]) {
      const end = g - gateW;
      if (end - cursor > 0.1) {
        if (axis === 'x') kit.slab(cursor, 0, at - 0.5, end, WH, at + 0.5, mat, { bevel: 0.05 });
        else kit.slab(at - 0.5, 0, cursor, at + 0.5, WH, end, mat, { bevel: 0.05 });
      }
      cursor = g + gateW;
    }
    // barrier to the sky
    if (axis === 'x') kit.collision.addBox(-70, WH, at - 0.5, 70, 70, at + 0.5, 'barrier');
    else kit.collision.addBox(at - 0.5, WH, -70, at + 0.5, 70, 70, 'barrier');
    // columns + top beam for structure
    for (let t = -H + 4; t < H; t += 8) {
      if (segs.some((g) => Math.abs(g - t) < gateW + 0.6)) continue;
      if (axis === 'x') kit.box(t, WH / 2, at + Math.sign(-at) * 0.65, 0.5, WH + 0.3, 0.35, M.steelDark, { collide: false });
      else kit.box(at + Math.sign(-at) * 0.65, WH / 2, t, 0.35, WH + 0.3, 0.5, M.steelDark, { collide: false });
    }
  }
  wallRun('x', -H, gates.N, M.wallA);
  wallRun('x', H, gates.S, M.wallA);
  wallRun('z', -H, gates.W, M.wallB);
  wallRun('z', H, gates.E, M.wallB);

  const spawnPoints = [];
  function bay(side, t) {
    const out = side === 'N' || side === 'W' ? -1 : 1;
    const alongX = side === 'N' || side === 'S';
    const w = gateW + 0.6, depth = 6.5;
    if (alongX) {
      const z0 = out * H, z1 = out * (H + depth);
      kit.slab(t - w - 0.5, 0, Math.min(z0, z1), t - w, WH, Math.max(z0, z1), M.wallA);
      kit.slab(t + w, 0, Math.min(z0, z1), t + w + 0.5, WH, Math.max(z0, z1), M.wallA);
      kit.slab(t - w - 0.5, 0, z1 - (out > 0 ? 0 : 0.5), t + w + 0.5, WH, z1 + (out > 0 ? 0.5 : 0), M.wallA);
      spawnPoints.push(new THREE.Vector3(t, 0, out * (H + depth / 2)));
      for (const s of [-1, 1]) kit.box(t + s * (gateW + 0.2), WH / 2, out * H, 0.5, WH, 1.2, M.hazard, { collide: false });
      kit.box(t, WH - 0.4, out * H, gateW * 2 + 1, 0.8, 1.2, M.steelDark, { collide: false });
      kit.box(t, WH - 1.1, out * H + out * -0.62, 0.3, 0.3, 0.05, M.redLight, { collide: false, cast: false, bevel: 0 });
    } else {
      const x0 = out * H, x1 = out * (H + depth);
      kit.slab(Math.min(x0, x1), 0, t - w - 0.5, Math.max(x0, x1), WH, t - w, M.wallB);
      kit.slab(Math.min(x0, x1), 0, t + w, Math.max(x0, x1), WH, t + w + 0.5, M.wallB);
      kit.slab(x1 - (out > 0 ? 0 : 0.5), 0, t - w - 0.5, x1 + (out > 0 ? 0.5 : 0), WH, t + w + 0.5, M.wallB);
      spawnPoints.push(new THREE.Vector3(out * (H + depth / 2), 0, t));
      for (const s of [-1, 1]) kit.box(out * H, WH / 2, t + s * (gateW + 0.2), 1.2, WH, 0.5, M.hazard, { collide: false });
      kit.box(out * H, WH - 0.4, t, 1.2, 0.8, gateW * 2 + 1, M.steelDark, { collide: false });
    }
  }
  for (const t of gates.N) bay('N', t);
  for (const t of gates.S) bay('S', t);
  for (const t of gates.W) bay('W', t);
  for (const t of gates.E) bay('E', t);

  // ---------- CENTRE: the crane deck ----------
  const D = 7, DY = 3.5;
  for (const px of [-6, 0, 6]) {
    for (const pz of [-6, 0, 6]) kit.box(px, (DY - 0.4) / 2, pz, 0.8, DY - 0.4, 0.8, M.steelDark);
  }
  kit.slab(-D, DY - 0.4, -D, D, DY, D, M.steel);
  kit.box(0, DY - 0.45, -D + 0.1, 2 * D, 0.5, 0.2, M.hazard, { collide: false, cast: false });
  kit.box(0, DY - 0.45, D - 0.1, 2 * D, 0.5, 0.2, M.hazard, { collide: false, cast: false });
  kit.stairs(0, -13, '+z', 6, 2.6, 0, DY, M.steel, { sideMat: M.dark, open: true });
  kit.stairs(0, 13, '-z', 6, 2.6, 0, DY, M.steel, { sideMat: M.dark, open: true });
  kit.stairs(-13, 0, '+x', 6, 2.6, 0, DY, M.steel, { sideMat: M.dark, open: true });
  kit.stairs(13, 0, '-x', 6, 2.6, 0, DY, M.steel, { sideMat: M.dark, open: true });
  const railOps = [{ c: 0, w: 3, y0: DY, y1: DY + 1.05 }];
  kit.wall('x', -D + 0.1, -D, D, DY, DY + 1.05, 0.2, M.dark, railOps);
  kit.wall('x', D - 0.1, -D, D, DY, DY + 1.05, 0.2, M.dark, railOps);
  kit.wall('z', -D + 0.1, -D + 0.2, D - 0.2, DY, DY + 1.05, 0.2, M.dark, railOps);
  kit.wall('z', D - 0.1, -D + 0.2, D - 0.2, DY, DY + 1.05, 0.2, M.dark, railOps);
  // crucible
  const CR = 2.2, CH = 2.8;
  kit.geo(new THREE.CylinderGeometry(CR, CR * 0.85, CH, 28), M.rust, { y: DY + CH / 2 });
  kit.geo(new THREE.TorusGeometry(CR, 0.12, 8, 28), M.steelDark, { y: DY + CH, rx: Math.PI / 2 });
  kit.geo(new THREE.TorusGeometry(CR * 0.93, 0.1, 8, 28), M.steelDark, { y: DY + 0.6, rx: Math.PI / 2 });
  const moltenTop = new THREE.Mesh(new THREE.CircleGeometry(CR - 0.1, 28), M.lava);
  moltenTop.rotation.x = -Math.PI / 2;
  moltenTop.position.set(0, DY + CH - 0.15, 0);
  kit.add(moltenTop);
  kit.collision.addBox(-CR, DY, -CR * 0.7, CR, DY + CH, CR * 0.7, 'metal');
  kit.collision.addBox(-CR * 0.7, DY, -CR, CR * 0.7, DY + CH, CR, 'metal');
  emitters.push({ type: 'smoke', x: 0, y: DY + CH + 0.3, z: 0, rate: 4 });
  emitters.push({ type: 'sparks', x: 0.8, y: DY + CH, z: 0.4, rate: 5 });
  lamp(0, DY + CH + 1, 0, 0xff7a2a, 12, 16);
  lamp(0, 2.2, 0, 0xffa060, 6, 13); // under-deck
  for (const [x, z] of [[-4, -4], [4, 4]]) P.crateStack(kit, x, z, mats, rng);
  kit.box(-3.5, 0.55, 3.6, 2.2, 1.1, 1.1, M.steelDark);
  kit.box(3.6, DY + 0.55, -3.8, 1.6, 1.1, 1.6, M.steelDark);
  kit.box(-4.2, DY + 0.55, 3.6, 1.1, 1.1, 2.2, M.steelDark);

  // ---------- NORTH: the molten channel ----------
  const CZ0 = -17, CZ1 = -14.5;
  const channel = new THREE.Mesh(new THREE.PlaneGeometry(2 * H, CZ1 - CZ0), M.lava);
  channel.rotation.x = -Math.PI / 2;
  channel.position.set(0, 0.03, (CZ0 + CZ1) / 2);
  kit.add(channel);
  hazards.push({ minX: -H, maxX: H, minZ: CZ0, maxZ: CZ1, dps: 24 });
  for (const x of [-30, 0, 30]) lamp(x, 1.3, (CZ0 + CZ1) / 2, 0xff6a1a, 10, 18);
  for (let i = 0; i < 12; i++) emitters.push({ type: 'steam', x: -40 + i * 7.3 + rng() * 2, y: 0.2, z: (CZ0 + CZ1) / 2, rate: 0.6 });
  const bridges = [-26, 0, 26];
  // kerbs along the channel (steppable), broken by bridges
  for (const z of [CZ0 - 0.2, CZ1 + 0.2]) {
    let cursor = -H;
    for (const b of [...bridges, H + 10]) {
      const end = Math.min(H, b - 1.9);
      if (end > cursor) kit.slab(cursor, 0, z - 0.2, end, 0.28, z + 0.2, M.hazard, { bevel: 0.03 });
      cursor = b + 1.9;
    }
  }
  for (const bx of bridges) {
    kit.slab(bx - 1.7, 0, CZ0 - 0.9, bx + 1.7, 0.45, CZ1 + 0.9, M.steel);
    for (const s of [-1, 1]) {
      kit.slab(bx + s * 1.7 - 0.08, 0.45, CZ0 - 0.9, bx + s * 1.7 + 0.08, 1.4, CZ1 + 0.9, M.dark, { bevel: 0.02 });
    }
  }

  // ---------- NW: the Pump House ----------
  buildPumpHouse(kit, M, emitters, lamp);

  // ---------- NE: the Tank Farm ----------
  function tank(cx, cz, r, h, mat) {
    kit.geo(new THREE.CylinderGeometry(r, r, h, 36), mat, { x: cx, y: h / 2, z: cz });
    for (const y of [0.4, h * 0.5, h - 0.3]) kit.geo(new THREE.TorusGeometry(r + 0.03, 0.07, 6, 36), M.steelDark, { x: cx, y, z: cz, rx: Math.PI / 2 });
    kit.geo(new THREE.CylinderGeometry(r * 0.98, r, 0.25, 36), M.steel, { x: cx, y: h + 0.02, z: cz });
    kit.collision.addBox(cx - r, 0, cz - r * 0.72, cx + r, h, cz + r * 0.72, 'metal');
    kit.collision.addBox(cx - r * 0.72, 0, cz - r, cx + r * 0.72, h, cz + r, 'metal');
  }
  const T1 = { x: 30, z: -30.5, r: 3.5 }, T2 = { x: 38, z: -22, r: 3.2 };
  tank(T1.x, T1.z, T1.r, 7, M.tank);
  tank(T2.x, T2.z, T2.r, 7, M.tank);
  tank(22, -24, 2.2, 3.2, M.rust);
  // stair tower: flight A along the north wall, landing, flight B onto tank 1
  kit.stairs(18, -41.2, '+x', 8, 1.8, 0, 3.5, M.steel, { sideMat: M.dark, open: true });
  kit.slab(26, 3.1, -42.3, 32, 3.5, -39.4, M.steel);
  for (const [x, z] of [[26.4, -42], [31.6, -42], [26.4, -39.7], [31.6, -39.7]]) kit.box(x, 1.55, z, 0.35, 3.1, 0.35, M.steelDark);
  kit.stairs(30, -39.4, '+z', 5.4, 1.8, 3.5, 7, M.steel, { sideMat: M.dark, open: true });
  // catwalk bridges tank-to-tank at 7m
  kit.slab(T1.x + T1.r - 0.2, 6.7, -31.5, 39.2, 7, -29.5, M.steel, { shadow: true });
  kit.slab(37.2, 6.7, -31.5, 39.2, 7, T2.z - T2.r + 0.3, M.steel);
  kit.box(36, 3.35, -30.5, 0.4, 6.7, 0.4, M.steelDark);
  kit.box(38.2, 3.35, -27, 0.4, 6.7, 0.4, M.steelDark);
  // pipes between the tanks (visual)
  kit.geo(new THREE.CylinderGeometry(0.35, 0.35, 9, 12), M.pipeRed, { x: 34, y: 1.2, z: -26.3, rz: Math.PI / 2, ry: 0.8 });
  kit.geo(new THREE.CylinderGeometry(0.25, 0.25, 12, 12), M.pipe, { x: 26, y: 2.4, z: -36, rz: Math.PI / 2 });
  P.barrelCluster(kit, 24, -38, mats, rng);
  P.crateStack(kit, 34.5, -38.5, mats, rng, true);

  // ---------- SE: the Loading Dock ----------
  kit.slab(22, 0, 20, 40, 1.4, 32, M.concrete, { bevel: 0.06 });
  kit.box(31, 0.7, 20.05, 18, 0.2, 0.1, M.hazard, { collide: false, cast: false });
  kit.stairs(18.5, 26, '+x', 3.5, 3, 0, 1.4, M.concrete);
  kit.ramp(28, 16, 32, 20, 1, 0, 1.4, true, M.steel);
  kit.stairs(34, 36, '-z', 4, 3, 0, 1.4, M.concrete);
  // warehouse shed on the dock
  for (const x of [28.3, 34, 39.7]) {
    for (const z of [21, 31]) kit.box(x, 1.4 + 2.5, z, 0.4, 5, 0.4, M.steelDark);
  }
  kit.slab(27.8, 6.4, 20.5, 40.4, 6.7, 31.5, M.wallA);
  kit.slab(40, 1.4, 20.5, 40.4, 6.4, 31.5, M.wallA);
  for (const [x, z] of [[31, 24.5], [36, 24.5], [31, 28], [36, 28]]) {
    kit.box(x, 1.4 + 1.2, z, 3, 2.4, 0.9, M.steelDark);
    P.crate(kit, x - 0.6, z, 0.8, M.crate, { y: 1.4 + 2.4 });
  }
  P.barrelCluster(kit, 24, 23, mats, rng);
  P.container(kit, 6, 0, 30, 'z', M.wallB, M.dark);
  P.crateStack(kit, 16, 36, mats, rng, true);
  P.crateStack(kit, 26, 38, mats, rng);
  // flatbed truck
  kit.box(20, 1.2, 40, 6.5, 0.4, 2.4, M.steelDark);
  kit.box(24, 1.8, 40, 1.8, 2.2, 2.4, M.pipeRed);
  for (const x of [17.5, 20, 23.8]) for (const s of [-1, 1]) kit.geo(new THREE.CylinderGeometry(0.5, 0.5, 0.35, 14), M.dark, { x, y: 0.5, z: 40 + s * 1.15, rx: Math.PI / 2 });
  kit.collision.addBox(16.7, 0, 38.8, 25, 1.4, 41.2, 'metal');

  // ---------- SW: the Slag Pits ----------
  kit.slab(-34, 0, 24, -24, 2.8, 32, M.concrete, { bevel: 0.08 });
  kit.stairs(-20, 28, '-x', 4, 2.4, 0, 2.8, M.concrete);
  kit.stairs(-29, 19.5, '+z', 4.5, 2.4, 0, 2.8, M.concrete);
  kit.wall('x', 31.8, -34, -24, 2.8, 3.8, 0.3, M.dark);
  // the ladle: a tilted bucket of molten metal on a frame
  kit.geo(new THREE.CylinderGeometry(1.5, 1.2, 2, 20, 1, true), M.rust, { x: -30, y: 4.4, z: 28, rz: 0.5 });
  const ladleTop = new THREE.Mesh(new THREE.CircleGeometry(1.35, 20), M.lava);
  ladleTop.position.set(-29.5, 5.3, 28);
  ladleTop.rotation.set(-Math.PI / 2, 0.5, 0);
  kit.add(ladleTop);
  for (const s of [-1, 1]) kit.box(-30, 4.3, 28 + s * 1.8, 0.3, 3, 0.3, M.steelDark);
  kit.collision.addBox(-31.5, 2.8, 26.5, -28.5, 5.2, 29.5, 'metal');
  emitters.push({ type: 'sparks', x: -29, y: 5.3, z: 28, rate: 6 });
  emitters.push({ type: 'smoke', x: -29.5, y: 5.6, z: 28, rate: 3 });
  lamp(-29, 6.5, 28, 0xff6a1a, 10, 16);
  function pool(x0, z0, x1, z1) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), M.lava);
    m.rotation.x = -Math.PI / 2;
    m.position.set((x0 + x1) / 2, 0.03, (z0 + z1) / 2);
    kit.add(m);
    hazards.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, dps: 24 });
    kit.slab(x0 - 0.3, 0, z0 - 0.3, x1 + 0.3, 0.28, z0, M.hazard);
    kit.slab(x0 - 0.3, 0, z1, x1 + 0.3, 0.28, z1 + 0.3, M.hazard);
    kit.slab(x0 - 0.3, 0, z0, x0, 0.28, z1, M.hazard);
    kit.slab(x1, 0, z0, x1 + 0.3, 0.28, z1, M.hazard);
  }
  pool(-41, 15, -36, 22);
  pool(-22, 35, -15, 41);
  lamp(-38.5, 1.2, 18.5, 0xff6a1a, 7, 12);
  lamp(-18.5, 1.2, 38, 0xff6a1a, 7, 12);
  // ingot stacks: waist-high cover
  for (const [x, z, r] of [[-16, 20, 0], [-20, 23, 0.4], [-36, 34, 0.1], [-12, 28, 1.2], [-38, 28, -0.3], [-26, 38, 0.6]]) {
    kit.box(x, 0.45, z, 2.4, 0.9, 1.2, M.steelDark, { ry: r });
    kit.box(x, 1.05, z, 1.8, 0.3, 0.9, M.rust, { ry: r + 0.1, collide: false });
  }

  // ---------- the gantry high line (8.5m) ----------
  const GY = 8.5, GZ0 = 9.5, GZ1 = 11.5;
  kit.slab(-20, GY - 0.3, GZ0, 20, GY, GZ1, M.steel);
  kit.box(0, GY - 0.35, GZ0 + 0.05, 40, 0.12, 0.1, M.hazard, { collide: false, cast: false });
  for (const s of [-1, 1]) {
    // A-frame legs
    for (const z of [GZ0 - 1.2, GZ1 + 1.2]) {
      kit.box(s * 21, GY / 2, z, 0.6, GY + 0.3, 0.6, M.steelDark);
    }
    kit.box(s * 21, GY + 0.2, (GZ0 + GZ1) / 2, 0.7, 0.6, GZ1 - GZ0 + 3.2, M.steelDark);
    // guard rails (visual only, so robots and players can drop off)
    kit.box(0, GY + 0.55, s > 0 ? GZ1 : GZ0, 40, 0.06, 0.06, M.dark, { collide: false, cast: false, bevel: 0 });
  }
  // crane trolley with hook hanging over the south stair
  kit.box(-6, GY + 0.6, 10.5, 2.2, 1, 2.8, M.hazard, { collide: false });
  kit.geo(new THREE.CylinderGeometry(0.03, 0.03, 3.5, 5), M.dark, { x: -6, y: GY - 1.8, z: 10.5 });
  kit.geo(new THREE.TorusGeometry(0.3, 0.07, 6, 12, Math.PI * 1.4), M.pipe, { x: -6, y: GY - 3.7, z: 10.5 });

  // ---------- jump pads (nav links) ----------
  const jumpPads = [
    pad(12, 18, 15, GY, 10.5),
    pad(-12, 18, -15, GY, 10.5),
    pad(15, -26, T1.x - 1, 7, T1.z + 0.5),
    pad(-17, -24, -28, 7.2, -29.5),
  ];
  const padMat = new THREE.MeshStandardMaterial({ color: 0x0a2a33, emissive: 0x44ddff, emissiveIntensity: 2.2 });
  for (const p of jumpPads) {
    kit.geo(new THREE.CylinderGeometry(1.2, 1.35, 0.25, 24), M.steelDark, { x: p.x, y: 0.12, z: p.z });
    const glow = new THREE.Mesh(new THREE.RingGeometry(0.55, 1.05, 32), padMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(p.x, 0.26, p.z);
    kit.add(glow);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.6, 3), padMat);
    arrow.position.set(p.x, 0.9, p.z);
    arrow.rotation.set(Math.atan2(Math.hypot(p.vx, p.vz), p.vy) * 0.5, Math.atan2(p.vx, p.vz), 0, 'YXZ');
    kit.add(arrow);
    let t = rng() * 6;
    updaters.push((dt) => { t += dt; arrow.position.y = 0.9 + Math.sin(t * 3) * 0.15; padMat.emissiveIntensity = 1.8 + Math.sin(t * 5) * 0.6; });
    kit.collision.addBox(p.x - 1.2, 0, p.z - 1.2, p.x + 1.2, 0.25, p.z + 1.2, 'metal');
    p.y = 0.25;
  }

  // ---------- scattered cover / dressing ----------
  // pipe racks south of the deck (waist cover with a gap in the middle)
  for (const [x0, x1] of [[-10, -2.2], [2.2, 10]]) {
    kit.slab(x0, 0, 21.5, x1, 1.25, 22.3, M.steelDark, { bevel: 0.03 });
    kit.geo(new THREE.CylinderGeometry(0.28, 0.28, x1 - x0, 12), M.pipe, { x: (x0 + x1) / 2, y: 1.5, z: 21.9, rz: Math.PI / 2 });
  }
  for (const [x, z] of [[-10, -8], [10, 8], [-16, 7], [17, -6], [-24, 8], [24, -8], [-8, 32], [8, 34], [-36, -8], [36, 10], [-4, -26], [6, -34], [-12, -36], [12, -22]]) {
    if (rng() < 0.5) P.crateStack(kit, x, z, mats, rng, rng() < 0.4);
    else P.barrelCluster(kit, x, z, mats, rng);
  }
  for (const [x, z, w, d] of [[-22, -2, 1.2, 4], [22, 2, 1.2, 4], [-6, 26, 4, 1.2], [30, 8, 4, 1.2], [-30, -8, 4, 1.2], [8, -24, 4, 1.2]]) {
    kit.box(x, 0.9, z, w, 1.8, d, M.steel);
  }
  // sodium lamp posts
  for (const [x, z, r] of [[-9, 9, 0.8], [9, -9, -2.4], [-12, -12, -0.8], [12, 12, 2.4], [-30, 12, 0], [30, -12, Math.PI], [0, 30, Math.PI / 2], [-20, -32, 0]]) {
    P.lampPost(kit, x, z, M.dark, M.sodium, { h: 6, ry: r });
  }
  lamp(-9, 5.6, 9, 0xffa040, 5, 15);
  lamp(9, 5.6, -9, 0xffa040, 5, 15);
  // skyline: smokestacks beyond the wall
  for (const [x, z, h] of [[-52, -30, 34], [-56, 10, 28], [54, -40, 38], [58, 24, 30], [10, -58, 32], [-20, 58, 26]]) {
    kit.geo(new THREE.CylinderGeometry(1.6, 2.4, h, 16), M.steelDark, { x, y: h / 2, z, cast: false });
    kit.geo(new THREE.CylinderGeometry(1.75, 1.75, 1.2, 16), M.hazard, { x, y: h - 2, z, cast: false });
    kit.box(x, h - 0.6, z, 0.4, 0.4, 0.4, M.redLight, { collide: false, cast: false, bevel: 0 });
    emitters.push({ type: 'smoke', x, y: h + 0.5, z, rate: 3 });
  }

  return {
    spawnPoints,
    playerSpawn: { x: 0, z: 36, yaw: 0 },
    sun, sunDir, hemi, sky,
    shadowLights: [sun],
    hazards, jumpPads,
    updaters,
    floorSurface: 'concrete',
    bounds: { minX: -52, maxX: 52, minZ: -52, maxZ: 52 },
    env: {
      exposure: 1.1, bloom: 0.55, bloomRadius: 0.5, bloomThreshold: 0.85,
      grade: { saturation: 1.08, contrast: 1.1, tint: [1.0, 0.98, 1.0], lift: [0.01, 0.012, 0.03], vignette: 0.36 },
      vmHemi: [0x8a90b8, 0x5a3a2a], vmSun: 0xffb080, vmEnvIntensity: 0.7,
    },
    music: 2,
  };
}

// Two storeys + roof. 1F→2F stairs along the north wall (rising east),
// 2F→roof along the south wall (rising west). Doors south + east.
function buildPumpHouse(kit, M, emitters, lamp) {
  const x0 = -38, x1 = -24, z0 = -38, z1 = -26, T = 0.4;
  const F2 = 3.6, R = 7.2;
  const win = (c, y) => ({ c, w: 1.8, y0: y + 1.1, y1: y + 2.4 });
  kit.wall('x', z1 - T / 2, x0, x1, 0, R, T, M.wallB, [{ c: -31, w: 2.6, y0: 0, y1: 2.7 }, win(-35.5, F2), win(-28.5, F2)]);
  kit.wall('x', z0 + T / 2, x0, x1, 0, R, T, M.wallB, [win(-34, 0), win(-28, 0), win(-31, F2)]);
  kit.wall('z', x0 + T / 2, z0 + T, z1 - T, 0, R, T, M.wallB, [win(-32, 0), win(-32, F2)]);
  kit.wall('z', x1 - T / 2, z0 + T, z1 - T, 0, R, T, M.wallB, [{ c: -32, w: 2.6, y0: 0, y1: 2.7 }, win(-29, F2), win(-35.2, F2)]);
  const ix0 = x0 + T, ix1 = x1 - T, iz0 = z0 + T, iz1 = z1 - T;
  // 2F slab with the stairwell hole (north strip x -36.5..-30.5)
  kit.slab(ix0, F2 - 0.3, -35.8, ix1, F2, iz1, M.steel);
  kit.slab(ix0, F2 - 0.3, iz0, -36.5, F2, -35.8, M.steel);
  kit.slab(-30.5, F2 - 0.3, iz0, ix1, F2, -35.8, M.steel);
  kit.stairs(-36.5, -36.8, '+x', 6, 1.6, 0, F2, M.steelDark, { sideMat: M.dark, open: true });
  kit.slab(-36.5, F2, -35.95, -30.5, F2 + 1, -35.8, M.dark, { bevel: 0.02 });
  // roof slab with the hole along the south wall (x -32.5..-26.5)
  kit.slab(ix0, R - 0.3, iz0, ix1, R, -28, M.steel);
  kit.slab(ix0, R - 0.3, -28, -32.5, R, iz1, M.steel);
  kit.slab(-26.5, R - 0.3, -28, ix1, R, iz1, M.steel);
  kit.stairs(-26.5, -27.2, '-x', 6, 1.6, F2, R, M.steelDark, { sideMat: M.dark, open: true });
  kit.slab(-32.5, R, -28.15, -26.5, R + 1, -28, M.dark, { bevel: 0.02 });
  // parapet with gaps
  const py = R, ph = R + 1;
  kit.wall('x', z1 - T / 2, x0, x1, py, ph, T, M.wallB, [{ c: -36, w: 1.4, y0: py, y1: ph }]);
  kit.wall('x', z0 + T / 2, x0, x1, py, ph, T, M.wallB, [{ c: -27, w: 1.4, y0: py, y1: ph }]);
  kit.wall('z', x0 + T / 2, z0 + T, z1 - T, py, ph, T, M.wallB);
  kit.wall('z', x1 - T / 2, z0 + T, z1 - T, py, ph, T, M.wallB, [{ c: -33, w: 1.4, y0: py, y1: ph }]);
  // roof: water tank + vents (cover)
  kit.geo(new THREE.CylinderGeometry(1.2, 1.2, 1.8, 18), M.tank, { x: -35, y: R + 0.9, z: -31 });
  kit.collision.addBox(-36.2, R, -32.2, -33.8, R + 1.8, -29.8, 'metal');
  kit.box(-28, R + 0.5, -34.5, 1.6, 1, 1.6, M.steelDark);
  emitters.push({ type: 'steam', x: -28, y: R + 1.2, z: -34.5, rate: 1.2 });
  // interior: pumps (cover)
  kit.box(-34.5, 0.7, -31, 2.2, 1.4, 1.4, M.pipeRed);
  kit.geo(new THREE.CylinderGeometry(0.3, 0.3, 2.5, 12), M.pipe, { x: -34.5, y: 1.6, z: -31, rz: Math.PI / 2 });
  kit.box(-27.5, 0.6, -30, 1.2, 1.2, 2.2, M.steelDark);
  kit.box(-33, F2 + 0.6, -29.5, 2.4, 1.2, 1, M.steelDark);
  // exterior pipes to the channel
  kit.geo(new THREE.CylinderGeometry(0.4, 0.4, 8.5, 14), M.pipe, { x: -31, y: 0.6, z: -21.5, rx: Math.PI / 2 });
  kit.collision.addBox(-31.45, 0, -25.8, -30.55, 1.0, -17.2, 'metal');
  lamp(-31, 2.8, -32, 0xffc080, 4, 10);
  lamp(-31, F2 + 2.6, -32, 0xffc080, 4, 10);
}
