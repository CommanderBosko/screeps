# Screeps Bot

A Screeps MMO bot written in plain JavaScript. The bot automates a full colony lifecycle: early-game harvester economy, mid-game miner/hauler/link network, automated structure planning, tower defense, and multi-room expansion.

## Current Status

Active development — mid-game systems stable, approaching RCL 6. Recent work fixed hauler energy-source selection in a 3-link room, corrected tower-fill priority (emptiest tower first), and laid the complete RCL 6 foundation: `lab.js` reaction manager, extractor placement on the mineral tile, stamp order rewritten so terminal/labs are placed before extensions, and road demolition so blocked terminal/lab tiles clear on the next planner run. Earlier sessions resolved the link-mode hauler spawn deadlock, fixed miners never filling source links (missing CARRY part), set up full TypeScript type coverage, and introduced `watch.js` for real-time console streaming.

## Features

**Economy**
- RCL 1–3: generalist harvesters mine and deliver energy directly
- RCL 4+: dedicated miners (one per container; `containerId` stamped at spawn; pre-spawned before dying miner expires) + haulers (carry energy to structures)
- 600-energy miner body: `[WORK×5, CARRY, MOVE]` — 1 CARRY lets miners accumulate energy and transfer directly to adjacent source links
- Emergency hauler bootstrap: 150-energy `[CARRY,CARRY,MOVE]` spawns before the normal hauler block whenever miners are alive but no haulers exist — prevents permanent deadlock after hauler wipe
- Link network (RCL 5+): source links transfer energy instantly to receiver link near spawn/storage; hauler count collapses to 1 when `srcLinks >= 1 && receiverLinks >= 1`
- Hauler pickup order: non-controller receiver links → source containers (link overflow) → storage; `containerId` cleared on empty container to prevent pre-link deadlock
- Hauler tower fill: emptiest tower first (most free capacity), tiebroken by range — prevents full tower absorbing all deliveries while an empty tower is ignored
- Hauler storage fallback: in a 3-link room (2 source + 1 controller), the hauler correctly skips the controller-adjacent link and draws from storage; extensions stay filled
- Energy body scaling: all roles wait for full-capacity body before spawning (income-critical roles bypass wait)
- Builders only spawn when construction sites exist
- Upgrader count scales with storage energy via `desiredUpgraders()`: no storage → 2; <50k → 1; <150k → 2; <300k → 3; 300k+ → 4
- Upgrader spawning is infrastructure-aware via `spawnUpgrader()`: WORK-heavy body (1W→12W) when a receiver link or container is within range 3 of the controller; balanced WORK/CARRY body (equal parts) when neither exists and the upgrader must travel for energy; all tiers RCL-8-safe (< 15W cap)
- Opportunistic creep renewal: idle spawns renew nearby haulers (RCL 4+) or any role (RCL 1–3) with TTL < 400
- Remote miner role: travels to rooms listed in `Memory.remoteRooms`, mines safe sources (SK-room aware), carries energy home and deposits to storage (two-flag returning pattern; body rebalanced with heavier CARRY)
- Mineral harvester role: RCL 6+, one per room with extractor, deposits to terminal then storage
- Lab reaction manager (`lab.js`, RCL 6+): designates input/output labs by geometry, runs configured reaction per tick; set `Memory.labReaction['RoomName'] = 'OH'` to start

**Structure Planning**
- Automated planner runs every 5 ticks with a fast `needsReplanning()` early-exit; `needsReplanning()` checks for missing terminal, labs, and extractor so missed structures always trigger a replan
- Full rewrite: fixed 11×11 stamp template centered on hub tile encodes all structure types (spawn, storage, 60 extensions, 6 towers, receiver link, terminal, 10 labs, observer, nuker, power spawn, roads); hub candidate validated with `stampFits()` before committing
- RCL-gated placement via `STAMP_LIMITS` map; stamp order: unique structures (terminal, labs, towers, link) placed before extensions so the 90-site cap never blocks high-value structures
- RCL-gated rampart placement: spawn-only at RCL 2–3; spawn + towers at RCL 4; full coverage at RCL 5+
- Self-healing: replan triggers if structures are destroyed (raid recovery)
- Road demolition: `applyStamp` destroys any road occupying a structure tile (e.g., terminal/lab tiles that were roaded at lower RCL), allowing construction sites to appear on the next tick
- Extractor placed on the mineral tile at RCL 6+
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
- Node.js (available as a system package on this machine; no `nix-shell` wrapper needed)

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
node push.js
# or
npm run push
```

`push.js` reads all `.js` files from `src/`, names each module after the filename (without extension), and uploads them to the Screeps API under the `default` branch.

### Streaming Console Output

```bash
node watch.js
```

`watch.js` connects to the Screeps MMO WebSocket API, reads the auth token from `.screeps.json`, and streams real-time console output to the terminal. Reconnects automatically with exponential backoff.

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
  lab.js                 — RCL 6+: reaction manager; designates input/output/output labs by geometry; Memory.labReaction controls product
  global.d.ts            — Ambient TypeScript augmentations for project-specific CreepMemory/RoomMemory/Memory fields
  roles/                 — (unused, legacy scaffold)
push.js                  — Upload script: reads src/*.js and POSTs to Screeps API
watch.js                 — Real-time console streaming: WebSocket subscription to MMO console with auto-reconnect
.vscode/settings.json    — Workspace setting: disables JS suggestion actions (suppresses TS80001 on require() calls)
```

## Recent Changes

### 2026-05-17 — Hauler Energy Source, Tower Fill, RCL 6 Foundation (lab/extractor/terminal)

