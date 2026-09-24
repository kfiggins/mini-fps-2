# Bus events

Every slice talks through `bus.emit(name, payload)` / `bus.on(name, fn)`.
This is the contract. Keep it current when adding an event.

## Run flow
| Event | Payload | Emitted by | Heard by |
|---|---|---|---|
| `run:begin` | `{ difficulty }` | menu, dev | waves |
| `run:start` | `{ difficulty }` | waves | (almost every slice resets) |
| `run:end` | `{ won, score, wave, difficulty, endless }` | waves | menu, bounties |
| `run:endless` | — | menu | waves |
| `act:transition` | `{ act, name, tagline }` | waves | menu |
| `act:start` | `{ act, name, tagline, first }` | waves | menu |
| `arena:load` | `{ id }` | waves, menu | arenas |
| `arena:ready` | `state.world` | arenas | nav, player, enemies, fx, pickups, drones, abilities, render |
| `wave:intermission` / `wave:start` / `wave:cleared` | `{ wave, boss, … }` | waves | bounties, player |
| `offer:open` / `offer:reroll` / `offer:picked` | `{ wave, boss, act }` / — / `{ id }` | waves / shop / upgrades | upgrades, shop / upgrades / waves, shop |
| `armory:open` / `armory:done` | — | waves / upgrades | upgrades, shop / waves, menu, shop |
| `mutator` | `{ id }` | waves | arenas |
| `resume` | — | waves | menu |

## Combat
| Event | Payload | Emitted by | Heard by |
|---|---|---|---|
| `enemy:spawn` | `{ type, hpMult, baseHpMult, dmgMult, accuracy, speedMult, elite?, minion?, at? }` | waves | enemies |
| `damage:enemy` | `{ enemy, amount, part, source, point, dir?, depth?, stagger?, result? }` | weapons, abilities, drones, mech, upgrades, arenas, enemies | enemies |
| `enemy:hit` | `{ enemy, amount, part, point, source }` | enemies | waves |
| `enemy:killed` | `{ enemy, type, pos, center, part, source, depth, boss, elite, minion, points, scrap }` | enemies | waves, upgrades, pickups, bounties, weapons, hud |
| `explode` | `{ pos, radius, damage, playerDamage?, hurtsPlayer, hurtsEnemies?, source, scale, color, exclude?, sourceEnemy? }` | weapons, abilities, mech, enemies, attacks | enemies, player, fx |
| `damage:player` | `{ amount, kind, from, source? }` | enemies, attacks, arenas, player | player |
| `player:hurt` | `{ amount, absorbed, kind, from, source }` | player, mech | hud, render, upgrades, bounties |
| `player:died` | — | player | waves |
| `shot:result` | `{ head, kill, dealt }` | weapons | hud |
| `shield:hit` | `{ amount, point }` | attacks | abilities |
| `enemies:freeze` / `enemies:clear` | `{ duration, bossDuration }` / — | abilities / waves, menu | enemies |

## Player & gear
`player:velocity {x,y,z,mode}`, `player:invuln {t}`, `player:landed {speed}`, `recoil {pitch,yaw}`,
`heal {amount, overfill}`, `secondwind:recharge`, `shop:buy {item}`, `scrap:add {amount}`, `scrap:spend {amount}`,
`pickup {type}`, `pickup:collect {item}`, `weapon:give {id, slot}`, `ability:assign {slot, id}`,
`build:changed {owned, synergies}`, `synergy {id, name, desc}`, `mech:enter profile`, `mech:exit {died}`, `mech:hurt {amount}`.

## Presentation
`sfx {id, pos?, vol?, pitch?, level?, surface?}` and `music {mood, act}` → audio ·
`fx:*` (burst, impact, tracer, beam, arc, heal, explosion, ring, jet, trail, flame, ember, smoke) → fx ·
`light`, `shake`, `hitstop`, `aberration`, `quality:changed` → render ·
`hud:banner|popup|feed|callout|killfeed|warn|scrapgain`, `fx:dmgnum` → hud ·
`key {code, repeat}`, `keyup {code}`, `wheel {dir}`, `input:unlocked` ← input · `audio:unlock` ← menu.
