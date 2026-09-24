import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CollisionWorld } from '../src/core/collide.js';
import { buildNavGraph, FlowField } from '../src/slices/nav/graph.js';

// A 4m-high platform reached by a ramp, a wall with a door, and a crate.
function world() {
  const c = new CollisionWorld(32, 4);
  c.addBox(4, 0, -3, 10, 4, 3); // platform top 4
  c.addRamp(-3, -1, 4, 1, 0, 0, 0, 4); // ramp along +x rising to 4 at x=4 (slope 0.57)
  c.addBox(-12, 0, 6, -2, 3, 6.4); // wall segment
  c.addBox(0.6, 0, 6, 10, 3, 6.4); // wall segment (door gap -2..0.6)
  c.addBox(-8, 0, -8, -7, 1.2, -7); // crate (jumpable, unreachable top)
  return c;
}
const bounds = { minX: -15, maxX: 15, minZ: -15, maxZ: 15 };

test('collision: ramp surface + groundHeight', () => {
  const c = world();
  const g = c.groundHeight(0.5, 0, 0.3, 2.3, 0.55);
  assert.ok(Math.abs(g - 2) < 0.1, `ramp height ${g}`);
  assert.equal(c.groundHeight(7, 0, 0.3, 4, 0.55), 4);
});

test('collision: raycast hits ramp slope and box face', () => {
  const c = world();
  assert.ok(c.raycast(0, 10, 0, 0, -1, 0, 50));
  assert.ok(Math.abs(c.hit.y - 12 / 7) < 0.05, `slope hit y ${c.hit.y}`);
  assert.ok(c.raycast(-10, 1, 0, 1, 0, 0, 50));
  // the ramp's low end is under y=1 until x≈-1.25 so the first thing hit is the slope
  assert.ok(c.hit.x > -2 && c.hit.x < 0, `hit x ${c.hit.x}`);
  assert.ok(!c.segmentClear(5, 1, 10, 5, 1, 2)); // through the wall
  assert.ok(c.segmentClear(-0.7, 1, 10, -0.7, 1, 2)); // through the door
});

test('collision: collideXZ pushes out of a wall', () => {
  const c = world();
  const p = { x: 5, z: 6.2 };
  c.collideXZ(p, 0.4, 0, 1.7, 0.55);
  assert.ok(p.z < 5.61 || p.z > 6.79, `pushed z ${p.z}`);
});

test('nav: platform reachable via ramp, through the door', () => {
  const c = world();
  const g = buildNavGraph(c, bounds);
  const f = new FlowField(g);
  const top = g.nearest(8, 4, 0);
  assert.ok(top >= 0 && Math.abs(g.height[top] - 4) < 0.01);
  f.compute(top);
  const behindWall = g.nearest(5, 0, 10);
  assert.ok(f.dist[behindWall] < Infinity, 'path from behind the wall');
  const crateTop = g.nearest(-7.5, 1.2, -7.5);
  assert.ok(Math.abs(g.height[crateTop] - 1.2) < 0.01, 'crate top node');
  assert.notEqual(g.comp[crateTop], g.main, 'crate top is its own island');
  // following next pointers from behind the wall reaches the target
  let n = behindWall, steps = 0;
  while (n !== top && steps < 200) { n = f.next[n]; steps++; }
  assert.equal(n, top);
  // drops: from the platform you can hop down to the ground
  const ground = g.nearest(12, 0, 0);
  f.compute(ground);
  assert.ok(f.dist[top] < Infinity);
});
