import * as THREE from 'three';
import { chamferBox } from './chamfer.js';

// First-person weapon models (built from bevelled parts so edges catch the
// light) with gloved hands, plus the procedural animation stack:
// sway (lags your look), bob (figure-8 with steps), recoil (damped springs),
// ADS alignment, sprint pose, reload choreography, equip, landing dip,
// muzzle flash sprites and ejected casings.

const RB = (w, h, d, r = 0.006) => chamferBox(w, h, d, Math.min(r * 0.8, w / 3, h / 3, d / 3));
const CYL = (r, len, seg = 16) => {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.rotateX(Math.PI / 2);
  return g;
};

function noiseTex(size, fn) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = fn(i % size, (i / size) | 0);
    img.data[i * 4] = v[0];
    img.data[i * 4 + 1] = v[1];
    img.data[i * 4 + 2] = v[2];
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function makeMaterials() {
  // fine grain roughness variation so metal reads as machined, not plastic
  const grain = noiseTex(128, () => {
    const r = 150 + Math.random() * 70;
    return [255, r, 255];
  });
  grain.repeat.set(4, 4);
  const m = {
    metal: new THREE.MeshStandardMaterial({ color: 0x33373d, roughness: 0.45, metalness: 0.75, roughnessMap: grain, envMapIntensity: 0.8 }),
    metalLight: new THREE.MeshStandardMaterial({ color: 0x484c52, roughness: 0.4, metalness: 0.85, roughnessMap: grain, envMapIntensity: 0.7 }),
    polymer: new THREE.MeshStandardMaterial({ color: 0x26292e, roughness: 0.62, metalness: 0.1 }),
    accent: new THREE.MeshStandardMaterial({ color: 0x8b7a5a, roughness: 0.65, metalness: 0.05 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x5b3d22, roughness: 0.55, metalness: 0.0 }),
    glove: new THREE.MeshStandardMaterial({ color: 0x2a2724, roughness: 0.85, metalness: 0 }),
    sleeve: new THREE.MeshStandardMaterial({ color: 0x3a3f2c, roughness: 0.95, metalness: 0 }),
    lens: new THREE.MeshStandardMaterial({ color: 0x0c1a22, roughness: 0.05, metalness: 1, envMapIntensity: 2 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc9a14a, roughness: 0.3, metalness: 1 }),
    shell: new THREE.MeshStandardMaterial({ color: 0xa3281e, roughness: 0.5, metalness: 0.2 }),
    red: new THREE.MeshBasicMaterial({ color: 0xff2a2a }),
    cyan: new THREE.MeshStandardMaterial({ color: 0x0a3040, emissive: 0x19e6ff, emissiveIntensity: 1.1 }),
    violet: new THREE.MeshStandardMaterial({ color: 0x1a1030, emissive: 0x7a4dff, emissiveIntensity: 1.1 }),
    amber: new THREE.MeshStandardMaterial({ color: 0x3a2508, emissive: 0xffa62b, emissiveIntensity: 2 }),
  };
  m.all = Object.values(m).filter((x) => x.isMaterial);
  return m;
}

function add(group, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  group.add(mesh);
  return mesh;
}

// ---- hands ----
function hand(M, grip = true) {
  const g = new THREE.Group();
  add(g, RB(0.07, 0.035, 0.09, 0.015), M.glove, 0, 0, 0);
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Group();
    f.position.set(-0.026 + i * 0.017, 0.0, -0.045);
    add(f, RB(0.016, 0.018, 0.045, 0.007), M.glove, 0, 0, -0.02);
    const tip = add(f, RB(0.015, 0.017, 0.035, 0.007), M.glove, 0, -0.012, -0.045, grip ? -1.3 : -0.4);
    void tip;
    f.rotation.x = grip ? -0.9 : -0.2;
    g.add(f);
  }
  add(g, RB(0.02, 0.02, 0.05, 0.008), M.glove, 0.04, 0.01, -0.02, 0, -0.5, 0.4); // thumb
  return g;
}

function arm(M, len = 0.5) {
  const g = new THREE.Group();
  const fore = new THREE.CapsuleGeometry(0.038, len, 4, 10);
  fore.rotateX(Math.PI / 2);
  add(g, fore, M.sleeve, 0, 0, len / 2 + 0.04);
  const cuff = new THREE.CylinderGeometry(0.042, 0.042, 0.05, 12);
  cuff.rotateX(Math.PI / 2);
  add(g, cuff, M.glove, 0, 0, 0.05);
  return g;
}

