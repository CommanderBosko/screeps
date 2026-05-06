# Screeps Bot

A Screeps MMO bot written in plain JavaScript. The bot automates a full colony lifecycle: early-game harvester economy, mid-game miner/hauler/link network, automated structure planning, tower defense, and multi-room expansion.

## Current Status

Active development — mid-game systems stable and well-hardened. Bot progresses through RCL 1–5 reliably; RCL 5 unlock expected imminently. Recent work refined defender spawning (now invader-core-gated, melee-only), hardened barrier repair with tiered HP caps, and fixed numerous economy issues across the hauler, miner, and upgrader pipeline.

## Features

**Economy**
- RCL 1–3: generalist harvesters mine and deliver energy directly
- RCL 4+: dedicated miners (one per container; `containerId` stamped at spawn; pre-spawned before dying miner expires) + haulers (carry energy to structures)
- Link network (RCL 5+): source links transfer energy instantly to receiver link near spawn/storage; hauler count collapses to 1 when `srcLinks >= 1 && receiverLinks >= 1`
- Hauler picks fullest container (max energy reduce) rather than closest; idles by topping up store and parking at spawn
- Energy body scaling: all roles wait for full-capacity body before spawning (income-critical roles bypass wait)
- Builders only spawn when construction sites exist
- Upgrader count scales with storage energy via `desiredUpgraders()`: no storage → 2; <50k → 1; <150k → 2; <300k → 3; 300k+ → 4
- Upgrader spawning is infrastructure-aware via `spawnUpgrader()`: WORK-heavy body (1W→12W) when a receiver link or container is within range 3 of the controller; balanced WORK/CARRY body (equal parts) when neither exists and the upgrader must travel for energy; all tiers RCL-8-safe (< 15W cap)
- Opportunistic creep renewal: idle spawns renew nearby haulers (RCL 4+) or any role (RCL 1–3) with TTL < 400
- Remote miner role: travels to rooms listed in `Memory.remoteRooms`, mines safe sources (SK-room aware), carries energy home and deposits to storage (two-flag returning pattern; body rebalanced with heavier CARRY)
- Mineral harvester role: RCL 6+, one per room with extractor, deposits to terminal then storage

**Structure Planning**
- Automated planner runs every 5 ticks with a fast `needsReplanning()` early-exit
- Full rewrite: fixed 11×11 stamp template centered on hub tile encodes all structure types (spawn, storage, 60 extensions, 6 towers, receiver link, terminal, 10 labs, observer, nuker, power spawn, roads); hub candidate validated with `stampFits()` before committing
- RCL-gated placement via `STAMP_LIMITS` map; roads placed last so structures claim tiles first
- RCL-gated rampart placement: spawn-only at RCL 2–3; spawn + towers at RCL 4; full coverage at RCL 5+
- Self-healing: replan triggers if structures are destroyed (raid recovery)
- 90-site cap respected; roads coexist with ramparts but not other structures

**Defense**
- Towers attack hostiles (attackers prioritized), heal wounded creeps, emergency-repair dying ramparts (< 500 HP), repair non-barrier structures (roads, containers); wall/rampart upkeep fully delegated to the repairer
- Repairer raises barriers to RCL-tiered caps via `cache.barrierCap(rcl)`: 10k/50k/200k/1M/5M at RCL 1–3/4–5/6/7/8 (not hitsMax); persistent `repairTarget` commits full energy load to one barrier per cycle; `barrierCap()` is the single source of truth shared by the repairer and the spawn gate
- Repairer only spawns when actual repair demand exists: emergency rampart (< 500 HP), barriers below `barrierCap(rcl)`, or non-barrier damage when no tower has energy
- Without an energized tower, repairer handles roads, containers, and barriers below cap
- `hasWork()` helper prevents repairer from harvesting when nothing needs repair; idle repairer dumps energy to storage
- Defenders: spawn only when a `STRUCTURE_INVADER_CORE` is detected (towers handle ordinary NPC creep waves before a defender finishes spawning); melee-only body (`TOUGH+ATTACK+MOVE`); primary target is the invader core, falls back to nearest hostile creep; retreats to nearest rampart below 40% HP
- Safe-mode auto-activation when hostile combat creeps are present and towers are low on energy

**Spawn Logic**
- Priority order: defenders (invader core present only; melee-only) → emergency miner/harvester → miners → harvesters (RCL 1–3) → haulers → pioneers → attackers → remote miners → mineral harvesters → builders → upgraders → repairers → scout → claimer
- Upgrader count driven by `desiredUpgraders()` (storage-energy tiers); see Economy section
- Builders only spawn when construction sites exist
- Repairer only spawns when actual repair demand exists; gated per `barrierCap()` and tower energy state
- Hauler ceiling: total live haulers cannot exceed source container count; emergency spawn creates a miner (not harvester) when a container exists to avoid ghost haulers
- All roles wait for full-capacity body before spawning; income-critical roles bypass to prevent starvation

**Multi-Room Expansion**
- Scout deployed when GCL headroom exists (RCL 4+)
- Auto claim target selected from scout data (adjacent rooms preferred, most sources first)
- Pioneer squad (3 creeps) bootstraps new rooms before their spawn is built
- Claimer dispatched when `Memory.claimTarget` is set (auto or manual)
- Attack target selection (manual enable: `Memory.attackEnabled = true`) targets low-RCL rooms with ≤1 tower

