// The physical rules of every arena. Arenas fill a CollisionWorld with
// axis-aligned boxes and ramps; the player, enemies, projectiles, the nav
// builder and every line-of-sight check all read the same world. Pure math,
// no three.js, so it runs in Node tests too.

export const BOX = 0;
export const RAMP = 1;

// Ramp surface height at (x, z), clamped to the ramp footprint.
export function surfaceY(c, x, z) {
  if (c.kind === BOX) return c.maxY;
  if (c.axis === 0) {
    const t = Math.min(1, Math.max(0, (x - c.minX) / (c.maxX - c.minX)));
    return c.y0 + (c.y1 - c.y0) * t;
  }
  const t = Math.min(1, Math.max(0, (z - c.minZ) / (c.maxZ - c.minZ)));
  return c.y0 + (c.y1 - c.y0) * t;
}

export class CollisionWorld {
  constructor(half = 64, cell = 4) {
    this.half = half;
    this.cell = cell;
    this.n = Math.ceil((half * 2) / cell);
    this.cells = Array.from({ length: this.n * this.n }, () => []);
    this.colliders = [];
    this.stamp = 1;
    this.floorY = 0;
    this._buf = [];
    this.hit = { t: 0, nx: 0, ny: 0, nz: 0, c: null, x: 0, y: 0, z: 0 };
  }

  cellIndex(ix, iz) {
    return iz * this.n + ix;
  }

  toCell(v) {
    return Math.min(this.n - 1, Math.max(0, Math.floor((v + this.half) / this.cell)));
  }

  add(c) {
    c.stamp = 0;
    c.id = this.colliders.length;
    this.colliders.push(c);
    const x0 = this.toCell(c.minX), x1 = this.toCell(c.maxX);
    const z0 = this.toCell(c.minZ), z1 = this.toCell(c.maxZ);
    for (let iz = z0; iz <= z1; iz++) {
      for (let ix = x0; ix <= x1; ix++) this.cells[this.cellIndex(ix, iz)].push(c);
    }
    return c;
  }

  addBox(minX, minY, minZ, maxX, maxY, maxZ, tag = 'solid') {
    return this.add({ kind: BOX, minX, minY, minZ, maxX, maxY, maxZ, tag });
  }

  // axis 0: slope runs along x (y0 at minX, y1 at maxX); axis 1: along z
  addRamp(minX, minZ, maxX, maxZ, baseY, axis, y0, y1, tag = 'ramp') {
    return this.add({
      kind: RAMP, minX, minY: baseY, minZ, maxX, maxY: Math.max(y0, y1), maxZ,
      axis, y0, y1, tag,
    });
  }

  // Candidate colliders overlapping an XZ rectangle (deduped, reused buffer).
  query(minX, minZ, maxX, maxZ) {
    const out = this._buf;
    out.length = 0;
    const s = ++this.stamp;
    const x0 = this.toCell(minX), x1 = this.toCell(maxX);
    const z0 = this.toCell(minZ), z1 = this.toCell(maxZ);
    for (let iz = z0; iz <= z1; iz++) {
      for (let ix = x0; ix <= x1; ix++) {
        const list = this.cells[this.cellIndex(ix, iz)];
        for (let i = 0; i < list.length; i++) {
          const c = list[i];
          if (c.stamp === s) continue;
          c.stamp = s;
          if (c.maxX < minX || c.minX > maxX || c.maxZ < minZ || c.minZ > maxZ) continue;
          out.push(c);
        }
      }
    }
    return out;
  }

