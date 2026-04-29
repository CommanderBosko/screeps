# Screeps Bot

A Screeps MMO bot written in plain JavaScript. The bot automates a full colony lifecycle: early-game harvester economy, mid-game miner/hauler/link network, automated structure planning, tower defense, and multi-room expansion.

## Current Status

Active development — mid-game systems stable and economically corrected. Bot progresses through RCL 1–5+ reliably. This session focused on fixing a chain of economic correctness bugs at RCL 4+ and adding two late-game roles (remote miner, mineral harvester).

## Features

**Economy**
- RCL 1–3: generalist harvesters mine and deliver energy directly
- RCL 4+: dedicated miners (one per container; `containerId` stamped at spawn; pre-spawned before dying miner expires) + haulers (carry energy to structures)
- Link network (RCL 5+): source links transfer energy instantly to receiver link near spawn/storage; hauler count collapses to 1 when `srcLinks >= 1 && receiverLinks >= 1`
- Hauler picks fullest container (max energy reduce) rather than closest; idles by topping up store and parking at spawn
- Energy body scaling: all roles wait for full-capacity body before spawning (income-critical roles bypass wait)
- Builders only spawn when construction sites exist; upgrader count corrected to `rcl>=6?3:2`; GCL farming at RCL 8 (5 upgraders when storage > 100k)
- Opportunistic creep renewal: idle spawns renew nearby haulers (RCL 4+) or any role (RCL 1–3) with TTL < 400
- Remote miner role: travels to rooms listed in `Memory.remoteRooms`, mines safe sources (SK-room aware), drops energy
- Mineral harvester role: RCL 6+, one per room with extractor, deposits to terminal then storage

**Structure Planning**
- Automated planner runs every 5 ticks with a fast `needsReplanning()` early-exit
- Full rewrite: fixed 11×11 stamp template centered on hub tile encodes all structure types (spawn, storage, 60 extensions, 6 towers, receiver link, terminal, 10 labs, observer, nuker, power spawn, roads); hub candidate validated with `stampFits()` before committing
- RCL-gated placement via `STAMP_LIMITS` map; roads placed last so structures claim tiles first
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
- Priority order: defenders (reactive) → emergency harvester (requires zero harvesters AND miners/haulers) → miners → harvesters (RCL 1–3) → haulers → pioneers → attackers → remote miners → mineral harvesters → builders → upgraders → repairers → scout → claimer
- Upgrader count: 2 at RCL 1–5, 3 at RCL 6–7, 1 at RCL 8 (GCL farming: 5 when storage > 100k)
- Builders only spawn when construction sites exist (drops to 0 automatically when done)
- All roles wait for full-capacity body before spawning; income-critical roles bypass to prevent starvation
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
  role.repairer.js       — Fill towers first, then repair damaged structures; emergency rampart priority
  role.tower.js          — Attack > heal > emergency barriers > repair > barrier maintenance > surplus top-up
  role.defender.js       — Melee defender, spawned reactively when hostiles detected
  role.scout.js          — Lightweight [MOVE] creep, records room data; counts by homeRoom; 1500t cooldown
  role.claimer.js        — Claims target room controller
  role.pioneer.js        — Multi-role bootstrap creep for new rooms (build spawn, mine, upgrade)
  role.attacker.js       — Combat creep for attack campaigns (manual: Memory.attackEnabled = true)
  role.remoteMiner.js    — Travels to Memory.remoteRooms target, mines safe sources, drops energy
  role.mineralHarvester.js — RCL 6+: harvests room mineral into terminal then storage
  roles/                 — (unused, legacy scaffold)
push.js                  — Upload script: reads src/*.js and POSTs to Screeps API
```

## Recent Changes

### 2026-04-28 — Economy Hardening, Stamp Planner Rewrite, Remote/Mineral Roles

- Fixed emergency guard (requires zero harvesters, not just zero miners/haulers)
- Fixed miner pre-spawn race: `activeMinerCount` excludes dying miners; replacement spawns before expiry
- Fixed rebalancer incorrectly reassigning miners mid-life (miners now excluded from `rebalanceSources`)
- Spawn one miner per container (not per source); `containerId` stamped at spawn time
- Fixed hauler link detection: requires `srcLinks >= 1 && receiverLinks >= 1` (not just `linksBuilt >= 2`)
- Upgrader count corrected to `rcl>=6?3:2`; GCL farming mode at RCL 8 (5 upgraders when storage > 100k)
- Builders retire when no construction sites exist
- All spawns wait for full-capacity body; income roles bypass wait
- Haulers pull from fullest container; idle haulers fill up then park at spawn range 1
- Haulers always fill towers to 100% (threshold removed)
- Renewal at RCL 4+ restricted to haulers only
- Upgraders park near controller at RCL 4+ instead of competing with miners at sources
- Scout: counts by homeRoom; 1500-tick cooldown; reusePath reduced from 50 to 5
- Planner.js rewritten: fixed 11×11 stamp template with `stampFits()` footprint validation
- New `role.remoteMiner.js`: remote mining with SK-room source filtering, drops energy
- New `role.mineralHarvester.js`: harvests minerals to terminal then storage (RCL 6+)

### 2026-04-27 — Tower Repair Pool Unification

- Walls and ramparts compete in a single pool sorted by hits — proximity preference removed
- Extracted `pickWeakestBarrier()` helper; surplus repair mode when energy > 700 and barriers meet floor
- Hub parity persisted to `room.memory.parity`

## Roadmap

- Deploy and verify miner pre-spawn, builder count gating, hauler link collapse in live game
- Test remote miner (`Memory.remoteRooms`) and mineral harvester (RCL 6+) in live game
- Verify stamp planner hub tile selection on live room
- Add remote hauler to collect dropped energy from remote miners
- Hauler withdraw from storage when storage exists (not just containers)
- Clean up or delete `defense.js` (mostly empty after planner consolidation)
- Reach RCL 8 in starting room, claim second room

## License

Personal project — no license.
