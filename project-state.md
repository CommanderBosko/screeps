# Project State

_Last updated: 2026-04-27_

## Current Project State

The bot is in active mid-game development. Core economic and defensive systems are stable and operational. The bot successfully progresses through RCL 1–5+ with automated structure planning, a miner/hauler economy at RCL 4+, a functional link network, and tower-based defense with rampart/wall maintenance.

**What works:**
- Full RCL 1–8 spawn logic with role prioritization and emergency fallback
- Miner + hauler economy activates at RCL 4 (miners saturate sources; haulers deliver energy)
- Link network (RCL 5+) eliminates hauler trips: source links → receiver link near spawn/storage
- Automated structure planner: extensions, towers, containers, links, roads, ramparts
- RCL-scaled rampart placement (spawn only at RCL 2–3; full coverage at RCL 5+)
- Tower logic: attack > heal > emergency barrier repair > general repair > barrier maintenance > surplus top-up
- Emergency barrier threshold (500 HP) covers both walls and ramparts in a unified pool (lowest hits wins)
- Wall/rampart HP targets from a per-RCL tier table in `cache.getWallTarget()`: 10k/50k/150k/300k
- Surplus repair mode: when tower energy > 700 and all barriers meet RCL floor, tower tops them toward hitsMax
- Hub parity exposed in `room.memory.parity` so other modules need not recompute it
- Rebalancer corrects source assignment drift every 20 ticks
- Creep renewal when spawn is idle and creeps have < 400 TTL
- Safe-mode auto-activation when towers are low and hostiles are present
- Scout → claimer → pioneer pipeline for automated room expansion (RCL 4+ headroom)
- Attack squad targeting (manual enable: `Memory.attackEnabled = true`)

**In progress / known fragile:**
- Multi-room expansion untested at scale (pioneer + claimer logic exists but is lightly tested)
- Defense module (`defense.js`) has been stripped to its core — only chokepoint wall placement remains; rampart placement is now fully owned by `planner.js`

**Not yet implemented:**
- Storage fill/drain logic for haulers (haulers currently deliver to spawn/extensions/towers only)
- Automatic nuker management
- Observer/power creep roles

## Current Goals

### Short-term (next 1–3 sessions)
- Deploy and verify in-game: walls at 1 HP are emergency-repaired within a few ticks; surplus mode tops barriers once they meet the RCL floor
- Test full RCL 5–6 transition with link network active
- Validate multi-room expansion with a claim attempt

### Long-term
- Reach RCL 8 in starting room
- Claim and bootstrap a second room
- Improve hauler routing when storage exists (withdraw from storage, not just containers)

## Recent Decisions

- **Rampart placement moved to planner.js** — `defense.js` had a duplicate, inferior placer causing conflicts. `planner.js` now owns all rampart placement with RCL-scaled coverage.
- **RCL-gated rampart count** — at RCL 2–3 only the spawn is protected; at RCL 4 towers are added; RCL 5+ full coverage. Prevents decay overload before tower capacity exists.
- **Wall HP target tier table** — replaced linear formula with 10k/50k/150k/300k tiers stored in `cache.getWallTarget()` and shared by both repairer and tower to prevent them working against each other.
- **Emergency barrier threshold widened to walls** — newly placed walls start at 1 HP and were being ignored by the emergency repair block; the filter now covers both `STRUCTURE_WALL` and `STRUCTURE_RAMPART`.
- **Unified barrier pool in tower** — walls and ramparts compete by lowest hits only; proximity preference removed. A rampart at 1M HP no longer beats a wall at 10k just because it is nearer the tower. Extracted into `pickWeakestBarrier()` helper used in all three repair passes.
- **Surplus repair mode** — when all barriers meet the RCL floor and the tower has > 700 energy, it tops barriers toward hitsMax rather than sitting idle.
- **Checkerboard road parity rolled back** — parity filter was briefly added to road placement but caused gapped roads and weak pathfinder steering. Off-parity roads already placed would take ~57 real days to decay naturally. Reverted; parity correctly scoped to extension/tower layout only.
- **Hub parity persisted to `mem.parity`** — future modules can read it without recomputing.
- **Lower REPAIR_RESERVE (400 → 200)** — towers repair more aggressively when idle.
- **Faster periodic task cadence** — defense every 30t, rebalanceSources every 20t, planner every 5t (all have cheap early-exits so actual CPU cost is low).
- **Tighter reusePath values** — harvesters/haulers/builders/repairers/upgraders re-path more often to reduce traffic jams; miners stay at 10 (stationary).
- **Builder site selection uses findClosestByPath** within the top-priority tier to minimize travel between same-priority sites.
- **Hauler extension delivery uses findClosestByPath** (was findClosestByRange) for accurate routing.

## Known Issues / Tech Debt

- `defense.js` is now mostly dead code (all placement logic removed); only `run()` with chokepoint walls remains. Could be folded into planner or deleted if chokepoints are not needed.
- The `roles/` subdirectory exists but appears unused — may be leftover scaffolding.
- Repairer container logic avoids source containers unless overflowing (>500); this is correct but the threshold was recently aligned — worth monitoring in-game to confirm repairers are not starved.
- No CPU profiling across the full creep roster at high RCL — high-CPU warning fires at 18 CPU; bucket is the safety net.

## Next Steps

1. Deploy and verify in-game: walls at 1 HP are rescued by tower emergency pass within a few ticks; surplus mode activates once barriers clear the RCL floor.
2. Check rebalanceSources at 20t cadence does not cause visible creep churn (source thrashing).
3. When RCL 5+ is reached, confirm link network is placed and hauler count collapses to 1 as expected.
4. Begin testing multi-room expansion: scout → claimer pipeline.
5. Consider deleting or consolidating `defense.js` since planner now owns all structure placement.
