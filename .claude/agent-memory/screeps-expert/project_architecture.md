---
name: Architecture snapshot
description: Module list, roles, spawn priority, link topology, and key thresholds as of April 2026
type: project
---

## Modules
- main.js: game loop, spawn, runLinks, runTowers, rebalanceSources, renewCreeps, defense/planner throttle
- cache.js: tick-level find() cache, getLinkRoles(), pickupNearby(), pickSource()
- planner.js: stamp/bunker pattern — fixed 11×11 template stamped from a hub center point. applyStamp() places structures in template order (structures before roads); findHub() uses distanceTransform + stampFits() validation; placeLinks() handles source/upgrader links outside stamp; placeRoads() pathfinds external roads to sources/controller; placeContainers() near sources/controller; placeRamparts() RCL-scaled. Hub cached in Memory.rooms[room].plan.hub permanently.
- defense.js: ramparts on structures, chokepoint walls at exits — runs every 100 ticks; does NOT place extensions, towers, containers, or roads (planner owns all of these)
- role.miner.js: stationary miner on container, fills source link > container
- role.hauler.js: drains receiver links/containers, fills spawns > extensions > towers (>50%) > storage
- role.upgrader.js: gets energy from controller link > storage > controller container > any container > mine
- role.harvester.js: RCL 1-3 only, mines and delivers to spawns > extensions > towers > storage
- role.builder.js: builds by priority (tower>ext>link>container>storage>road>wall), gets energy from storage > non-source containers > source containers > mine
- role.repairer.js: fills towers <50%, repairs structures by hit%, then walls/ramparts to HP floor, dumps to storage when idle; energy source: storage>1000 > non-source containers>100 > source containers>500 > mine (with 50% spawn guard)
- role.tower.js: attacks hostiles (prefer attack-part creeps), heals wounded, repairs structures

## Spawn priority per room
1. Defenders (reactive, hostiles present)
2. Miners (one per source with container, pre-spawn at TTL<75; activeMinerCount excludes dying miners)
3. Harvesters (3 at RCL 1-3, 0 at RCL 4+)
4. Haulers (= sourcesWithContainer unless srcLinks>=1 AND receiverLinks>=1, then 1)
5. Pioneers (3 per unclaimed room without spawn)
6. Attackers (5 when Memory.attackTarget set)
7. Remote Miners (RCL 4+ with storage; up to 2 per remote room in Memory.remoteRooms[roomName])
8. Mineral Harvesters (RCL 6+; 1 per room when extractor + mineral.mineralAmount > 0, costs 850 energy)
9. Builders (2 if constructionSites.length > 0, else 0)
10. Upgraders (RCL 1-5: 2, RCL 6-7: 3, RCL 8: 1 or 5 if storage>100k)
11. Repairers (1 unless tower exists)
12. Scouts (when GCL headroom and RCL>=4)
13. Claimers (when Memory.claimTarget set)

## Remote room configuration
Set `Memory.remoteRooms[roomName] = ['W1N2', 'W1N3']` in console to enable remote mining from a room.
Up to 2 remote miners per remote room, sourceIdx 0 and 1. Bodies scale with energy (200-700).
SK rooms detected by STRUCTURE_KEEPER_LAIR within range 5 of source — those sources are skipped.

## Mineral harvesting
role.mineralHarvester.js: body [WORK×5, CARRY×2, MOVE×3] = 850 energy.
Deposits into terminal first (market access), falls back to storage.
Activates only when mineral.mineralAmount > 0 and extractor.cooldown === 0.
Register with Memory: no setup needed — spawner checks for extractor + mineral automatically at RCL 6+.

## Link topology
- Source links: within range 2 of a source — filled by miner, classified as srcLink
- Receiver links: everything else — can be near spawn/storage OR near controller (upgrader link)
- runLinks: fires all src links to the receiver with most free capacity
- upgrader: prefers controller-adjacent receiver link for stationary withdrawal at RCL 6+

## Key thresholds
- MINER_RESPAWN_TTL = 75 (pre-spawn replacement)
- RENEW_AT_TTL = 400 (opportunistic renewal when spawn idle)
- Storage withdrawal: upgrader>5000, builder>500, repairer>300 (lowered May 2026)
- Planner runs every 5 ticks (offset 3), defense every 30, rebalance every 20
- Body scaling uses min(energyCapacityAvailable, energyAvailable) so bodies grow with extensions

## Upgrader link (RCL 6+)
Planner places a link within range 3 of controller when 3 link slots available. This enables
stationary upgraders that withdraw from the controller link instead of travelling to storage.
Why: controller is far from spawn — link removes the hauler round-trip for upgrade energy.

