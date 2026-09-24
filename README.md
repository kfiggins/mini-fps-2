# Mini FPS 2

A roguelike arena shooter in the browser, and the sequel to
[mini-fps](https://github.com/kfiggins/fable-fps-test). You fight through three
acts of robot waves across three hand-built arenas, building an absurd loadout
from upgrade cards, synergies, drones, a jetpack and a 1000-scrap mech.

**Play it:** https://kfiggins.github.io/mini-fps-2/

```sh
npm install
npm run dev        # http://localhost:5190
npm test           # collision, nav graph and audio contract tests
npm run build
```

## The run

- **3 acts × 10 waves.** Wave 5 of every act is a mini-boss and wave 10 is the
  act boss. Every boss has a second phase that exposes a glowing core, which
  takes double damage.
- **Act 1 — Dust Outpost.** A desert base at golden hour: a two-storey command
  post, timber watchtowers, a container yard with a sniper perch, a trench line
  and a crashed helicopter.
- **Act 2 — The Refinery.** An industrial yard at dusk. A crane deck sits in the
  centre, and a molten channel with bridges crosses the map. The tank farm has
  7m catwalks, and an 8.5m gantry is reached by jump pads.
- **Act 3 — Reactor Core.** A neon facility at night, with a ring catwalk around
  a live reactor. **The Pulse:** the reactor charges and then sweeps the floor
  with a shockwave. Get up high or jump it, and try to catch robots in it.
- **Operators:** starting kits unlocked by progress:
  - Vanguard: rifle + marksman
  - Breacher: scattergun + rifle, armor (reach Act 2)
  - Ghost: Arc SMG + marksman, Rocket Boots (reach Act 3)
  - Engineer: rifle + launcher, a drone, scrap (win a run)
- **Endless:** after a victory, keep going. The arenas repeat in rotation and
  every rotation adds more robots.
- **Difficulties:**
  - **Easy** is for kids and new recruits: more HP, weaker robots, fewer
    spawns and more scrap.
  - **Normal** is the real game.
  - **Overdrive** unlocks after a Normal win.

## Builds

- **Cards:** after each wave you pick 1 card (common, uncommon, rare or
  legendary). The odds get better every wave, and boss rewards guarantee a
  legendary.
- **Synergies:** 17 named card pairs unlock bonus powers, for example Vampire
  Rounds + Berserker = BLOODLUST. A card that would complete a synergy is
  highlighted on the offer screen.
- **Cursed cards:** a big upside with a real cost, such as Glass Cannon or
  Blood Pact.
- **Armory:** between acts you can swap in the Scattergun, Arc SMG, Rail Lancer
  or Launcher. Each gun has its own upgrade cards.
- **Abilities (Q/E):** Grapple Claw, Blink Dash, Bubble Shield, Homing Missile,
  Hologram Decoy, Stasis Nova, Sweep Laser, Overclock and Healing Field.
- **Scrap shop:** rerolls, armor, grenades, combat drones (with upgrades), a
  scrap collector, the jetpack and the **MECH**.
- **Bounties:** optional challenges each wave for bonus scrap.

### Weapon balance

- **All-rounder:** the rifle.
- **Niche specialists** (each wins its niche outright):
  - Marksman: 3× headshots, pierces a target, bonus damage to elites and bosses
  - Scattergun: close range, stagger
  - Arc SMG: hits arc to nearby enemies
  - Rail Lancer: pierces everything
  - Launcher: splash
- **Proc effects scale with hit damage.** Explosive rounds, ricochet and arcs
  deal a share of the triggering hit, so a fast-firing gun gets no free
  advantage.
- **Holstered guns reload themselves,** so swapping is faster than reloading.

## Controls

| Input | Action |
| --- | --- |
| Mouse / left click / right click | Aim / fire (hold) / aim down sights |
| WASD, Shift | Move, sprint |
| Space | Jump · double jump (Rocket Boots) · hold in the air to use the jetpack |
| R · 1 / 2 / wheel | Reload · swap weapons |
| G (hold) | Charge and throw a grenade |
| Q / E | Abilities (or mech weapons) |
| Esc | Pause |

## How it's built

The code is organised as **vertical slices** under `src/slices/`. Each slice
owns its logic, visuals, UI and styles, and slices never import each other.
They communicate through a synchronous event bus and a shared state object
(`src/core/`). `src/main.js` is the composition root and the only file that
knows every slice.

| Slice | What it owns |
| --- | --- |
| `render` | WebGL renderer; post chain (ACES, GTAO, bloom, grade/vignette/damage); quality presets; pooled lights; shake; hit-stop |
| `arenas` | Procedural PBR textures, chamfered level kit, sky/env maps, the three arenas, the reactor pulse |
| `nav` | Nav graph auto-generated from collision (floors, stairs, drops, jump-pad links) plus a flow field toward the player |
| `player` / `input` | Movement (acceleration, coyote time, jump buffer, double jump, jetpack, pads), damage pipeline |
| `weapons` | 6 guns, hitscan vs hitboxes, procs, grenades, viewmodels with procedural animation |
| `enemies` | 9 robot types + 6 bosses, AI, every attack pattern, elites, debris deaths |
| `upgrades` | Stat block, cards, synergies, cursed cards, Armory, on-kill effects |
| `waves` | Run director: acts, waves, scaling, elites, mutators, score/combo, scrap wallet |
| `abilities` `drones` `mech` `shop` `pickups` `bounties` | What the names say |
| `fx` | GPU particles, tracers, beams, arcs, decals, explosions |
| `audio` | Fully synthesized SFX (spatial) and adaptive procedural music per act |
| `hud` `menu` | All DOM UI |

There are no asset files: every texture, model, sound and song is generated in
code.

### Tools

- `node tools/playtest.mjs shots <arena>`: screenshots from preset cameras
  (`tools/cams.json`).
- `node tools/playtest.mjs nav <arena>`: nav audit. Renders a top-down
  reachability map and lists any walkable area enemies can't reach.
- `node tools/playtest.mjs run 60 normal [god]`: an autopilot soak test.
- `node tools/playtest.mjs flow`: offers → shop → boss → armory → act
  transition → death.
- `node tools/playtest.mjs vm | enemies`: viewmodel and robot lineups.
- `node tools/ai-reach.mjs`: can robots reach the player on every high point?
- `node tools/balance.mjs`: wave HP compared with v1's Arena waves.
- `/audio-lab.html` (dev server): play every sound and music mood.

On localhost, `window.__game` exposes state, the bus and debug helpers
(`debug.start()`, `skipTo(n)`, `give(cardId)`, `ability(id)`, `weapon(id)`,
`god()`, `scrap(n)`).
