import { createBus } from './core/bus.js';
import { createState } from './core/state.js';
import { createRng } from './core/rng.js';
import { createRender } from './slices/render/index.js';
import { createInput } from './slices/input/index.js';
import { createAudio } from './slices/audio/index.js';
import { createArenas } from './slices/arenas/index.js';
import { createNav } from './slices/nav/index.js';
import { createUpgrades } from './slices/upgrades/index.js';
import { createPlayer } from './slices/player/index.js';
import { createAbilities } from './slices/abilities/index.js';
import { createWeapons } from './slices/weapons/index.js';
import { createEnemies } from './slices/enemies/index.js';
import { createFx } from './slices/fx/index.js';
import { createPickups } from './slices/pickups/index.js';
import { createDrones } from './slices/drones/index.js';
import { createMech } from './slices/mech/index.js';
import { createShop } from './slices/shop/index.js';
import { createBounties } from './slices/bounties/index.js';
import { createWaves } from './slices/waves/index.js';
import { createHud } from './slices/hud/index.js';
import { createMenu } from './slices/menu/index.js';

// Composition root — the only file that knows every slice. Order matters
// for event handlers: the upgrades slice resets the stat block before the
// player reads it on run:start.

const state = createState();
const bus = createBus();
state.rng = createRng();

const render = createRender(state, bus);
const input = createInput(state, bus);
const audio = createAudio(state, bus);
const arenas = createArenas(state, bus);
const nav = createNav(state, bus);
const abilities = createAbilities(state, bus);
const upgrades = createUpgrades(state, bus);
const player = createPlayer(state, bus);
const weapons = createWeapons(state, bus);
const enemies = createEnemies(state, bus);
const fx = createFx(state, bus);
const pickups = createPickups(state, bus);
const drones = createDrones(state, bus);
const mech = createMech(state, bus);
const shop = createShop(state, bus);
const waves = createWaves(state, bus);
// after waves: bounty checks read the combo the director just updated
const bounties = createBounties(state, bus);
const hud = createHud(state, bus);
const menu = createMenu(state, bus, { lock: input.lock, unlock: input.unlock });

let last = performance.now();
let fpsAcc = 0, fpsN = 0;
state.fps = 60;

let loopErrors = 0;
function frame(now) {
  // never let one bad frame kill the loop: schedule first, report once
  requestAnimationFrame(frame);
  try {
    step(now);
  } catch (err) {
    if (loopErrors++ < 3) console.error('frame error', err);
  }
}

state.perf = { update: 0, render: 0 };
function step(now) {
  const tStart = performance.now();
  const realDt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  state.time += realDt;
  fpsAcc += realDt; fpsN++;
  if (fpsAcc > 0.5) { state.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
  const dt = realDt * state.timeScale;

  player.look();
  if (state.mode === 'playing') {
    upgrades.update(dt);
    player.update(dt);
    abilities.update(dt);
    mech.update(dt);
    weapons.update(dt);
    nav.update(dt);
    enemies.update(dt);
    pickups.update(dt);
    drones.update(dt);
    bounties.update(dt);
    waves.update(dt);
  } else if (state.mode === 'transition') {
    waves.update(dt);
  }
  arenas.update(dt);
  if (state.mode === 'menu') menu.updateCamera(realDt);
  else player.updateCamera(dt);
  fx.update(dt);
  hud.update(realDt);
  menu.update(realDt);
  audio.update(realDt);
  const tMid = performance.now();
  render.render(realDt);
  const tEnd = performance.now();
  // exponential averages of CPU time per part (ms) for the perf harness
  state.perf.update += (tMid - tStart - state.perf.update) * 0.1;
  state.perf.render += (tEnd - tMid - state.perf.render) * 0.1;
}

// build the first arena behind the boot screen, then start the loop
setTimeout(() => {
  arenas.load('outpost');
  document.getElementById('boot').classList.add('done');
  requestAnimationFrame((t) => { last = t; frame(t); });
}, 30);

// dev / test handle — local only
const DEV = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
if (DEV) {
  window.__game = {
    state, bus,
    slices: { render, input, audio, arenas, nav, abilities, upgrades, player, weapons, enemies, fx, pickups, drones, mech, shop, bounties, waves, hud, menu },
    debug: {
      start(difficulty = 'normal', operator = 'vanguard') {
        state.autopilot = true;
        state.settings.difficulty = difficulty;
        bus.emit('run:begin', { difficulty, operator });
        document.getElementById('menu').classList.add('hidden');
      },
      skipTo: (n) => waves.debug.skipTo(n),
      winWave: () => waves.debug.winWave(),
      scrap: (n) => bus.emit('scrap:add', { amount: n }),
      god(on = true) { state.debugGod = on; },
      give(id) {
        const card = state.codex.cards().find((c) => c.id === id);
        if (!card) return false;
        card.apply(state.stats);
        upgrades.owned.set(id, (upgrades.owned.get(id) || 0) + 1);
        bus.emit('build:changed', { owned: upgrades.owned, synergies: state.build.synergies });
        return true;
      },
      ability: (id, slot = 'Q') => bus.emit('ability:assign', { slot, id }),
      weapon: (id, slot = 1) => bus.emit('weapon:give', { id, slot }),
      spawn: (type, opts = {}) => enemies.spawn({ type, ...opts }),
    },
  };
}
