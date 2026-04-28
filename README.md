# Screeps Bot

A Screeps MMO bot written in plain JavaScript. The bot automates a full colony lifecycle: early-game harvester economy, mid-game miner/hauler/link network, automated structure planning, tower defense, and multi-room expansion.

## Current Status

Active development — mid-game systems stable. Bot progresses through RCL 1–5+ reliably with automated planning. Defensive hardening (walls, ramparts, tower repair logic) was the primary focus of the most recent session.

## Features

**Economy**
- RCL 1–3: generalist harvesters mine and deliver energy directly
- RCL 4+: dedicated miners (stationary, saturate sources) + haulers (carry energy to structures)
- Link network (RCL 5+): source links transfer energy instantly to receiver link near spawn/storage; hauler count collapses to 1
- Energy body scaling: all creep roles have breakpoint tables that maximize efficiency at each energy tier
- Spawn buffer: upgraders/builders capped at `energyAvailable - 300` to always leave room for emergency spawns
- Opportunistic creep renewal: idle spawns renew nearby creeps with TTL < 400

**Structure Planning**
- Automated planner runs every 5 ticks with a fast `needsReplanning()` early-exit
- Places extensions (checkered hub pattern using distance-transform), towers, containers (per source + controller), links, roads (pathfinder-based), and ramparts
- RCL-gated rampart placement: spawn-only at RCL 2–3; spawn + towers at RCL 4; full coverage at RCL 5+
- Self-healing: replan triggers if structures are destroyed (raid recovery)
- 90-site cap respected; roads coexist with ramparts but not other structures

**Defense**
- Towers attack hostiles (attackers prioritized), heal wounded creeps, emergency-repair dying barriers (< 500 HP), repair damaged structures, raise walls/ramparts to HP tier target, then top up barriers toward hitsMax when energy is surplus (> 700)
- All repair passes use a unified wall+rampart pool sorted by lowest hits — no proximity preference; `pickWeakestBarrier()` is the single authority
- HP targets: 10k (RCL 2–3), 50k (RCL 4–5), 150k (RCL 6–7), 300k (RCL 8) via `cache.getWallTarget()`
- Repairers share the same HP targets and fill towers first before beginning repair work
- Safe-mode auto-activation when hostile combat creeps are present and towers are low on energy

**Spawn Logic**
- Priority order: defenders (reactive) → emergency harvester → miners → harvesters (RCL 1–3) → haulers → pioneers → attackers → builders → upgraders → repairers → scout → claimer
- Upgrader count scales by RCL: 3 at RCL 1–3, 4 at RCL 4–5, 2 at RCL 6–7, 1 at RCL 8
- Repairer only spawns when no tower exists (tower handles repair at RCL 3+)

**Multi-Room Expansion**
- Scout deployed when GCL headroom exists (RCL 4+)
- Auto claim target selected from scout data (adjacent rooms preferred, most sources first)
- Pioneer squad (3 creeps) bootstraps new rooms before their spawn is built
- Claimer dispatched when `Memory.claimTarget` is set (auto or manual)
- Attack target selection (manual enable: `Memory.attackEnabled = true`) targets low-RCL rooms with ≤1 tower

**CPU Management**
- Tick-local `cache.find()` wrapper deduplicated across all modules
- Periodic tasks staggered: defense every 30t, source rebalancing every 20t, planner every 5t
- `reusePath` tuned per role: miners=10 (stationary), harvesters/haulers=2, others=3
- CPU warning logged at 18 CPU with bucket value

## Getting Started

### Prerequisites

- Screeps account (screeps.com)
- Node.js (NixOS: `nix-shell -p nodejs`)

### Installation

```bash
git clone <repo>
cd screeps
npm install
```

### Configuration

Create `.screeps.json` at the project root (gitignored):

```json
{
  "main": {
    "token": "YOUR_SCREEPS_AUTH_TOKEN",
    "branch": "default",
    "modules": {}
  }
}
```

### Deploying

```bash
nix-shell -p nodejs --run "node push.js"
# or
npm run push
```

`push.js` reads all `.js` files from `src/`, names each module after the filename (without extension), and uploads them to the Screeps API under the `default` branch.

## Project Structure

```
src/
  main.js           — Game loop: memory cleanup, spawn logic, periodic tasks, role dispatch
  cache.js          — Tick-local find() cache, source assignment, wall HP targets
  planner.js        — Automated structure placement (extensions, towers, containers, links, roads, ramparts)
  defense.js        — Chokepoint wall placement (rampart/structure placement moved to planner)
  role.harvester.js — RCL 1-3 generalist: mine → deliver (spawn > extensions > towers > containers)
  role.miner.js     — RCL 4+ stationary miner: saturates a source, deposits into adjacent container
  role.hauler.js    — RCL 4+ carrier: withdraws from container/link, delivers to spawn/extensions/towers/storage
  role.upgrader.js  — Mine/withdraw energy, upgrade room controller
  role.builder.js   — Build construction sites in priority order, then fill towers/spawns
  role.repairer.js  — Fill towers first, then repair damaged structures; emergency rampart priority
  role.tower.js     — Tower logic: attack > heal > emergency barriers > repair > barrier maintenance
  role.defender.js  — Melee defender, spawned reactively when hostiles detected
  role.scout.js     — Lightweight [MOVE] creep, records room data into Memory.scoutData
  role.claimer.js   — Claims target room controller
  role.pioneer.js   — Multi-role bootstrap creep for new rooms (build spawn, mine, upgrade)
  role.attacker.js  — Combat creep for attack campaigns (manual activation)
  roles/            — (unused, legacy scaffold)
push.js             — Upload script: reads src/*.js and POSTs to Screeps API
```

## Recent Changes

### 2026-04-27 — Tower Repair Pool Unification

- Walls and ramparts now compete in a single pool sorted by hits — proximity preference removed from all repair passes
- Extracted `pickWeakestBarrier()` helper used by emergency, floor, and surplus repair passes
- Surplus repair mode: when tower energy > 700 and all barriers meet the RCL floor, tower tops barriers toward hitsMax
- Hub parity persisted to `room.memory.parity` for use by other modules
- Checkerboard parity filter on roads rolled back — created gapped road networks incompatible with the pathfinder

### 2026-04-26 — Defense Hardening & CPU Optimization

- Fixed tower emergency repair to cover walls (not just ramparts) — walls start at 1 HP and were never being rescued
- Consolidated wall/rampart HP targets into `cache.getWallTarget()` tier table shared by tower and repairer
- RCL-scaled rampart placement prevents decay overload at RCL 2–3 (spawn-only until tower capacity exists)
- Removed duplicate structure placers from `defense.js`; `planner.js` now owns all placement
- Fixed road placement to skip tiles with non-road structures; roads coexist with ramparts
- Tighter `reusePath` values and faster periodic task cadence to better utilize spare CPU
- Builder and hauler routing switched to `findClosestByPath` for smarter site/extension targeting

## Roadmap

- Verify wall emergency repair end-to-end in live game
- Test and tune multi-room expansion (scout → claimer → pioneer)
- Hauler withdraw from storage when it exists (not just containers)
- Clean up or delete `defense.js` (mostly empty after planner consolidation)
- Reach RCL 8 in starting room, claim second room

## License

Personal project — no license.