- **Hauler storage fallback (3-link rooms)**: with 2 source links and 1 controller link, the hauler correctly skips the controller-adjacent link but previously had no remaining source, starving extensions. Now draws from storage as fallback.
- **Hauler pickup reordered**: non-controller receiver links → source containers → storage; `containerId` cleared when pinned container is empty to break the pre-link container deadlock.
- **Emptiest tower first**: hauler now sorts towers by free capacity before delivering — a fully empty distant tower is always served before a nearly-full nearby one.
- **`lab.js` added**: RCL 6 reaction manager wired into the game loop; input/output/output lab designation by geometry; configure with `Memory.labReaction['RoomName'] = 'OH'`.
- **Extractor placed on mineral tile at RCL 6+** via planner; `needsReplanning()` checks terminal/labs/extractor.
- **Stamp order fixed**: terminal, labs, towers, and link are now placed before extensions; the 90-site cap no longer blocks these structures.
- **Road demolition in `applyStamp`**: roads occupying terminal/lab tiles are destroyed during stamp application, allowing construction sites to appear on the next planner tick.

### 2026-05-17 — TypeScript Setup, Hauler Spawn Deadlock Fix, Link-Mode Bootstrap

- **Link-mode hauler spawn deadlock broken**: `spawnStandard` was waiting for `energyCapacityAvailable` before spawning a hauler — but with no hauler, extensions drain and `energyAvailable` never reaches capacity. Fixed by spawning the hauler from `room.energyAvailable` directly; it spawns at minimum 300 energy immediately, extensions refill once the hauler is live.
- **Emergency bootstrap and idle top-up are now link-aware**: both paths check receiver links in addition to containers; in link mode energy arrives via receiver links, not containers — the old code was silently skipping spawns.
- **TypeScript checking fully configured**: `@types/screeps` + `@types/node` injected via `tsconfig.json`; `moduleResolution: "node10"` for CommonJS; `baseUrl: "./src"` for bare `require()` resolution; `lib` includes `"dom"` for `console`; `src/global.d.ts` augments `CreepMemory`, `RoomMemory`, and `Memory` with all project-specific fields; JSDoc casts on `getObjectById` call sites; `.vscode/settings.json` suppresses TS80001 at workspace level.

### 2026-05-17 — Miner Link Delivery Fix, Emergency Hauler Bootstrap, watch.js, tsconfig Cleanup

- **Root cause fix**: 600-energy miner body changed from `[WORK×6, MOVE]` to `[WORK×5, CARRY, MOVE]`; without CARRY, `creep.transfer()` always failed (store capacity was 0), so source links were never filled — energy fell to the ground and containers absorbed it. 1 CARRY = 50 energy capacity makes the link delivery path reachable. 5 WORK still saturates a source at full regeneration rate.
- **Emergency hauler bootstrap**: 150-energy `[CARRY,CARRY,MOVE]` spawns before the normal hauler block when miners are alive and no haulers exist — breaks permanent economy deadlock after hauler wipe.
- **`watch.js`** added: real-time Screeps MMO console streaming via WebSocket; reads auth token from `.screeps.json`; strips HTML tags; shows tick numbers; exponential backoff reconnection.
- **tsconfig.json** corrected: `include` changed to `src/**/*.js`; `allowJs: true`; `commonjs`/`node` module resolution; strict disabled; utility scripts (`push.js`, `watch.js`) excluded.
- Node.js is now a system package — `nix-shell -p nodejs` wrapper no longer required.

### 2026-05-06 — Infrastructure-Aware Upgrader, barrierCap Consolidation, Remote Miner Carry, CPU Audit

- `getUpgraderBody(energy, hasAdjacentEnergy)` added: selects balanced WORK/CARRY body when no link or container is within range 3 of the controller; WORK-heavy body only when infrastructure is confirmed; all tiers RCL-8-safe
- `spawnUpgrader()` detects receiver links and controller-adjacent containers before selecting the body tier; upgrader split out of the generic role spawn loop
- `cache.barrierCap(rcl)` replaces the local function in `role.repairer.js` (now deleted) and the dangling import in `main.js`; single source of truth for both the repairer and the spawn gate
- `role.remoteMiner.js` overhauled: two-flag returning pattern replaces drop-on-full; miner carries energy home and deposits to storage; body rebalanced with heavier CARRY
- Storage withdraw floors lowered: `role.builder.js` 2000→500; `role.repairer.js` 1000→300

### 2026-05-03 — Repairer Full-Load Lock, Tower-Fill Removal, Target-Switch Fix

- `_resolveTarget` rewritten: target lock cleared only when structure is destroyed, not at HP cap — eliminates mid-trip target switching
- Tower-fill block removed from `doRepair`; harvesters and builders own tower fill
- Store-empty flip normalized to `getUsedCapacity() === 0`; full energy load committed before refueling

## Roadmap

- Observe live game: confirm hauler draws from storage in 3-link setup and extensions stay filled
- Watch planner run at RCL 6: confirm roads on terminal/lab tiles are demolished and construction sites appear
- Verify lab reaction manager picks correct input/output labs and reactions run (`Memory.labReaction['RoomName'] = 'OH'`)
- Verify extractor appears on mineral tile at RCL 6
- Confirm 600-energy miners are transferring energy directly to source links (not dropping to ground)
- Confirm emergency hauler bootstrap fires after a deliberate hauler wipe; economy resumes within 2–3 ticks
- Monitor link network throughput; confirm hauler count stays at 1
- Monitor RCL 5 unlock: 2nd tower built, `desiredUpgraders()` activates as storage fills through 50k/150k/300k thresholds
- Verify invader core detection: defender spawns on core presence only; no spawn for ordinary NPC waves
- Delete or consolidate `defense.js` (mostly dead code after planner consolidation)
- Re-add ranged defender if player raids with healers become a problem
- Reach RCL 8 in starting room, claim second room

## License

Personal project — no license.
