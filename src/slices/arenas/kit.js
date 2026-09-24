import * as THREE from 'three';
import { chamferBox } from './chamfer.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Level-building kit. Every call can add a collider to the CollisionWorld
// and static geometry to a per-material batch. finish() merges each batch
// into one mesh with world-space (box-projected) UVs, so textures keep a
// constant texel density on every surface no matter how big the box is.

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _e = new THREE.Euler();

const geoCache = new Map();
function roundedBox(w, h, d, r) {
  // cache unit-ish shapes by rounded dims — lots of repeats (crates, posts)
  const key = `${w.toFixed(2)}|${h.toFixed(2)}|${d.toFixed(2)}|${r}`;
  let g = geoCache.get(key);
  if (!g) {
    g = chamferBox(w, h, d, r > 0.005 ? r : 0);
    g.deleteAttribute('uv');
    geoCache.set(key, g);
  }
  return g;
}

// box-projected UVs from world positions and normals
function applyWorldUV(geo, tile) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
    let u, v;
    // right-handed tangent frames (T × B = N) so normal maps light correctly
    if (ay >= ax && ay >= az) { u = x; v = -z * Math.sign(nor.getY(i) || 1); }
    else if (ax >= az) { u = -z * Math.sign(nor.getX(i) || 1); v = y; }
    else { u = x * Math.sign(nor.getZ(i) || 1); v = y; }
    uv[i * 2] = u / tile;
    uv[i * 2 + 1] = v / tile;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

