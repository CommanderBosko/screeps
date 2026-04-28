# Session Summary

_Most recent session at top._

---

## Session: 2026-04-27 — Tower Repair Pool Unification & Checkerboard Road Rollback

**Duration Estimate**: ~1–2 hours
**Session Focus**: Fix tower repair target selection so walls and ramparts compete purely on hits (not proximity), add surplus repair mode, and roll back a mistaken checkerboard parity filter on road placement.

### What Was Accomplished

- **Unified wall/rampart repair pool** — extracted `pickWeakestBarrier(structures, maxHits)` helper in `role.tower.js`. All three repair passes (emergency < 500 HP, floor target, surplus top-up) now call this helper. Walls and ramparts compete in one pool sorted solely by hits. The previous proximity preference (`tower.pos.inRangeTo(s, 10)`) was removed — a rampart sitting at 1M HP should never beat a wall at 10k just because it is closer.

- **Surplus repair mode** — when the tower's energy exceeds 700 and every barrier already meets the RCL-scaled HP floor, the tower now calls `pickWeakestBarrier(allStructures, Infinity)` to top barriers toward hitsMax. Previously the tower went idle in this state.

- **Removed stale `tower` parameter** — `pickWeakestBarrier()` no longer accepts or uses a tower reference (proximity logic was the only reason it existed).

- **Reuse `allStructures` across passes** — `cache.find(tower.room, FIND_STRUCTURES)` is now called once at the top of the repair block and reused by all three passes, eliminating two redundant cache lookups per tick.

- **Persist hub parity to `mem.parity`** — `planner.js` now writes the hub parity into room memory so other modules can read it without recomputing `(hub.x + hub.y) % 2`.

- **Checkerboard road parity rolled back** — a parity filter was added to `planner.js` to restrict road placement to `(x+y) % 2 === parity` tiles, with a matching tower skip for off-parity roads. After expert analysis this was reverted: gap roads give the pathfinder nothing to steer between parity tiles, and off-parity roads already in the room would take ~57 real days to decay naturally. Parity remains correctly scoped to extension/tower layout only.

### Files Changed

- `src/role.tower.js` — extracted `pickWeakestBarrier()` helper; unified repair pool (no proximity); surplus mode added; `allStructures` reused; added `SURPLUS_THRESHOLD = 700` constant
- `src/planner.js` — persist hub parity to `mem.parity`; clarified road cost-1 comment; checkerboard road filter added then reverted (net result: only parity persistence remains)

### Commits This Session

- `4477e29` — Unify wall/rampart repair pool and expose hub parity in memory

### Decisions Made

- **Proximity preference removed from barrier repair** — tower efficiency delta (~150 vs ~300 HP/tick based on range) is never large enough to justify repairing the wrong structure. Lowest hits always wins.
- **Surplus mode threshold at 700** — leaves 200 headroom above `REPAIR_RESERVE` (200) before surplus fires, so the tower does not start topping up barriers when it is nearly empty.
- **Checkerboard roads rejected** — gapped road networks and a ~57 real-day natural decay clock for already-placed off-parity roads made the feature impractical. Parity is only meaningful for the extension/tower hub layout.

### Issues Encountered

- Checkerboard parity filter initially included road placement, which creates isolated road tiles with no connecting path between them — pathfinder has nothing to follow. Caught in review before being deployed live.

### Remaining / Next Session

- Deploy and verify in-game: walls at 1 HP get emergency-repaired by towers within a few ticks; surplus mode activates once barriers clear the RCL floor
- Watch source rebalancing at 20t cadence for creep churn — raise to 30–50t if thrashing is visible
- Confirm hauler count drops to 1 when link network activates at RCL 5+
- Test multi-room expansion: scout → claimer → pioneer pipeline
- Consider deleting or consolidating `defense.js` (mostly empty after planner consolidation)

---

## Session: 2026-04-26 — Defense Hardening & CPU Optimization

**Duration Estimate**: ~3 hours (commits span 16:52–18:39)
**Session Focus**: Fix a cascade of wall/rampart bugs — placement conflicts, HP target mismatches, and tower blind spots — then squeeze better routing and pathfinding performance out of the spare CPU budget.

### What Was Accomplished

**Defense bug fixes (7 commits):**
- Identified and removed duplicate rampart placer in `defense.js`; `planner.js` now owns all rampart placement
- Fixed `placeRoads` to skip tiles with any existing non-road structure (was placing roads under extensions, towers, etc.)
- Fixed road placement on source-adjacent tiles in `defense.js` (was missing the exclusion zone that `planner.js` already had)
- Fixed cross-file contradictions: rampart HP cap (80k vs 300k), tower fill threshold (70% vs 50%), repairer container drain logic
- Added `reusePath` to all hauler `moveTo` calls (was recalculating every tick)
- Aligned repairer container logic with builder (avoid source containers unless overflowing)

**Rampart system overhaul (3 commits):**
- RCL-gated rampart placement: RCL 2–3 = spawn only; RCL 4 = spawn + towers; RCL 5+ = full coverage
- Added emergency barrier priority (< 500 HP) to both tower and repairer so dying ramparts are rescued before normal repair pass
- Widened emergency filter to include walls (`STRUCTURE_WALL`) — walls start at 1 HP and were never being emergency-repaired

**HP target consolidation (1 commit):**
- Replaced duplicated `rampartTarget()` linear formula in repairer and tower with a single `cache.getWallTarget()` tier table: 10k (RCL 2–3), 50k (RCL 4–5), 150k (RCL 6–7), 300k (RCL 8)

**Construction priority (1 commit):**
- Walls now build before ramparts in `constructionPriority` at all RCL stages

