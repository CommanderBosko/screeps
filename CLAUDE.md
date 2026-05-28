# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a [Screeps](https://store.screeps.com/) AI bot written in plain JavaScript competing on the MMO server. Screeps is a programming game where you write code to control units ("creeps") that mine resources, build structures, and compete against other players.

## Screeps Game Concepts

- **Creeps**: Units you control via code. Each has a body made of parts (WORK, CARRY, MOVE, ATTACK, etc.)
- **Room**: A grid-based game area. You start with a single room and expand by claiming controllers
- **RCL (Room Controller Level)**: 1–8, gates which structures you can build and how many
- **Energy**: Primary resource. Mined from sources, used to spawn creeps and build/repair structures
- **Spawn**: Structure that creates creeps. Each creep costs energy based on its body parts
- **Game loop**: `main.js` `module.exports.loop` runs every game tick (~1 second real-time on MMO)
- **CPU limit**: Each tick you have a CPU budget (~20 CPU). Exceeding it kills your script

## Setup

No build step — plain JS files are uploaded directly to the Screeps server. Node.js is available on NixOS via `nix-shell -p nodejs`.

`.screeps.json` holds the auth token and server config — it is **gitignored**. The `main` key targets the MMO server.

```bash
nix-shell -p nodejs   # enter Node environment (NixOS)
node push.js          # upload all src/*.js to the server
npm run push          # same, via npm alias
```

`push.js` reads all `.js` files from `src/`, names each module after the filename (without extension), and POSTs them to the Screeps API under the `default` branch.

## Architecture

Six modules, each uploaded as a separate Screeps code module:

| File | Screeps module | Purpose |
|------|----------------|---------|
| `main.js` | `main` | Game loop: memory cleanup → spawn → roles → towers |
| `role.harvester.js` | `role.harvester` | Mine energy, deliver to spawn/extensions/towers/containers (priority order) |
| `role.upgrader.js` | `role.upgrader` | Mine energy, upgrade room controller |
| `role.builder.js` | `role.builder` | Mine energy, build construction sites (priority order), then fill towers/spawns |
| `role.repairer.js` | `role.repairer` | Fill towers first, then repair damaged structures (excluding walls/ramparts) |
| `role.tower.js` | `role.tower` | Attack hostiles; repair damaged structures when idle |

### Spawn Logic (`main.js`)

- Maintains **2 creeps per role** in this order: harvester → builder → upgrader → repairer
- Spawns one at a time (exits loop after each spawn to maintain priority)
- Minimum 300 energy to spawn; body scales with available energy (300→400→500+)
- Base body: `[WORK, CARRY, MOVE, MOVE]`; adds `[CARRY, MOVE]` at 400 and 500 energy

### Role State Pattern

All roles use a two-flag memory pattern:
- `creep.memory.harvesting` / `creep.memory.building` / `creep.memory.repairing` / `creep.memory.upgrading`
- Flip to harvest when store empty, flip to work when store full

### Harvester Energy Delivery Priority

`role.harvester` delivers to: **spawns → extensions → towers → containers**

### Builder Construction Priority

`role.builder` builds in this order: roads → towers → extensions → containers → storage → walls → ramparts

## Key Screeps API Patterns

- Always check `creep.store.getFreeCapacity()` / `creep.store.getUsedCapacity()` for store state
- `moveTo` accepts `{ visualizePathStyle: { stroke: '#color' } }` for path debugging
- `findClosestByPath` for accuracy; `findClosestByRange` for CPU savings
- Cache expensive `find()` calls in room memory with a TTL to save CPU
- `Game.time % N === 0` pattern for running logic every N ticks

## CPU Budget Guidelines

- Avoid `room.find()` inside per-creep loops — cache results in a tick-local variable
- Keep total tick CPU under 15 to leave headroom for GCL/bucket recovery