  // Push a vertical capsule (circle in XZ) out of every collider it overlaps
  // between feetY and headY. Anything whose top is within `step` of the feet
  // is walkable and doesn't block.
  collideXZ(pos, radius, feetY, headY, step) {
    for (let iter = 0; iter < 2; iter++) {
      const list = this.query(pos.x - radius, pos.z - radius, pos.x + radius, pos.z + radius);
      let moved = false;
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (headY <= c.minY || feetY >= c.maxY) continue;
        const cx = Math.min(c.maxX, Math.max(c.minX, pos.x));
        const cz = Math.min(c.maxZ, Math.max(c.minZ, pos.z));
        const top = c.kind === BOX ? c.maxY : surfaceY(c, cx, cz);
        if (top <= feetY + step) continue;
        if (feetY >= top) continue;
        const dx = pos.x - cx;
        const dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          pos.x = cx + (dx / d) * radius;
          pos.z = cz + (dz / d) * radius;
        } else {
          // center inside the footprint: leave through the nearest side
          const l = pos.x - c.minX, r = c.maxX - pos.x;
          const b = pos.z - c.minZ, f = c.maxZ - pos.z;
          const m = Math.min(l, r, b, f);
          if (m === l) pos.x = c.minX - radius;
          else if (m === r) pos.x = c.maxX + radius;
          else if (m === b) pos.z = c.minZ - radius;
          else pos.z = c.maxZ + radius;
        }
        moved = true;
      }
      if (!moved) break;
    }
  }

  // Highest walkable surface under (x, z) that is at or below feet + step.
  groundHeight(x, z, radius, feetY, step) {
    let support = this.floorY;
    const list = this.query(x - radius, z - radius, x + radius, z + radius);
    const limit = feetY + step + 0.01;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c.minY > limit) continue;
      let top;
      if (c.kind === BOX) {
        top = c.maxY;
        if (x < c.minX - radius || x > c.maxX + radius || z < c.minZ - radius || z > c.maxZ + radius) continue;
      } else {
        if (x < c.minX - radius || x > c.maxX + radius || z < c.minZ - radius || z > c.maxZ + radius) continue;
        top = surfaceY(c, x, z);
      }
      if (top > limit) continue;
      if (top > support) support = top;
    }
    return support;
  }

  // Lowest collider underside strictly above fromY (and at most toY).
  ceiling(x, z, radius, fromY, toY) {
    let best = Infinity;
    const list = this.query(x - radius, z - radius, x + radius, z + radius);
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c.minY <= fromY || c.minY > toY) continue;
      if (x < c.minX - radius || x > c.maxX + radius || z < c.minZ - radius || z > c.maxZ + radius) continue;
      if (c.minY < best) best = c.minY;
    }
    return best;
  }

  // Ray vs world (and the floor plane). Returns true and fills this.hit.
  raycast(ox, oy, oz, dx, dy, dz, maxT, includeFloor = true) {
    const hit = this.hit;
    let best = maxT;
    let found = false;
    if (includeFloor && dy < 0 && oy > this.floorY) {
      const t = (this.floorY - oy) / dy;
      if (t < best) {
        best = t;
        found = true;
        hit.nx = 0; hit.ny = 1; hit.nz = 0; hit.c = null;
      }
    }
    const s = ++this.stamp;
    const cell = this.cell;
    const half = this.half;
    let ix = Math.floor((ox + half) / cell);
    let iz = Math.floor((oz + half) / cell);
    const stepX = dx > 0 ? 1 : -1;
    const stepZ = dz > 0 ? 1 : -1;
    const tDeltaX = dx !== 0 ? Math.abs(cell / dx) : Infinity;
    const tDeltaZ = dz !== 0 ? Math.abs(cell / dz) : Infinity;
    let tMaxX = dx !== 0 ? ((dx > 0 ? (ix + 1) * cell : ix * cell) - (ox + half)) / dx : Infinity;
    let tMaxZ = dz !== 0 ? ((dz > 0 ? (iz + 1) * cell : iz * cell) - (oz + half)) / dz : Infinity;
    const n = this.n;
    for (let guard = 0; guard < 256; guard++) {
      if (ix >= 0 && ix < n && iz >= 0 && iz < n) {
        const list = this.cells[iz * n + ix];
        for (let i = 0; i < list.length; i++) {
          const c = list[i];
          if (c.stamp === s) continue;
          c.stamp = s;
          const t = c.kind === BOX
            ? rayBox(c, ox, oy, oz, dx, dy, dz, best, hit)
            : rayRamp(c, ox, oy, oz, dx, dy, dz, best, hit);
          if (t >= 0 && t < best) {
            best = t;
            found = true;
            hit.c = c;
          }
        }
      } else if (
        (ix < 0 && stepX < 0) || (ix >= n && stepX > 0) ||
        (iz < 0 && stepZ < 0) || (iz >= n && stepZ > 0)
      ) break;
      const tNext = Math.min(tMaxX, tMaxZ);
      if (best <= tNext || tNext > maxT) break;
      if (tMaxX < tMaxZ) {
        ix += stepX;
        tMaxX += tDeltaX;
      } else {
        iz += stepZ;
        tMaxZ += tDeltaZ;
      }
    }
    if (found) {
      hit.t = best;
      hit.x = ox + dx * best;
      hit.y = oy + dy * best;
      hit.z = oz + dz * best;
    }
    return found;
  }

  segmentClear(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-6) return true;
    return !this.raycast(ax, ay, az, dx / len, dy / len, dz / len, len, true);
  }

  // Is there room for a body of this radius/height standing at (x, feetY, z)?
  fits(x, feetY, z, radius, height) {
    const list = this.query(x - radius, z - radius, x + radius, z + radius);
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c.maxY <= feetY + 0.05 || c.minY >= feetY + height) continue;
      if (x <= c.minX - radius || x >= c.maxX + radius || z <= c.minZ - radius || z >= c.maxZ + radius) continue;
      if (c.kind === RAMP) {
        const cx = Math.min(c.maxX, Math.max(c.minX, x));
        const cz = Math.min(c.maxZ, Math.max(c.minZ, z));
        if (surfaceY(c, cx, cz) <= feetY + 0.6) continue;
      }
      return false;
    }
    return true;
  }
}

