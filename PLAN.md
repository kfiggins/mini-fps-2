# Mini FPS 2 — design plan

Fresh rebuild of `../mini-fps`. v1 stays untouched. We carry over v1's ideas and
balance numbers, not its code.

## Key decisions

- **Platform: web (Three.js + Vite) on GitHub Pages.** Kids can play in one
  click, deploys work the way they do now, and the game can be play-tested and
  screenshotted in headless Chrome. Godot/Unity would raise the graphics ceiling,
  but the v1 → v2 gap is art direction and rendering setup, not the engine.
- **Enemy pathfinding is generated from level geometry automatically.** v1
  used hand-placed routes (`routeFor`), which is why the Foundry broke: every
  ledge needed its own route. v2 builds a multi-level navigation grid from the
  collision geometry, adds explicit links (drops, jump pads), and refreshes a
  flow field toward the player a few times a second. Enemies can then reach
  any spot the player can, whatever the layout. Arena builds fail a check if any
  walkable area can't be reached from an enemy spawn.
- **Vertical-slice architecture.** A tiny `core/` (state shape, constants, RNG,
  event bus, collision rules). Feature slices own their data, logic, visuals and
  tests, talk to each other through events and published state, and never import
  each other. There is one composition root.
- **Enemies are robots.** This keeps the game kid-friendly (sparks and scrap
  instead of gore) and explains why scrap is the currency.

## Run structure

A run is **3 acts × 10 waves = 30 waves, each act in a different arena.** Wave 5
of each act has a mini-boss and wave 10 has the act boss. Between acts there's a
transition moment with a full heal and an **Armory** pick. This replaces "beat
map 1 to unlock map 2": every run visits all three arenas.

Difficulties:
- **Easy (kids):** keeps v1's easy tuning, including more HP, weaker enemies,
  fewer spawns and extra scrap.
- **Normal:** the real game. It stays hard enough that only strong builds win.
- **Overdrive:** unlocks after a Normal win. Stacking modifiers for replays.

## Arenas (three)

1. **Dust Outpost (act 1).** Sunny desert military outpost: a central 2-story
   command post with ramps, two watchtowers, a trench line and clear sightlines.
2. **The Refinery (act 2).** Dusk and industrial. Lava stays in clearly glowing
   channels, catwalks are reached by ramps and jump pads, and a gantry crane
   runs overhead. No more than two raised levels.
3. **Reactor Core (act 3).** Night and neon: a ring arena around a reactor that
   pulses periodically with a warning first, plus bridges and jump pads.

Rules for every arena:
- Enemies can reach anywhere the player can (checked automatically).
- At least three routes up to each high point.
- Readable silhouettes and lighting.

## Combat

- **Weapons:** rifle and marksman keep their v1 numbers and feel, including
  sights and scope.
- **Weapon feel:** recoil, a springy first-person gun model with hands, reload
  animations, shell casings, bullet-hole decals, headshot sound, optional damage
  numbers, and indicators showing which direction damage came from.
- **Armory weapons** (offered between acts and on rare cards):
  - Scattergun
  - Arc SMG (hits chain between enemies)
  - Rail Lancer (charged shot that pierces)
  - Launcher

  Each Armory weapon has its own upgrade cards.
- **Regular enemies:** v1 roles plus two new ones:
  - grunt, rusher, tank, sniper and wasp return
  - **Bulwark** (front shield, so you flank it)
  - **Mender** (repairs other enemies; kill it first)
- **Bosses:** 3 mini-bosses and 3 act bosses, each with two phases and clear
  warning signs before big attacks. Their attacks draw on v1's Warden, Titan,
  Butcher, Overlord, Phantom and Apex.
- **Elite modifiers** with visible auras: shielded, volatile, hasted, vampiric,
  splitting.

## Roguelike layer

- **Upgrade cards:** the four tiers and v1's upgrade pool are ported over and
  rebalanced. Cards show exact numbers and how many you already own.
- **Synergies (new):** owning certain card pairs unlocks a named bonus. Example:
  Vampire + Berserker = *Bloodlust*. About 12 of them. A card is marked when it
  would complete one, and the codex tracks the ones you've discovered. This is
  aimed at the "insane builds" fun.
- **Bounties (new):** an optional challenge before each wave, such as
  headshots only, no damage taken or a time limit. Completing it pays bonus
  scrap or a free reroll.
- **Cursed cards (new):** a big power with a real drawback, for example Glass
  Cannon.
- **Armory (new):** swap in new weapons between acts.
- **Kept from v1:** scrap shop, drones and collector, jetpack, armor, mech, and
  Q/E abilities.
- **Maybe later:** Operators, i.e. alternate starting kits unlocked by
  milestones.

## Graphics

- **Lighting and rendering:**
  - Filmic tone mapping and environment lighting, so metal looks like metal
  - High-resolution shadows that follow the player
  - Glow on bright parts (bloom), ambient occlusion and atmospheric fog
- **Level art:**
  - Procedural textures (concrete, painted metal, hazard stripes, sand, rust)
    that stay sharp at any size
  - Rounded edges instead of plain boxes
  - Props: barrels, sandbags, lights, cables and antennas
  - Scorch-mark decals and lots of particle effects
- **Robot enemies:**
  - Built from many parts, with walk cycles and aiming
  - Flinch, stagger and break apart on death
  - Glowing eyes
- **Settings:** Low/Med/High quality presets.

## Audio

- **Weapons:** layered synthesized gunshots with reverb, so they have punch and
  a tail.
- **Positional sound:** 3D-positioned enemy sounds, and footsteps that change
  with the surface.
- **Adaptive music:** calm, combat and boss layers that shift with the action.
- **Menus:** volume sliders for master, SFX and music.

## UI

- New HUD.
- Menu with settings for sensitivity, FOV, volume and quality.
- Codex and an end-of-run summary.

## Testing

- **Headless Chrome play-test harness:** screenshots of each arena, scripted
  play sessions, and error checks.
- **Navigation checks:** confirm every walkable area can be reached.
- **Balance simulation:** estimate clear times and damage per second for
  sample builds.

## Build order

1. **Foundations.** Skeleton, renderer and quality settings, Dust Outpost
   blockout, player movement, pathfinding, and the rifle and marksman with full
   gun feel.
2. **Act 1 playable.** Robot enemies with animation, waves, upgrade cards and
   the shop.
3. **Act 1 polish.** Art, audio and music pass on act 1.
4. **Full run.** The Refinery and Reactor Core, all bosses, and act
   transitions.
5. **New systems.** Synergies, bounties, Armory and cursed cards; Easy mode
   tuning and a balance pass.
6. **Ship.** Polish, README, deploy.
