import { surfaceY } from '../../core/collide.js';

// Navigation graph generated from a CollisionWorld.
// A 1m grid of columns; each column holds a node for every walkable surface
// height (floor, crate tops, floors of buildings, stair/ramp surfaces) where
// a body fits. Nodes link to their 8 neighbours when the height change is
// climbable, and one-way "drop" links let enemies hop down off ledges.
// Pure JS (no three.js) so it can be unit-tested in Node.

export const CELL = 1;
const RADIUS = 0.34;
const HEIGHT = 1.7;
const CLIMB = 0.72;
const MAX_DROP = 8;

export function buildNavGraph(col, bounds, jumpPads = [], hazards = []) {
  const minX = bounds.minX, minZ = bounds.minZ;
  const nx = Math.ceil((bounds.maxX - minX) / CELL);
  const nz = Math.ceil((bounds.maxZ - minZ) / CELL);
  const colStart = new Int32Array(nx * nz + 1);
  const hs = [];
  const cx = (ix) => minX + (ix + 0.5) * CELL;
  const cz = (iz) => minZ + (iz + 0.5) * CELL;

  // ---- nodes ----
  const cand = [];
  const valid = [];
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const ci = iz * nx + ix;
      colStart[ci] = hs.length;
      const x = cx(ix), z = cz(iz);
      cand.length = 0;
      cand.push(col.floorY);
      const list = col.query(x - 0.01, z - 0.01, x + 0.01, z + 0.01);
      for (const c of list) {
        if (c.tag === 'barrier' || c.tag === 'nowalk') continue;
        if (x < c.minX || x > c.maxX || z < c.minZ || z > c.maxZ) continue;
        cand.push(surfaceY(c, x, z));
      }
      cand.sort((a, b) => a - b);
      valid.length = 0;
      for (const h of cand) {
        const g = col.groundHeight(x, z, 0.05, h, 0.05);
        if (Math.abs(g - h) > 0.08) continue;
        if (!col.fits(x, h, z, RADIUS, HEIGHT)) continue;
        // never path through molten floors (bridges sit above them)
        if (h < 0.3 && hazards.some((hz) => x > hz.minX - RADIUS && x < hz.maxX + RADIUS && z > hz.minZ - RADIUS && z < hz.maxZ + RADIUS)) continue;
        // a surface just below another (floor under a ramp's low end) is the
        // same standing spot — keep only the upper one
        if (valid.length && h - valid[valid.length - 1] < 0.6) valid.pop();
        valid.push(h);
      }
      for (const h of valid) hs.push(h);
    }
  }
  colStart[nx * nz] = hs.length;
  const N = hs.length;
  const height = Float32Array.from(hs);
  const nodeCol = new Int32Array(N);
  for (let ci = 0; ci < nx * nz; ci++) {
    for (let n = colStart[ci]; n < colStart[ci + 1]; n++) nodeCol[n] = ci;
  }

  const findIn = (ci, h, tol) => {
    let best = -1, bd = tol;
    for (let n = colStart[ci]; n < colStart[ci + 1]; n++) {
      const d = Math.abs(height[n] - h);
      if (d <= bd) { bd = d; best = n; }
    }
    return best;
  };

  // ---- edges ----
  const eFrom = [], eTo = [], eCost = [], eWalk = [];
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (let a = 0; a < N; a++) {
    const ci = nodeCol[a];
    const ix = ci % nx, iz = (ci / nx) | 0;
    const ha = height[a];
    const ax = cx(ix), az = cz(iz);
    for (const [dx, dz] of DIRS) {
      const jx = ix + dx, jz = iz + dz;
      if (jx < 0 || jz < 0 || jx >= nx || jz >= nz) continue;
      const cj = jz * nx + jx;
      const diag = dx !== 0 && dz !== 0;
      const mx = (ax + cx(jx)) / 2, mz = (az + cz(jz)) / 2;
      let linked = false;
      for (let b = colStart[cj]; b < colStart[cj + 1]; b++) {
        const hb = height[b];
        if (Math.abs(hb - ha) > CLIMB) continue;
        const top = Math.max(ha, hb);
        if (diag) {
          // no corner cutting: both orthogonal cells must be walkable too
          if (findIn(iz * nx + jx, ha, CLIMB) < 0 || findIn(jz * nx + ix, ha, CLIMB) < 0) continue;
        }
        if (!col.fits(mx, top, mz, RADIUS * 0.85, HEIGHT)) continue;
        const g = col.groundHeight(mx, mz, 0.25, top + 0.05, 0.1);
        if (g < Math.min(ha, hb) - 0.35) continue; // gap between
        eFrom.push(a); eTo.push(b);
        eCost.push((diag ? 1.414 : 1) + Math.max(0, hb - ha) * 0.5);
        eWalk.push(1);
        linked = true;
      }
      if (linked || diag) continue;
      // drop down: highest lower node in the neighbour column
      let drop = -1, dh = -Infinity;
      for (let n = colStart[cj]; n < colStart[cj + 1]; n++) {
        const h = height[n];
        if (h < ha - CLIMB && ha - h <= MAX_DROP && h > dh) { dh = h; drop = n; }
      }
      if (drop < 0) continue;
      if (!col.fits(mx, ha, mz, RADIUS * 0.85, HEIGHT)) continue;
      // the landing cell must not have something between (a ledge lower than ha)
      if (col.groundHeight(mx, mz, 0.05, ha - 0.1, 0.0) > dh + 0.2) continue;
      eFrom.push(a); eTo.push(drop);
      eCost.push(1.5 + (ha - dh) * 0.15);
      eWalk.push(0);
    }
  }
  for (const pad of jumpPads) {
    const a = nearestNode(pad.x, pad.y ?? 0, pad.z);
    const b = nearestNode(pad.toX, pad.toY, pad.toZ);
    if (a >= 0 && b >= 0) { eFrom.push(a); eTo.push(b); eCost.push(3); eWalk.push(0); }
  }

  // CSR forward + reverse adjacency
  const E = eFrom.length;
  const out = csr(N, eFrom, eTo, eCost);
  const inc = csr(N, eTo, eFrom, eCost);
  // walk-only adjacency (drops / jump pads are one-way, so they don't join
  // components: a crate you can only jump onto is its own island)
  const wf = [], wt = [];
  for (let i = 0; i < E; i++) if (eWalk[i]) { wf.push(eFrom[i]); wt.push(eTo[i]); }
  const walk = csr(N, wf, wt, new Float32Array(wf.length));

  // ---- components (over walk links) ----
  const comp = new Int32Array(N).fill(-1);
  const compSize = [];
  const stack = [];
  for (let s = 0; s < N; s++) {
    if (comp[s] >= 0) continue;
    const id = compSize.length;
    let size = 0;
    comp[s] = id;
    stack.push(s);
    while (stack.length) {
      const u = stack.pop();
      size++;
      for (let k = walk.start[u]; k < walk.start[u + 1]; k++) {
        const v = walk.to[k];
        if (comp[v] < 0) { comp[v] = id; stack.push(v); }
      }
    }
    compSize.push(size);
  }
  let main = 0;
  for (let i = 1; i < compSize.length; i++) if (compSize[i] > compSize[main]) main = i;

  function colOf(x, z) {
    const ix = Math.floor((x - minX) / CELL), iz = Math.floor((z - minZ) / CELL);
    if (ix < 0 || iz < 0 || ix >= nx || iz >= nz) return -1;
    return iz * nx + ix;
  }

  // highest node in the column at or below feetY (+tolerance)
  function inColumn(ci, feetY) {
    let best = -1, bh = -Infinity;
    for (let n = colStart[ci]; n < colStart[ci + 1]; n++) {
      const h = height[n];
      if (h <= feetY + 0.6 && h > bh) { bh = h; best = n; }
    }
    return best;
  }

  function nearestNode(x, feetY, z, preferMain = false) {
    const ci = colOf(x, z);
    if (ci < 0) return -1;
    const n = inColumn(ci, feetY);
    if (n >= 0 && Math.abs(height[n] - feetY) < 1.2 && (!preferMain || comp[n] === main)) return n;
    // search outward rings for the closest node near this height
    const ix = ci % nx, iz = (ci / nx) | 0;
    let best = n, bd = n >= 0 && (!preferMain || comp[n] === main) ? Math.abs(height[n] - feetY) * 2 : Infinity;
    for (let r = 1; r <= 3; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const jx = ix + dx, jz = iz + dz;
          if (jx < 0 || jz < 0 || jx >= nx || jz >= nz) continue;
          const m = inColumn(jz * nx + jx, feetY);
          if (m < 0) continue;
          if (preferMain && comp[m] !== main) continue;
          const d = Math.hypot(dx, dz) + Math.abs(height[m] - feetY) * 2;
          if (d < bd) { bd = d; best = m; }
        }
      }
      if (best >= 0 && bd < r + 1.5) break;
    }
    return best;
  }

  return {
    N, E, nx, nz, minX, minZ, height, nodeCol, out, inc, comp, main, compSize,
    nearest: nearestNode,
    nodePos(i, o) {
      const ci = nodeCol[i];
      o.x = cx(ci % nx);
      o.y = height[i];
      o.z = cz((ci / nx) | 0);
      return o;
    },
    randomNear(x, z, rMin, rMax, rnd = Math.random) {
      for (let t = 0; t < 16; t++) {
        const a = rnd() * Math.PI * 2, r = rMin + rnd() * (rMax - rMin);
        const ci = colOf(x + Math.cos(a) * r, z + Math.sin(a) * r);
        if (ci < 0 || colStart[ci] === colStart[ci + 1]) continue;
        const n = colStart[ci];
        if (comp[n] === main) return n;
      }
      return -1;
    },
  };
}