export function createKit(scene, collision) {
  const batches = new Map(); // material -> { geos: [], cast, receive }
  const dynamic = []; // separately-added meshes (animated / special)
  let poolTex = null;

  function push(mat, geo, cast = true) {
    const key = `${mat.uuid}|${cast ? 1 : 0}`;
    let b = batches.get(key);
    if (!b) {
      b = { mat, geos: [], cast };
      batches.set(key, b);
    }
    b.geos.push(geo);
  }

  const kit = {
    scene,
    collision,

    // Add arbitrary geometry (already sized) at a transform into a batch.
    geo(geometry, mat, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, cast = true } = {}) {
      const g = geometry.clone();
      if (g.attributes.uv) g.deleteAttribute('uv');
      _e.set(rx, ry, rz);
      _q.setFromEuler(_e);
      _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
      g.applyMatrix4(_m);
      if (!g.index) {
        // mergeGeometries needs consistent indexing
        g.setIndex([...Array(g.attributes.position.count).keys()]);
      }
      for (const name of Object.keys(g.attributes)) {
        if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
      }
      push(mat, g, cast);
      return g;
    },

    // Centered box. collide: add an AABB collider. bevel: corner radius.
    box(x, y, z, w, h, d, mat, { collide = true, bevel = 0.04, cast = true, tag = null, ry = 0 } = {}) {
      tag = tag ?? mat.userData.surface ?? 'solid';
      const g = roundedBox(w, h, d, bevel);
      kit.geo(g, mat, { x, y, z, ry, cast });
      if (collide) {
        if (ry !== 0 && Math.abs(Math.sin(ry * 2)) > 0.01) {
          // rotated props collide with their rotated footprint bounds
          const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry));
          const hw = (w * c + d * s) / 2, hd = (w * s + d * c) / 2;
          collision.addBox(x - hw, y - h / 2, z - hd, x + hw, y + h / 2, z + hd, tag);
        } else {
          const swap = Math.abs(Math.sin(ry)) > 0.5;
          const hw = (swap ? d : w) / 2, hd = (swap ? w : d) / 2;
          collision.addBox(x - hw, y - h / 2, z - hd, x + hw, y + h / 2, z + hd, tag);
        }
      }
    },

    // Box by bounds (walls, slabs).
    slab(minX, minY, minZ, maxX, maxY, maxZ, mat, opts = {}) {
      kit.box(
        (minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2,
        maxX - minX, maxY - minY, maxZ - minZ, mat, opts
      );
    },

    // Stairs: smooth ramp collider, stepped visuals. dir: '+x' | '-x' | '+z' | '-z'
    // (the direction you walk to go UP). (x, z) is the bottom-center edge.
    stairs(x, z, dir, length, width, y0, y1, mat, { stepH = 0.25, sideMat = null, open = false } = {}) {
      const rise = y1 - y0;
      const n = Math.max(2, Math.round(rise / stepH));
      const axis = dir === '+x' || dir === '-x' ? 0 : 1;
      const sgn = dir[0] === '+' ? 1 : -1;
      let minX, maxX, minZ, maxZ;
      if (axis === 0) {
        minX = sgn > 0 ? x : x - length; maxX = sgn > 0 ? x + length : x;
        minZ = z - width / 2; maxZ = z + width / 2;
      } else {
        minZ = sgn > 0 ? z : z - length; maxZ = sgn > 0 ? z + length : z;
        minX = x - width / 2; maxX = x + width / 2;
      }
      collision.addRamp(minX, minZ, maxX, maxZ, y0, axis, sgn > 0 ? y0 : y1, sgn > 0 ? y1 : y0, mat.userData.surface ?? 'concrete');
      const depth = length / n;
      for (let i = 0; i < n; i++) {
        const top = y0 + (rise * (i + 1)) / n;
        const along = (i + 0.5) * depth * sgn;
        // open stairs: floating treads between side plates; solid: stepped blocks
        const h = open ? 0.09 : top - y0;
        const cy = open ? top - 0.045 : y0 + h / 2;
        if (axis === 0) kit.box(x + along, cy, z, depth + 0.02, h, width, mat, { collide: false, bevel: open ? 0.01 : 0.02 });
        else kit.box(x, cy, z + along, width, h, depth + 0.02, mat, { collide: false, bevel: open ? 0.01 : 0.02 });
      }
      const ry = axis === 0 ? (sgn > 0 ? 0 : Math.PI) : (sgn > 0 ? -Math.PI / 2 : Math.PI / 2);
      if (open) {
        // triangular side plates read as the solid body the collider is
        const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(length, 0), new THREE.Vector2(length, rise)]);
        const plate = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false });
        plate.translate(0, 0, -0.04);
        for (const s of [-1, 1]) {
          const px = axis === 0 ? x : x + s * (width / 2 + 0.04);
          const pz = axis === 0 ? z + s * (width / 2 + 0.04) : z;
          kit.geo(plate, sideMat || mat, { x: px, y: y0, z: pz, ry });
        }
      } else if (sideMat) {
        // stringers along both sides
        for (const s of [-1, 1]) {
          const len = Math.hypot(length, rise);
          const ang = Math.atan2(rise, length);
          const g = roundedBox(len, 0.12, 0.1, 0.02);
          const cx = axis === 0 ? x + (sgn * length) / 2 : x + s * (width / 2 + 0.05);
          const cz = axis === 1 ? z + (sgn * length) / 2 : z + s * (width / 2 + 0.05);
          kit.geo(g, sideMat, { x: cx, y: y0 + rise / 2 + 0.08, z: cz, ry, rz: ang });
        }
      }
    },

    // A smooth ramp with a flat slab visual (vehicle ramps, container ramps).
    ramp(minX, minZ, maxX, maxZ, axis, yLow, yHigh, upPositive, mat, { thickness = 0.2 } = {}) {
      collision.addRamp(minX, minZ, maxX, maxZ, 0, axis, upPositive ? yLow : yHigh, upPositive ? yHigh : yLow, mat.userData.surface ?? 'metal');
      const len = axis === 0 ? maxX - minX : maxZ - minZ;
      const wid = axis === 0 ? maxZ - minZ : maxX - minX;
      const rise = yHigh - yLow;
      const slope = Math.hypot(len, rise);
      const ang = Math.atan2(rise, len) * (upPositive ? 1 : -1);
      const g = roundedBox(slope, thickness, wid, 0.03);
      const cy = (yLow + yHigh) / 2 - thickness / 2;
      if (axis === 0) kit.geo(g, mat, { x: (minX + maxX) / 2, y: cy, z: (minZ + maxZ) / 2, rz: ang });
      else kit.geo(g, mat, { x: (minX + maxX) / 2, y: cy, z: (minZ + maxZ) / 2, ry: -Math.PI / 2, rz: ang });
    },

    // A wall along an axis with rectangular openings (doors / windows).
    // axis 'x': runs along x from a to b at z = at; axis 'z': along z at x = at.
    // openings: [{ c: center along wall, w: width, y0: bottom, y1: top }]
    wall(axis, at, a, b, y0, y1, thick, mat, openings = [], opts = {}) {
      const ops = [...openings].sort((p, q) => p.c - q.c);
      const seg = (s0, s1, h0, h1) => {
        if (s1 - s0 < 0.02 || h1 - h0 < 0.02) return;
        if (axis === 'x') kit.slab(s0, h0, at - thick / 2, s1, h1, at + thick / 2, mat, opts);
        else kit.slab(at - thick / 2, h0, s0, at + thick / 2, h1, s1, mat, opts);
      };
      let cursor = a;
      for (const o of ops) {
        const o0 = o.c - o.w / 2, o1 = o.c + o.w / 2;
        seg(cursor, o0, y0, y1);
        seg(o0, o1, y0, o.y0); // sill
        seg(o0, o1, o.y1, y1); // lintel
        cursor = o1;
      }
      seg(cursor, b, y0, y1);
    },

    // Fake light spill: an additive glow disc on the surface below a lamp.
    // Looks like a point light's pool for the cost of one transparent quad.
    lightPool(x, y, z, radius, color, strength = 1) {
      if (!poolTex) {
        const c = document.createElement('canvas');
        c.width = c.height = 128;
        const g = c.getContext('2d');
        const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        grd.addColorStop(0, 'rgba(255,255,255,1)');
        grd.addColorStop(0.35, 'rgba(255,255,255,0.45)');
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd;
        g.fillRect(0, 0, 128, 128);
        poolTex = new THREE.CanvasTexture(c);
      }
      const floor = collision.groundHeight(x, z, 0.1, y - 0.3, 0);
      const m = new THREE.MeshBasicMaterial({
        map: poolTex, color, transparent: true, opacity: Math.min(1, 0.45 * strength),
        blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), m);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, floor + 0.04, z);
      mesh.renderOrder = 1;
      scene.add(mesh);
      dynamic.push(mesh);
      return mesh;
    },

    // Separate mesh (animated props, emissive signs, etc.)
    add(mesh, { cast = false, receive = true } = {}) {
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
      scene.add(mesh);
      dynamic.push(mesh);
      return mesh;
    },

    finish() {
      const meshes = [];
      for (const b of batches.values()) {
        const tile = b.mat.userData.tileMeters ?? 4;
        for (const g of b.geos) applyWorldUV(g, tile);
        const merged = mergeGeometries(b.geos, false);
        for (const g of b.geos) g.dispose();
        if (!merged) continue;
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, b.mat);
        mesh.castShadow = b.cast;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        scene.add(mesh);
        meshes.push(mesh);
      }
      batches.clear();
      return meshes;
    },
  };
  return kit;
}