**CPU optimization (1 commit):**
- Periodic task cadence tightened: defense 100t→30t, rebalanceSources 50t→20t, planner 10t→5t
- `reusePath` reduced for harvesters (3→2), haulers (3→2), upgraders (5→3), builders (5→3), repairers (5→3)
- Hauler extension delivery: `findClosestByRange` → `findClosestByPath` for accuracy
- Builder site selection: `findClosestByPath` tiebreak within top-priority tier to minimize travel
- Tower repair: prefer nearest damaged structure within range 10 before falling back to globally worst
- `REPAIR_RESERVE` lowered from 400 to 200 so towers repair more aggressively when idle

### Files Changed

- `src/main.js` — periodic task cadence (defense 30t, rebalanceSources 20t, planner 5t)
- `src/cache.js` — added `cache.getWallTarget()` tier table shared by repairer and tower
- `src/planner.js` — RCL-scaled `placeRamparts()`, synced `needsReplanning()`, fixed `placeRoads` collision detection
- `src/defense.js` — removed duplicate structure placers (towers, extensions, containers, roads, ramparts); only chokepoint logic remains
- `src/role.tower.js` — emergency barrier filter widened to walls; nearby-first repair; lower `REPAIR_RESERVE`; `cache.getWallTarget()` consolidation
- `src/role.repairer.js` — emergency rampart priority; container drain alignment; `cache.getWallTarget()` consolidation; spawn-low guard
- `src/role.builder.js` — tower fill threshold aligned to 50%; `findClosestByPath` tiebreak; wall before rampart in priority
- `src/role.hauler.js` — `reusePath` added; `findClosestByPath` for extension delivery
- `src/role.harvester.js` — `reusePath` reduced
- `src/role.upgrader.js` — `reusePath` reduced
- `CLAUDE.md` — added agent delegation instruction

### Commits This Session

- `d7dbdcb` — Fix tower emergency repair to include walls alongside ramparts
- `45a03d9` — Put spare CPU budget to work: tighter reusePaths, faster periodic tasks, smarter targeting
- `643592b` — Scale rampart placement to RCL to prevent decay overload
- `a62ad52` — Fix wall/rampart HP targets to match per-RCL tier table
- `60e4790` — Build walls before ramparts in constructionPriority at all RCL stages
- `dcb7c3a` — Add placeRamparts to planner.js and fix road placement on rampart tiles
- `4fb23ed` — Fix placeRoads to skip tiles with any existing structure
- `7a8076d` — Fix cross-file contradictions: rampart caps, tower thresholds, duplicate placers, repairer energy logic
- `056b7db` — Fix road-adjacent-to-source bug: defense.placeRoads had no exclusion zone
- `529b783` — Always delegate to screeps-expert agent per CLAUDE.md
- `9ba3d76` — Move roads to bottom of build priority at all RCL stages
- `0960e9f` — Cap upgrader/builder body budget to prevent spawn buffer drain
- `89d6a63` — Reserve source-adjacent tiles by blocking road placement within range 1
- `50b2882` — Fix creep pileup: wait at assigned source instead of chasing active one
- `cfe515a` — Fix road placement on source tiles causing harvest deadlock
- `775842a` — Add emergency harvester spawn and energy ratio gate
- `2a2d199` — Gate miner spawning on RCL 4+ and hauler availability
- `4a66d1f` — Fix hauler sourceId contamination and miner harvest skip
- `aa70238` — Fix all creep body threshold bugs and add full RCL scaling
- `5fc7b05` — Overhaul structure placement: rebuild on destroy, fix collisions, smarter roads
- `2e8518f` — Major bot improvements via screeps-expert agent
- `71c81b1` — Fix severe source imbalance: stop clearing sourceId, add periodic rebalancer
- `a33e3f0` — Implement link network to replace hauler trips with instant energy transfer
- `e0f6a3e` — Add opportunistic creep renewal and preemptive miner replacement

### Decisions Made

- **`defense.js` stripped to chokepoint-only** — all structure placement (including ramparts) moved to `planner.js` to eliminate dual-placer conflicts and inconsistent algorithms. Rationale: planner owns the full RCL-scaled build plan; defense was a legacy placer with no awareness of the plan state.
- **RCL-gated rampart count** — a single repairer cannot maintain 8+ ramparts at RCL 2–3 (no tower, travel overhead). Only spawn is protected until tower capacity exists. Avoids the infinite replan-decay cycle that was stranding the bot.
- **Tier table for wall targets** — linear formula (level * 10k) was diverging between tower and repairer; consolidated into `cache.getWallTarget()` with sane per-tier caps that both modules share.

### Issues Encountered

- Walls were stuck at 1 HP indefinitely because the emergency repair block checked `STRUCTURE_RAMPART` only — walls never entered the fast-repair queue. Fixed by widening the filter.
- Roads were being placed under extensions and other structures because `placeRoads` checked `existing.length > 0` but ramparts are transparent to road placement — the guard was blocking valid road+rampart coexistence. Fixed to check for non-road, non-rampart structures only.
- `defense.js` had a road placer running every tick via `defense.run()` that had no source exclusion zone, overriding the cleaner planner road placement. Fixed then removed.

### Remaining / Next Session

- Deploy and verify in-game that the wall emergency repair path works (walls at 1 HP are rescued by towers within a few ticks of placement)
- Watch for source rebalancing churn at the new 20t cadence — if creeps thrash sourceIds too often, raise back to 30–50t
- Confirm hauler count drops to 1 when link network becomes active at RCL 5+
- Test multi-room expansion: scout → claimer → pioneer pipeline
- Consider whether `defense.js` (now mostly empty) can be deleted or merged into planner

---
