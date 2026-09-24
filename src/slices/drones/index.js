import * as THREE from 'three';

// Drones slice: scrap-bought helper drones that orbit you and snipe the
// nearest visible enemy, plus the scrap collector that hoovers up loot.
//
// Listens: shop:buy (drone, droneRate, droneTwin, droneRepair, collector,
//          collectorSpeed), run:start, arena:ready
// Emits:   damage:enemy, heal, pickup:collect, fx:tracer, sfx
// Publishes state.drones: { count, max, twin, rateUps, collector, collectorUps, repair }

const RANGE = 40;
const DAMAGE = 16;
const INTERVAL = 1.3;
export const DRONE_MAX = 2;

const _t = new THREE.Vector3();
const _d = new THREE.Vector3();

function droneModel(color, glow) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.22, 4, 10).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.7 }));
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshStandardMaterial({ color: glow, emissive: glow, emissiveIntensity: 3 }));
  eye.position.z = -0.24;
  g.add(body, eye);
  const rotors = [];
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 0.03), body.material);
    arm.position.set(x * 0.12, 0.05, z * 0.1);
    arm.rotation.y = x * z * 0.7;
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.005, 0.025), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    r.position.set(x * 0.22, 0.08, z * 0.18);
    g.add(arm, r);
    rotors.push(r);
  }
  g.traverse((o) => { o.castShadow = true; });
  return { group: g, rotors };
}

export function createDrones(state, bus) {
  const root = new THREE.Group();
  state.scene.add(root);
  const D = { count: 0, max: DRONE_MAX, twin: false, rateUps: 0, repair: false, collector: false, collectorUps: 0 };
  state.drones = D;
  const drones = [];
  let collector = null;
  let angle = 0;
  let rateMult = 1;
  let collectSpeed = 5;

  function clear() {
    for (const d of drones) root.remove(d.group);
    drones.length = 0;
    if (collector) root.remove(collector.group);
    collector = null;
    Object.assign(D, { count: 0, twin: false, rateUps: 0, repair: false, collector: false, collectorUps: 0 });
    rateMult = 1;
    collectSpeed = 5;
  }

  function addDrone() {
    const m = droneModel(0x3a4452, 0x7fe7ff);
    m.group.position.copy(state.player.pos);
    root.add(m.group);
    drones.push({ ...m, offset: drones.length * Math.PI, shootT: 0.8 });
    D.count = drones.length;
  }

  bus.on('shop:buy', ({ item }) => {
    if (item === 'drone' && drones.length < DRONE_MAX) addDrone();
    if (item === 'droneRate') { rateMult *= 1.15; D.rateUps++; }
    if (item === 'droneTwin') D.twin = true;
    if (item === 'droneRepair') D.repair = true;
    if (item === 'collector' && !collector) {
      const m = droneModel(0x8a6410, 0xffc94d);
      m.group.scale.setScalar(1.2);
      m.group.position.copy(state.player.pos);
      root.add(m.group);
      collector = { ...m, t: 0 };
      D.collector = true;
    }
    if (item === 'collectorSpeed') { collectSpeed *= 1.4; D.collectorUps++; }
  });
  bus.on('run:start', clear);
  bus.on('arena:ready', () => {
    for (const d of drones) d.group.position.copy(state.player.pos);
    if (collector) collector.group.position.copy(state.player.pos);
  });

  return {
    update(dt) {
      const p = state.player;
      if (!p.pos || !state.world) return;
      angle += dt * 0.7;
      const col = state.world.collision;
      const scale = 1 + (state.run.wave - 1) * 0.04;
      for (const d of drones) {
        const a = angle + d.offset;
        const r = p.inMech ? 3 : 1.7;
        _t.set(p.pos.x + Math.cos(a) * r, p.pos.y + (p.inMech ? 0.8 : 0.6), p.pos.z + Math.sin(a) * r);
        d.group.position.lerp(_t, Math.min(1, dt * 6));
        for (const rt of d.rotors) rt.rotation.y += dt * 40;
        if (D.repair && p.health < p.maxHealth) bus.emit('heal', { amount: 2.5 * dt });
        if (state.mode !== 'playing') continue;
        d.shootT -= dt;
        if (d.shootT > 0) continue;
        let best = null, bd = RANGE;
        const dp = d.group.position;
        for (const e of state.enemies.list) {
          if (!e.alive || e.untargetable) continue;
          const dist = dp.distanceTo(e.center);
          if (dist < bd && col.segmentClear(dp.x, dp.y, dp.z, e.center.x, e.center.y, e.center.z)) { bd = dist; best = e; }
        }
        if (!best) { d.shootT = 0.3; continue; }
        d.shootT = INTERVAL / rateMult;
        d.group.lookAt(best.center);
        d.group.rotateY(Math.PI);
        bus.emit('fx:tracer', { from: dp.clone(), to: best.center.clone(), color: 0x7fe7ff });
        bus.emit('sfx', { id: 'drone_shot', pos: dp, vol: 0.5 });
        const dmg = Math.round(DAMAGE * scale);
        bus.emit('damage:enemy', { enemy: best, amount: dmg, part: 'body', source: 'drone', point: best.center, depth: 1 });
        if (D.twin && best.alive) bus.emit('damage:enemy', { enemy: best, amount: dmg, part: 'body', source: 'drone', point: best.center, depth: 1 });
      }
      if (collector) {
        const c = collector;
        c.t += dt;
        for (const rt of c.rotors) rt.rotation.y += dt * 30;
        let target = null, bd = Infinity;
        for (const it of state.pickups?.list || []) {
          if (it.type !== 'scrap') continue;
          const dd = c.group.position.distanceTo(it.mesh.position);
          if (dd < bd) { bd = dd; target = it; }
        }
        if (target) _t.copy(target.mesh.position);
        else _t.set(p.pos.x - 2, p.pos.y + 1.2 + Math.sin(c.t * 2.5) * 0.2, p.pos.z - 2);
        _d.copy(_t).sub(c.group.position);
        const dd = _d.length();
        if (dd > 0.05) c.group.position.addScaledVector(_d.divideScalar(dd), Math.min(dd, collectSpeed * dt));
        c.group.rotation.y += dt * 1.5;
        if (target && dd < 1) {
          bus.emit('pickup:collect', { item: target });
          bus.emit('sfx', { id: 'collector', pos: c.group.position, vol: 0.5 });
        }
      }
    },
  };
}
