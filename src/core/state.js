// The shared state shape. Slices publish their fields here and read other
// slices' fields — data coupling, never imports. Each field notes its owner
// (the only slice that writes it).

export function createState() {
  return {
    // ---- composition root ----
    mode: 'menu', // menu | playing | paused | offer | transition | over
    time: 0, // seconds since boot (unscaled)
    timeScale: 1, // hit-stop / slow-mo (render owns decay)
    rng: null, // core/rng instance for this run

    // ---- menu (settings persisted to localStorage) ----
    settings: {
      sensitivity: 1,
      fov: 78,
      quality: 'high', // low | medium | high
      qualityAuto: true, // until the player picks one, drop quality if fps is low
      volume: { master: 0.8, sfx: 0.9, music: 0.55 },
      damageNumbers: true,
      difficulty: 'normal', // easy | normal | overdrive
      operator: 'vanguard', // starting kit (waves/defs OPERATORS)
    },

    // ---- render ----
    scene: null, // THREE.Scene (world)
    camera: null, // THREE.PerspectiveCamera — the player's eyes
    viewScene: null, // THREE.Scene for the first-person viewmodel
    viewCamera: null,
    shake: 0, // trauma 0..1 (anyone may add; render decays it)
    flashLights: null, // pooled point lights: { spawn(pos, color, intensity, dist, life) }

    // ---- arenas ----
    world: null, // { collision: CollisionWorld, name, spawnPoints, playerSpawn,
    //             hazards[], jumpPads[], bounds, env, surfaceAt(x,y,z) }

    // ---- nav ----
    nav: null, // { next(pos, out) -> bool, costAt(pos), reachable(pos) }

    // ---- player ----
    player: {
      pos: null, // THREE.Vector3 (eye position; camera follows)
      vel: null,
      yaw: 0, pitch: 0,
      eye: 1.7, radius: 0.42,
      health: 100, maxHealth: 100, armor: 0, maxArmor: 100,
      onGround: true, alive: true, invuln: 0, sinceHit: 99,
      sprinting: false, moving: false, airborne: false,
      jetpack: { owned: false, fuel: 0, maxFuel: 1.3, thrust: 38 },
      inMech: false,
    },

    // ---- weapons ----
    weapons: {
      slots: ['rifle', 'marksman'], current: 'rifle',
      ammo: {}, mag: 0, reloading: false, ads: 0, grenades: 1, grenadeCharge: -1,
    },

    // ---- upgrades (the run's stat block; everyone reads, only upgrades writes) ----
    stats: null,
    build: null, // { owned: Map<id,count>, synergies: Set<id>, abilities: {Q,E} }

    // ---- enemies ----
    enemies: { list: [], boss: null, alive: 0, queued: 0 },

    // ---- waves (run director) ----
    run: {
      act: 1, wave: 0, waveState: 'idle', // idle | intermission | active | cleared
      countdown: 0, score: 0, scrap: 0, kills: 0,
      combo: 1, comboTimer: 0, comboChain: 0,
      mutator: null, bounty: null,
      intensity: 0, // 0..1 combat intensity (music reads this)
      stats: null, // end-of-run statistics
      difficulty: null, // resolved difficulty table for this run
    },
  };
}