## Planner: stamp/bunker architecture (rewritten April 2026)
Replaced BFS flood-fill + parity checkerboard with a fixed 11×11 stamp template centered on a hub point.
Stamp encodes every structure offset as {dx, dy, type}. applyStamp() iterates the stamp, gates each
type on its RCL limit, and calls createConstructionSite — structures first, roads last (so structures
claim tiles before roads attempt to occupy them). stampFits() validates the full footprint before hub selection.
Key stamp positions: spawn[0,0], storage[0,-1], receiver link[0,-2], terminal[0,1], observer[0,2].
Extensions: 60 total across 5 rings; [2,-3] excluded (conflicts with lab cluster) — compensated by [-4,3].
Towers: 6 at [-3,-3],[3,-3],[-3,3],[3,3],[-4,-2],[4,-2].
Labs: 10 in +x/-y quadrant [2,-3]..[5,-5].
Receiver link handled by stamp at [0,-2]; source links and upgrader link still placed by placeLinks().
Hub is cached permanently in Memory.rooms[room].plan.hub after first findHub() call.

## Planner rebuild detection (needsReplanning)
Planner checks extension count, tower count, container count, and link count against RCL limits every 5 ticks.
If any are below target (structures destroyed), full replanning runs immediately — no waiting for next RCL change.
lastRCL is only committed once all ext+tower counts reach their targets (prevents silent incomplete plans).

## Rampart placement scaling by RCL (fixed April 2026)
At RCL 2-3 planner previously placed ramparts on every extension, container, spawn, controller — up to 9+.
A base repairer (1 WORK) does ~20-40 effective HP/tick vs 1 HP/tick decay per rampart = unsustainable.
No tower exists at RCL 2 (TOWER_LIMITS[2]=0), so only the repairer was covering all ramparts.
Fix: placeRamparts is now RCL-gated:
  - RCL 2-3: spawn only (1 rampart)
  - RCL 4: spawn + towers
  - RCL 5+: all critical structures + controller
needsReplanning rampart check mirrors the same scaled set to prevent infinite replan-decay cycles.
Tower and repairer both got an emergency priority for ramparts < 500 HP (rescues before road/container maintenance).

## Receiver link detection fix (April 2026)
Receiver link presence check uses range 1 (not 2) from anchor (storage/spawn).
Prior range-2 check could treat a nearby source link as the receiver and skip placing a real receiver link.

## Hauler sourceId bug (fixed April 2026)
spawnStandard() previously stamped sourceId on ALL roles including haulers.
Haulers don't use sourceId (they pull from receiver links by position), but pickSource() and
rebalanceSources() both count every creep with a sourceId — so haulers inflated one source's
bucket, causing rebalanceSources to steal a miner from that source unnecessarily.
Fix: ROLES_NEEDING_SOURCE Set gates sourceId assignment to harvester/upgrader/builder/repairer only.
Miners assign their own sourceId in role.miner.assignSource().

## Miner fall-through harvest fix (fixed April 2026)
Miner was returning after a successful transfer (link or container), losing one harvest tick per
fill cycle. Fixed: only return early if transfer result !== OK (store blocked). On OK, fall
through to harvest() on the same tick — saves ~1 tick per 2-tick fill cycle at 5 WORK body.

## RCL 4+ emergency guard fix (fixed April 2026)
Emergency guard at RCL 4+ fired when miners=0 AND haulers=0, even if harvesters were present.
This caused an infinite loop: it kept spawning Emergency harvesters every tick, never reaching
the miner spawn block. Fix: added `&& roomCreeps('harvester', rn) === 0` so the guard only
fires when there is truly zero income from any role.
With 2 containers per source, `sourcesWithContainer` counts unique sources (not containers),
so haulerMax = 2 (no links) or 1 (links present) — correct regardless of containers-per-source count.

## Spawn audit fixes (applied April 2026)
- Fix 1: Miner pre-spawn race — activeMinerCount now filters dying miners (ticksToLive < MINER_RESPAWN_TTL) so replacement spawns even while the dying miner is still alive.
- Fix 2: Hauler link collapse — replaced `linksBuilt >= 2` with `srcLinks >= 1 AND receiverLinks >= 1` using getLinkRoles(). Prevents collapsing to 1 hauler when 2 source links exist but no receiver.
- Fix 3: Upgrader count simplified to `rcl >= 8 ? 1 : (rcl >= 6 ? 3 : 2)`. Mid-RCL no longer over-saturates with 4 upgraders.
- Fix 4: Builder count now `constructionSites.length > 0 ? 2 : 0`. Builders don't spawn when there's nothing to build.
- Fix 5: Hauler reusePath changed from 2 to 10 — reduces pathfinding recalculation on stable delivery routes.
- Fix 6: rebalanceSources skips miners (`role === 'miner'`) — miners own their container slot and must not be reassigned.
- Fix 7: Upgrader direct mining blocked at RCL 4+ — parks near controller instead to avoid competing with miners on source tiles.
- Fix 8: GCL farming — upgraderMax becomes 5 at RCL 8 when storage.store[RESOURCE_ENERGY] > 100000.
- Fix 9: Remote miner role added (role.remoteMiner.js), spawned from Memory.remoteRooms.
- Fix 10: Mineral harvester role added (role.mineralHarvester.js), spawned at RCL 6+ when extractor active.