// ---- guns: each returns { group, muzzle, sightY, mag, port, extra } ----
function buildRifle(M) {
  const g = new THREE.Group();
  add(g, RB(0.066, 0.08, 0.34), M.metal, 0, 0.02, -0.06); // receiver
  add(g, RB(0.07, 0.03, 0.12), M.accent, 0, -0.012, -0.12); // mag well accent
  add(g, RB(0.046, 0.018, 0.34), M.polymer, 0, 0.068, -0.08); // top rail
  for (let i = 0; i < 12; i++) add(g, RB(0.05, 0.008, 0.012, 0.002), M.metal, 0, 0.08, -0.23 + i * 0.026);
  add(g, RB(0.074, 0.072, 0.3, 0.01), M.accent, 0, 0.016, -0.37); // handguard
  for (let i = 0; i < 5; i++) {
    add(g, RB(0.076, 0.012, 0.035, 0.003), M.polymer, 0, 0.02, -0.28 - i * 0.05);
  }
  add(g, CYL(0.012, 0.26), M.metal, 0, 0.018, -0.6);
  const brake = add(g, CYL(0.02, 0.07, 12), M.metal, 0, 0.018, -0.74);
  void brake;
  for (let i = 0; i < 3; i++) add(g, RB(0.044, 0.006, 0.008, 0.002), M.polymer, 0, 0.018, -0.72 - i * 0.017);
  add(g, RB(0.04, 0.12, 0.055, 0.012), M.polymer, 0, -0.07, 0.08, 0.35); // grip
  const guard = new THREE.TorusGeometry(0.03, 0.004, 6, 12, Math.PI);
  add(g, guard, M.metal, 0, -0.03, 0.03, 0, Math.PI / 2, Math.PI);
  add(g, RB(0.046, 0.075, 0.2, 0.012), M.accent, 0, -0.005, 0.25); // stock
  add(g, RB(0.05, 0.1, 0.03, 0.01), M.polymer, 0, -0.01, 0.36); // butt pad
  add(g, RB(0.02, 0.02, 0.2, 0.005), M.metal, 0, 0.028, 0.16); // buffer tube
  add(g, RB(0.012, 0.024, 0.07, 0.004), M.metal, 0.036, 0.03, -0.08); // port cover
  add(g, RB(0.02, 0.012, 0.03, 0.004), M.metal, 0, 0.07, 0.07); // charging handle
  // red-dot optic
  add(g, RB(0.042, 0.012, 0.07, 0.004), M.metal, 0, 0.083, -0.04);
  add(g, RB(0.044, 0.05, 0.016, 0.006), M.metal, 0, 0.11, -0.005);
  add(g, RB(0.044, 0.05, 0.016, 0.006), M.metal, 0, 0.11, -0.085);
  add(g, RB(0.008, 0.05, 0.08, 0.003), M.metal, 0.02, 0.11, -0.045);
  add(g, RB(0.008, 0.05, 0.08, 0.003), M.metal, -0.02, 0.11, -0.045);
  add(g, RB(0.044, 0.008, 0.08, 0.003), M.metal, 0, 0.136, -0.045);
  const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.032, 0.036), new THREE.MeshStandardMaterial({
    color: 0x66ffaa, transparent: true, opacity: 0.12, roughness: 0, metalness: 1,
  }));
  lens.position.set(0, 0.11, -0.085);
  g.add(lens);
  const dot = add(g, new THREE.SphereGeometry(0.0016, 8, 6), M.red, 0, 0.11, -0.084);
  dot.renderOrder = 5;
  // magazine (separate so the reload can pull it)
  const mag = new THREE.Group();
  add(mag, RB(0.04, 0.15, 0.075, 0.008), M.polymer, 0, -0.07, 0, 0.18);
  add(mag, RB(0.042, 0.02, 0.078, 0.006), M.metal, 0, -0.145, 0.013, 0.18);
  mag.position.set(0, -0.02, -0.12);
  g.add(mag);
  return { group: g, muzzle: new THREE.Vector3(0, 0.018, -0.79), sightY: 0.11, sightZ: -0.045, mag, port: new THREE.Vector3(0.04, 0.03, -0.08) };
}

