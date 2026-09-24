import * as THREE from 'three';
import { GRAVITY, EYE_HEIGHT, PLAYER_RADIUS, STEP_HEIGHT } from '../../core/constants.js';

// Player slice: movement (ground accel + air control, coyote time, jump
// buffer, double jump, jetpack, jump pads), the camera transform, health,
// armor, regen, and the whole incoming-damage pipeline.
//
// Listens: arena:ready, run:start, key, recoil, player:velocity,
//          damage:player, explode, heal, shop:buy, mech:enter,
//          mech:exit, wave:cleared, player:invuln, secondwind:recharge
// Emits:   player:hurt, player:died, player:landed,
//          sfx, shake, fx:*, mech:hurt, hud:banner

const WALK = 7;
const SPRINT = 1.48;
const JUMP = 9;
const ACCEL_GROUND = 75;
const ACCEL_AIR = 22;
const FRICTION = 11;
const COYOTE = 0.11;
const JUMP_BUFFER = 0.14;
const LOOK = 0.0021;

export function createPlayer(state, bus) {
  const p = state.player;
  p.pos = new THREE.Vector3(0, EYE_HEIGHT, 0);
  p.vel = new THREE.Vector3();
  p.eye = EYE_HEIGHT;
  p.radius = PLAYER_RADIUS;
  let stepH = STEP_HEIGHT;
  let baseSpeed = WALK;
  let jumpSpeed = JUMP;
  let canSprint = true;

  let coyote = 0;
  let jumpBuffer = 0;
  let airJumps = 0;
  let wasOnGround = true;
  let fallSpeed = 0;
  let landDip = 0;
  let recoilPitch = 0;
  let recoilYaw = 0;
  let stepAcc = 0;
  let jetSfx = 0;
  let padCd = 0;
  let hazardCd = 0;
  let secondWindUsed = false;
  let heartbeat = 0;
  let bobT = 0;

  const vec = new THREE.Vector3();

  function reset() {
    const s = state.world?.playerSpawn || { x: 0, z: 0, yaw: 0 };
    p.pos.set(s.x, p.eye, s.z);
    p.vel.set(0, 0, 0);
    p.yaw = s.yaw;
    p.pitch = 0;
    p.onGround = true;
    p.alive = true;
    p.sinceHit = 99;
    p.invuln = 0;
  }

  function maxHealthFor() {
    const st = state.stats;
    const diff = state.run.difficulty;
    return Math.round((100 + (st?.maxHealthBonus || 0)) * (diff?.playerHp || 1));
  }

  bus.on('run:start', () => {
    p.jetpack = { owned: false, fuel: 0, maxFuel: 1.3, thrust: 38 };
    p.armor = 0;
    p.maxArmor = 100;
    p.inMech = false;
    secondWindUsed = false;
    p.maxHealth = maxHealthFor();
    p.health = p.maxHealth;
    reset();
  });
  bus.on('arena:ready', reset);
  bus.on('player:invuln', ({ t }) => { p.invuln = Math.max(p.invuln, t); });
  bus.on('secondwind:recharge', () => {
    if (secondWindUsed) bus.emit('hud:feed', { text: 'SECOND WIND RECHARGED', color: '#ffd36b' });
    secondWindUsed = false;
  });

  bus.on('key', ({ code, repeat }) => {
    if (state.mode !== 'playing' || repeat) return;
    if (code === 'Space') jumpBuffer = JUMP_BUFFER;
  });

  bus.on('recoil', ({ pitch = 0, yaw = 0 }) => {
    // part of the kick stays (you must pull down), part springs back
    p.pitch = Math.min(1.5, p.pitch + pitch * 0.45);
    p.yaw += yaw * 0.45;
    recoilPitch += pitch * 0.55;
    recoilYaw += yaw * 0.55;
  });

  bus.on('player:velocity', ({ x = 0, y = 0, z = 0, mode = 'add' }) => {
    if (state.stats?.noKnockback && mode !== 'set' && !p.inMech && y <= 6.5 && y > 0) return;
    if (mode === 'set') p.vel.set(x, y, z);
    else p.vel.x += x, p.vel.y += y, p.vel.z += z;
    if (y > 0) p.onGround = false;
  });

  bus.on('heal', ({ amount, overfill = false }) => {
    const cap = overfill && state.stats?.overshield ? p.maxHealth * 1.3 : p.maxHealth;
    if (p.health >= cap) return;
    p.health = Math.min(cap, p.health + amount);
  });

  bus.on('wave:cleared', () => {
    p.health = Math.max(p.health, p.maxHealth);
  });

  bus.on('shop:buy', ({ item }) => {
    const jp = p.jetpack;
    if (item === 'jetpack') { jp.owned = true; jp.fuel = jp.maxFuel; }
    if (item === 'jetFuel') jp.maxFuel += 0.65;
    if (item === 'jetThrust') jp.thrust += 7.5;
    if (item === 'armor') p.armor = Math.min(p.maxArmor, p.armor + 25);
  });

  bus.on('mech:enter', (profile) => {
    p.inMech = true;
    p.eye = profile.eye;
    p.radius = profile.radius;
    stepH = profile.step;
    baseSpeed = profile.speed;
    jumpSpeed = profile.jump;
    canSprint = false;
    p.pos.y += profile.eye - EYE_HEIGHT;
  });
  bus.on('mech:exit', () => {
    p.pos.y -= p.eye - EYE_HEIGHT;
    p.inMech = false;
    p.eye = EYE_HEIGHT;
    p.radius = PLAYER_RADIUS;
    stepH = STEP_HEIGHT;
    baseSpeed = WALK;
    jumpSpeed = JUMP;
    canSprint = true;
    p.invuln = Math.max(p.invuln, 1.5);
  });

  // ---- incoming damage: invuln → difficulty → mech → resist → armor → HP ----
  bus.on('damage:player', (d) => {
    if (!p.alive || state.mode !== 'playing') return;
    if (p.invuln > 0 || state.debugGod) return;
    const st = state.stats || {};
    const diff = state.run.difficulty || { enemyDmg: 1 };
    let amount = Math.max(1, Math.round(d.amount * diff.enemyDmg * (d.scale ?? 1)));
    if (p.inMech) {
      bus.emit('mech:hurt', { amount, kind: d.kind, from: d.from });
      bus.emit('shake', d.kind === 'blast' || d.kind === 'shock' ? 0.5 : 0.15);
      return;
    }
    if (d.kind === 'shock' && st.shockImmune) {
      bus.emit('hud:feed', { text: 'SLAM BLOCKED', color: '#9fe' });
      return;
    }
    amount = Math.max(1, Math.round(amount * (1 - (st.damageReduction || 0)) * (st.damageTakenMult || 1)));
    let absorbed = 0;
    if (p.armor > 0) {
      absorbed = Math.min(p.armor, amount);
      p.armor -= absorbed;
      amount -= absorbed;
      bus.emit('sfx', { id: p.armor <= 0 ? 'armor_break' : 'armor_hit' });
      if (p.armor <= 0) bus.emit('hud:feed', { text: 'ARMOR DESTROYED', color: '#8cf' });
    }
    p.sinceHit = 0;
    const heavy = d.kind === 'blast' || d.kind === 'shock' || d.kind === 'melee';
    bus.emit('shake', heavy ? 0.55 : 0.12 + (amount + absorbed) / 90);
    bus.emit('player:hurt', { amount, absorbed, kind: d.kind, from: d.from, source: d.source });
    if (amount <= 0) return;
    bus.emit('sfx', { id: amount >= 25 || heavy ? 'hurt_heavy' : 'hurt' });
    p.health -= amount;
    if (p.health <= 0) {
      if (st.secondWind && !secondWindUsed) {
        secondWindUsed = true;
        p.health = Math.round(p.maxHealth * 0.5);
        p.invuln = 2;
        bus.emit('hud:banner', { title: 'SECOND WIND', sub: 'DEATH REFUSED', color: '#ffd36b' });
        bus.emit('fx:explosion', { pos: p.pos.clone().setY(p.pos.y - 1), color: 0xffd36b, scale: 1.4, harmless: true });
        bus.emit('sfx', { id: 'boss_roar', vol: 0.6 });
        return;
      }
      p.health = 0;
      p.alive = false;
      bus.emit('sfx', { id: 'death' });
      bus.emit('player:died');
    }
  });

  bus.on('explode', (ex) => {
    if (!ex.hurtsPlayer || !p.alive) return;
    const dx = p.pos.x - ex.pos.x, dy = p.pos.y - 0.6 - ex.pos.y, dz = p.pos.z - ex.pos.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > ex.radius) return;
    const amt = (ex.playerDamage ?? ex.damage) * (1 - 0.5 * (d / ex.radius));
    bus.emit('damage:player', { amount: amt, kind: 'blast', from: ex.pos, source: ex.sourceEnemy || null });
  });

  function speedMult() {
    const st = state.stats || {};
    const ab = state.abilities || {};
    return (st.speedMult || 1) * (st.tempSpeed || 1) * (ab.overclock ? 1.2 : 1) *
      (1 - (state.weapons.ads || 0) * 0.35) * (state.run.difficulty?.playerSpeed || 1);
  }

  return {
    // camera + look happen every frame, even while paused menus are open
    look() {
      const inp = state.input;
      if (!inp) return;
      const sens = LOOK * state.settings.sensitivity * Math.max(0.25, state.fovScale || 1);
      if (state.mode === 'playing') {
        p.yaw -= inp.lookX * sens;
        p.pitch = Math.max(-1.55, Math.min(1.55, p.pitch - inp.lookY * sens));
      }
      // weapons read this frame's look delta for sway
      inp.frameLookX = inp.lookX;
      inp.frameLookY = inp.lookY;
      inp.lookX = 0;
      inp.lookY = 0;
    },

    update(dt) {
      if (!state.world) return;
      const col = state.world.collision;
      const keys = state.input?.keys || {};
      const st = state.stats || {};

      // max health tracks the build (growth heals by the difference)
      const newMax = maxHealthFor();
      if (newMax !== p.maxHealth) {
        if (newMax > p.maxHealth) p.health += newMax - p.maxHealth;
        p.maxHealth = newMax;
        p.health = Math.min(p.health, p.maxHealth * (st.overshield ? 1.3 : 1));
      }
      p.invuln = Math.max(0, p.invuln - dt);
      padCd = Math.max(0, padCd - dt);

      if (!p.alive) return;

      // ---- horizontal ----
      const iz = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
      const ix = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
      const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
      vec.set(-sy * iz + cy * ix, 0, -cy * iz - sy * ix);
      if (vec.lengthSq() > 1) vec.normalize();
      p.sprinting = canSprint && !!(keys.ShiftLeft || keys.ShiftRight) && iz > 0 && !(state.weapons.ads > 0.5);
      const speed = baseSpeed * (p.sprinting ? SPRINT : 1) * speedMult();
      const wishX = vec.x * speed, wishZ = vec.z * speed;
      const accel = p.onGround ? ACCEL_GROUND : ACCEL_AIR;
      // accelerate toward the wish velocity, friction when no input on ground
      let dvx = wishX - p.vel.x, dvz = wishZ - p.vel.z;
      const dl = Math.hypot(dvx, dvz);
      const maxDv = (p.onGround && vec.lengthSq() < 0.01 ? FRICTION * speed + 20 : accel) * dt;
      if (dl > maxDv) { dvx *= maxDv / dl; dvz *= maxDv / dl; }
      // in the air, don't bleed off momentum you gained from launches
      if (!p.onGround && vec.lengthSq() < 0.01) { dvx = 0; dvz = 0; }
      if (!p.onGround) {
        const hs = Math.hypot(p.vel.x, p.vel.z);
        if (hs > speed) {
          // above run speed (grapple/pads): air input steers but can't add
          p.vel.x += dvx; p.vel.z += dvz;
          const ns = Math.hypot(p.vel.x, p.vel.z);
          if (ns > hs) { p.vel.x *= hs / ns; p.vel.z *= hs / ns; }
          dvx = dvz = 0;
          // gentle drag toward normal speeds
          p.vel.x *= 1 - dt * 0.25;
          p.vel.z *= 1 - dt * 0.25;
        }
      }
      p.vel.x += dvx;
      p.vel.z += dvz;
      p.moving = Math.hypot(p.vel.x, p.vel.z) > 1;

      const feet0 = p.pos.y - p.eye;
      p.pos.x += p.vel.x * dt;
      p.pos.z += p.vel.z * dt;
      col.collideXZ(p.pos, p.radius, feet0, feet0 + p.eye + 0.15, stepH);
      const b = state.world.bounds;
      p.pos.x = Math.max(b.minX + p.radius, Math.min(b.maxX - p.radius, p.pos.x));
      p.pos.z = Math.max(b.minZ + p.radius, Math.min(b.maxZ - p.radius, p.pos.z));

      // ---- vertical ----
      coyote = p.onGround ? COYOTE : coyote - dt;
      jumpBuffer -= dt;
      if (jumpBuffer > 0) {
        if (coyote > 0) {
          p.vel.y = jumpSpeed * Math.sqrt(st.jumpMult || 1);
          p.onGround = false;
          coyote = 0;
          jumpBuffer = 0;
          bus.emit('sfx', { id: 'jump', vol: 0.5 });
        } else if (st.doubleJump && airJumps < st.doubleJump && !p.inMech) {
          p.vel.y = jumpSpeed * 0.95;
          airJumps++;
          jumpBuffer = 0;
          bus.emit('sfx', { id: 'double_jump' });
          bus.emit('fx:burst', { pos: { x: p.pos.x, y: p.pos.y - p.eye, z: p.pos.z }, color: 0x9fd8ff, count: 14, speed: 3, life: 0.35 });
        }
      }
      // jetpack: hold Space while airborne and falling or after the jump apex
      const jp = p.jetpack;
      p.jetting = false;
      if (jp?.owned && keys.Space && !p.onGround && jp.fuel > 0 && coyote <= 0 && !p.inMech) {
        p.vel.y = Math.min(p.vel.y + jp.thrust * dt, 10);
        jp.fuel = Math.max(0, jp.fuel - dt);
        p.jetting = true;
        jetSfx -= dt;
        if (jetSfx <= 0) {
          jetSfx = 0.11;
          bus.emit('sfx', { id: 'jetpack', vol: 0.7 });
          bus.emit('fx:jet', { pos: { x: p.pos.x, y: p.pos.y - p.eye + 0.3, z: p.pos.z } });
        }
      }
      if (jp?.owned && p.onGround) jp.fuel = Math.min(jp.maxFuel, jp.fuel + (jp.maxFuel / 2.2) * dt);

      p.vel.y -= GRAVITY * (state.run.mutator === 'lowgrav' ? 0.45 : 1) * dt;
      p.pos.y += p.vel.y * dt;
      if (p.vel.y < 0) fallSpeed = Math.max(fallSpeed, -p.vel.y);

      // ceiling
      if (p.vel.y > 0) {
        const head = p.pos.y + 0.15;
        const ceil = col.ceiling(p.pos.x, p.pos.z, p.radius * 0.6, head - p.vel.y * dt - 0.2, head);
        if (ceil !== Infinity) {
          p.pos.y = ceil - 0.16;
          p.vel.y = 0;
        }
      }

      const feet = p.pos.y - p.eye;
      const support = col.groundHeight(p.pos.x, p.pos.z, p.radius * 0.6, feet, stepH);
      if (feet < support - 0.001 && p.vel.y <= 0.01) {
        // walking up a step: glide up instead of snapping
        p.pos.y = Math.min(support + p.eye, p.pos.y + 16 * dt);
        if (p.pos.y >= support + p.eye - 0.001) p.pos.y = support + p.eye;
        p.vel.y = 0;
        p.onGround = true;
      } else if (p.vel.y <= 0 && feet <= support + 0.06) {
        p.pos.y = support + p.eye;
        p.vel.y = 0;
        p.onGround = true;
      } else {
        p.onGround = false;
      }
      if (p.onGround) {
        airJumps = 0;
        if (!wasOnGround && fallSpeed > 4) {
          landDip = Math.min(0.28, fallSpeed * 0.018);
          bus.emit('sfx', { id: 'land', vol: Math.min(1, fallSpeed / 14) });
          bus.emit('player:landed', { speed: fallSpeed });
          if (fallSpeed > 13) bus.emit('shake', Math.min(0.4, fallSpeed / 60));
        }
        fallSpeed = 0;
      }
      wasOnGround = p.onGround;
      p.airborne = !p.onGround;

      // jump pads
      if (p.onGround && padCd <= 0) {
        for (const pad of state.world.jumpPads) {
          if (Math.hypot(p.pos.x - pad.x, p.pos.z - pad.z) < pad.r && Math.abs(feet - (pad.y ?? 0)) < 0.4) {
            p.vel.set(pad.vx, pad.vy, pad.vz);
            p.onGround = false;
            padCd = 0.6;
            bus.emit('sfx', { id: 'jump_pad' });
            bus.emit('fx:burst', { pos: { x: pad.x, y: (pad.y ?? 0) + 0.2, z: pad.z }, color: pad.color ?? 0x44ddff, count: 26, speed: 6, life: 0.5 });
            break;
          }
        }
      }

      // molten / electrified floors
      hazardCd -= dt;
      if (hazardCd <= 0 && feet < 0.4 && !p.inMech) {
        for (const h of state.world.hazards) {
          if (h.active === false) continue;
          if (p.pos.x > h.minX && p.pos.x < h.maxX && p.pos.z > h.minZ && p.pos.z < h.maxZ) {
            hazardCd = 0.3;
            bus.emit('damage:player', { amount: h.dps * 0.3, kind: 'burn', from: null });
            bus.emit('sfx', { id: 'lava_sizzle', vol: 0.6 });
            break;
          }
        }
      }

      // regen
      p.sinceHit += dt;
      const diff = state.run.difficulty || { regenDelay: 1, regenRate: 1 };
      const delay = (st.regenDelay ?? 5) * diff.regenDelay;
      if (p.sinceHit > delay && p.health < p.maxHealth && !st.regenDisabled) {
        p.health = Math.min(p.maxHealth, p.health + (st.regenRate ?? 8) * diff.regenRate * dt);
      }

      // footsteps
      const hs = Math.hypot(p.vel.x, p.vel.z);
      if (p.onGround && hs > 1.5 && !p.inMech) {
        stepAcc += dt * hs;
        if (stepAcc > (p.sprinting ? 3.4 : 2.7)) {
          stepAcc = 0;
          bus.emit('sfx', { id: 'footstep', surface: state.world.surfaceAt(p.pos.x, feet, p.pos.z), vol: p.sprinting ? 0.8 : 0.55 });
        }
      }

      // heartbeat at low health
      if (!p.inMech && p.health < p.maxHealth * 0.3) {
        heartbeat -= dt;
        if (heartbeat <= 0) {
          heartbeat = 0.9;
          bus.emit('sfx', { id: 'heartbeat' });
        }
      }
    },

    // camera transform (after everything that moves the player)
    updateCamera(dt) {
      const cam = state.camera;
      landDip = Math.max(0, landDip - dt * 1.2);
      recoilPitch *= Math.exp(-dt * 12);
      recoilYaw *= Math.exp(-dt * 12);
      const hs = p.onGround ? Math.hypot(p.vel.x, p.vel.z) : 0;
      bobT += dt * hs * 1.25;
      const bob = Math.sin(bobT) * 0.035 * Math.min(1, hs / 7) * (1 - (state.weapons.ads || 0));
      cam.position.set(p.pos.x, p.pos.y - landDip * Math.sin(Math.min(1, landDip * 6) * Math.PI) - Math.abs(bob) * 0.8, p.pos.z);
      cam.rotation.set(p.pitch + recoilPitch, p.yaw + recoilYaw, Math.sin(bobT * 0.5) * 0.004 * Math.min(1, hs / 7));
      state.player.bob = bobT;
    },
  };
}