// Slab test. Writes the entry normal into hit (only when it improves best).
function rayBox(c, ox, oy, oz, dx, dy, dz, best, hit) {
  let tmin = -Infinity, tmax = Infinity;
  let nx = 0, ny = 0, nz = 0;
  if (dx !== 0) {
    const inv = 1 / dx;
    let t1 = (c.minX - ox) * inv, t2 = (c.maxX - ox) * inv;
    let n = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; n = 1; }
    if (t1 > tmin) { tmin = t1; nx = n; ny = 0; nz = 0; }
    if (t2 < tmax) tmax = t2;
  } else if (ox < c.minX || ox > c.maxX) return -1;
  if (dy !== 0) {
    const inv = 1 / dy;
    let t1 = (c.minY - oy) * inv, t2 = (c.maxY - oy) * inv;
    let n = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; n = 1; }
    if (t1 > tmin) { tmin = t1; nx = 0; ny = n; nz = 0; }
    if (t2 < tmax) tmax = t2;
  } else if (oy < c.minY || oy > c.maxY) return -1;
  if (dz !== 0) {
    const inv = 1 / dz;
    let t1 = (c.minZ - oz) * inv, t2 = (c.maxZ - oz) * inv;
    let n = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; n = 1; }
    if (t1 > tmin) { tmin = t1; nx = 0; ny = 0; nz = n; }
    if (t2 < tmax) tmax = t2;
  } else if (oz < c.minZ || oz > c.maxZ) return -1;
  if (tmax < tmin || tmin < 0 || tmin >= best) return -1;
  hit.nx = nx; hit.ny = ny; hit.nz = nz;
  return tmin;
}

function rayRamp(c, ox, oy, oz, dx, dy, dz, best, hit) {
  // clip to the bounding box first
  let tmin = 0, tmax = best;
  let nx = 0, ny = 0, nz = 0;
  const axes = [
    [dx, ox, c.minX, c.maxX, 0],
    [dy, oy, c.minY, c.maxY, 1],
    [dz, oz, c.minZ, c.maxZ, 2],
  ];
  for (const [d, o, lo, hi, a] of axes) {
    if (d !== 0) {
      let t1 = (lo - o) / d, t2 = (hi - o) / d, n = -1;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; n = 1; }
      if (t1 > tmin) { tmin = t1; nx = a === 0 ? n : 0; ny = a === 1 ? n : 0; nz = a === 2 ? n : 0; }
      if (t2 < tmax) tmax = t2;
    } else if (o < lo || o > hi) return -1;
  }
  if (tmax < tmin) return -1;
  const f = (t) => oy + dy * t - surfaceY(c, ox + dx * t, oz + dz * t);
  const f0 = f(tmin);
  if (f0 <= 0) {
    if (tmin <= 0) return -1; // started inside
    hit.nx = nx; hit.ny = ny; hit.nz = nz;
    return tmin;
  }
  const f1 = f(tmax);
  if (f1 > 0) return -1;
  const t = tmin + (tmax - tmin) * (f0 / (f0 - f1));
  const len = c.axis === 0 ? c.maxX - c.minX : c.maxZ - c.minZ;
  const k = (c.y1 - c.y0) / len;
  const inv = 1 / Math.sqrt(1 + k * k);
  hit.nx = c.axis === 0 ? -k * inv : 0;
  hit.ny = inv;
  hit.nz = c.axis === 1 ? -k * inv : 0;
  return t;
}

// Ray vs sphere; returns entry distance or -1. (Enemy hitboxes.)
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tc = lx * dx + ly * dy + lz * dz;
  const d2 = lx * lx + ly * ly + lz * lz - tc * tc;
  const r2 = r * r;
  if (d2 > r2) return -1;
  const thc = Math.sqrt(r2 - d2);
  const t0 = tc - thc;
  if (t0 >= 0) return t0;
  const t1 = tc + thc;
  return t1 >= 0 ? 0 : -1;
}
