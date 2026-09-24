import { buildNavGraph, FlowField } from './graph.js';

// Nav slice: generates a multi-level navigation graph from the arena's
// collision world (no hand-placed routes — any surface the player can walk
// to, enemies can path to), then keeps a flow field toward the player.
//
// Listens: arena:ready
// Publishes state.nav: {
//   graph, steer(pos, feetY, out, lookahead) -> cost | Infinity,
//   nearest(x, feetY, z) -> node index | -1, nodePos(i, out),
//   randomNear(x, z, rMin, rMax, rng) -> node index, costAt(x, feetY, z) }

const REFRESH = 0.15;

export function createNav(state, bus) {
  let graph = null;
  let field = null;
  let refreshT = 0;
  let lastTarget = -1;

  bus.on('arena:ready', (world) => {
    const t0 = performance.now();
    graph = buildNavGraph(world.collision, world.bounds, world.jumpPads);
    field = new FlowField(graph);
    lastTarget = -1;
    const ms = (performance.now() - t0).toFixed(0);
    state.nav = {
      graph,
      buildMs: ms,
      nearest: (x, feetY, z) => graph.nearest(x, feetY, z),
      nodePos: (i, out) => graph.nodePos(i, out),
      costAt: (x, feetY, z) => {
        const n = graph.nearest(x, feetY, z);
        return n < 0 ? Infinity : field.dist[n];
      },
      steer: (pos, feetY, out, lookahead = 2) => field.steer(pos, feetY, out, lookahead),
      randomNear: (x, z, rMin, rMax, rnd) => graph.randomNear(x, z, rMin, rMax, rnd),
      target: -1,
    };
  });

  return {
    update(dt) {
      if (!graph) return;
      refreshT -= dt;
      const p = state.player;
      if (!p.pos) return;
      const feet = p.pos.y - p.eye;
      // while airborne, target the ground column beneath the player
      // prefer the big connected region so a player perched on a crate
      // still pulls enemies to the ground right beside them
      const target = graph.nearest(p.pos.x, feet + 0.3, p.pos.z, true);
      if (target < 0) return;
      if (target !== lastTarget && refreshT <= 0) {
        field.compute(target);
        lastTarget = target;
        state.nav.target = target;
        refreshT = REFRESH;
      }
    },
  };
}