function buildMarksman(M) {
  const g = new THREE.Group();
  add(g, RB(0.062, 0.075, 0.42), M.metal, 0, 0.02, -0.1);
  add(g, RB(0.07, 0.07, 0.62, 0.02), M.wood, 0, -0.015, -0.08); // stock body
  add(g, RB(0.055, 0.12, 0.2, 0.02), M.wood, 0, -0.035, 0.28); // butt
  add(g, RB(0.06, 0.12, 0.02, 0.008), M.polymer, 0, -0.03, 0.385);
  add(g, RB(0.042, 0.1, 0.05, 0.012), M.wood, 0, -0.08, 0.1, 0.4); // grip
  add(g, CYL(0.015, 0.62), M.metal, 0, 0.03, -0.64);
  add(g, CYL(0.024, 0.14, 14), M.metal, 0, 0.03, -0.98); // muzzle brake
  for (let i = 0; i < 4; i++) add(g, RB(0.052, 0.006, 0.01, 0.002), M.polymer, 0, 0.03, -0.93 - i * 0.03);
  // scope
  add(g, CYL(0.02, 0.3), M.metal, 0, 0.115, -0.1);
  add(g, new THREE.CylinderGeometry(0.03, 0.022, 0.07, 16).rotateX(Math.PI / 2), M.metal, 0, 0.115, -0.28);
  add(g, new THREE.CylinderGeometry(0.022, 0.028, 0.05, 16).rotateX(Math.PI / 2), M.metal, 0, 0.115, 0.07);
  add(g, new THREE.CircleGeometry(0.027, 16), M.lens, 0, 0.115, -0.316, 0, Math.PI, 0);
  add(g, new THREE.CylinderGeometry(0.012, 0.012, 0.03, 10), M.metal, 0, 0.143, -0.1);
  add(g, new THREE.CylinderGeometry(0.012, 0.012, 0.03, 10), M.metal, 0.03, 0.115, -0.1, 0, 0, Math.PI / 2);
  add(g, RB(0.02, 0.04, 0.02, 0.005), M.metal, 0, 0.078, -0.2);
  add(g, RB(0.02, 0.04, 0.02, 0.005), M.metal, 0, 0.078, 0.0);
  // bolt
  const bolt = new THREE.Group();
  add(bolt, CYL(0.006, 0.07, 8), M.metalLight, 0.04, 0, 0, 0, Math.PI / 2, 0);
  add(bolt, new THREE.SphereGeometry(0.013, 10, 8), M.metalLight, 0.075, 0, 0);
  bolt.position.set(0, 0.04, 0.04);
  g.add(bolt);
  const mag = new THREE.Group();
  add(mag, RB(0.045, 0.06, 0.1, 0.008), M.polymer, 0, -0.03, 0);
  mag.position.set(0, -0.04, -0.12);
  g.add(mag);
  return { group: g, muzzle: new THREE.Vector3(0, 0.03, -1.06), sightY: 0.115, sightZ: -0.1, mag, bolt, port: new THREE.Vector3(0.04, 0.04, -0.05) };
}

function buildScattergun(M) {
  const g = new THREE.Group();
  add(g, RB(0.07, 0.09, 0.26, 0.01), M.metal, 0, 0.015, -0.05);
  add(g, CYL(0.019, 0.58), M.metal, 0, 0.04, -0.46);
  add(g, CYL(0.016, 0.5), M.metal, 0, -0.0, -0.42);
  const pump = new THREE.Group();
  add(pump, RB(0.06, 0.055, 0.2, 0.015), M.accent, 0, 0, 0);
  for (let i = 0; i < 5; i++) add(pump, RB(0.062, 0.008, 0.012, 0.003), M.polymer, 0, -0.02, -0.08 + i * 0.04);
  pump.position.set(0, -0.005, -0.4);
  g.add(pump);
  add(g, RB(0.042, 0.12, 0.055, 0.012), M.polymer, 0, -0.075, 0.1, 0.35);
  add(g, RB(0.05, 0.085, 0.24, 0.015), M.accent, 0, -0.01, 0.28);
  add(g, RB(0.055, 0.1, 0.025, 0.01), M.polymer, 0, -0.015, 0.405);
  add(g, RB(0.012, 0.02, 0.012, 0.003), M.amber, 0, 0.068, -0.74);
  add(g, RB(0.03, 0.02, 0.012, 0.003), M.metal, 0, 0.07, -0.02);
  const mag = new THREE.Group();
  mag.position.set(0, -0.03, -0.05);
  g.add(mag);
  return { group: g, muzzle: new THREE.Vector3(0, 0.04, -0.77), sightY: 0.078, sightZ: -0.3, mag, pump, port: new THREE.Vector3(0.04, 0.02, -0.05) };
}

