import * as THREE from 'three';

// Box with 45° chamfered edges and flat-shaded faces (6 faces, 12 edge
// strips, 8 corner triangles). Exact normals, so box-projected UVs and
// normal maps behave; the bevels catch highlights so boxes read as objects.
export function chamferBox(w, h, d, b = 0.03) {
  b = Math.max(0, Math.min(b, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
  const x = w / 2, y = h / 2, z = d / 2;
  const pos = [];
  const nor = [];
  const idx = [];
  const n = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const c = new THREE.Vector3();
  function poly(pts, nx, ny, nz) {
    n.set(nx, ny, nz).normalize();
    // wind counter-clockwise as seen from outside
    e1.set(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]);
    e2.set(pts[2][0] - pts[0][0], pts[2][1] - pts[0][1], pts[2][2] - pts[0][2]);
    c.crossVectors(e1, e2);
    const list = c.dot(n) < 0 ? [...pts].reverse() : pts;
    const base = pos.length / 3;
    for (const p of list) {
      pos.push(p[0], p[1], p[2]);
      nor.push(n.x, n.y, n.z);
    }
    for (let i = 1; i < list.length - 1; i++) idx.push(base, base + i, base + i + 1);
  }
  const xi = x - b, yi = y - b, zi = z - b;
  // faces
  poly([[x, -yi, -zi], [x, yi, -zi], [x, yi, zi], [x, -yi, zi]], 1, 0, 0);
  poly([[-x, -yi, -zi], [-x, yi, -zi], [-x, yi, zi], [-x, -yi, zi]], -1, 0, 0);
  poly([[-xi, y, -zi], [xi, y, -zi], [xi, y, zi], [-xi, y, zi]], 0, 1, 0);
  poly([[-xi, -y, -zi], [xi, -y, -zi], [xi, -y, zi], [-xi, -y, zi]], 0, -1, 0);
  poly([[-xi, -yi, z], [xi, -yi, z], [xi, yi, z], [-xi, yi, z]], 0, 0, 1);
  poly([[-xi, -yi, -z], [xi, -yi, -z], [xi, yi, -z], [-xi, yi, -z]], 0, 0, -1);
  if (b > 0) {
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        // edges along z
        poly([[sx * x, sy * yi, -zi], [sx * xi, sy * y, -zi], [sx * xi, sy * y, zi], [sx * x, sy * yi, zi]], sx, sy, 0);
      }
      for (const sz of [-1, 1]) {
        // edges along y
        poly([[sx * x, -yi, sz * zi], [sx * xi, -yi, sz * z], [sx * xi, yi, sz * z], [sx * x, yi, sz * zi]], sx, 0, sz);
      }
    }
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        // edges along x
        poly([[-xi, sy * y, sz * zi], [-xi, sy * yi, sz * z], [xi, sy * yi, sz * z], [xi, sy * y, sz * zi]], 0, sy, sz);
      }
    }
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          poly([[sx * x, sy * yi, sz * zi], [sx * xi, sy * y, sz * zi], [sx * xi, sy * yi, sz * z]], sx, sy, sz);
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  // simple per-face box UVs (0..1) for callers that want them
  const uv = [];
  for (let i = 0; i < pos.length / 3; i++) {
    const px = pos[i * 3], py = pos[i * 3 + 1], pz = pos[i * 3 + 2];
    const ax = Math.abs(nor[i * 3]), ay = Math.abs(nor[i * 3 + 1]);
    if (ay > 0.7) uv.push(px / w + 0.5, pz / d + 0.5);
    else if (ax > 0.7) uv.push(pz / d + 0.5, py / h + 0.5);
    else uv.push(px / w + 0.5, py / h + 0.5);
  }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
