---
name: Optimization patterns
description: CPU and energy optimization patterns found and applied in this codebase
type: feedback
---

## CPU patterns applied

**ROLE_MAP hoisted to module scope**: Was rebuilt inside setRoles() every tick for every creep.
**Why:** Object literal construction in a hot loop is waste; module-scope constant is free.
**How to apply:** Any static dispatch table built inside a loop should be hoisted.

**cache.getLinkRoles()**: runLinks() previously called sources.some() for every link on every tick.
**Why:** With 2-3 links and 2 sources, that's 4-6 source scans per tick just for link classification.
**How to apply:** Any per-tick classification of mostly-static structures should be tick-cached.

**planner.run throttled to every 10 ticks (offset 3)**: Was called every tick; even the early-return
path paid Memory.rooms read cost. Stagger offset from defense (mod 100) and rebalance (mod 50).
**Why:** Planner only matters when RCL changes, which is extremely rare.

**roomSources / roomMyStructs cached locally in spawnForRoom**: Eliminated duplicate cache.find calls.

**pickupNearby now filters dropped resources < 50 energy**: Avoids chasing tiny scraps.

**miner: early return after transfer when full**: Previously called harvest after transfer in same tick.
**Why:** Store full means harvest is a no-op that still costs CPU.

## Energy patterns applied

**Storage integration**: hauler now fills storage after spawn/ext/towers. Builder/repairer/upgrader
withdraw from storage (with minimum thresholds to prevent starvation).

**Body scaling uses energyCapacityAvailable**: Creeps now spawn at full-room-capacity body size
as soon as they can afford it, instead of always using current-tick energy level.
**Why:** energyAvailable fluctuates; capacity is stable and reflects installed extensions.

**Upgrader source hierarchy**: controller link > storage > controller container > any container > mine.
This keeps upgraders stationary near controller once infrastructure exists.

**Builder avoids source containers**: At RCL 4+ with miners, builders now skip source-adjacent
containers (only withdraw from them if > 500 energy). Prevents builders from draining miner buffers.

**Controller container placed at RCL 3+**: Gives upgraders a local energy cache without needing
a link. Planner places it within range 3 of controller. Upgrader checks ctrl.pos.findInRange(3).

**Upgrader link at RCL 6+**: Third link slot goes near controller. runLinks feeds it automatically.
Upgraders detect it via receiverLinks filtered by inRangeTo(ctrl, 3).

**Upgrader count**: 3 at RCL 1-3, 4 at RCL 4-5, 2 at RCL 6-7, 1 at RCL 8.
**Why:** RCL 4-5 is the biggest bottleneck for expansion; RCL 8 is just keepalive.

**Tower fill threshold in hauler/builder**: Only fill towers when < 50% capacity, not just any gap.
**Why:** Prevents haulers from making a trip for 5 energy top-off.

## Cross-file consistency audit (April 2026)

**rampartTarget cap unified**: role.tower.js capped at 80k, role.repairer.js at 300k. Both now 300k.
**Why:** Tower was stopping auto-repair at 80k while creep repairer targeted 300k; tower kept undoing no work.

**Tower fill threshold unified**: builder used >30% free (~fill when <70% full), hauler/repairer used >50% free.
All three now use >50% free (fill when less than half full).
**Why:** Builder was routing to towers too eagerly, wasting trips for small top-offs.

**defense.js duplicate placers removed**: defense.run() was calling placeContainers() and placeRoads() which
duplicated planner.js logic. The defense versions used inferior algorithms (findPathTo, no cost matrix).
Dead functions placeTowers() and placeExtensions() also removed from defense.js.
**Why:** Two different code paths placing the same structures caused conflicts and inconsistent results.

**repairer container logic aligned with builder**: repairer was draining ANY container with any energy,
including source containers miners depend on. Now avoids source-adjacent containers (>100 threshold),
taps source containers only when overflowing (>500), and has the 50% spawn-low guard before mining.
**Why:** Repairer was stealing miner buffers; builder already had this guard but repairer didn't.

**hauler reusePath added**: All hauler moveTo calls were missing reusePath; recalculated every tick.
**Why:** Haulers are the most active movers — repeated pathfinding was unnecessary CPU burn.

**Tower surplus mode (April 2026)**: When tower energy > 700 and no hostiles are present, tower now
tops up ramparts/walls toward hitsMax (full HP) after the RCL-floor pass completes.
**Why:** `getWallTarget` gives a conservative RCL-tiered floor (e.g. 10k at RCL 3). In peacetime with
spare energy, there is no reason to leave barriers at the floor — thicker walls absorb more damage
before the floor is breached. Gated at 700 energy so normal defense-and-heal capacity is never starved.
Priority order: attack > heal > emergency barrier (<500) > regular structures > floor barriers > surplus topping.

## Correctness fixes (April 2026 audit — 15 issues)

**hasTower vs hasTowerWithEnergy (repairer)**: `doRepair()` was using plain tower-existence check.
Changed to require `store[RESOURCE_ENERGY] > 0`. Matches `hasWork()` and `main.js` spawn gate exactly.
**Why:** Creep was idling with energy while towers existed but were empty.

**repairer doRepair() hoisted variables**: `hasTower`, `allStructures`, `cap` were recomputed mid-function
and duplicated at the bottom in a near-identical block. Hoisted to top; removed duplicate block.
**How to apply:** Always hoist shared state to top of function body.