function buildArcSmg(M) {
  const g = new THREE.Group();
  add(g, RB(0.06, 0.08, 0.3, 0.012), M.polymer, 0, 0.02, -0.12);
  add(g, RB(0.064, 0.03, 0.26, 0.01), M.metalLight, 0, 0.07, -0.12);
  add(g, CYL(0.014, 0.2), M.metal, 0, 0.025, -0.36);
  for (let i = 0; i < 4; i++) {
    const ring = new THREE.TorusGeometry(0.024, 0.006, 6, 16);
    add(g, ring, M.cyan, 0, 0.025, -0.3 - i * 0.04);
  }
  add(g, RB(0.04, 0.11, 0.05, 0.012), M.polymer, 0, -0.07, 0.05, 0.3);
  add(g, RB(0.035, 0.05, 0.18, 0.01), M.metal, 0, 0.0, 0.16);
  add(g, RB(0.02, 0.03, 0.02, 0.004), M.cyan, 0, 0.098, -0.02);
  const mag = new THREE.Group();
  add(mag, RB(0.035, 0.17, 0.045, 0.008), M.metal, 0, -0.08, 0, 0.1);
  add(mag, RB(0.037, 0.12, 0.02, 0.004), M.cyan, 0, -0.07, 0.015, 0.1);
  mag.position.set(0, -0.02, -0.16);
  g.add(mag);
  return { group: g, muzzle: new THREE.Vector3(0, 0.025, -0.48), sightY: 0.1, sightZ: -0.02, mag, port: new THREE.Vector3(0.035, 0.03, -0.1) };
}

function buildRail(M) {
  const g = new THREE.Group();
  add(g, RB(0.08, 0.1, 0.36, 0.02), M.metal, 0, 0.02, -0.08);
  for (const s of [-1, 1]) {
    add(g, RB(0.018, 0.05, 0.5, 0.008), M.metalLight, s * 0.028, 0.03, -0.46);
    add(g, RB(0.006, 0.03, 0.44, 0.002), M.violet, s * 0.017, 0.03, -0.46);
  }
  add(g, RB(0.042, 0.12, 0.055, 0.012), M.polymer, 0, -0.08, 0.09, 0.35);
  add(g, RB(0.05, 0.08, 0.2, 0.02), M.polymer, 0, 0.0, 0.25);
  add(g, RB(0.03, 0.03, 0.1, 0.006), M.violet, 0, 0.085, -0.06);
  const core = add(g, new THREE.SphereGeometry(0.026, 14, 10), M.violet, 0, 0.02, -0.25);
  const mag = new THREE.Group();
  add(mag, RB(0.05, 0.06, 0.08, 0.01), M.violet, 0, -0.03, 0);
  mag.position.set(0, -0.04, -0.06);
  g.add(mag);
  return { group: g, muzzle: new THREE.Vector3(0, 0.03, -0.72), sightY: 0.1, sightZ: -0.06, mag, core, port: null };
}

function buildLauncher(M) {
  const g = new THREE.Group();
  add(g, CYL(0.05, 0.5, 20), M.metal, 0, 0.03, -0.3);
  add(g, CYL(0.056, 0.06, 20), M.accent, 0, 0.03, -0.56);
  const drum = add(g, new THREE.CylinderGeometry(0.075, 0.075, 0.12, 8).rotateX(Math.PI / 2), M.accent, 0, 0.0, -0.02);
  add(g, RB(0.045, 0.12, 0.055, 0.012), M.polymer, 0, -0.1, 0.1, 0.35);
  add(g, RB(0.05, 0.08, 0.2, 0.02), M.polymer, 0, -0.03, 0.26);
  add(g, RB(0.02, 0.05, 0.02, 0.005), M.amber, 0, 0.1, -0.2);
  const mag = new THREE.Group();
  mag.position.set(0, -0.05, -0.02);
  g.add(mag);
  return { group: g, muzzle: new THREE.Vector3(0, 0.03, -0.6), sightY: 0.125, sightZ: -0.2, mag, drum, port: null };
}

const BUILDERS = { rifle: buildRifle, marksman: buildMarksman, scattergun: buildScattergun, arcsmg: buildArcSmg, rail: buildRail, launcher: buildLauncher };