**CPU Management**
- Tick-local `cache.find()` wrapper deduplicated across all modules; `cache.getTowers(room)` helper used everywhere towers are queried
- Periodic tasks staggered: defense every 30t, source rebalancing every 20t, planner every 5t
- `reusePath` tuned per role: miners=10 (stationary), haulers=10, scouts=5, others=3
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
  main.js                — Game loop: memory cleanup, spawn logic, periodic tasks, role dispatch
  cache.js               — Tick-local find() cache, source assignment, wall HP targets, link role classification
  planner.js             — Automated structure placement via fixed 11×11 stamp template (all RCL structures)
  defense.js             — Chokepoint wall placement only (rampart/extension placement in planner)
  role.harvester.js      — RCL 1-3 generalist: mine → deliver (spawn > extensions > towers > containers)
  role.miner.js          — RCL 4+ stationary miner: owns a specific container (containerId), pre-spawned before death
  role.hauler.js         — RCL 4+ carrier: pulls from fullest container/link, delivers to spawn/extensions/towers
  role.upgrader.js       — Withdraw energy from container/link, upgrade controller; parks near ctrl at RCL 4+
  role.builder.js        — Build construction sites in priority order, then fill towers/spawns
  role.repairer.js       — Raise barriers to RCL-tiered cap (tower present, full-load lock per barrier); roads/containers only (no tower)
  role.tower.js          — Attack > heal > emergency ramparts (< 500 HP) > non-barrier structure repair
  role.defender.js       — Melee-only defender; spawned on invader core detection; targets core first, falls back to hostile creeps
  role.scout.js          — Lightweight [MOVE] creep, records room data; counts by homeRoom; 1500t cooldown
  role.claimer.js        — Claims target room controller
  role.pioneer.js        — Multi-role bootstrap creep for new rooms (build spawn, mine, upgrade)
  role.attacker.js       — Combat creep for attack campaigns (manual: Memory.attackEnabled = true)
  role.remoteMiner.js    — Travels to Memory.remoteRooms target, mines safe sources, carries energy home to storage
  role.mineralHarvester.js — RCL 6+: harvests room mineral into terminal then storage
  roles/                 — (unused, legacy scaffold)
push.js                  — Upload script: reads src/*.js and POSTs to Screeps API
```

## Recent Changes

### 2026-05-06 — Infrastructure-Aware Upgrader, barrierCap Consolidation, Remote Miner Carry, CPU Audit

- `getUpgraderBody(energy, hasAdjacentEnergy)` added: selects balanced WORK/CARRY body when no link or container is within range 3 of the controller; WORK-heavy body only when infrastructure is confirmed; all tiers RCL-8-safe
- `spawnUpgrader()` detects receiver links and controller-adjacent containers before selecting the body tier; upgrader split out of the generic role spawn loop
- `cache.barrierCap(rcl)` replaces the local function in `role.repairer.js` (now deleted) and the dangling import in `main.js`; single source of truth for both the repairer and the spawn gate
- Repairer spawn gate fixed: was silently broken by a dangling `barrierCap` import after prior consolidation; gate now calls `cache.barrierCap(rcl)` directly — repairers will now spawn correctly when barriers are below the RCL cap
- `role.remoteMiner.js` overhauled: two-flag returning pattern (`returning = false/true`) replaces drop-on-full; miner carries energy home and deposits to storage; body rebalanced with much heavier CARRY
- `cache.getTowers(room)` helper extracted; `runTowers()` and `checkSafeMode()` updated to use it
- Storage withdraw floors lowered: `role.builder.js` 2000→500; `role.repairer.js` 1000→300
- `checkAttackComplete()` in `main.js`: raw `room.find()` replaced with `cache.find()`
- `planner.js`: `totalSites()` and `placeRoads()` raw `room.find()` calls replaced with `cache.find()`

### 2026-05-03 — Repairer Full-Load Lock, Tower-Fill Removal, Target-Switch Fix

- `_resolveTarget` rewritten: target lock cleared only when structure is destroyed (`Game.getObjectById` returns null), not at HP cap — eliminates mid-trip target switching
- Tower-fill block (`transfer()` to towers below 50%) removed from `doRepair`; harvesters and builders own tower fill
- Store-empty flip normalized to `getUsedCapacity() === 0`; full energy load committed before refueling
- `_lockTarget` helper extracted; inline target-ID management replaced

### 2026-05-01 — Invader Core-Gated Defender, Melee-Only Body, RCL 5 Readiness

- Defender spawn triggers only when `STRUCTURE_INVADER_CORE` is present; removed reactive spawn on normal NPC invader waves
- Ranged defender branch removed; defender is melee-only (`TOUGH+ATTACK+MOVE` variants)
- `role.defender.js` targets the invader core first, falls back to nearest hostile creep
- RCL 5 readiness confirmed: no code changes needed for the upcoming unlock

## Roadmap

- Observe infrastructure-aware upgrader in live game: confirm balanced body at current RCL; confirm switch to WORK-heavy body once a controller link or container is placed
- Watch repairer spawn gate now that `barrierCap` is correctly wired — repairers should spawn when barriers are below the RCL cap
- Observe remote miner returning home and depositing to storage; verify heavier CARRY body loads are worthwhile
- Monitor RCL 5 unlock: storage placed, 2nd tower built, link network activates, hauler count collapses to 1
- Watch `desiredUpgraders()` scale at 50k/150k/300k storage thresholds post-RCL-5
- Verify invader core detection: defender spawns on core presence only; no spawn for ordinary NPC waves
- Test mineral harvester at RCL 6
- Add hauler withdraw from storage when storage exists
- Delete or consolidate `defense.js` (mostly dead code after planner consolidation)
- Re-add ranged defender if player raids with healers become a problem
- Reach RCL 8 in starting room, claim second room

## License

Personal project — no license.