**Source container fallback threshold > 0 (builder + repairer)**: Was `> 500`, so creeps ignored
partially-full containers as a last resort. Changed to `> 0`.
**Why:** When all other energy sources are gone, 1 energy is better than going to mine directly.

**miner.assignSource() homeRoom filter**: Was checking all miners across all rooms for source conflicts.
Fixed to filter `c.memory.homeRoom === creep.memory.homeRoom` first.
**Why:** Multi-room setups caused miners to avoid sources in their own room due to cross-room collisions.

**runLinks() multiple src→same receiver per tick**: After a successful `transferEnergy()`, now `break`s
out of the src loop. Previously all src links could transfer to the same receiver in one tick.
**Why:** Link cooldown fires after the tick; one receiver can only accept one transfer per tick.

**Emergency harvester at RCL 4+ changed to miner/hauler**: Was spawning `role: 'harvester'` at RCL 4+
where `harvesterMax` is 0 — so it was never renewed. Now spawns as `miner` (with containerId) if a
source container exists, or as a minimal `hauler` if not.
**Why:** `harvester` role at RCL 4+ is invisible to the spawner's renewal logic.

**Hauler container-mode deadlock**: Spawn gate required full-body cost; if energy < targetCost the
hauler was never spawned. Added `trueZeroCoverage` path (mirrors miner) to spawn best affordable body.
**Why:** With no hauler, miner containers fill → miner blocks → income stops.

**Defender body gate corrections**: Previous gates (1080, 730, 1100, 760) were incorrect. Fixed to
match exact body costs: 6T+6A+6M=840, 4T+4A+4M=560, 4T+4RA+4M=840, 3T+3RA+3M=630, etc.
**Why:** Incorrect gates cause ERR_NOT_ENOUGH_ENERGY spawn rejections on smaller bodies.

**planner.js added cache require**: `countType()` and `needsReplanning()` used raw `room.find()`.
Both now use `cache.find()`. `needsReplanning()` raw calls for rampart target also fixed.
**How to apply:** Any module calling `room.find()` in per-tick paths should use `cache.find()`.

**planner.js FIND_SOURCES called twice in placeRoads()**: Extracted to single `const sources` used
for both the `.map(s => s.pos)` targets and the skip check inside the path loop.

**role.scout.js: three filtered find() calls**: Replaced with one `room.find(FIND_STRUCTURES)` and
two JS `.filter()` calls for towers and spawns.

**role.mineralHarvester.js: added cache require**: `harvest()` used raw `room.find()` for extractors
and minerals. Now uses `cache.find()`.

**role.remoteMiner.js: full-store check moved before harvest**: Was dropping after harvest attempt
when full. Now drops and returns BEFORE calling `harvest()`.
**Why:** Attempting harvest when store is full is a wasted action + CPU.

**role.hauler.js: delivery threshold changed to getFreeCapacity() === 0**: Was `>= 50%` capacity.
**Why:** Hauler was starting delivery at half load, requiring 2 trips where 1 would do.

**role.repairer.js: FIND_MY_SPAWNS replaced**: `cache.find(room, FIND_MY_SPAWNS)` changed to
`cache.find(room, FIND_MY_STRUCTURES).filter(s => s.structureType === STRUCTURE_SPAWN)`.
**Why:** Reuses the already-cached FIND_MY_STRUCTURES result instead of a separate cache bucket.



**Miner return-after-transfer**: Was harvesting on same tick as full-store transfer (wasted action).

**repairer sorts by hit percentage** instead of raw hits, so a nearly-broken road gets priority
over a container at 50k/200k hits.

**Attacker uses room.find() (uncached)** since it's in enemy rooms where cache.find doesn't help.
This is acceptable since attackers are rare.

## Body system audit (April 2026) — all thresholds now match exact body costs

Critical spawn-rejection bugs fixed (threshold < body cost = ERR_NOT_ENOUGH_ENERGY):
- Miner 3-WORK: was `>= 350` for 400-cost body. Fixed to `>= 400`. Added 2-WORK `[WORK×2,MOVE]`=250 and `[WORK,MOVE]`=150 tiers.
- Miner dropped CARRY: stationary miners don't need CARRY; replaced with extra WORK.
- Harvester: was `>= 400` for 500-cost body. Fixed. Added 300, 400, 500, 800 tiers.
- Upgrader: was `>= 800` for 850-cost body. Fixed to `>= 800` for `[6W+2C+2M]`=800. Added 300, 1050, 1300 tiers.
- Builder/repairer: was `>= 550` for 600-cost body, `>= 400` for 500-cost body. Fixed all.
- Defender: `[TOUGH×2,ATTACK×2,MOVE×2]`=280, was gated at 380. Fixed to 280.
- Attacker: `[T×3,A×3,M×6]`=570 gated at 720; `[T×2,A×2,M×4]`=380 gated at 480. Fixed both.
- Pioneer: `[W×2,C×2,M×3]`=450 gated at 550. Fixed to 450.

New high-energy scaling added:
- Hauler: now scales from 150 to 1800 energy (24C+12M at RCL5); was capped at 600.
- Upgrader: now scales to 1300 (10W+2C+4M); was capped at 800.
- Builder/repairer: now scales to 1300 (7W+6C+6M); was capped at 550.

Rule: threshold must always >= body cost. Never threshold < cost (spawn rejection). Threshold > cost (energy surplus) is safe but conservative.
