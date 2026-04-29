# Session Summary

_Most recent session at top._

---

## Session: 2026-04-29 — Repairer Barrier Overhaul, Ranged Defender, Hauler Pinning

**Duration Estimate**: Single focused session
**Session Focus**: Overhaul the repairer to bring walls and ramparts to full maxHits with persistent targeting, fix barrier repair queue priority, add a ranged defender variant for healer squads, simplify tower repair, and refine hauler container pinning.

### What Was Accomplished

**Repairer overhaul (`role.repairer.js`):**
- Repairer now targets walls and ramparts to full `hitsMax` (not an HP floor) when a tower is present
- Barrier priority fixed: with a tower, walls/ramparts rank above containers and roads in the repair queue (containers were draining the repairer's energy while barriers degraded)
- Persistent `repairTarget` in `creep.memory`: repairer commits its full energy load to one barrier before picking the next; sort runs only on target selection, `Game.getObjectById` O(1) lookup each tick
- `hasWork()` helper: prevents the repairer from harvesting when there is genuinely nothing to repair; idle repairer dumps carried energy to storage and says 💤
- Fixed `creep.say()` outputting the word "brick" instead of the 🧱 emoji
- Without a tower, repairer still handles roads/containers only (no barrier work)

**Defender hardening (`role.defender.js`, `main.js`):**
- Ranged defender variant spawned when hostiles include a HEAL-part creep; uses `rangedAttack()`, falls back to `rangedMassAttack()` when multiple hostiles in range 3
- Melee defender now holds rampart position: attacks in range 1, advances to the nearest rampart closer to the target rather than charging in the open
- Retreat: when below 40% HP and not on a rampart, defender flees to the closest rampart
- Idle rally: defenders move to the closest rampart (not just near spawn)
- Body scaling for both `defender` and `defender-ranged` added to `getBody()` switch; emergency minimum-viable-defender uses ranged body when possible and healers are present

**Tower simplification (`role.tower.js`):**
- Tower no longer repairs walls or ramparts beyond emergency (< 500 HP); wall/rampart upkeep fully delegated to repairer
- Removed `REPAIR_RESERVE`, `SURPLUS_THRESHOLD`, `pickWeakestBarrier()`
- Non-barrier repair sorted by hit % (most degraded first)
- Repairer always spawns (max=1) regardless of tower presence (removed `hasTower ? 0 : 1` gating)

**Hauler refinements (`role.hauler.js`):**
- Delivery flip threshold lowered from 100% to 50% store capacity; haulers start delivering sooner
- `pickContainer()` helper: prefers closest container when all are >= 80% full; otherwise fullest
- Container-pinned mode: when `containerId` is set, withdraw only from that container; wait near it when empty rather than roaming
- Opportunistic pickup capped at range 5 (was unlimited)

**Cache and upgrader (`cache.js`, `role.upgrader.js`):**
- `pickupNearby()` accepts optional `maxRange` parameter; callers now pass 5
- Upgrader container pool falls back to source containers when no non-source containers are available (prevents stalling when only source containers have energy)
- Upgrader opportunistic pickup capped at range 5

### Files Changed

- `src/role.repairer.js` — barrier-to-maxHits logic, persistent repairTarget, hasWork() helper, priority fix, emoji fix
- `src/role.defender.js` — ranged variant, rampart-hold tactic, retreat logic, rally to rampart
- `src/main.js` — ranged defender spawn, emergency body selection, hauler per-container spawn pinning, repairer always-spawn (max=1), defender/defender-ranged bodies in getBody()
- `src/role.hauler.js` — 50% delivery flip, pickContainer() helper, container-pinned withdraw mode, pickup range 5
- `src/role.tower.js` — removed barrier maintenance passes, simplified to emergency + non-barrier repair only
- `src/cache.js` — pickupNearby() maxRange parameter
- `src/role.upgrader.js` — container pool fallback to source containers, pickup range 5

### Commits This Session

- `128b92a` — Repairer barrier overhaul, ranged defender, hauler per-container pinning, tower simplification

### Decisions Made

- **Repairer targets barriers to maxHits** — the HP-floor approach left walls far below their structural maximum; with a tower managing non-barrier upkeep, the repairer can commit entirely to raising barriers.
- **Persistent repairTarget** — re-sorting walls (up to 300M maxHits each) every tick is wasteful; locking onto one target per energy load is O(1) after selection and prevents the repairer oscillating between walls.
- **Barriers before containers** — tower already handles container upkeep when idle; repairer should handle what the tower cannot raise high enough.
- **Tower delegates walls/ramparts to repairer** — tower repair passes for barriers beyond emergency were removed; a dedicated repairer with persistent targeting is more effective than scattered tower pulses.
- **Ranged defender for healer squads** — melee defenders cannot out-DPS a healer repairing the attacker; ranged attack bypasses this by dealing consistent damage from distance.
- **Rampart-hold tactic** — holding position on a rampart and waiting for range-1 contact is more efficient than charging; rampart provides structural protection.
- **50% hauler delivery flip** — prevents extensions starving while haulers sit at containers filling to 100%.
- **Pickup range 5** — unlimited radius caused haulers and upgraders to roam for small drops; range 5 keeps behavior local.

### Issues Encountered

- Containers were ahead of barriers in the repair priority queue, causing the repairer to cycle between containers while walls sat at low HP. Fixed by restructuring the `doRepair()` conditional tree.
- `creep.say('brick')` was a string literal instead of the emoji character `'🧱'`.

### Remaining / Next Session

- Deploy to MMO and watch repairer commit to one wall per energy load; confirm barriers trend toward maxHits over multiple sessions
- Observe ranged defender engaging a healer-accompanied raid
- Verify miner pre-spawn, builder count gating, hauler link collapse (carry-over from 2026-04-28)
- Test remote miner by configuring `Memory.remoteRooms` manually
- At RCL 6, verify mineral harvester spawns and deposits correctly

---

## Session: 2026-04-28 — Economy Hardening, Stamp Planner Rewrite, Remote/Mineral Roles

**Duration Estimate**: Multi-hour session (22 discrete changes)
**Session Focus**: Fix a chain of economic correctness bugs at RCL 4+ (emergency guard, miner pre-spawn race, rebalancer interference, link detection), rewrite the planner to use a fixed stamp template, and add two new roles (remote miner, mineral harvester).

### What Was Accomplished

**Bug fixes — spawn/economic correctness:**
- **Emergency guard fixed** — `roomCreeps('harvester') === 0` added to the RCL 4 emergency condition; previously fired whenever miners or haulers were absent even if harvesters were covering income.
- **Miner pre-spawn race fixed** — replaced `minersForContainer.length < 1` with `activeMinerCount < 1` (filters out dying miners below `MINER_RESPAWN_TTL=75`), so replacements spawn before the dying miner actually expires.
- **Miner container rebalancing bug fixed** — `rebalanceSources` now skips all `role==='miner'` creeps; miners own a specific container and must never be source-reassigned mid-life.
- **Spawn 1 miner per container** — loop changed from "one per source" to "one per container adjacent to source"; `containerId` stamped into miner memory at spawn time so `assignContainer` is bypassed.
- **Hauler link detection fixed** — replaced `linksBuilt >= 2` with `cache.getLinkRoles(room)` check requiring `srcLinks.length >= 1 && receiverLinks.length >= 1`; two source links with no receiver link wrongly collapsed hauler count to 1.
- **Miner container invalidation** — `role.miner.js` now detects when `containerId` no longer matches the assigned source (e.g., after a rebalance) and calls `assignContainer` to re-home.

**Spawn logic improvements:**
- **Upgrader count corrected** — from `rcl>=4?4:3` to `rcl>=6?3:2`; old count assumed income that RCL 4 miners/haulers cannot sustain. GCL farming mode added: 5 upgraders when `rcl===8 && storage>100k`.
- **Builder count gated on construction sites** — `builderMax=0` when no `FIND_CONSTRUCTION_SITES` exist; idle builders no longer drain energy.
- **Spawn at full capacity** — `spawnStandard` now computes the target body at `energyCapacityAvailable`, costs it with a new `bodyCost()` helper, and waits until `energyAvailable >= targetCost`; income-critical roles (harvester/miner/hauler) bypass the wait.
- **Renewal logic refined** — `renewCreeps` at RCL 4+ only renews haulers (already adjacent to spawn when idle); RCL 1–3 renews any role.

**Role behavior improvements:**
- **Upgrader no direct mining at RCL 4+** — when a link/container supply exists, upgraders park near the controller and wait rather than competing with miners at sources.
- **Hauler picks fullest container** — changed from `findClosestByPath` to a `reduce` max on `store[RESOURCE_ENERGY]`; drains the most stocked container first to prevent overflow.
- **Hauler idle behavior** — when nothing needs filling, haulers top up their own store from the fullest container, then park at range 1 of the spawn.
- **Tower fill threshold removed** — haulers fill towers whenever `getFreeCapacity() > 0` (was only when below 50% capacity).
- **Hauler reusePath** — raised from 2 to 10 for all `moveTo` calls in the hauler; reduces pathfinding CPU on long delivery routes.
- **Scout reusePath** — reduced from 50 to 5 to prevent getting stuck on stale empty paths between rooms.
- **Scout count fix** — counts scouts by `homeRoom` in memory (not current room) so a scout crossing rooms isn't double-counted as zero.
- **Scout spawn cooldown** — 1500-tick cooldown (`Memory.rooms[rn].lastScoutSpawn`) prevents spam-replacing scouts that die far from home.

**Planner rewrite:**
- **Stamp/bunker planner** — `planner.js` completely rewritten from BFS flood-fill to a fixed 11×11 stamp template centered on the hub tile. The stamp encodes every structure type (spawn, storage, 60 extensions, 6 towers, receiver link, terminal, 10 labs, observer, nuker, power spawn, internal roads) as `{dx, dy, type}` offsets. RCL limits are enforced per structure type via `STAMP_LIMITS`. A new `stampFits()` function validates the full footprint before committing to a hub candidate. Roads are processed last so structures claim their tiles first.

**New roles:**
- **`role.remoteMiner.js`** — travels to a `targetRoom` from memory, finds sources, filters out source-keeper-lair-adjacent sources (SK-room aware), mines by `sourceIdx`, and drops energy (no carry infrastructure in remote rooms). Spawned when `Memory.remoteRooms[roomName]` lists target rooms.
- **`role.mineralHarvester.js`** — RCL 6+, one per room with an extractor and mineral supply. Harvests the room mineral, deposits into terminal first (for market access), then storage. Respects extractor cooldown.

### Files Changed

- `src/main.js` — emergency guard fix; miner-per-container loop; activeMinerCount race fix; link detection via getLinkRoles; upgrader count formula; builderMax gated on sites; spawnStandard full-capacity wait + bodyCost helper; hauler spawn via link roles; renewCreeps RCL gate; rebalanceSources miners excluded; scout homeRoom count + cooldown; remote miner + mineral harvester spawn blocks; ROLE_MAP entries for two new roles
- `src/planner.js` — complete rewrite: STAMP constant (11×11 template), STAMP_LIMITS map, stampFits() validator, updated findHub() to validate stamp footprint, updated placeStructures() to iterate STAMP entries gated by RCL limits
- `src/role.hauler.js` — fullest-container pick (reduce); idle fill-then-park behavior; tower fill threshold removed (always fill); reusePath raised to 10 across all moveTo calls
- `src/role.miner.js` — containerId invalidation guard; assignContainer skipped when containerId already set at spawn
- `src/role.scout.js` — reusePath reduced to 5
- `src/role.upgrader.js` — RCL 4+ parks near controller instead of mining directly
- `src/role.remoteMiner.js` — new file: remote mining with SK-room source filtering
- `src/role.mineralHarvester.js` — new file: mineral harvest to terminal/storage

### Commits This Session

- `511ba3f` — RCL 4+ economy hardening, stamp planner rewrite, new remote/mineral roles

### Decisions Made

- **Miner per container, not per source** — sources can have more than one adjacent container; binding to the container (not just the source) avoids two miners competing for the same tile.
- **Full-capacity spawn wait** — one large creep is always more efficient than two small ones on MMO; the wait is bypassed for income-critical roles to prevent starvation.
- **Stamp over flood-fill** — a fixed stamp gives deterministic, human-readable placement and is far easier to tune than BFS scoring. The hub candidate check now validates the entire footprint fits before committing.
- **Hauler pulls from fullest container** — prevents a lightly loaded container from growing while a full one is ignored, which can trigger miner stops when miners' containers overflow.
- **Remote miner drops energy** — simplest correct behavior for rooms with no infrastructure; a follow-up hauler role can collect dropped energy.
- **Scout cooldown over count** — counting by homeRoom was correct but not sufficient; a 1500-tick cooldown prevents wasted energy when the previous scout died crossing into an unknown room.

### Issues Encountered

- `linksBuilt >= 2` check was masking the real bug (two source links with no receiver = no transfer); the fix required reading `cache.getLinkRoles()` properly.
- The BFS flood-fill planner had no concept of footprint validation; the stamp approach needed `stampFits()` to avoid placing hub on terrain that couldn't fit the full layout.

### Remaining / Next Session

- Deploy and verify in-game: full-capacity miner spawns correctly before the dying miner expires
- Confirm builder count drops to 0 when no construction sites remain
- Verify hauler collapses to 1 when link network is operational (srcLinks>=1, receiverLinks>=1)
- Test stamp planner against existing rooms — confirm hub placement selects a valid footprint
- Remote miner: test in a non-SK adjacent room; configure `Memory.remoteRooms` manually
- Mineral harvester: verify extractor cooldown handling and terminal deposit priority
- Consider adding a hauler-to-storage withdraw path when storage exists and is below threshold
- Consider deleting or consolidating `defense.js` (only chokepoint walls remain)

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
