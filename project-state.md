# Project State

_Last updated: 2026-04-26_

## Current Project State

The bot is in active mid-game development. Core economic and defensive systems are stable and operational. The bot successfully progresses through RCL 1–5+ with automated structure planning, a miner/hauler economy at RCL 4+, a functional link network, and tower-based defense with rampart/wall maintenance.

**What works:**
- Full RCL 1–8 spawn logic with role prioritization and emergency fallback
- Miner + hauler economy activates at RCL 4 (miners saturate sources; haulers deliver energy)
- Link network (RCL 5+) eliminates hauler trips: source links → receiver link near spawn/storage
- Automated structure planner: extensions, towers, containers, links, roads, ramparts
- RCL-scaled rampart placement (spawn only at RCL 2–3; full coverage at RCL 5+)
- Tower logic: attack > heal > emergency barrier repair > general repair > barrier maintenance
- Emergency barrier threshold (500 HP) covers both walls and ramparts
- Wall/rampart HP targets from a per-RCL tier table in `cache.getWallTarget()`: 10k/50k/150k/300k
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
- Verify wall HP ramp-up works end-to-end: walls spawn at 1 HP, emergency pass rescues them, tower brings them to hpTarget over time
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

1. Deploy current code and observe in-game: verify walls at 1 HP get emergency-repaired by towers before hpTarget pass runs.
2. Check rebalanceSources at 20t cadence does not cause visible creep churn (source thrashing).
3. When RCL 5+ is reached, confirm link network is placed and hauler count collapses to 1 as expected.
4. Begin testing multi-room expansion: scout → claimer pipeline.
5. Consider deleting or consolidating `defense.js` since planner now owns all structure placement.
