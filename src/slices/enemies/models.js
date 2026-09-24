import * as THREE from 'three';
import { chamferBox } from './chamfer.js';

// Procedural robot rigs. A model spec (types.js) picks a body plan —
// biped, quad, drone, orb, wraith — plus heads, weapons and dressing.
// Every rig exposes joints for procedural animation, hitbox anchors, a
// muzzle, per-enemy materials (for hit flash / elite tint) and its meshes
// (so deaths can break the robot apart).

const geoCache = new Map();
function RB(w, h, d, r = 0.03) {
  const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${r}`;
  let g = geoCache.get(key);
  if (!g) {
    g = chamferBox(w, h, d, Math.min(r * 0.7, w / 3, h / 3, d / 3));
    geoCache.set(key, g);
  }
  return g;
}
function CYL(rt, rb, h, s = 12, axis = 'y') {
  const key = `c${rt}|${rb}|${h}|${s}|${axis}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new THREE.CylinderGeometry(rt, rb, h, s);
    if (axis === 'z') g.rotateX(Math.PI / 2);
    if (axis === 'x') g.rotateZ(Math.PI / 2);
    geoCache.set(key, g);
  }
  return g;
}
function SPH(r, w = 16, h = 12) {
  const key = `s${r}|${w}|${h}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new THREE.SphereGeometry(r, w, h);
    geoCache.set(key, g);
  }
  return g;
}

// shared armour panel normal map (panel seams + rivets)
let panelNormal = null;
function getPanelNormal() {
  if (panelNormal) return panelNormal;
  const size = 128;
  const H = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const seam = Math.min(u, 1 - u, v, 1 - v, Math.abs(v - 0.5) * 1.0 + (u > 0.5 ? 1 : 0));
      let h = seam < 0.02 ? 0.2 : 0.8;
      const rv = [[0.08, 0.08], [0.92, 0.08], [0.08, 0.92], [0.92, 0.92]];
      for (const [rx, ry] of rv) {
        const d = Math.hypot(u - rx, v - ry);
        if (d < 0.03) h = 1;
      }
      H[y * size + x] = h + Math.random() * 0.03;
    }
  }
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const l = H[y * size + ((x - 1 + size) % size)], r = H[y * size + ((x + 1) % size)];
      const t = H[((y - 1 + size) % size) * size + x], b = H[((y + 1) % size) * size + x];
      let nx = (l - r) * 3, ny = (b - t) * 3, nz = 1;
      const inv = 1 / Math.hypot(nx, ny, nz);
      img.data[i * 4] = (nx * inv * 0.5 + 0.5) * 255;
      img.data[i * 4 + 1] = (ny * inv * 0.5 + 0.5) * 255;
      img.data[i * 4 + 2] = (nz * inv * 0.5 + 0.5) * 255;
      img.data[i * 4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  panelNormal = new THREE.CanvasTexture(c);
  panelNormal.wrapS = panelNormal.wrapT = THREE.RepeatWrapping;
  return panelNormal;
}

function materials(spec) {
  const armor = new THREE.MeshStandardMaterial({
    color: spec.armor, metalness: 0.55, roughness: 0.42, normalMap: getPanelNormal(),
    normalScale: new THREE.Vector2(0.6, 0.6), emissive: 0x000000,
  });
  const trim = new THREE.MeshStandardMaterial({ color: spec.trim, metalness: 0.75, roughness: 0.5, emissive: 0x000000 });
  const glow = new THREE.MeshStandardMaterial({ color: spec.glow, emissive: spec.glow, emissiveIntensity: 3.2, roughness: 0.3 });
  const joint = new THREE.MeshStandardMaterial({ color: 0x1a1c20, metalness: 0.8, roughness: 0.35 });
  return { armor, trim, glow, joint };
}

class RigBuilder {
  constructor(mats) {
    this.mats = mats;
    this.meshes = [];
  }
  part(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, shadow = false) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = shadow;
    parent.add(m);
    this.meshes.push(m);
    return m;
  }
  joint(parent, x = 0, y = 0, z = 0) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  }
}

// ---------- weapons held in hands ----------
function armWeapon(b, hand, kind, M) {
  const muzzle = new THREE.Object3D();
  if (kind === 'rifle') {
    b.part(hand, RB(0.09, 0.12, 0.62, 0.02), M.trim, 0, -0.02, -0.22);
    b.part(hand, RB(0.05, 0.05, 0.3, 0.01), M.joint, 0, 0.04, -0.5);
    b.part(hand, RB(0.02, 0.03, 0.2, 0.005), M.glow, 0.05, 0.0, -0.2);
    muzzle.position.set(0, 0.02, -0.66);
  } else if (kind === 'longrifle') {
    b.part(hand, RB(0.07, 0.1, 1.2, 0.02), M.trim, 0, 0, -0.45);
    b.part(hand, CYL(0.035, 0.035, 0.28, 10, 'z'), M.joint, 0, 0.1, -0.2);
    b.part(hand, CYL(0.02, 0.02, 0.04, 10, 'z'), M.glow, 0, 0.1, -0.35);
    muzzle.position.set(0, 0.0, -1.06);
  } else if (kind === 'cannon') {
    b.part(hand, CYL(0.13, 0.15, 0.7, 14, 'z'), M.trim, 0, 0, -0.25);
    b.part(hand, CYL(0.16, 0.16, 0.1, 14, 'z'), M.armor, 0, 0, -0.5);
    b.part(hand, CYL(0.08, 0.08, 0.02, 14, 'z'), M.glow, 0, 0, -0.61);
    muzzle.position.set(0, 0, -0.64);
  } else if (kind === 'minigun') {
    const spin = b.joint(hand, 0, 0, -0.35);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      b.part(spin, CYL(0.028, 0.028, 0.75, 8, 'z'), M.joint, Math.cos(a) * 0.08, Math.sin(a) * 0.08, 0);
    }
    b.part(hand, CYL(0.15, 0.15, 0.25, 14, 'z'), M.trim, 0, 0, 0.0);
    b.part(hand, CYL(0.12, 0.12, 0.04, 14, 'z'), M.glow, 0, 0, -0.14);
    muzzle.position.set(0, 0, -0.75);
    hand.userData.spin = spin;
  } else if (kind === 'blade') {
    b.part(hand, RB(0.05, 0.28, 1.0, 0.015), M.trim, 0, -0.05, -0.45, 0.15, 0, 0);
    b.part(hand, RB(0.02, 0.04, 0.95, 0.005), M.glow, 0, -0.18, -0.45, 0.15, 0, 0);
    muzzle.position.set(0, 0, -0.8);
  } else if (kind === 'flamer') {
    b.part(hand, CYL(0.07, 0.1, 0.45, 12, 'z'), M.trim, 0, 0, -0.2);
    b.part(hand, CYL(0.05, 0.05, 0.08, 10, 'z'), M.glow, 0, 0, -0.46);
    muzzle.position.set(0, 0, -0.52);
  } else {
    b.part(hand, RB(0.14, 0.14, 0.14, 0.03), M.trim, 0, 0, -0.05);
    muzzle.position.set(0, 0, -0.1);
  }
  hand.add(muzzle);
  return muzzle;
}

// ---------- body plans ----------
function buildBiped(spec, M) {
  const b = new RigBuilder(M);
  const s = spec.size || 1;
  const bulk = spec.bulk || 1;
  const slim = spec.slim || 1;
  const root = new THREE.Group();
  const body = b.joint(root, 0, 0, 0);
  body.scale.setScalar(s);
  const hipY = 1.0;
  const hips = b.joint(body, 0, hipY, 0);
  b.part(hips, RB(0.38 * bulk * slim, 0.2, 0.26, 0.05), M.trim, 0, 0, 0, 0, 0, 0, true);
  const torso = b.joint(hips, 0, 0.1, 0);
  b.part(torso, CYL(0.12 * bulk * slim, 0.15 * bulk * slim, 0.22, 12), M.joint, 0, 0.1, 0);
  const chest = b.part(torso, RB(0.54 * bulk * slim, 0.44, 0.34 * (spec.hunch ? 1.2 : 1), 0.07), M.armor, 0, 0.42, 0, 0, 0, 0, true);
  b.part(torso, RB(0.3 * bulk * slim, 0.16, 0.04, 0.02), M.trim, 0, 0.44, -0.18);
  b.part(torso, RB(0.08, 0.05, 0.02, 0.01), M.glow, 0.12 * bulk, 0.52, -0.19);
  if (spec.hunch) torso.rotation.x = -0.35;
  // core (bosses expose it in phase 2)
  const core = b.part(torso, SPH(0.1, 12, 10), M.glow, 0, 0.4, -0.17);
  core.visible = false;
  // backpack
  if (spec.pack === 'box') b.part(torso, RB(0.32, 0.34, 0.16, 0.04), M.trim, 0, 0.42, 0.24);
  if (spec.pack === 'antenna') {
    b.part(torso, RB(0.22, 0.3, 0.12, 0.03), M.trim, 0, 0.42, 0.22);
    b.part(torso, CYL(0.01, 0.01, 0.7, 5), M.joint, 0.08, 0.85, 0.24);
    b.part(torso, SPH(0.025, 6, 6), M.glow, 0.08, 1.2, 0.24);
  }
  if (spec.pack === 'tanks') {
    for (const sx of [-1, 1]) b.part(torso, CYL(0.1, 0.1, 0.46, 12), M.glow, sx * 0.12, 0.42, 0.25);
  }
  if (spec.pack === 'reactor') {
    b.part(torso, RB(0.5 * bulk, 0.42, 0.22, 0.05), M.trim, 0, 0.45, 0.26);
    b.part(torso, CYL(0.09, 0.09, 0.32, 12), M.glow, 0, 0.47, 0.4);
    for (const sx of [-1, 1]) b.part(torso, CYL(0.04, 0.05, 0.4, 8), M.joint, sx * 0.18, 0.78, 0.28);
  }
  // head
  const neck = b.joint(torso, 0, 0.66, spec.hunch ? -0.12 : 0);
  const head = b.joint(neck, 0, 0.12, 0);
  const hk = spec.head || 'visor';
  if (hk === 'visor') {
    b.part(head, RB(0.26, 0.24, 0.28, 0.06), M.armor, 0, 0, 0, 0, 0, 0, true);
    b.part(head, RB(0.22, 0.06, 0.03, 0.015), M.glow, 0, 0.01, -0.14);
  } else if (hk === 'dome') {
    b.part(head, SPH(0.17, 16, 10), M.armor, 0, 0, 0, 0, 0, 0, true);
    b.part(head, RB(0.2, 0.04, 0.05, 0.01), M.glow, 0, 0, -0.14);
    b.part(head, RB(0.3, 0.06, 0.3, 0.02), M.trim, 0, -0.07, 0);
  } else if (hk === 'eye') {
    b.part(head, CYL(0.11, 0.13, 0.26, 14, 'z'), M.armor, 0, 0, 0, 0, 0, 0, true);
    b.part(head, CYL(0.06, 0.06, 0.03, 14, 'z'), M.glow, 0, 0, -0.14);
  } else if (hk === 'crown') {
    b.part(head, RB(0.32, 0.26, 0.3, 0.06), M.armor, 0, 0, 0, 0, 0, 0, true);
    b.part(head, RB(0.28, 0.05, 0.03, 0.01), M.glow, 0, 0.0, -0.15);
    for (const sx of [-1, 1]) b.part(head, RB(0.05, 0.28, 0.1, 0.02), M.trim, sx * 0.16, 0.18, 0.02, 0, 0, sx * -0.35);
  } else if (hk === 'horns') {
    b.part(head, RB(0.3, 0.22, 0.3, 0.06), M.armor, 0, 0, 0, 0, 0, 0, true);
    b.part(head, RB(0.24, 0.05, 0.03, 0.01), M.glow, 0, 0.0, -0.15);
    for (const sx of [-1, 1]) b.part(head, new THREE.ConeGeometry(0.05, 0.35, 6), M.trim, sx * 0.17, 0.2, 0, 0, 0, sx * -0.6);
  }
  // shoulders
  const shoulderX = 0.34 * bulk * slim;
  const arms = [];
  for (const side of [1, -1]) {
    const sh = b.joint(torso, side * shoulderX, 0.56, 0);
    if (spec.shoulder === 'plates') b.part(sh, RB(0.26, 0.12, 0.3, 0.04), M.armor, side * 0.06, 0.1, 0, 0, 0, side * -0.25, true);
    if (spec.shoulder === 'pods' && side === 1) {
      b.part(sh, RB(0.3, 0.26, 0.4, 0.04), M.trim, 0.1, 0.25, 0);
      for (let i = 0; i < 4; i++) b.part(sh, CYL(0.035, 0.035, 0.02, 8, 'z'), M.glow, 0.02 + (i % 2) * 0.12, 0.2 + Math.floor(i / 2) * 0.1, -0.2);
    }
    b.part(sh, SPH(0.09, 10, 8), M.joint, 0, 0, 0);
    const upper = b.joint(sh, 0, 0, 0);
    b.part(upper, RB(0.13, 0.32, 0.14, 0.03), M.armor, 0, -0.17, 0, 0, 0, 0, true);
    const elbow = b.joint(upper, 0, -0.34, 0);
    b.part(elbow, SPH(0.065, 8, 6), M.joint, 0, 0, 0);
    const fore = b.joint(elbow, 0, 0, 0);
    b.part(fore, RB(0.12, 0.3, 0.13, 0.03), M.trim, 0, -0.15, 0);
    const hand = b.joint(fore, 0, -0.32, 0);
    arms.push({ side, sh, upper, elbow, fore, hand });
  }
  // right hand = main weapon, left = off weapon or shield
  const main = arms[0];
  const off = arms[1];
  const muzzle = armWeapon(b, main.hand, spec.arm || 'rifle', M);
  let muzzle2 = null;
  if (spec.offArm) muzzle2 = armWeapon(b, off.hand, spec.offArm, M);
  else armWeapon(b, off.hand, 'fist', M);
  // energy shield panel
  let shield = null;
  if (spec.shieldArm) {
    const smat = new THREE.MeshStandardMaterial({
      color: 0x4fa8ff, emissive: 0x2a7fff, emissiveIntensity: 1.6, transparent: true, opacity: 0.38,
      side: THREE.DoubleSide, depthWrite: false,
    });
    shield = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 1.7, 20, 1, true, -0.75, 1.5), smat);
    shield.rotation.y = Math.PI;
    shield.position.set(0, 1.25, 0);
    body.add(shield);
    b.part(body, RB(0.7, 0.05, 0.08, 0.02), M.trim, 0, 0.42, -0.72);
    b.meshes.push(shield);
  }
  // legs
  const legs = [];
  for (const side of [1, -1]) {
    const hip = b.joint(hips, side * 0.17 * bulk * slim, -0.05, 0);
    b.part(hip, SPH(0.09, 10, 8), M.joint, 0, 0, 0);
    const thigh = b.joint(hip, 0, 0, 0);
    b.part(thigh, RB(0.17 * bulk, 0.46, 0.2, 0.04), M.armor, 0, -0.24, 0, 0, 0, 0, true);
    const knee = b.joint(thigh, 0, -0.47, 0);
    b.part(knee, RB(0.14, 0.12, 0.14, 0.03), M.trim, 0, 0, -0.05);
    const shin = b.joint(knee, 0, 0, 0);
    b.part(shin, RB(0.14 * bulk, 0.46, 0.16, 0.04), M.trim, 0, -0.23, 0.02, 0, 0, 0, true);
    const ankle = b.joint(shin, 0, -0.47, 0);
    b.part(ankle, RB(0.2 * bulk, 0.08, 0.34, 0.03), M.joint, 0, -0.02, -0.06);
    legs.push({ side, hip, thigh, knee, shin, ankle });
  }

  const standH = (hipY + 1.3) * s;
  const rig = {
    root, body, hips, torso, head, neck, arms, legs, muzzle, muzzle2, shield, core,
    meshes: b.meshes, mats: M, height: standH, headAnchor: head,
    hitboxes: [
      { node: head, off: new THREE.Vector3(0, 0, 0), r: 0.19 * s, part: 'head' },
      { node: torso, off: new THREE.Vector3(0, 0.42, 0), r: 0.34 * s * bulk * slim, part: 'body' },
      { node: torso, off: new THREE.Vector3(0, 0.12, 0), r: 0.24 * s * bulk * slim, part: 'body' },
      { node: legs[0].thigh, off: new THREE.Vector3(0, -0.3, 0), r: 0.17 * s * bulk, part: 'body' },
      { node: legs[1].thigh, off: new THREE.Vector3(0, -0.3, 0), r: 0.17 * s * bulk, part: 'body' },
      { node: legs[0].shin, off: new THREE.Vector3(0, -0.25, 0), r: 0.14 * s * bulk, part: 'body' },
      { node: legs[1].shin, off: new THREE.Vector3(0, -0.25, 0), r: 0.14 * s * bulk, part: 'body' },
    ],
    weak: { node: torso, off: new THREE.Vector3(0, 0.4, -0.17), r: 0.16 * s, part: 'weak' },
    shieldBoxes: shield ? [-0.45, 0, 0.45].map((x) => ({ node: body, off: new THREE.Vector3(x, 1.1, -0.8), r: 0.5, part: 'shield' })) : null,
    center: { node: torso, off: new THREE.Vector3(0, 0.35, 0) },
  };

  let phase = Math.random() * 6;
  rig.animate = (dt, a) => {
    const gait = Math.min(1, a.speed / (2.5 * s));
    phase += dt * (a.speed / (0.9 * s)) * 2.2;
    const sw = Math.sin(phase) * 0.55 * gait;
    const fwd = a.fwd, side = a.side;
    for (const leg of legs) {
      const ph = leg.side === 1 ? phase : phase + Math.PI;
      const swing = Math.sin(ph) * 0.6 * gait;
      leg.thigh.rotation.x = -swing * fwd;
      leg.thigh.rotation.z = swing * side * 0.5;
      leg.shin.rotation.x = Math.max(0, Math.sin(ph - 1.2)) * 1.0 * gait + 0.05;
      leg.ankle.rotation.x = -leg.shin.rotation.x * 0.4 - leg.thigh.rotation.x * 0.5;
    }
    hips.position.y = hipY + (Math.abs(Math.cos(phase)) - 0.5) * 0.06 * gait - (a.crouch || 0) * 0.15;
    torso.rotation.y = -sw * 0.25;
    torso.rotation.z = Math.sin(phase) * 0.05 * gait;
    torso.rotation.x = (spec.hunch ? -0.35 : 0) + a.lean + (a.flinchX || 0);
    // look + aim
    neck.rotation.x = a.aimPitch * 0.6;
    const aimPose = a.aiming ? 1 : 0.35;
    for (const arm of arms) {
      const isMain = arm.side === 1;
      const melee = a.swing > 0 && (isMain || spec.offArm === 'blade');
      if (melee) {
        const t = a.swing;
        arm.upper.rotation.x = -1.2 - Math.sin(t * Math.PI) * 1.4;
        arm.elbow.rotation.x = -0.4;
        arm.upper.rotation.z = arm.side * 0.4;
      } else if (isMain || spec.offArm) {
        arm.upper.rotation.x = -1.35 * aimPose - 0.25 + a.aimPitch * aimPose + (isMain ? a.recoil : 0) * 0.3;
        arm.elbow.rotation.x = -0.25 * aimPose - 0.2;
        arm.upper.rotation.z = arm.side * (0.08 + (1 - aimPose) * 0.15);
        arm.upper.rotation.y = arm.side * -0.15 * aimPose;
        if (arm.hand.userData.spin) arm.hand.userData.spin.rotation.z += dt * (a.firing ? 30 : 2);
      } else {
        arm.upper.rotation.x = sw * 0.6 * fwd - 0.1;
        arm.elbow.rotation.x = -0.35;
        arm.upper.rotation.z = arm.side * 0.12;
      }
      arm.hand.rotation.x = 0;
    }
    if (shield) shield.visible = a.shieldUp !== false;
  };
  return rig;
}

function buildQuad(spec, M) {
  const b = new RigBuilder(M);
  const s = spec.size || 1;
  const root = new THREE.Group();
  const body = b.joint(root, 0, 0, 0);
  body.scale.setScalar(s);
  const heavy = spec.heavy;
  const bodyY = heavy ? 0.95 : 0.62;
  const torso = b.joint(body, 0, bodyY, 0);
  b.part(torso, RB(heavy ? 0.9 : 0.5, heavy ? 0.45 : 0.3, heavy ? 1.3 : 0.9, 0.08), M.armor, 0, 0, 0, 0, 0, 0, true);
  b.part(torso, RB(heavy ? 0.6 : 0.34, 0.08, heavy ? 1.0 : 0.7, 0.03), M.trim, 0, heavy ? 0.26 : 0.17, 0);
  for (let i = 0; i < 3; i++) b.part(torso, RB(0.06, 0.03, 0.05, 0.01), M.glow, 0, heavy ? 0.31 : 0.22, -0.25 + i * 0.25);
  const core = b.part(torso, SPH(heavy ? 0.16 : 0.08, 12, 10), M.glow, 0, 0, -(heavy ? 0.66 : 0.46));
  core.visible = false;
  const neck = b.joint(torso, 0, 0.05, heavy ? -0.72 : -0.5);
  const head = b.joint(neck, 0, 0, 0);
  b.part(head, RB(heavy ? 0.5 : 0.3, heavy ? 0.32 : 0.2, heavy ? 0.4 : 0.3, 0.05), M.armor, 0, 0, -0.1, 0, 0, 0, true);
  for (const sx of [-1, 1]) b.part(head, SPH(heavy ? 0.05 : 0.035, 8, 6), M.glow, sx * (heavy ? 0.12 : 0.07), 0.03, heavy ? -0.31 : -0.26);
  let muzzle = new THREE.Object3D();
  if (!heavy) {
    // ripper blades
    for (const sx of [-1, 1]) b.part(head, RB(0.03, 0.08, 0.45, 0.01), M.glow, sx * 0.12, -0.06, -0.35, 0, sx * 0.25, 0);
    muzzle.position.set(0, 0, -0.5);
    head.add(muzzle);
  } else if (spec.mortar) {
    const tube = b.joint(torso, 0, 0.3, 0.2);
    b.part(tube, CYL(0.14, 0.17, 0.7, 12), M.trim, 0, 0.3, 0, -0.6, 0, 0);
    b.part(tube, CYL(0.1, 0.1, 0.03, 12), M.glow, 0, 0.62, -0.2, -0.6, 0, 0);
    muzzle.position.set(0, 0.62, -0.2);
    tube.add(muzzle);
  } else {
    muzzle.position.set(0, 0, -0.35);
    head.add(muzzle);
  }
  if (spec.pods) {
    for (const sx of [-1, 1]) {
      const pod = b.joint(torso, sx * 0.62, 0.2, 0);
      b.part(pod, RB(0.3, 0.34, 0.6, 0.05), M.trim, 0, 0, 0, 0, 0, 0, true);
      for (let i = 0; i < 6; i++) b.part(pod, CYL(0.04, 0.04, 0.02, 8, 'z'), M.glow, -0.07 + (i % 2) * 0.14, -0.08 + Math.floor(i / 2) * 0.08, -0.31);
    }
    b.part(torso, CYL(0.12, 0.12, 0.5, 14), M.glow, 0, 0.45, 0.2);
  }
  const legs = [];
  const lx = heavy ? 0.5 : 0.28, lz = heavy ? 0.5 : 0.34;
  for (const [sx, sz, ph] of [[1, -1, 0], [-1, -1, Math.PI], [1, 1, Math.PI], [-1, 1, 0]]) {
    const hip = b.joint(torso, sx * lx, -0.05, sz * lz);
    b.part(hip, SPH(heavy ? 0.12 : 0.07, 8, 6), M.joint, 0, 0, 0);
    const thigh = b.joint(hip, 0, 0, 0);
    thigh.rotation.z = sx * 0.9;
    b.part(thigh, RB(heavy ? 0.16 : 0.09, heavy ? 0.7 : 0.42, heavy ? 0.16 : 0.09, 0.03), M.armor, 0, -(heavy ? 0.35 : 0.21), 0, 0, 0, 0, true);
    const knee = b.joint(thigh, 0, -(heavy ? 0.7 : 0.42), 0);
    const shin = b.joint(knee, 0, 0, 0);
    shin.rotation.z = -sx * 1.6;
    b.part(shin, RB(heavy ? 0.12 : 0.07, heavy ? 0.85 : 0.5, heavy ? 0.12 : 0.07, 0.03), M.trim, 0, -(heavy ? 0.42 : 0.25), 0);
    b.part(shin, new THREE.ConeGeometry(heavy ? 0.08 : 0.045, heavy ? 0.2 : 0.12, 6), M.joint, 0, -(heavy ? 0.9 : 0.54), 0, Math.PI, 0, 0);
    legs.push({ sx, sz, ph, hip, thigh, shin });
  }
  const rig = {
    root, body, torso, head, neck, legs, arms: [], muzzle, core, meshes: b.meshes, mats: M,
    height: (bodyY + 0.4) * s, headAnchor: head,
    hitboxes: [
      { node: head, off: new THREE.Vector3(0, 0, -0.1), r: (heavy ? 0.28 : 0.17) * s, part: 'head' },
      { node: torso, off: new THREE.Vector3(0, 0, -0.25), r: (heavy ? 0.5 : 0.28) * s, part: 'body' },
      { node: torso, off: new THREE.Vector3(0, 0, 0.25), r: (heavy ? 0.5 : 0.28) * s, part: 'body' },
    ],
    weak: { node: torso, off: new THREE.Vector3(0, 0, -(heavy ? 0.66 : 0.46)), r: (heavy ? 0.22 : 0.12) * s, part: 'weak' },
    center: { node: torso, off: new THREE.Vector3(0, 0, 0) },
  };
  let phase = Math.random() * 6;
  rig.animate = (dt, a) => {
    const gait = Math.min(1, a.speed / (2 * s));
    phase += dt * (a.speed / (0.6 * s)) * 2.4;
    for (const L of legs) {
      const p = phase + L.ph;
      L.hip.rotation.x = Math.sin(p) * 0.5 * gait * (a.fwd >= 0 ? 1 : -1);
      L.hip.rotation.z = Math.sin(p) * 0.3 * gait * a.side;
      L.shin.rotation.x = Math.max(0, Math.cos(p)) * 0.4 * gait;
    }
    torso.position.y = bodyY + Math.abs(Math.sin(phase * 2)) * 0.04 * gait - (a.crouch || 0) * 0.2;
    torso.rotation.x = a.lean * 0.5 + (a.flinchX || 0) + (a.swing > 0 ? -Math.sin(a.swing * Math.PI) * 0.4 : 0);
    neck.rotation.x = a.aimPitch * 0.7;
  };
  return rig;
}

function buildDrone(spec, M) {
  const b = new RigBuilder(M);
  const s = spec.size || 1;
  const root = new THREE.Group();
  const body = b.joint(root, 0, 0, 0);
  body.scale.setScalar(s);
  const torso = b.joint(body, 0, 0, 0);
  const hull = new THREE.CapsuleGeometry(0.2, 0.45, 4, 12);
  hull.rotateX(Math.PI / 2);
  b.part(torso, hull, M.armor, 0, 0, 0, 0, 0, 0, true);
  b.part(torso, RB(0.3, 0.06, 0.5, 0.02), M.trim, 0, 0.18, 0.05);
  const head = b.joint(torso, 0, 0, -0.35);
  b.part(head, SPH(0.1, 12, 10), M.glow, 0, 0, -0.03);
  b.part(torso, new THREE.ConeGeometry(0.06, 0.3, 8), M.trim, 0, -0.05, 0.45, -Math.PI / 2, 0, 0);
  const rotors = [];
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    b.part(torso, RB(0.36, 0.04, 0.05, 0.01), M.trim, sx * 0.25, 0.08, sz * 0.18, 0, sz * sx * 0.6, 0);
    const r = b.joint(torso, sx * 0.42, 0.12, sz * 0.3);
    b.part(r, RB(0.34, 0.01, 0.04, 0.005), M.joint, 0, 0, 0);
    b.part(r, RB(0.04, 0.01, 0.34, 0.005), M.joint, 0, 0, 0);
    b.part(torso, CYL(0.19, 0.19, 0.03, 16), new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.25 }), sx * 0.42, 0.12, sz * 0.3);
    rotors.push(r);
  }
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, -0.45);
  head.add(muzzle);
  const rig = {
    root, body, torso, head, muzzle, meshes: b.meshes, mats: M, arms: [], legs: [],
    height: 0.5 * s, headAnchor: head, core: null,
    hitboxes: [
      { node: torso, off: new THREE.Vector3(0, 0, 0), r: 0.34 * s, part: 'body' },
      { node: head, off: new THREE.Vector3(0, 0, 0), r: 0.14 * s, part: 'head' },
    ],
    center: { node: torso, off: new THREE.Vector3(0, 0, 0) },
  };
  rig.animate = (dt, a) => {
    for (const r of rotors) r.rotation.y += dt * 40;
    torso.rotation.x = -a.fwd * 0.25 + (a.dive ? 0.9 : 0) + (a.flinchX || 0);
    torso.rotation.z = -a.side * 0.3;
  };
  return rig;
}

function buildOrb(spec, M) {
  const b = new RigBuilder(M);
  const s = spec.size || 1;
  const root = new THREE.Group();
  const body = b.joint(root, 0, 0, 0);
  body.scale.setScalar(s);
  const torso = b.joint(body, 0, 0, 0);
  b.part(torso, SPH(0.3, 20, 14), M.armor, 0, 0, 0, 0, 0, 0, true);
  b.part(torso, new THREE.TorusGeometry(0.34, 0.03, 8, 30), M.trim, 0, 0, 0, Math.PI / 2, 0, 0);
  const head = b.joint(torso, 0, 0, -0.26);
  b.part(head, CYL(0.12, 0.12, 0.06, 16, 'z'), M.trim, 0, 0, 0);
  b.part(head, CYL(0.09, 0.09, 0.04, 16, 'z'), M.glow, 0, 0, -0.03);
  const halo = b.joint(torso, 0, 0.1, 0);
  b.part(halo, new THREE.TorusGeometry(0.5, 0.015, 6, 36), M.glow, 0, 0, 0, Math.PI / 2, 0, 0);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    b.part(halo, SPH(0.05, 8, 6), M.glow, Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5);
  }
  b.part(torso, new THREE.ConeGeometry(0.1, 0.25, 10), M.trim, 0, -0.35, 0, Math.PI, 0, 0);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, -0.1);
  head.add(muzzle);
  const rig = {
    root, body, torso, head, muzzle, meshes: b.meshes, mats: M, arms: [], legs: [],
    height: 0.6 * s, headAnchor: head, core: null,
    hitboxes: [
      { node: torso, off: new THREE.Vector3(0, 0, 0), r: 0.34 * s, part: 'body' },
      { node: head, off: new THREE.Vector3(0, 0, 0), r: 0.13 * s, part: 'head' },
    ],
    center: { node: torso, off: new THREE.Vector3(0, 0, 0) },
  };
  rig.animate = (dt, a) => {
    halo.rotation.y += dt * 2.5;
    halo.rotation.x = Math.sin(performance.now() / 700) * 0.2;
    torso.rotation.x = a.aimPitch * 0.5 + (a.flinchX || 0);
  };
  return rig;
}

function buildWraith(spec, M) {
  const b = new RigBuilder(M);
  const s = spec.size || 1;
  const root = new THREE.Group();
  const body = b.joint(root, 0, 0, 0);
  body.scale.setScalar(s);
  const torso = b.joint(body, 0, 1.1, 0);
  const cloakMat = new THREE.MeshStandardMaterial({ color: spec.trim, roughness: 0.8, metalness: 0.2, side: THREE.DoubleSide, emissive: 0x000000 });
  b.part(torso, new THREE.ConeGeometry(0.55, 1.5, 14, 1, true), cloakMat, 0, -0.55, 0, 0, 0, 0, true);
  b.part(torso, RB(0.5, 0.5, 0.34, 0.08), M.armor, 0, 0.35, 0, 0, 0, 0, true);
  const core = b.part(torso, SPH(0.1, 12, 10), M.glow, 0, 0.35, -0.18);
  core.visible = false;
  const neck = b.joint(torso, 0, 0.68, 0);
  const head = b.joint(neck, 0, 0.08, 0);
  b.part(head, new THREE.ConeGeometry(0.26, 0.5, 12, 1, true), cloakMat, 0, 0.05, 0.03, -0.25, 0, 0);
  b.part(head, SPH(0.16, 12, 10), M.trim, 0, -0.02, 0);
  for (const sx of [-1, 1]) b.part(head, SPH(0.035, 8, 6), M.glow, sx * 0.07, 0.0, -0.14);
  const arms = [];
  for (const side of [1, -1]) {
    const sh = b.joint(torso, side * 0.32, 0.5, 0);
    const upper = b.joint(sh, 0, 0, 0);
    b.part(upper, RB(0.1, 0.5, 0.1, 0.03), M.armor, 0, -0.25, 0);
    const elbow = b.joint(upper, 0, -0.5, 0);
    const fore = b.joint(elbow, 0, 0, 0);
    b.part(fore, RB(0.08, 0.5, 0.08, 0.03), M.trim, 0, -0.25, 0);
    const hand = b.joint(fore, 0, -0.52, 0);
    for (let i = 0; i < 3; i++) b.part(hand, new THREE.ConeGeometry(0.02, 0.22, 5), M.glow, -0.04 + i * 0.04, -0.1, 0, Math.PI, 0, 0);
    arms.push({ side, sh, upper, elbow, fore, hand });
  }
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, -0.2, 0);
  arms[0].hand.add(muzzle);
  const rig = {
    root, body, torso, head, neck, arms, legs: [], muzzle, core, meshes: b.meshes, mats: { ...M, cloak: cloakMat },
    height: 2.0 * s, headAnchor: head,
    hitboxes: [
      { node: head, off: new THREE.Vector3(0, 0, 0), r: 0.2 * s, part: 'head' },
      { node: torso, off: new THREE.Vector3(0, 0.3, 0), r: 0.34 * s, part: 'body' },
      { node: torso, off: new THREE.Vector3(0, -0.3, 0), r: 0.4 * s, part: 'body' },
    ],
    weak: { node: torso, off: new THREE.Vector3(0, 0.35, -0.18), r: 0.16 * s, part: 'weak' },
    center: { node: torso, off: new THREE.Vector3(0, 0.2, 0) },
  };
  let t = Math.random() * 5;
  rig.animate = (dt, a) => {
    t += dt;
    torso.position.y = 1.1 + Math.sin(t * 1.8) * 0.12;
    torso.rotation.x = a.lean + (a.flinchX || 0);
    neck.rotation.x = a.aimPitch * 0.6;
    for (const arm of arms) {
      const cast = a.aiming ? 1 : 0;
      arm.upper.rotation.x = -0.3 - cast * 1.1 + Math.sin(t * 2 + arm.side) * 0.1;
      arm.upper.rotation.z = arm.side * (0.35 - cast * 0.2);
      arm.elbow.rotation.x = -0.4;
    }
  };
  return rig;
}

const PLANS = { biped: buildBiped, quad: buildQuad, drone: buildDrone, orb: buildOrb, wraith: buildWraith };

export function buildRig(spec) {
  const M = materials(spec);
  const rig = PLANS[spec.kind](spec, M);
  rig.flashMats = [M.armor, M.trim, rig.mats.cloak].filter(Boolean);
  return rig;
}