## Lab reaction manager (added May 2026)
lab.js: new module, wired into main loop alongside runLinks.
Reads Memory.labReaction[roomName] for configured product (e.g. 'OH', 'ZK').
Designates output lab as the one closest to all others (minimises runReaction range failures).
Stores { input1, input2, output } IDs in Memory.rooms[roomName].labs; re-designates if any ID is stale.
Calls outputLab.runReaction(srcA, srcB) each tick when inputs have the correct reagents.
Logs unexpected errors (not ERR_NOT_ENOUGH_RESOURCES, not ERR_TIRED).
Does NOT haul minerals into input labs — that is a separate task.
To configure: `Memory.labReaction['W1N1'] = 'OH'` in console.

## Extractor placement (added May 2026)
planner.placeExtractor(room) places STRUCTURE_EXTRACTOR on the mineral tile at RCL 6+.
Called from planner.run() at RCL 6+ alongside other placement functions.
needsReplanning() now checks terminal, labs, and extractor — previously these were never retried if missed.
lastRCL commit guard also updated to gate on terminal, labs, and extractor counts.

## barrierCap shared export (refactored May 2026)
cache.barrierCap(rcl) is the canonical barrier HP target function (10k/50k/200k/1M/5M by RCL).
Formerly defined locally in role.repairer.js; now lives in cache.js and imported by role.repairer.js as `const barrierCap = cache.barrierCap`.
main.js needsRepair gate and role.repairer hasWork() / doRepair() both use this function.
Old cache.getWallTarget() (different values, unused) has been removed.
All `s.hits < s.hitsMax` barrier predicates replaced with `s.hits < barrierCap(rcl)` or `s.hits < cap`.

## cache.getTowers helper (added May 2026)
cache.getTowers(room) returns FIND_MY_STRUCTURES filtered to STRUCTURE_TOWER, cached per tick via the existing find() infrastructure.
Used by runTowers() and checkSafeMode() in main.js instead of inline .filter() calls.

## Remote miner deposit behavior (changed May 2026)
role.remoteMiner now returns home to deposit rather than dropping energy in the remote room.
Uses standard two-flag pattern: returning=false → mine in targetRoom, returning=true → go to homeRoom and transfer to storage (fallback to spawn, then drop).
Spawn body tiers rebalanced to give more CARRY (trip-weight matters now): 850=3W6C5M, 700=3W4C4M, 500=2W3C3M, 300=1W2C2M, 200=1W1C1M.

## Miner link search radius fix (fixed May 2026)
role.miner searched `findInRange(FIND_MY_STRUCTURES, 1)` for a source link from the miner's position
(which is the container tile). placeLinks() first tries to place the link on a tile adjacent to BOTH
source and container, but falls back to any open tile adjacent to the source — which can be on the
opposite side of the source from the container (range 2 from miner). Range 1 misses that link.
Fix: changed search to `findInRange(FIND_MY_STRUCTURES, 2)`. Source links are always within range 2
of the source, and the container is range 1 from the source, so miner-to-link distance is at most 2.

## Energy-stall self-recovery fixes (fixed May 2026)
Three coordinated fixes to make the bot recover from an empty-spawn energy drought at RCL 4+.

### Bug 1: Hauler stranded energy — container empty wait loop
role.hauler.js: when a pinned hauler's container was empty (miner dead), it waited next to the container
indefinitely even if it was already carrying energy. `delivering` flag only flips on full store, so a
partial load was never delivered. Spawn starved permanently.
Fix: if container is empty AND hauler carries >= PARTIAL_DELIVER_THRESHOLD (100) energy, immediately
set `delivering = true` and head for spawn. Hauler now escapes the wait loop.

### Bug 2: Emergency spawn blocked by live-but-empty hauler
main.js: RCL 4+ emergency path required `roomCreeps('hauler') === 0`. A single hauler alive next to
an empty container (with nothing in its store) counted as a "live hauler" and blocked the emergency path
from ever firing — even though that hauler had zero ability to unblock the spawn.
Fix: compute `liveHaulers` and check if any have >= 100 energy in store (`haulerCanDeliver`).
Emergency fires when `noHaulers || !haulerCanDeliver`, not just when `noHaulers`.

### Bug 3: Miner link-park idle when link full
role.miner.js: when link was full (`ERR_FULL`), miner returned without harvesting, wasting the tick.
Fix: only return on unexpected errors. `ERR_FULL` falls through to `harvest()` — energy stays in miner
store and transfers next tick when link drains.

## Miner stale containerId bug (fixed April 2026)
rebalanceSources() can switch a miner's sourceId mid-life to balance source coverage.
assignContainer() only fires when containerId is falsy — so after a rebalance, the miner kept
its OLD container (adjacent to the old source) while now assigned to a different source.
Result: miner sat on the wrong container, called harvest() on the new (distant) source, got
ERR_NOT_IN_RANGE silently, and idled indefinitely with no visible error.
Fix: in roleMiner.run, after resolving the source object, validate that the cached containerId
is still within range 1 of the current source. If not, null it and re-run assignContainer().
This is O(1) per tick (getObjectById + inRangeTo) — no CPU cost concern.
