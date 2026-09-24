import * as THREE from 'three';

// Pickups slice: loot drops (scrap, grenades, health orbs) from kills,
// bobbing/magnetised pickups, collection (by the player or the collector
// drone, which publishes its position), and scrap values.
//
// Listens: enemy:killed, run:start, arena:ready, pickup:collect
// Emits:   scrap:add, pickup, heal, sfx, fx:burst
// Publishes state.pickups: { list }

const SCRAP = { grunt: 10, rusher: 12, sniper: 15, tank: 25, wasp: 12, bulwark: 20, mender: 18, scorcher: 18, slag: 20 };
const SCRAP_CHANCE = 0.45;
const GRENADE_CHANCE = 0.07;
const HEALTH_CHANCE = 0.05;
const RADIUS = 1.9;
const MAGNET = 5.5;

export function createPickups(state, bus) {
  const root = new THREE.Group();
  state.scene.add(root);
  const list = [];
  state.pickups = { list };

  const scrapGeo = new THREE.OctahedronGeometry(0.2, 0);
  const scrapMat = new THREE.MeshStandardMaterial({ color: 0xffc94d, emissive: 0xb07a10, emissiveIntensity: 1.2, roughness: 0.25, metalness: 0.8 });
  const bigScrapMat = new THREE.MeshStandardMaterial({ color: 0xffe08a, emissive: 0xffb020, emissiveIntensity: 2, roughness: 0.2, metalness: 0.9 });
  const nadeGeo = new THREE.CapsuleGeometry(0.12, 0.14, 4, 10);
  const nadeMat = new THREE.MeshStandardMaterial({ color: 0x3dd68c, emissive: 0x1a7a4c, emissiveIntensity: 1.5, roughness: 0.4 });
  const hpGeo = new THREE.SphereGeometry(0.22, 16, 12);
  const hpMat = new THREE.MeshStandardMaterial({ color: 0x3dff8a, emissive: 0x22ff77, emissiveIntensity: 2.5, roughness: 0.3 });
  const ringGeo = new THREE.TorusGeometry(0.34, 0.025, 6, 24);

  function clear() {
    for (const p of list) root.remove(p.mesh);
    list.length = 0;
  }

  function spawn(pos, type, value = 0) {
    const g = new THREE.Group();
    let mesh;
    if (type === 'scrap') mesh = new THREE.Mesh(scrapGeo, value >= 100 ? bigScrapMat : scrapMat);
    else if (type === 'grenade') mesh = new THREE.Mesh(nadeGeo, nadeMat);
    else mesh = new THREE.Mesh(hpGeo, hpMat);
    if (type === 'scrap' && value >= 100) mesh.scale.setScalar(1.8);
    g.add(mesh);
    if (type !== 'scrap') {
      const ring = new THREE.Mesh(ringGeo, type === 'grenade' ? nadeMat : hpMat);
      ring.rotation.x = Math.PI / 2;
      g.add(ring);
    }
    const col = state.world.collision;
    const x = pos.x + (Math.random() - 0.5) * 1.2, z = pos.z + (Math.random() - 0.5) * 1.2;
    const floor = col.groundHeight(x, z, 0.1, pos.y + 0.5, 0.6);
    g.position.set(x, floor + 0.55, z);
    root.add(g);
    // pop out of the robot, then settle
    list.push({ mesh: g, type, value, t: Math.random() * 6, baseY: floor + 0.55, pop: 0.35, vy: 4, life: 45 });
  }

  bus.on('enemy:killed', (k) => {
    if (!state.world || k.source === 'self') return;
    if (k.source === 'bosswipe' && Math.random() > 0.5) return;
    const s = state.stats || {};
    const d = state.run.difficulty || { scrapMult: 1 };
    const pos = k.pos;
    const base = (SCRAP[k.type] || 10) * d.scrapMult * (s.scrapValueMult || 1);
    if (k.boss) {
      spawn(pos, 'scrap', Math.round(150 * d.scrapMult * (s.scrapValueMult || 1)));
      spawn(pos, 'grenade');
      spawn(pos, 'grenade');
      spawn(pos, 'health', 50);
      return;
    }
    if (k.minion && Math.random() < 0.5) return;
    if (k.elite) spawn(pos, 'scrap', Math.round(base * 3));
    else if (Math.random() < Math.min(0.95, SCRAP_CHANCE * (s.scrapDropMult || 1) * (state.run.mutator === 'frenzy' ? 2 : 1))) {
      spawn(pos, 'scrap', Math.round(base));
    }
    if (Math.random() < GRENADE_CHANCE * (s.grenadeDropMult || 1)) spawn(pos, 'grenade');
    if (Math.random() < HEALTH_CHANCE) spawn(pos, 'health', 25);
  });

  function collect(p, i) {
    if (p.type === 'scrap') {
      bus.emit('scrap:add', { amount: p.value });
      bus.emit('sfx', { id: 'pickup_scrap', vol: p.value >= 100 ? 1 : 0.6 });
      bus.emit('hud:scrapgain', { amount: p.value });
    } else if (p.type === 'grenade') {
      if (state.weapons.grenades >= state.weapons.grenadeMax) return false;
      bus.emit('pickup', { type: 'grenade' });
      bus.emit('sfx', { id: 'pickup_grenade' });
      bus.emit('hud:feed', { text: 'GRENADE +1', color: '#3dd68c' });
    } else {
      if (state.player.health >= state.player.maxHealth) return false;
      bus.emit('heal', { amount: p.value });
      bus.emit('sfx', { id: 'pickup_health' });
    }
    bus.emit('fx:burst', { pos: p.mesh.position.clone(), color: p.type === 'scrap' ? 0xffd060 : p.type === 'grenade' ? 0x3dd68c : 0x3dff8a, count: 10, speed: 3, life: 0.35 });
    root.remove(p.mesh);
    list.splice(i, 1);
    return true;
  }

  bus.on('pickup:collect', ({ item }) => {
    const i = list.indexOf(item);
    if (i >= 0) collect(item, i);
  });
  bus.on('run:start', clear);
  bus.on('arena:ready', clear);

  return {
    spawn: (pos, type, value) => spawn(pos, type, value),
    update(dt) {
      const p = state.player;
      if (!p.pos) return;
      const feet = p.pos.y - p.eye;
      const magnet = MAGNET * (p.inMech ? 2 : 1);
      for (let i = list.length - 1; i >= 0; i--) {
        const it = list[i];
        it.t += dt;
        it.life -= dt;
        const m = it.mesh;
        m.rotation.y += dt * 2.4;
        if (it.pop > 0) {
          it.pop -= dt;
          it.vy -= 20 * dt;
          m.position.y = Math.max(it.baseY, m.position.y + it.vy * dt);
        } else {
          m.position.y += (it.baseY + Math.sin(it.t * 3) * 0.1 - m.position.y) * Math.min(1, dt * 8);
        }
        const dx = p.pos.x - m.position.x, dz = p.pos.z - m.position.z;
        const dy = feet + 0.6 - m.position.y;
        const d = Math.hypot(dx, dz);
        // scrap drifts toward you once you're close
        if (it.type === 'scrap' && d < magnet && Math.abs(dy) < 2.5 && p.alive) {
          const k = Math.min(1, dt * (8 / Math.max(0.5, d)));
          m.position.x += dx * k;
          m.position.z += dz * k;
          it.baseY += dy * k * 0.5;
        }
        if (d < RADIUS * (p.inMech ? 1.8 : 1) && Math.abs(dy) < 1.8 && p.alive) {
          if (collect(it, i)) continue;
        }
        if (it.life <= 0) {
          root.remove(m);
          list.splice(i, 1);
        } else if (it.life < 5) m.visible = Math.sin(it.life * 12) > 0;
      }
    },
  };
}
