import * as THREE from 'three';
import { TYPES, ELITE_AFFIXES } from './types.js';
import { buildRig } from './models.js';
import { createAttacks } from './attacks.js';
import { GRAVITY } from '../../core/constants.js';

// Enemies slice: spawning (with a materialise-in), AI (nav flow field
// movement, cover, range keeping, strafing, fleeing, flying), every attack
// pattern, boss phases, elite affixes, damage + explosions, and deaths that
// break the robot into physical debris.
//
// Listens: enemy:spawn, damage:enemy, explode, enemies:freeze, enemies:clear,
//          run:start, arena:ready
// Emits:   enemy:spawned, enemy:hit, enemy:killed, boss:phase, damage:player,
//          sfx, fx:*, light, shake, hitstop, hud:banner, player:velocity
// Publishes state.enemies: { list, boss, alive }

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _t = new THREE.Vector3();
const _m = new THREE.Vector3();
const _dir = new THREE.Vector3();
const STEP = 0.55;
const rand = (a, b) => a + Math.random() * (b - a);

export function createEnemies(state, bus) {
  const E = state.enemies;
  E.list = [];
  E.boss = null;
  E.alive = 0;
  const root = new THREE.Group();
  root.name = 'enemies';
  state.scene.add(root);
  const attacks = createAttacks(state, bus, root);
  const debris = [];
  let nextId = 1;
  let losCursor = 0;

  function clear() {
    for (const e of E.list) removeRig(e);
    E.list.length = 0;
    for (const d of debris) root.remove(d.mesh);
    debris.length = 0;
    attacks.clear();
  }

  function removeRig(e) {
    root.remove(e.rig.root);
    if (e.laser) root.remove(e.laser);
    for (const m of Object.values(e.rig.mats)) m.dispose?.();
  }

  // ---------------- spawning ----------------
  function pickSpawn(fly) {
    const pts = state.world.spawnPoints;
    const pp = state.player.pos;
    const far = pts.filter((p) => Math.hypot(p.x - pp.x, p.z - pp.z) > 24);
    const pool = far.length ? far : pts;
    const p = pool[Math.floor(Math.random() * pool.length)];
    const out = new THREE.Vector3(p.x + rand(-2, 2), 0, p.z + rand(-2, 2));
    const nav = state.nav;
    if (nav && !fly) {
      const n = nav.nearest(out.x, 0.2, out.z, true);
      if (n >= 0) nav.nodePos(n, out);
    }
    return out;
  }

  function spawn(opts) {
    const cfg = TYPES[opts.type];
    if (!cfg) return null;
    const rig = buildRig(cfg.model);
    root.add(rig.root);
    const pos = rig.root.position;
    if (opts.at) {
      pos.set(opts.at.x + rand(-1.5, 1.5), opts.at.y ?? 0, opts.at.z + rand(-1.5, 1.5));
      const n = state.nav?.nearest(pos.x, pos.y + 0.3, pos.z, true);
      if (n >= 0 && !cfg.fly) state.nav.nodePos(n, pos);
    } else {
      pos.copy(pickSpawn(cfg.fly));
    }
    if (cfg.fly) pos.y = cfg.hover ?? rand(5, 8);
    const hp = Math.max(10, Math.round(cfg.hp * (opts.hpMult ?? 1)));
    const e = {
      id: nextId++, type: opts.type, cfg, rig, alive: true, pos,
      vel: new THREE.Vector3(), vy: 0, yaw: Math.atan2(state.player.pos.x - pos.x, state.player.pos.z - pos.z) + Math.PI,
      hp, maxHp: hp, boss: !!cfg.boss, elite: null, minion: !!opts.minion,
      radius: cfg.radius, height: rig.height,
      center: new THREE.Vector3(), hitboxes: rig.hitboxes.map((h) => ({ x: 0, y: 0, z: 0, r: h.r, part: h.part, src: h })),
      bound: { x: 0, y: 0, z: 0, r: 1 },
      dmgMult: opts.dmgMult ?? 1, accuracy: opts.accuracy ?? 1, speedMult: opts.speedMult ?? 1,
      rate: 1, phase: 1, atk: { ...cfg },
      spawnT: 0.8, untargetable: true, stun: 0, flash: 0, flinch: 0, flinchV: 0,
      hasLOS: false, noLOS: 0, losT: Math.random() * 0.3,
      state: 'engage', strafeDir: Math.random() < 0.5 ? -1 : 1, strafeT: 0,
      burstT: rand(1, 2.5), burstLeft: 0, gapT: 0, tele: 0,
      aim: null, meleeCd: 0, swingT: 0, coverCd: 0,
      timers: {}, lastPos: new THREE.Vector3().copy(pos), stuckT: 0, unstick: 0, recoil: 0,
      oshield: 0, splitDone: false, healTarget: null,
      minionHp: opts.minionHp, minionDmg: opts.minionDmg,
    };
    // elites: gold glow, one affix, triple scrap
    if (opts.elite) {
      e.elite = opts.elite;
      const aff = ELITE_AFFIXES[opts.elite];
      rig.root.scale.setScalar(1.12);
      e.radius *= 1.12;
      e.height *= 1.12;
      e.maxHp = e.hp = Math.round(e.hp * 1.6);
      if (opts.elite === 'swift') { e.speedMult *= 1.45; e.rate = 1.3; }
      if (opts.elite === 'shielded') e.oshield = Math.round(e.maxHp * 0.6);
      rig.mats.glow.color.setHex(aff.color);
      rig.mats.glow.emissive.setHex(aff.color);
      rig.mats.armor.emissive.setHex(0x3a2a04);
      e.eliteColor = aff.color;
    }
    if (e.boss) {
      E.boss = e;
      bus.emit('sfx', { id: 'boss_roar', pos });
      bus.emit('shake', 0.5);
    }
    for (const k of ['orbs', 'missiles', 'artillery', 'lob', 'teleport', 'magnet', 'aimed', 'laser']) {
      if (e.atk[k]) e.timers[k] = rand(...(e.atk[k].interval || [4, 6])) * 0.6;
    }
    if (e.atk.summon) e.timers.summon = e.atk.summon.cd * 0.7;
    if (e.atk.shock) e.timers.shock = 2;
    if (cfg.shield) e.timers.shield = cfg.shield.up;
    e.shieldUp = !!cfg.shield;
    if (cfg.aimed || e.atk.laser) e.laser = attacks.makeLaser(0xffdd44);
    rig.root.scale.multiplyScalar(0.01);
    e.baseScale = opts.elite ? 1.12 : 1;
    E.list.push(e);
    bus.emit('fx:beam', { pos: { x: pos.x, y: pos.y, z: pos.z }, color: cfg.model.glow, height: e.height + 3 });
    bus.emit('sfx', { id: opts.minion ? 'summon' : 'enemy_spawn', pos, vol: 0.6 });
    bus.emit('enemy:spawned', { enemy: e });
    return e;
  }

  // ---------------- damage ----------------
  function flashOn(e, amt) {
    e.flash = 0.1;
    for (const m of e.rig.flashMats) m.emissive.setRGB(amt, amt, amt);
  }
  function restoreTint(e) {
    for (const m of e.rig.flashMats) {
      if (e.stun > 0.15) m.emissive.setRGB(0.1, 0.35, 0.6);
      else if (e.enraged) m.emissive.setRGB(0.4, 0.03, 0.03);
      else if (e.elite) m.emissive.setHex(0x3a2a04);
      else m.emissive.setRGB(0, 0, 0);
    }
  }

  function damage(p) {
    const e = p.enemy;
    if (!e || !e.alive || e.untargetable) return;
    if (p.part === 'shield') {
      bus.emit('fx:impact', { pos: p.point, normal: { x: -(p.dir?.x || 0), y: 0, z: -(p.dir?.z || 0) }, surface: 'shield', small: true });
      bus.emit('sfx', { id: 'shield_hit', pos: p.point, vol: 0.5 });
      return;
    }
    let amount = p.amount;
    if (e.stun > 0.3 && state.stats?.frozenDmg) amount = Math.round(amount * state.stats.frozenDmg);
    if (e.oshield > 0) {
      const a = Math.min(e.oshield, amount);
      e.oshield -= a;
      amount -= a;
      bus.emit('sfx', { id: 'shield_hit', pos: e.center, vol: 0.4 });
      if (e.oshield <= 0) bus.emit('fx:burst', { pos: e.center.clone(), color: 0x4fc3ff, count: 30, speed: 6, life: 0.5 });
      if (amount <= 0) { flashOn(e, 0.3); return; }
    }
    e.hp -= amount;
    e.lastHit = 0;
    flashOn(e, 0.8);
    e.flinchV += Math.min(4, 0.6 + amount / Math.max(40, e.maxHp * 0.15)) * (e.boss ? 0.3 : 1);
    if (p.stagger && !e.boss) e.stun = Math.max(e.stun, 0.22);
    bus.emit('enemy:hit', { enemy: e, amount, part: p.part, point: p.point, source: p.source });
    bus.emit('fx:dmgnum', { pos: p.point || e.center, amount, crit: p.part === 'head' || p.part === 'weak' });
    if (p.part === 'head' || p.part === 'weak') bus.emit('fx:burst', { pos: p.point || e.center, color: e.cfg.model.glow, count: 8, speed: 4, life: 0.3 });
    // boss phase 2
    if (e.boss && e.phase === 1 && e.hp < e.maxHp * 0.5 && e.cfg.phase2) enterPhase2(e);
    if (e.hp <= 0) {
      kill(e, p);
      if (p.result) p.result.killed = true;
    }
  }

  function enterPhase2(e) {
    e.phase = 2;
    Object.assign(e.atk, e.cfg.phase2);
    for (const k of Object.keys(e.cfg.phase2)) {
      if (e.atk[k]?.interval) e.timers[k] = rand(...e.atk[k].interval) * 0.4;
    }
    if (e.cfg.phase2.enrage) {
      e.enraged = true;
      e.rate = e.cfg.phase2.enrage.rate;
      e.speedMult *= e.cfg.phase2.enrage.speed;
    }
    if (e.atk.laser && !e.laser) e.laser = attacks.makeLaser(0xff3333);
    if (e.rig.weak) {
      e.hitboxes.push({ x: 0, y: 0, z: 0, r: e.rig.weak.r, part: 'weak', src: e.rig.weak });
      if (e.rig.core) e.rig.core.visible = true;
    }
    e.rig.mats.glow.emissiveIntensity = 5;
    e.stun = 0.9;
    restoreTint(e);
    bus.emit('boss:phase', { enemy: e, phase: 2 });
    bus.emit('hud:banner', { title: `${e.cfg.name}`, sub: 'PHASE 2 — HIT THE CORE', color: '#ff5555' });
    bus.emit('sfx', { id: 'boss_enrage', pos: e.pos });
    bus.emit('shake', 0.7);
    attacks.shockwave(e, { radius: 9, dmg: 0 });
    if (e.cfg.phase2.clones) {
      for (let i = 0; i < e.cfg.phase2.clones; i++) spawn({ type: 'sniper', at: e.pos, minion: true, hpMult: 3, dmgMult: e.dmgMult, accuracy: e.accuracy });
    }
  }

  function kill(e, p) {
    e.alive = false;
    const pos = e.pos.clone();
    const center = e.center.clone();
    bus.emit('enemy:killed', {
      enemy: e, type: e.type, pos, center, part: p.part, source: p.source, depth: p.depth || 0,
      boss: e.boss, elite: e.elite, minion: e.minion, points: e.cfg.points, scrap: e.cfg.scrap,
    });
    bus.emit('sfx', { id: 'enemy_death', pos: center, vol: e.boss ? 1 : 0.8 });
    const scale = e.boss ? 2.6 : Math.max(0.7, e.height / 2);
    bus.emit('fx:explosion', { pos: center, color: e.cfg.model.glow, scale, harmless: true });
    bus.emit('light', { pos: center, color: 0xff8844, intensity: 30 * scale, dist: 10 * scale, life: 0.25 });
    breakApart(e, p);
    if (e.laser) e.laser.visible = false;
    // affixes & specials on death
    if (e.cfg.dive) {
      bus.emit('explode', { pos: center, radius: e.cfg.dive.radius, damage: 45, playerDamage: e.cfg.dive.dmg * 0.7 * e.dmgMult, hurtsPlayer: true, source: 'wasp', scale: 1, color: 0xffaa22, sourceEnemy: e });
    }
    if (e.elite === 'volatile') attacks.strike(pos.x, pos.y, pos.z, Math.round(35 * e.dmgMult), 4, 0.7, e);
    if (e.elite === 'splitting') {
      for (let i = 0; i < 2; i++) spawn({ type: 'rusher', at: pos, minion: true, hpMult: e.maxHp / 400, dmgMult: e.dmgMult, accuracy: e.accuracy });
    }
    if (e.boss) {
      bus.emit('hitstop', { duration: 0.6, scale: 0.15 });
      bus.emit('shake', 1);
      if (!E.list.some((o) => o.alive && o.boss)) {
        // the last boss falling wipes the field
        setTimeout(() => {
          for (const o of E.list) if (o.alive) kill(o, { part: 'body', source: 'bosswipe', depth: 2 });
        }, 350);
      }
    }
    if (E.boss === e) E.boss = null;
  }

  function breakApart(e, p) {
    const dir = p.dir || { x: 0, y: 0, z: 0 };
    e.rig.root.updateMatrixWorld(true);
    const meshes = e.rig.meshes;
    const keep = Math.min(meshes.length, e.boss ? 40 : 16);
    for (let i = 0; i < meshes.length; i++) {
      const m = meshes[i];
      if (i >= keep && i % 2) { m.visible = false; continue; }
      root.attach(m);
      m.castShadow = i % 3 === 0;
      const outward = _v.copy(m.getWorldPosition(_w)).sub(e.center);
      outward.y = Math.abs(outward.y) + 0.3;
      outward.normalize();
      const force = (e.boss ? 7 : 4.5) + Math.random() * 3;
      debris.push({
        mesh: m,
        v: new THREE.Vector3(outward.x * force + dir.x * 4, outward.y * force + 2 + Math.random() * 3, outward.z * force + dir.z * 4),
        w: new THREE.Vector3(rand(-12, 12), rand(-12, 12), rand(-12, 12)),
        life: 2.2 + Math.random() * 1.4,
        smoke: Math.random() < 0.15,
      });
    }
    // char the armour, let the glow die
    const M = e.rig.mats;
    M.armor.color.multiplyScalar(0.45);
    M.trim.color.multiplyScalar(0.5);
    M.armor.emissive.setRGB(0.25, 0.08, 0.02);
    M.glow.emissiveIntensity = 1.2;
    e.rig.root.visible = false;
    while (debris.length > 420) {
      const d = debris.shift();
      root.remove(d.mesh);
    }
  }

  // ---------------- AI helpers ----------------
  function updateLOS(e, eyeY) {
    const pp = state.player.pos;
    const tgt = state.abilities?.decoy || pp;
    e.hasLOS = state.world.collision.segmentClear(e.pos.x, eyeY, e.pos.z, tgt.x, tgt.y - 0.2, tgt.z);
  }

  function muzzleWorld(e, out, which = 'muzzle') {
    const m = e.rig[which] || e.rig.muzzle;
    return m.getWorldPosition(out);
  }

  function aimDir(e, from, out, spreadExtra = 0) {
    const pl = state.player;
    const tgt = state.abilities?.decoy || pl.pos;
    out.set(tgt.x, tgt.y - (pl.inMech ? 1.6 : 0.4), tgt.z).sub(from);
    const dist = out.length();
    out.divideScalar(dist || 1);
    const moving = Math.hypot(pl.vel.x, pl.vel.z);
    const spread = ((e.atk.burst?.spread ?? 0.03) * 0.5 + dist * 0.0018 + moving * 0.004 + spreadExtra) / e.accuracy;
    out.x += (Math.random() - 0.5) * 2 * spread;
    out.y += (Math.random() - 0.5) * 2 * spread;
    out.z += (Math.random() - 0.5) * 2 * spread;
    return out.normalize();
  }

  function nextTimer(e, key) {
    const iv = e.atk[key].interval;
    e.timers[key] = rand(iv[0], iv[1]) / e.rate;
  }

  // cover: a nearby nav node the player can't see
  function findCover(e) {
    const nav = state.nav;
    if (!nav) return null;
    const pp = state.player.pos;
    let best = null, bd = Infinity;
    for (let i = 0; i < 10; i++) {
      const n = nav.randomNear(e.pos.x, e.pos.z, 2, 9);
      if (n < 0) continue;
      nav.nodePos(n, _t);
      if (Math.abs(_t.y - e.pos.y) > 1) continue;
      if (state.world.collision.segmentClear(_t.x, _t.y + 1.3, _t.z, pp.x, pp.y, pp.z)) continue;
      const d = Math.hypot(_t.x - e.pos.x, _t.z - e.pos.z);
      if (d < bd) { bd = d; best = { x: _t.x, y: _t.y, z: _t.z }; }
    }
    return best;
  }

  // ---------------- per-enemy update ----------------
  function updateEnemy(e, dt) {
    const cfg = e.cfg;
    const atk = e.atk;
    const pl = state.player;
    const pp = state.abilities?.decoy || pl.pos;
    const pos = e.pos;
    const s = state.stats || {};

    // materialise
    if (e.spawnT > 0) {
      e.spawnT -= dt;
      const k = 1 - Math.max(0, e.spawnT) / 0.8;
      e.rig.root.scale.setScalar(e.baseScale * (0.2 + 0.8 * k * k));
      for (const m of e.rig.flashMats) m.emissive.setRGB(1 - k, 1 - k, 1 - k);
      if (e.spawnT <= 0) {
        e.untargetable = false;
        e.rig.root.scale.setScalar(e.baseScale);
        restoreTint(e);
      }
      animateAndSync(e, dt, 0, 0, 0);
      return;
    }

    if (e.flash > 0) {
      e.flash -= dt;
      if (e.flash <= 0) restoreTint(e);
    }
    const stunned = e.stun > 0;
    if (stunned) {
      e.stun -= dt;
      if (e.stun <= 0) restoreTint(e);
    }
    e.lastHit = (e.lastHit ?? 99) + dt;
    if (e.elite === 'regen' && e.lastHit > 2) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.06 * dt);
    if (e.elite === 'shielded' && e.lastHit > 4 && e.oshield < e.maxHp * 0.6) e.oshield += e.maxHp * 0.1 * dt;

    const dx = pp.x - pos.x, dz = pp.z - pos.z;
    const dist = Math.hypot(dx, dz);
    const ux = dx / (dist || 1), uz = dz / (dist || 1);
    const pFeet = pl.pos.y - pl.eye;
    const dy = pFeet - pos.y;
    const eyeY = pos.y + e.height * 0.85;

    e.losT -= dt;
    if (e.losT <= 0) {
      e.losT = 0.2 + Math.random() * 0.1;
      updateLOS(e, eyeY);
      e.noLOS = e.hasLOS ? 0 : e.noLOS + 0.25;
    }
    e.strafeT -= dt;
    if (e.strafeT <= 0) {
      e.strafeDir = Math.random() < 0.5 ? -1 : 1;
      e.strafeT = cfg.ai === 'rush' ? rand(0.4, 0.9) : rand(1.4, 3.6);
    }

    // ---------- movement intent ----------
    let mx = 0, mz = 0, sp = 1;
    let faceMove = false;
    const path = (mult = 1.1) => {
      const cost = cfg.fly ? Infinity : state.nav?.steer(pos, pos.y, _t, 2);
      if (cost !== undefined && cost < Infinity) {
        const wx = _t.x - pos.x, wz = _t.z - pos.z;
        const l = Math.hypot(wx, wz) || 1;
        mx = wx / l; mz = wz / l;
      } else {
        mx = ux; mz = uz;
      }
      sp = mult;
      faceMove = !e.hasLOS;
    };

    if (cfg.ai === 'wasp') { updateWasp(e, dt, dist, stunned); return; }
    if (cfg.ai === 'support') { updateSupport(e, dt, dist, stunned); return; }

    if (!stunned) {
      if (e.state === 'cover') {
        const c = e.cover;
        const cd = Math.hypot(c.x - pos.x, c.z - pos.z);
        if (cd > 0.8) {
          mx = (c.x - pos.x) / cd; mz = (c.z - pos.z) / cd; sp = 1.35; faceMove = true;
        } else {
          e.coverWait -= dt;
          e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.12 * dt);
        }
        if (e.coverWait <= 0 || dist < 6) { e.state = 'engage'; e.coverCd = 9; }
      } else if (cfg.ai === 'rush' || (e.boss && cfg.ai === 'rush')) {
        const close = e.hasLOS && dist < 7 && Math.abs(dy) < 1.2;
        if (close) {
          mx = ux + -uz * e.strafeDir * 0.5; mz = uz + ux * e.strafeDir * 0.5; sp = 1.3;
        } else path(1.15);
      } else if (cfg.ai === 'sniper') {
        if (dist < 15) {
          mx = -ux + -uz * e.strafeDir * 0.4; mz = -uz + ux * e.strafeDir * 0.4; sp = 1.5; faceMove = true;
        } else if (!e.hasLOS && e.noLOS > 2) path(1);
        else if (dist > 48) path(1);
        else if (!e.aim) { mx = -uz * e.strafeDir * 0.4; mz = ux * e.strafeDir * 0.4; sp = 0.6; }
      } else if (cfg.ai === 'bulwark') {
        e.timers.shield -= dt;
        if (e.timers.shield <= 0) {
          e.shieldUp = !e.shieldUp;
          e.timers.shield = e.shieldUp ? cfg.shield.up : cfg.shield.down;
          if (!e.shieldUp) { e.burstLeft = atk.burst.n; e.gapT = 0.25; }
        }
        if (e.shieldUp) {
          if (dist > atk.range[0] || !e.hasLOS) path(0.9);
        }
      } else {
        const [near, far] = atk.range;
        if (e.boss) {
          // bosses are too big for doorways: they walk straight at you and
          // sidestep when blocked
          if (dist > far || (!e.hasLOS && e.noLOS > 2)) { mx = ux; mz = uz; }
          else if (dist < near) { mx = -ux; mz = -uz; }
          mx += -uz * e.strafeDir * 0.7; mz += ux * e.strafeDir * 0.7;
        } else if ((!e.hasLOS && e.noLOS > 1.2) || dist > far) {
          path(1.1);
        } else {
          if (dist < near) { mx = -ux; mz = -uz; }
          mx += -uz * e.strafeDir * 0.8; mz += ux * e.strafeDir * 0.8;
          if (cfg.usesCover && e.state === 'engage' && e.hp < e.maxHp * 0.4 && (e.coverCd -= dt) <= 0) {
            const c = findCover(e);
            if (c) { e.state = 'cover'; e.cover = c; e.coverWait = 2.5; }
            else e.coverCd = 3;
          }
        }
      }
    }
    if (e.coverCd > 0) e.coverCd -= dt * 0.5;

    // unstick: if we want to move but aren't, sidestep for a moment
    const want = Math.hypot(mx, mz) > 0.1;
    const moved = Math.hypot(pos.x - e.lastPos.x, pos.z - e.lastPos.z);
    if (want && moved < cfg.speed * dt * 0.15) e.stuckT += dt; else e.stuckT = Math.max(0, e.stuckT - dt);
    e.lastPos.copy(pos);
    if (e.stuckT > 0.8) { e.stuckT = 0; e.unstick = 0.7; e.unstickDir = Math.random() < 0.5 ? -1 : 1; }
    if (e.unstick > 0) {
      e.unstick -= dt;
      const ox = mx;
      mx = -mz * e.unstickDir + mx * 0.3;
      mz = ox * e.unstickDir + mz * 0.3;
    }

    // ---------- integrate ----------
    const slow = e.boss ? 1 : (s.enemySlow || 1);
    const frenzy = state.run.mutator === 'frenzy' ? 1.3 : 1;
    let speed = cfg.speed * e.speedMult * sp * slow * frenzy;
    if (e.swingT > 0 || (e.aim && cfg.ai === 'sniper')) speed *= 0.35;
    if (cfg.ai === 'bulwark' && !e.shieldUp) speed = 0;
    const l = Math.hypot(mx, mz);
    const tx = l > 0.01 ? (mx / l) * speed : 0, tz = l > 0.01 ? (mz / l) * speed : 0;
    const acc = Math.min(1, dt * 8);
    e.vel.x += (tx - e.vel.x) * acc;
    e.vel.z += (tz - e.vel.z) * acc;
    if (stunned) { e.vel.x *= 0.8; e.vel.z *= 0.8; }
    moveBody(e, dt);

    // facing
    const faceX = faceMove && l > 0.01 ? mx : ux;
    const faceZ = faceMove && l > 0.01 ? mz : uz;
    const targetYaw = Math.atan2(faceX, faceZ) + Math.PI;
    let dyaw = targetYaw - e.yaw;
    dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    e.yaw += dyaw * Math.min(1, dt * (e.boss ? 4 : 9));
    e.rig.root.rotation.y = e.yaw;

    // ---------- attacks ----------
    let firing = false;
    if (!stunned && e.state !== 'cover') firing = attack(e, dt, dist, dy, ux, uz);

    // animate: local velocity for leg swing
    const cy = Math.cos(e.yaw), syaw = Math.sin(e.yaw);
    const fwd = (-e.vel.x * syaw - e.vel.z * cy) / Math.max(0.5, cfg.speed);
    const side = (e.vel.x * cy - e.vel.z * syaw) / Math.max(0.5, cfg.speed);
    const pitch = Math.atan2(pl.pos.y - 0.4 - (pos.y + e.height * 0.7), Math.max(1, dist));
    animateAndSync(e, dt, Math.hypot(e.vel.x, e.vel.z), fwd, side, pitch, firing);
  }

  function moveBody(e, dt) {
    const col = state.world.collision;
    const pos = e.pos;
    pos.x += e.vel.x * dt;
    pos.z += e.vel.z * dt;
    if (!e.cfg.fly) {
      col.collideXZ(pos, e.radius, pos.y, pos.y + Math.min(e.height, 2.2), STEP);
      // stay out of hazards (lava) unless knocked in
      for (const h of state.world.hazards) {
        if (h.active === false || pos.y > 0.4) continue;
        if (pos.x > h.minX - e.radius && pos.x < h.maxX + e.radius && pos.z > h.minZ - e.radius && pos.z < h.maxZ + e.radius) {
          const l = pos.x - h.minX + e.radius, r = h.maxX + e.radius - pos.x, b = pos.z - h.minZ + e.radius, f = h.maxZ + e.radius - pos.z;
          const m = Math.min(l, r, b, f);
          if (m === l) pos.x = h.minX - e.radius; else if (m === r) pos.x = h.maxX + e.radius;
          else if (m === b) pos.z = h.minZ - e.radius; else pos.z = h.maxZ + e.radius;
        }
      }
      e.vy -= GRAVITY * dt;
      pos.y += e.vy * dt;
      const support = col.groundHeight(pos.x, pos.z, e.radius * 0.5, pos.y, STEP);
      if (pos.y < support - 0.001 && e.vy <= 0.01) {
        pos.y = Math.min(support, pos.y + 12 * dt);
        e.vy = 0;
      } else if (e.vy <= 0 && pos.y <= support + 0.05) {
        pos.y = support;
        e.vy = 0;
      }
    }
    const b = state.world.bounds;
    pos.x = Math.max(b.minX + e.radius, Math.min(b.maxX - e.radius, pos.x));
    pos.z = Math.max(b.minZ + e.radius, Math.min(b.maxZ - e.radius, pos.z));
  }

  function animateAndSync(e, dt, speed, fwd, side, pitch = 0, firing = false) {
    e.flinchV -= e.flinch * 90 * dt + e.flinchV * 12 * dt;
    e.flinch += e.flinchV * dt;
    e.recoil = Math.max(0, e.recoil - dt * 8);
    e.swingT = Math.max(0, e.swingT - dt);
    e.rig.animate(dt, {
      speed, fwd, side, aimPitch: pitch, aiming: e.hasLOS || firing, firing,
      lean: Math.min(0.25, speed * 0.02) * (fwd > 0 ? 1 : -0.5), flinchX: e.flinch * 0.12,
      recoil: e.recoil, swing: e.swingT > 0 ? 1 - e.swingT / 0.35 : 0, shieldUp: e.shieldUp,
      dive: e.diving, crouch: e.state === 'cover' ? 1 : 0,
    });
    e.rig.root.updateMatrixWorld(true);
    for (const h of e.hitboxes) {
      _w.copy(h.src.off);
      h.src.node.localToWorld(_w);
      h.x = _w.x; h.y = _w.y; h.z = _w.z;
      h.r = h.src.r * (e.baseScale || 1);
    }
    if (e.shieldUp && e.rig.shieldBoxes && !e.shieldHB) {
      e.shieldHB = e.rig.shieldBoxes.map((s) => ({ x: 0, y: 0, z: 0, r: s.r, part: 'shield', src: s }));
      e.hitboxes.push(...e.shieldHB);
    }
    if (e.shieldHB) {
      for (const h of e.shieldHB) {
        if (!e.shieldUp) { h.r = 0; continue; }
        h.r = h.src.r;
      }
    }
    _w.copy(e.rig.center.off);
    e.rig.center.node.localToWorld(_w);
    e.center.copy(_w);
    e.bound.x = e.pos.x; e.bound.y = e.pos.y + e.height * 0.5; e.bound.z = e.pos.z;
    e.bound.r = e.height * 0.65 + e.radius + (e.shieldHB ? 1 : 0);
  }

  // ---------- attacks ----------
  function attack(e, dt, dist, dy, ux, uz) {
    const atk = e.atk;
    const pl = state.player;
    let firing = false;
    const dmg = (base) => Math.round(base * e.dmgMult);

    // hitscan bursts (with a short muzzle-glow telegraph)
    if (atk.burst && (e.cfg.ai !== 'bulwark' || !e.shieldUp)) {
      if (e.burstLeft > 0) {
        e.gapT -= dt;
        firing = true;
        if (e.gapT <= 0) {
          e.burstLeft--;
          e.gapT = atk.burst.gap / e.rate;
          const which = e.rig.muzzle2 && e.burstLeft % 2 ? 'muzzle2' : 'muzzle';
          muzzleWorld(e, _m, which);
          if (e.hasLOS) {
            aimDir(e, _m, _dir);
            const [a, b] = atk.burst.dmg;
            attacks.hitscan(e, _m, _dir, dmg(a + Math.random() * (b - a)), atk.burst.heavy ? 'heavy' : 'shot', atk.burst.heavy ? 0xffa030 : 0xff6a4a);
            bus.emit('sfx', { id: atk.burst.heavy ? 'enemy_heavy' : 'enemy_rifle', pos: _m, vol: e.boss ? 1 : 0.8 });
            e.recoil = 1;
          }
        }
      } else if (e.cfg.ai !== 'bulwark') {
        e.burstT -= dt;
        if (e.burstT <= 0.3 && e.burstT > 0 && e.hasLOS) e.rig.mats.glow.emissiveIntensity = 3.2 + (0.3 - e.burstT) * 12;
        if (e.burstT <= 0 && e.hasLOS && dist < 55) {
          const b = atk.burst;
          e.burstLeft = b.n;
          e.gapT = b.spinup ? 0.8 : 0;
          if (b.spinup) bus.emit('sfx', { id: 'laser_charge', pos: e.pos });
          e.burstT = rand(...b.interval) / e.rate;
          e.rig.mats.glow.emissiveIntensity = e.phase === 2 ? 5 : 3.2;
        } else if (e.burstT <= 0) e.burstT = 0.4;
      }
    }

    // sniper-style aimed shots (and the Apex laser)
    for (const key of ['aimed', 'laser']) {
      const a = atk[key];
      if (!a) continue;
      if (!e.aim || e.aim.key !== key) {
        if (e.aim) continue;
        e.timers[key] -= dt;
        if (e.timers[key] <= 0 && e.hasLOS && dist > 5) {
          e.aim = { key, t: 0, lock: null, lost: 0 };
          nextTimer(e, key);
          bus.emit('sfx', { id: key === 'laser' ? 'laser_charge' : 'sniper_charge', pos: e.pos });
        }
        continue;
      }
      const st = e.aim;
      st.t += dt;
      st.lost = e.hasLOS ? 0 : st.lost + dt;
      firing = true;
      muzzleWorld(e, _m);
      const tele = a.telegraph ?? 1.2;
      if (st.lost > 0.45) { e.aim = null; e.laser.visible = false; continue; }
      if (st.t >= tele - (a.lock ?? 0.3) && !st.lock) st.lock = new THREE.Vector3(pl.pos.x, pl.pos.y - 0.4, pl.pos.z);
      const target = st.lock || _t.set(pl.pos.x, pl.pos.y - 0.4, pl.pos.z);
      attacks.aimLaser(e.laser, _m, target, key === 'laser' ? 0.06 + st.t * 0.05 : 0.012, st.lock ? 0xff2222 : 0xffdd44);
      if (st.t >= tele) {
        _dir.copy(target).sub(_m).normalize();
        attacks.hitscan(e, _m, _dir, dmg(a.dmg), 'sniper', key === 'laser' ? 0xff3333 : 0xff4444);
        bus.emit('sfx', { id: key === 'laser' ? 'laser_fire' : 'sniper_fire', pos: _m });
        if (key === 'laser') bus.emit('fx:beam', { from: _m.clone(), to: target.clone(), color: 0xff3322, width: 3 });
        e.aim = null;
        e.laser.visible = false;
        e.recoil = 1;
      }
    }

    // melee (short wind-up so it can be dodged)
    if (atk.melee) {
      e.meleeCd -= dt;
      const reach = atk.melee.range + e.radius * 0.5;
      if (e.pendingSwing) {
        e.pendingSwing -= dt;
        if (e.pendingSwing <= 0) {
          e.pendingSwing = 0;
          const d2 = Math.hypot(pl.pos.x - e.pos.x, pl.pos.z - e.pos.z);
          if (d2 < reach * 1.2 && Math.abs(dy) < 1.4) {
            bus.emit('damage:player', { amount: dmg(atk.melee.dmg), kind: 'melee', from: e.center, source: e });
            const s = state.stats || {};
            if (s.thorns) bus.emit('damage:enemy', { enemy: e, amount: Math.max(50, Math.round(e.maxHp * 0.25)) * s.thorns, part: 'body', source: 'thorns', point: e.center, depth: 1 });
          }
        }
      } else if (e.meleeCd <= 0 && dist < reach && Math.abs(dy) < 1.4) {
        e.meleeCd = atk.melee.cd / e.rate;
        e.pendingSwing = 0.22;
        e.swingT = 0.35;
        bus.emit('sfx', { id: 'melee_swipe', pos: e.pos });
      }
    }

    // flamethrower
    if (atk.flame && e.hasLOS && dist < atk.flame.range + 1) {
      muzzleWorld(e, _m);
      _dir.set(ux, 0, uz);
      _dir.y = (pl.pos.y - 0.6 - _m.y) / Math.max(1, dist);
      _dir.normalize();
      attacks.flame(e, _m, _dir, { dps: atk.flame.dps * e.dmgMult, range: atk.flame.range }, dt);
      e.flameSfx = (e.flameSfx || 0) - dt;
      if (e.flameSfx <= 0) { e.flameSfx = 0.28; bus.emit('sfx', { id: 'flame', pos: _m, vol: 0.7 }); }
      firing = true;
    }

    // mortar globs
    if (atk.lob) {
      e.timers.lob -= dt;
      if (e.timers.lob <= 0 && dist < 34) {
        nextTimer(e, 'lob');
        muzzleWorld(e, _m);
        const feet = pl.pos.y - pl.eye;
        for (let i = 0; i < (atk.lob.n || 1); i++) {
          const off = i === 0 ? 0 : 3.5;
          const a = Math.random() * Math.PI * 2;
          const tx = pl.pos.x + pl.vel.x * 0.6 + Math.cos(a) * off, tz = pl.pos.z + pl.vel.z * 0.6 + Math.sin(a) * off;
          attacks.glob(e, _m, { x: tx, y: feet, z: tz }, { ...atk.lob, dmg: dmg(atk.lob.dmg), patchDps: atk.lob.patchDps * e.dmgMult });
        }
        e.recoil = 1;
      }
    }

    // orbs
    if (atk.orbs) {
      e.timers.orbs -= dt;
      if (e.timers.orbs <= 0 && e.hasLOS) {
        nextTimer(e, 'orbs');
        muzzleWorld(e, _m);
        _m.y += 0.4 * (e.boss ? 1 : 0);
        _dir.set(pl.pos.x, pl.pos.y - 0.5, pl.pos.z).sub(_m).normalize();
        const baseYaw = Math.atan2(_dir.x, _dir.z);
        const n = atk.orbs.n;
        for (let i = 0; i < n; i++) {
          const yaw = baseYaw + (i - (n - 1) / 2) * atk.orbs.spread;
          _v.set(Math.sin(yaw) * Math.sqrt(1 - _dir.y * _dir.y), _dir.y, Math.cos(yaw) * Math.sqrt(1 - _dir.y * _dir.y));
          attacks.orb(e, _m, _v, { speed: atk.orbs.speed, dmg: dmg(atk.orbs.dmg) });
        }
        bus.emit('sfx', { id: 'orb_volley', pos: _m });
      }
    }

    if (atk.missiles) {
      e.timers.missiles -= dt;
      if (e.timers.missiles <= 0) {
        nextTimer(e, 'missiles');
        for (let i = 0; i < atk.missiles.n; i++) {
          _m.set(e.pos.x, e.pos.y + e.height * 0.9, e.pos.z);
          attacks.missile(e, _m, { dmg: dmg(atk.missiles.dmg), radius: atk.missiles.radius });
        }
      }
    }

    if (atk.artillery) {
      e.timers.artillery -= dt;
      if (e.timers.artillery <= 0) {
        nextTimer(e, 'artillery');
        const feet = pl.pos.y - pl.eye;
        bus.emit('sfx', { id: 'artillery_warn', pos: pl.pos });
        for (let i = 0; i < atk.artillery.n; i++) {
          const r = i === 0 ? 0 : rand(3, 8);
          const a = Math.random() * Math.PI * 2;
          const x = pl.pos.x + pl.vel.x * 0.8 + Math.cos(a) * r, z = pl.pos.z + pl.vel.z * 0.8 + Math.sin(a) * r;
          const y = state.world.collision.groundHeight(x, z, 0.2, feet + 0.5, 0.6);
          attacks.strike(x, y, z, dmg(atk.artillery.dmg), atk.artillery.radius, atk.artillery.telegraph, e);
        }
      }
    }

    if (atk.shock) {
      e.timers.shock -= dt;
      if (e.windup > 0) {
        e.windup -= dt;
        e.rig.body.position.y = Math.sin((1 - e.windup / 0.6) * Math.PI) * 0.5;
        if (e.windup <= 0) {
          e.rig.body.position.y = 0;
          attacks.shockwave(e, { radius: atk.shock.radius, dmg: dmg(atk.shock.dmg) });
        }
      } else if (e.timers.shock <= 0 && dist < atk.shock.trigger && Math.abs(dy) < 2) {
        e.timers.shock = atk.shock.cd / e.rate;
        e.windup = 0.6;
        bus.emit('fx:ring', { pos: { x: e.pos.x, y: e.pos.y, z: e.pos.z }, radius: atk.shock.radius, color: 0xffaa44, life: 0.6 });
      }
    }

    if (atk.summon) {
      e.timers.summon -= dt;
      if (e.timers.summon <= 0) {
        e.timers.summon = atk.summon.cd / e.rate;
        const current = E.list.filter((o) => o.alive && o.minion).length;
        const room = atk.summon.max - current;
        for (let i = 0; i < Math.min(room, atk.summon.types.length); i++) {
          spawn({ type: atk.summon.types[i], at: e.pos, minion: true, hpMult: e.minionHp ?? 1, dmgMult: e.minionDmg ?? 1, accuracy: e.accuracy });
        }
        if (room > 0) bus.emit('sfx', { id: 'summon', pos: e.pos });
      }
    }

    if (atk.teleport) {
      e.timers.teleport -= dt;
      if (e.timers.teleport <= 0) {
        nextTimer(e, 'teleport');
        const nav = state.nav;
        const n = nav?.randomNear(pl.pos.x, pl.pos.z, atk.teleport.range[0], atk.teleport.range[1]);
        if (n >= 0) {
          bus.emit('fx:beam', { pos: { x: e.pos.x, y: e.pos.y, z: e.pos.z }, color: e.cfg.model.glow, height: 8 });
          nav.nodePos(n, _t);
          e.pos.set(_t.x, e.cfg.fly ? _t.y + (e.cfg.hover ?? 3) : _t.y, _t.z);
          bus.emit('fx:beam', { pos: { x: e.pos.x, y: _t.y, z: e.pos.z }, color: e.cfg.model.glow, height: 8 });
          bus.emit('sfx', { id: 'teleport', pos: e.pos });
        }
      }
    }

    if (atk.magnet) {
      e.timers.magnet -= dt;
      if (e.magnet) {
        e.magnet.t -= dt;
        if (e.magnet.t <= atk.magnet.pull && e.magnet.t > 0) {
          const d = Math.max(2, dist);
          bus.emit('player:velocity', { x: (-ux * atk.magnet.force * dt * 6) * Math.min(1, d / 6), y: 0, z: (-uz * atk.magnet.force * dt * 6) * Math.min(1, d / 6) });
          if (Math.random() < 0.5) bus.emit('fx:arc', { from: e.center, to: { x: pl.pos.x, y: pl.pos.y - 0.5, z: pl.pos.z }, color: 0x7fd8ff });
        }
        if (e.magnet.t <= 0) e.magnet = null;
      } else if (e.timers.magnet <= 0 && e.hasLOS && dist < 30) {
        nextTimer(e, 'magnet');
        e.magnet = { t: atk.magnet.telegraph + atk.magnet.pull };
        bus.emit('sfx', { id: 'laser_charge', pos: e.pos });
        bus.emit('hud:warn', { text: 'MAGNET — BREAK LINE OF SIGHT' });
      }
    }

    return firing;
  }

  // wasps: orbit high, then dive-bomb
  function updateWasp(e, dt, dist, stunned) {
    const pl = state.player;
    const pos = e.pos;
    e.timers.dive = (e.timers.dive ?? rand(2.5, 5)) - dt;
    e.orbit = (e.orbit ?? Math.random() * 6) + dt * 0.9 * e.strafeDir;
    if (stunned) {
      e.vel.multiplyScalar(0.9);
    } else if (e.diving) {
      _v.set(pl.pos.x - pos.x, pl.pos.y - 0.6 - pos.y, pl.pos.z - pos.z);
      const d = _v.length();
      _v.divideScalar(d).multiplyScalar(e.cfg.dive.speed * e.speedMult);
      e.vel.lerp(_v, Math.min(1, dt * 5));
      if (d < 1.4 || pos.y < 0.4 || e.diveT <= 0) {
        kill(e, { part: 'body', source: 'self' });
        return;
      }
      e.diveT -= dt;
    } else {
      const r = 10;
      const tx = pl.pos.x + Math.cos(e.orbit) * r, tz = pl.pos.z + Math.sin(e.orbit) * r;
      const ty = Math.max(pl.pos.y + 4, 6.5);
      _v.set(tx - pos.x, ty - pos.y, tz - pos.z);
      const d = _v.length();
      _v.divideScalar(d || 1).multiplyScalar(Math.min(e.cfg.speed * e.speedMult, d * 2));
      e.vel.lerp(_v, Math.min(1, dt * 3));
      if (e.timers.dive <= 0 && e.hasLOS && dist < 26) {
        e.diving = true;
        e.diveT = 3;
        bus.emit('sfx', { id: 'wasp_dive', pos });
      }
    }
    pos.addScaledVector(e.vel, dt);
    // don't fly through walls
    const col = state.world.collision;
    if (!e.diving) col.collideXZ(pos, e.radius, pos.y - 0.3, pos.y + 0.3, 0);
    const b = state.world.bounds;
    pos.x = Math.max(b.minX, Math.min(b.maxX, pos.x));
    pos.z = Math.max(b.minZ, Math.min(b.maxZ, pos.z));
    if (e.diving && !col.segmentClear(pos.x, pos.y, pos.z, pos.x + e.vel.x * dt * 2, pos.y + e.vel.y * dt * 2, pos.z + e.vel.z * dt * 2)) {
      kill(e, { part: 'body', source: 'self' });
      return;
    }
    e.yaw = Math.atan2(e.vel.x, e.vel.z) + Math.PI;
    e.rig.root.rotation.y = e.yaw;
    animateAndSync(e, dt, e.vel.length(), 1, 0, 0, false);
  }

  // menders: hover behind the pack and repair the most damaged ally
  function updateSupport(e, dt, dist, stunned) {
    const pl = state.player;
    const pos = e.pos;
    const heal = e.cfg.heal;
    let target = null, worst = 1;
    for (const o of E.list) {
      if (!o.alive || o === e || o.spawnT > 0) continue;
      const d = o.pos.distanceTo(pos);
      if (d > heal.range * 1.6) continue;
      const f = o.hp / o.maxHp;
      if (f < worst) { worst = f; target = o; }
    }
    // position: near the target (or the pack), away from the player
    let gx = pos.x, gz = pos.z;
    if (target) { gx = target.pos.x; gz = target.pos.z; }
    const ax = pos.x - pl.pos.x, az = pos.z - pl.pos.z;
    const al = Math.hypot(ax, az) || 1;
    gx += (ax / al) * 5;
    gz += (az / al) * 5;
    const gy = (target ? target.pos.y : 0) + 3.5;
    _v.set(gx - pos.x, gy - pos.y, gz - pos.z);
    const d = _v.length();
    if (dist < 12) _v.set(ax / al, 0.2, az / al).multiplyScalar(4);
    _v.divideScalar(Math.max(1, d)).multiplyScalar(stunned ? 0 : e.cfg.speed * e.speedMult);
    e.vel.lerp(_v, Math.min(1, dt * 2));
    pos.addScaledVector(e.vel, dt);
    state.world.collision.collideXZ(pos, e.radius, pos.y - 0.3, pos.y + 0.3, 0);
    if (target && !stunned && target.pos.distanceTo(pos) < heal.range) {
      target.hp = Math.min(target.maxHp, target.hp + target.maxHp * heal.rate * dt);
      e.beamT = (e.beamT || 0) - dt;
      if (e.beamT <= 0) {
        e.beamT = 0.08;
        bus.emit('fx:heal', { from: e.center, to: target.center });
      }
      e.healSfx = (e.healSfx || 0) - dt;
      if (e.healSfx <= 0) { e.healSfx = 0.9; bus.emit('sfx', { id: 'mender_beam', pos, vol: 0.5 }); }
    }
    const yawT = Math.atan2(pl.pos.x - pos.x, pl.pos.z - pos.z) + Math.PI;
    e.yaw += (Math.atan2(Math.sin(yawT - e.yaw), Math.cos(yawT - e.yaw))) * Math.min(1, dt * 5);
    e.rig.root.rotation.y = e.yaw;
    animateAndSync(e, dt, e.vel.length(), 0, 0, 0, false);
  }

  // ---------------- events ----------------
  bus.on('enemy:spawn', (o) => spawn(o));
  bus.on('damage:enemy', damage);
  bus.on('explode', (ex) => {
    if (ex.hurtsEnemies === false || !ex.damage) return;
    for (const e of E.list) {
      if (!e.alive || e === ex.exclude || e.untargetable) continue;
      const d = Math.hypot(e.center.x - ex.pos.x, e.center.y - ex.pos.y, e.center.z - ex.pos.z) - e.radius * 0.5;
      if (d > ex.radius) continue;
      const amt = Math.round(ex.damage * (1 - 0.6 * Math.max(0, d) / ex.radius));
      damage({ enemy: e, amount: amt, part: 'body', source: ex.source, point: e.center, depth: 1, dir: { x: e.center.x - ex.pos.x, y: 0.5, z: e.center.z - ex.pos.z } });
    }
  });
  bus.on('enemies:freeze', ({ duration, bossDuration }) => {
    for (const e of E.list) {
      if (!e.alive) continue;
      e.stun = Math.max(e.stun, e.boss ? bossDuration : duration);
      e.aim = null;
      if (e.laser) e.laser.visible = false;
      e.burstLeft = 0;
      restoreTint(e);
    }
  });
  bus.on('enemies:clear', clear);
  bus.on('run:start', clear);
  bus.on('arena:ready', clear);

  return {
    TYPES,
    spawn,
    kill: (e) => kill(e, { part: 'body', source: 'debug' }),
    update(dt) {
      if (!state.world) return;
      attacks.update(dt);
      let alive = 0;
      let boss = null;
      for (let i = 0; i < E.list.length; i++) {
        const e = E.list[i];
        if (!e.alive) continue;
        updateEnemy(e, dt);
        if (e.alive) {
          alive++;
          if (e.boss && (!boss || e.hp > boss.hp)) boss = e;
        }
      }
      E.alive = alive;
      E.boss = boss;
      // separation between ground enemies
      const L = E.list;
      for (let i = 0; i < L.length; i++) {
        const a = L[i];
        if (!a.alive || a.cfg.fly) continue;
        for (let j = i + 1; j < L.length; j++) {
          const b = L[j];
          if (!b.alive || b.cfg.fly || Math.abs(a.pos.y - b.pos.y) > 1.5) continue;
          const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
          const min = (a.radius + b.radius) * 0.9;
          const d2 = dx * dx + dz * dz;
          if (d2 < min * min && d2 > 1e-6) {
            const d = Math.sqrt(d2);
            const push = (min - d) * 0.5;
            const wa = a.boss ? 0.1 : b.boss ? 0.9 : 0.5;
            a.pos.x -= (dx / d) * push * 2 * wa;
            a.pos.z -= (dz / d) * push * 2 * wa;
            b.pos.x += (dx / d) * push * 2 * (1 - wa);
            b.pos.z += (dz / d) * push * 2 * (1 - wa);
          }
        }
      }
      // compact the list occasionally
      if (L.length > 60) {
        for (let i = L.length - 1; i >= 0; i--) if (!L[i].alive) { removeRig(L[i]); L.splice(i, 1); }
      }
      // debris physics
      const col = state.world.collision;
      for (let i = debris.length - 1; i >= 0; i--) {
        const d = debris[i];
        d.life -= dt;
        d.v.y -= 20 * dt;
        const p = d.mesh.position;
        p.addScaledVector(d.v, dt);
        const g = col.groundHeight(p.x, p.z, 0.05, p.y + 0.3, 0.3);
        if (p.y < g + 0.05) {
          p.y = g + 0.05;
          d.v.y *= -0.3;
          d.v.x *= 0.6;
          d.v.z *= 0.6;
          d.w.multiplyScalar(0.7);
        }
        d.mesh.rotation.x += d.w.x * dt;
        d.mesh.rotation.y += d.w.y * dt;
        d.mesh.rotation.z += d.w.z * dt;
        if (d.smoke && Math.random() < dt * 8) bus.emit('fx:smoke', { pos: p, size: 0.5 });
        if (d.life < 0.5) d.mesh.scale.multiplyScalar(Math.max(0.5, 1 - dt * 5));
        if (d.life <= 0) {
          root.remove(d.mesh);
          debris.splice(i, 1);
        }
      }
    },
  };
}