function csr(N, from, to, cost) {
  const start = new Int32Array(N + 1);
  for (let i = 0; i < from.length; i++) start[from[i] + 1]++;
  for (let i = 0; i < N; i++) start[i + 1] += start[i];
  const fill = start.slice(0, N);
  const t = new Int32Array(from.length);
  const c = new Float32Array(from.length);
  for (let i = 0; i < from.length; i++) {
    const k = fill[from[i]]++;
    t[k] = to[i];
    c[k] = cost[i];
  }
  return { start, to: t, cost: c };
}

// Dijkstra from the target over reversed edges: dist[n] = cost from n to
// the target, next[n] = the neighbour to step to.
export class FlowField {
  constructor(graph) {
    this.g = graph;
    this.dist = new Float32Array(graph.N).fill(Infinity);
    this.next = new Int32Array(graph.N).fill(-1);
    this.heapN = new Int32Array(graph.E + graph.N + 8);
    this.heapK = new Float32Array(graph.E + graph.N + 8);
    this.tmp = { x: 0, y: 0, z: 0 };
  }

  compute(target) {
    const g = this.g, dist = this.dist, next = this.next;
    dist.fill(Infinity);
    next.fill(-1);
    const hn = this.heapN, hk = this.heapK;
    let size = 0;
    const push = (n, k) => {
      let i = size++;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (hk[p] <= k) break;
        hn[i] = hn[p]; hk[i] = hk[p];
        i = p;
      }
      hn[i] = n; hk[i] = k;
    };
    const pop = () => {
      const top = hn[0];
      const n = hn[--size], k = hk[size];
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= size) break;
        if (c + 1 < size && hk[c + 1] < hk[c]) c++;
        if (hk[c] >= k) break;
        hn[i] = hn[c]; hk[i] = hk[c];
        i = c;
      }
      hn[i] = n; hk[i] = k;
      return top;
    };
    dist[target] = 0;
    push(target, 0);
    const inc = g.inc;
    while (size > 0) {
      const k = hk[0];
      const v = pop();
      if (k > dist[v]) continue;
      for (let e = inc.start[v]; e < inc.start[v + 1]; e++) {
        const u = inc.to[e];
        const d = k + inc.cost[e];
        if (d < dist[u]) {
          dist[u] = d;
          next[u] = v;
          if (size < hn.length) push(u, d);
        }
      }
    }
    this.target = target;
  }

  // Writes a waypoint to steer toward into out; returns remaining cost.
  steer(pos, feetY, out, lookahead = 2) {
    const g = this.g;
    const n = g.nearest(pos.x, feetY, pos.z);
    if (n < 0 || this.dist[n] === Infinity) return Infinity;
    let cur = n;
    const h0 = g.height[n];
    for (let i = 0; i < lookahead; i++) {
      const nx = this.next[cur];
      if (nx < 0) break;
      // stop the lookahead where the path changes level (stairs, drops,
      // jump pads) — aim for the step itself, not past it
      if (cur !== n && Math.abs(g.height[nx] - h0) > 0.4) break;
      cur = nx;
      if (Math.abs(g.height[cur] - h0) > 0.4) break;
    }
    g.nodePos(cur, out);
    return this.dist[n];
  }
}