// hip pose per model: where the gun sits and where the off-hand grabs
const POSE = {
  rifle: { hip: [0.2, -0.215, -0.5], lh: [0, -0.03, -0.38] },
  marksman: { hip: [0.2, -0.22, -0.5], lh: [0, -0.06, -0.4] },
  scattergun: { hip: [0.2, -0.215, -0.5], lh: [0, -0.035, -0.4] },
  arcsmg: { hip: [0.19, -0.2, -0.46], lh: [0, -0.04, -0.3] },
  rail: { hip: [0.2, -0.215, -0.5], lh: [0, -0.04, -0.35] },
  launcher: { hip: [0.21, -0.23, -0.52], lh: [0, -0.04, -0.34] },
};

function flashTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const grd = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,240,1)');
  grd.addColorStop(0.2, 'rgba(255,220,140,0.9)');
  grd.addColorStop(0.5, 'rgba(255,140,40,0.35)');
  grd.addColorStop(1, 'rgba(255,90,0,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 128, 128);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {
    ctx.save();
    ctx.translate(64, 64);
    ctx.rotate((i / 6) * Math.PI * 2 + Math.random() * 0.3);
    const g2 = ctx.createLinearGradient(0, 0, 60, 0);
    g2.addColorStop(0, 'rgba(255,230,160,0.9)');
    g2.addColorStop(1, 'rgba(255,120,20,0)');
    ctx.fillStyle = g2;
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(60, 0);
    ctx.lineTo(0, 5);
    ctx.fill();
    ctx.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// damped spring helper
class Spring {
  constructor(k = 180, d = 16) { this.k = k; this.d = d; this.x = 0; this.v = 0; }
  update(dt, target = 0) {
    const a = -this.k * (this.x - target) - this.d * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
    return this.x;
  }
}

export class Viewmodel {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.M = makeMaterials();
    this.root = new THREE.Group(); // animated rig (camera-space)
    camera.add(this.root);
    this.guns = {};
    this.current = null;
    this.id = null;

    // hands (shared across guns; re-parented on switch)
    this.rHand = hand(this.M, true);
    this.lHand = hand(this.M, true);
    this.rArm = arm(this.M, 0.55);
    this.lArm = arm(this.M, 0.6);

    // springs
    this.kickZ = new Spring(260, 22);
    this.kickRot = new Spring(220, 18);
    this.kickYaw = new Spring(200, 18);
    this.swayX = new Spring(90, 14);
    this.swayY = new Spring(90, 14);
    this.swayRoll = new Spring(80, 12);
    this.dip = new Spring(120, 12);

    this.equipT = 1;
    this.reloadP = -1; // 0..1 while reloading
    this.sprintT = 0;
    this.pumpT = 0;

    // muzzle flash: two crossed additive planes
    const fm = new THREE.MeshBasicMaterial({
      map: flashTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      color: 0xffffff,
    });
    fm.toneMapped = false;
    this.flash = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), fm);
      p.rotation.set(i === 2 ? 0 : Math.PI / 2, i === 1 ? Math.PI / 2 : 0, 0);
      if (i === 2) p.scale.setScalar(0.8);
      this.flash.add(p);
    }
    this.flashMat = fm;
    this.flash.visible = false;
    this.flashT = 0;

    // casings pool (camera-space physics)
    this.casings = [];
    const cg = new THREE.CylinderGeometry(0.005, 0.005, 0.022, 8);
    cg.rotateZ(Math.PI / 2);
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(cg, this.M.brass);
      m.visible = false;
      camera.add(m);
      this.casings.push({ mesh: m, life: 0, v: new THREE.Vector3(), w: new THREE.Vector3() });
    }
    this.casingIdx = 0;
    this.gold = false;
  }

  gun(id) {
    if (!this.guns[id]) {
      const b = BUILDERS[id](this.M);
      b.group.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
      b.group.visible = false;
      this.root.add(b.group);
      this.guns[id] = b;
    }
    return this.guns[id];
  }

  equip(id, instant = false) {
    if (this.current) this.current.group.visible = false;
    this.id = id;
    this.current = this.gun(id);
    const g = this.current.group;
    g.visible = true;
    // hands follow the gun
    const pose = POSE[id];
    g.add(this.rHand, this.lHand, this.rArm, this.lArm, this.flash);
    this.rHand.position.set(0.0, -0.075, 0.1);
    this.rHand.rotation.set(0.35, 0, 0);
    this.lHand.position.set(pose.lh[0], pose.lh[1] - 0.035, pose.lh[2]);
    this.lHand.rotation.set(0.1, 0, 0.9);
    this.rArm.position.set(0.02, -0.12, 0.13);
    this.rArm.rotation.set(0.7, 0.35, 0);
    this.lArm.position.set(pose.lh[0] - 0.02, pose.lh[1] - 0.07, pose.lh[2] + 0.02);
    this.lArm.rotation.set(0.75, -0.95, 0);
    this.flash.position.copy(this.current.muzzle);
    this.equipT = instant ? 1 : 0;
    this.reloadP = -1;
  }

  setGold(on) {
    if (on === this.gold) return;
    this.gold = on;
    const M = this.M;
    M.metal.color.setHex(on ? 0xd4af37 : 0x33373d);
    M.metal.roughness = on ? 0.22 : 0.5;
    M.metal.envMapIntensity = on ? 1.4 : 0.8;
    M.metalLight.color.setHex(on ? 0xf0d27a : 0x484c52);
    M.accent.color.setHex(on ? 0xb8912a : 0x8b7a5a);
    M.accent.metalness = on ? 0.9 : 0.05;
    M.accent.roughness = on ? 0.3 : 0.65;
    M.polymer.color.setHex(on ? 0x6b5520 : 0x26292e);
    M.polymer.metalness = on ? 0.8 : 0.05;
    M.wood.color.setHex(on ? 0xc9a13a : 0x5b3d22);
    M.wood.metalness = on ? 0.9 : 0;
  }

  kick(pitch, yaw, back) {
    this.kickZ.v += back * 60;
    this.kickRot.v += pitch * 60;
    this.kickYaw.v += yaw * 60;
    this.flashT = 0.05;
    this.flash.visible = true;
    this.flash.rotation.z = Math.random() * Math.PI;
    this.flash.scale.setScalar(0.8 + Math.random() * 0.5);
  }

  landing(speed) {
    this.dip.v -= Math.min(4, speed * 0.25);
  }

  ejectCasing(kind) {
    if (!kind || !this.current?.port) return;
    const c = this.casings[this.casingIdx];
    this.casingIdx = (this.casingIdx + 1) % this.casings.length;
    const port = this.current.port.clone();
    this.current.group.localToWorld(port);
    this.camera.worldToLocal(port);
    c.mesh.position.copy(port);
    c.mesh.material = kind === 'shell' ? this.M.shell : this.M.brass;
    const s = kind === 'big' ? 1.5 : kind === 'shell' ? 2.2 : kind === 'small' ? 0.8 : 1;
    c.mesh.scale.setScalar(s);
    c.v.set(1.2 + Math.random() * 0.6, 1.1 + Math.random() * 0.5, 0.2 + Math.random() * 0.3);
    c.w.set(Math.random() * 20, Math.random() * 20, Math.random() * 20);
    c.life = 0.7;
    c.mesh.visible = true;
  }

  // Muzzle position in world space (for tracers / lights).
  muzzleWorld(out) {
    if (!this.current) return out.set(0, 0, 0);
    // map the viewmodel muzzle through the view camera's space onto the world camera
    out.copy(this.current.muzzle);
    this.current.group.localToWorld(out);
    this.camera.worldToLocal(out); // now in view-camera space (== world camera space)
    out.z *= 1.4;
    return out;
  }

  // p: { dt, ads, sprint, speed, onGround, lookX, lookY, bob, reload, charge, gunAds }
  update(p) {
    const dt = p.dt;
    const cur = this.current;
    if (!cur) return;
    const pose = POSE[this.id];
    this.equipT = Math.min(1, this.equipT + dt * 3.2);
    this.sprintT += ((p.sprint ? 1 : 0) - this.sprintT) * Math.min(1, dt * 9);

    // sway: gun lags behind where you look
    const sx = this.swayX.update(dt, Math.max(-0.04, Math.min(0.04, -p.lookX * 0.00055)));
    const sy = this.swayY.update(dt, Math.max(-0.04, Math.min(0.04, p.lookY * 0.00055)));
    const sr = this.swayRoll.update(dt, Math.max(-0.12, Math.min(0.12, -p.lookX * 0.0018)));
    const kz = this.kickZ.update(dt);
    const kr = this.kickRot.update(dt);
    const ky = this.kickYaw.update(dt);
    const dip = this.dip.update(dt);

    const ads = p.ads;
    const hipW = 1 - ads;
    const mv = Math.min(1, p.speed / 7);
    const bobA = mv * (1 - ads * 0.85) * (p.onGround ? 1 : 0.2);
    const bx = Math.sin(p.bob * 0.5) * 0.012 * bobA * (1 + this.sprintT);
    const by = -Math.abs(Math.cos(p.bob * 0.5)) * 0.01 * bobA * (1 + this.sprintT * 1.4);
    const breathe = Math.sin(performance.now() / 900) * 0.0015 * hipW;

    // ADS target: sight at the view centre
    const adsPos = [0, -cur.sightY, -0.3 - cur.sightZ * 0.2];
    const px = pose.hip[0] * hipW + adsPos[0] * ads;
    const py = pose.hip[1] * hipW + adsPos[1] * ads;
    const pz = pose.hip[2] * hipW + adsPos[2] * ads;

    // reload choreography: tilt in, mag out/down, new mag up, tilt back
    let rTilt = 0, rRoll = 0, rDown = 0, magDrop = 0;
    if (this.reloadP >= 0) {
      const r = this.reloadP;
      const inOut = Math.sin(Math.min(1, r * 1.15) * Math.PI);
      rTilt = inOut * 0.35;
      rRoll = inOut * 0.5;
      rDown = inOut * 0.05;
      magDrop = r < 0.3 ? (r / 0.3) * 0.25 : r < 0.55 ? 0.25 : Math.max(0, 0.25 - ((r - 0.55) / 0.3) * 0.25);
    }
    if (cur.mag) cur.mag.position.y = (this.id === 'marksman' ? -0.04 : this.id === 'rifle' ? -0.02 : -0.03) - magDrop;
    if (cur.mag) cur.mag.visible = !(this.reloadP > 0.3 && this.reloadP < 0.4);
    // left hand follows the mag during reloads
    this.lHand.position.y = pose.lh[1] - 0.035 - magDrop * 0.6;
    this.lHand.position.z = pose.lh[2] + (this.reloadP >= 0 ? Math.sin(this.reloadP * Math.PI) * 0.22 : 0);

    // pump / bolt / drum
    this.pumpT = Math.max(0, this.pumpT - dt * 3.2);
    const pumpX = Math.sin(Math.min(1, this.pumpT) * Math.PI);
    if (cur.pump) cur.pump.position.z = -0.4 + pumpX * 0.08;
    if (cur.bolt) {
      cur.bolt.rotation.z = pumpX * 1.2;
      cur.bolt.position.z = 0.04 + pumpX * 0.05;
    }
    if (cur.drum) cur.drum.rotation.z += dt * this.pumpT * 6;
    if (cur.core) {
      const c = p.charge || 0;
      cur.core.scale.setScalar(1 + c * 0.6 + Math.sin(performance.now() / 60) * 0.05 * c);
      this.M.violet.emissiveIntensity = 1.1 + c * 5;
    }

    const eq = 1 - this.equipT;
    const g = this.root;
    g.position.set(
      px + sx * hipW + bx + ky * 0.02 - this.sprintT * 0.04,
      py + sy * hipW + by + breathe - rDown - eq * 0.25 + dip * 0.03 - this.sprintT * 0.04,
      pz + kz * 0.06 + eq * 0.05,
    );
    g.rotation.set(
      kr * 0.08 + rTilt * 0.4 - eq * 0.9 - this.sprintT * 0.35 + sy * 2,
      ky * 0.05 + sx * 2 * hipW + this.sprintT * 0.65,
      sr * hipW + rRoll * 0.5 + this.sprintT * 0.3,
    );

    // scoped weapons vanish into the scope overlay
    cur.group.visible = !(p.scoped);

    // flash
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.flash.visible = false;
    }

    // casings (camera space: gravity pulls down the view)
    for (const c of this.casings) {
      if (c.life <= 0) continue;
      c.life -= dt;
      c.v.y -= 5 * dt;
      c.mesh.position.addScaledVector(c.v, dt * 0.35);
      c.mesh.rotation.x += c.w.x * dt;
      c.mesh.rotation.y += c.w.y * dt;
      c.mesh.rotation.z += c.w.z * dt;
      if (c.life <= 0) c.mesh.visible = false;
    }
  }
}
