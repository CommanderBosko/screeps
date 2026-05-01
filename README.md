# Screeps Bot

A Screeps MMO bot written in plain JavaScript. The bot automates a full colony lifecycle: early-game harvester economy, mid-game miner/hauler/link network, automated structure planning, tower defense, and multi-room expansion.

## Current Status

Active development — mid-game systems stable and well-hardened. Bot progresses through RCL 1–5+ reliably. Recent sessions focused on RCL-tiered barrier HP caps, demand-based repairer spawning, storage-scaled upgrader counts, hauler over-spawn fixes, and a 15-fix audit sweep across economy, defense, and CPU efficiency.

## Features

**Economy**
- RCL 1–3: generalist harvesters mine and deliver energy directly
- RCL 4+: dedicated miners (one per container; `containerId` stamped at spawn; pre-spawned before dying miner expires) + haulers (carry energy to structures)
- Link network (RCL 5+): source links transfer energy instantly to receiver link near spawn/storage; hauler count collapses to 1 when `srcLinks >= 1 && receiverLinks >= 1`
- Hauler picks fullest container (max energy reduce) rather than closest; idles by topping up store and parking at spawn
- Energy body scaling: all roles wait for full-capacity body before spawning (income-critical roles bypass wait)
- Builders only spawn when construction sites exist
- Upgrader count scales with storage energy via `desiredUpgraders()`: no storage → 2; <50k → 1; <150k → 2; <300k → 3; 300k+ → 4
- Upgrader bodies scale from 1W (200e) up to 12W (1500e); top tier is RCL-8-safe (12W < 15W controller upgrade cap)
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
- Towers attack hostiles (attackers prioritized), heal wounded creeps, emergency-repair dying ramparts (< 500 HP), repair non-barrier structures (roads, containers); wall/rampart upkeep fully delegated to the repairer
- Repairer raises barriers to RCL-tiered caps via `barrierCap(rcl)`: 10k/50k/200k/1M/5M at RCL 1–3/4–5/6/7/8 (not hitsMax); persistent `repairTarget` commits full energy load to one barrier per cycle
- Repairer only spawns when actual repair demand exists: emergency rampart (< 500 HP), barriers below cap, or non-barrier damage when no tower has energy
- Without an energized tower, repairer handles roads, containers, and other non-barrier structures
- `hasWork()` helper prevents repairer from harvesting when nothing needs repair; idle repairer dumps energy to storage
- Defenders: melee variant holds rampart position and retreats to ramparts below 40% HP; ranged variant spawned when hostiles include HEAL parts — uses `rangedAttack()`/`rangedMassAttack()` from rampart cover
- Safe-mode auto-activation when hostile combat creeps are present and towers are low on energy

**Spawn Logic**
- Priority order: defenders (reactive, melee or ranged based on hostile body) → emergency miner/harvester → miners → harvesters (RCL 1–3) → haulers → pioneers → attackers → remote miners → mineral harvesters → builders → upgraders → repairers → scout → claimer
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
  role.repairer.js       — Fill towers first; raise barriers to maxHits (tower present); roads/containers only (no tower)
  role.tower.js          — Attack > heal > emergency ramparts (< 500 HP) > non-barrier structure repair
  role.defender.js       — Melee (rampart-hold) or ranged (healer squads) defender, spawned reactively
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

### 2026-04-30 — Tiered Barrier Caps, Demand-Based Repairer, Storage-Scaled Upgraders, Hauler Ceiling

- `barrierCap(rcl)` introduced: tiered HP targets 10k/50k/200k/1M/5M replace hitsMax for wall/rampart repair
- Repairer spawn gated on actual demand (emergency rampart, barriers below cap, non-barrier damage without energized tower)
- `desiredUpgraders()` replaces fixed upgrader count: 1/2/3/4 tiers based on storage energy at 50k/150k/300k
- Upgrader bodies scaled up to 12W (1500e); CARRY reduced to 1; RCL-8-safe
- Hauler total-count ceiling added: live haulers cannot exceed source container count
- Emergency spawn path fixed: miner (not harvester) spawned when source container exists — prevents ghost haulers
- Hauler delivery flip corrected to 100% full store (was 50%); eliminates unnecessary double-trips
- Miner source assignment filtered to `homeRoom`; cross-room miners no longer conflict with home-room miners
- Link single-transfer-per-receiver: `break` after first `OK` prevents double-send
- Defender/defender-ranged body energy gates corrected to exact body costs (removed 100–240e padding)
- `cache.find()` adopted in `planner.js`, `role.mineralHarvester.js`, `role.scout.js`
- Source container fallback threshold lowered to 0 in builder and repairer (was 500 energy)
- Remote miner full-store check moved before `harvest()` call

### 2026-04-29 — Repairer Barrier Overhaul, Ranged Defender, Hauler Pinning

- Repairer raises walls and ramparts to full `hitsMax` when a tower is present (not a HP floor)
- Barriers take priority over containers/roads in the repair queue; persistent `repairTarget` commits full energy load to one barrier
- `hasWork()` helper prevents repairer harvesting when nothing needs repair
- Tower simplified: handles only emergency ramparts (< 500 HP) and non-barrier structure repair
- Ranged defender spawned when hostile squad includes HEAL parts; melee holds rampart position and retreats at 40% HP
- Hauler per-container pinning via `containerId`; `pickupNearby()` capped at range 5

### 2026-04-28 — Economy Hardening, Stamp Planner Rewrite, Remote/Mineral Roles

- Fixed emergency guard (requires zero harvesters, not just zero miners/haulers)
- Fixed miner pre-spawn race and rebalancer incorrectly reassigning miners mid-life
- Fixed hauler link detection: requires `srcLinks >= 1 && receiverLinks >= 1`
- Planner.js rewritten: fixed 11×11 stamp template with `stampFits()` footprint validation
- New `role.remoteMiner.js` and `role.mineralHarvester.js`

## Roadmap

- Deploy and observe: barriers trend toward RCL-appropriate cap; upgrader count shifts at 50k/150k/300k storage thresholds; repairer does not spawn when towers have energy and nothing needs repair
- Observe ranged defender behavior against a healer-accompanied raid
- Test remote miner (`Memory.remoteRooms`) and mineral harvester (RCL 6+)
- Verify stamp planner hub tile selection on live room
- Add remote hauler to collect dropped energy from remote miners
- Add hauler withdraw from storage when storage exists
- Delete or consolidate `defense.js` (mostly dead code after planner consolidation)
- Reach RCL 8 in starting room, claim second room

## License

Personal project — no license.
