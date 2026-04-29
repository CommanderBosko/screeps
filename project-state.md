# Project State

_Last updated: 2026-04-28_

## Current Project State

The bot is in active mid-game development. Core economic and defensive systems are stable and corrected. This session fixed a chain of subtle economic correctness bugs at RCL 4+ (emergency guard, miner pre-spawn race, rebalancer interference, link network detection), rewrote the structure planner to use a fixed stamp template, and added two new roles for late-game and remote play.

**What works:**
- Full RCL 1–8 spawn logic with role prioritization and emergency fallback
- Emergency guard correctly requires zero harvesters AND zero miners/haulers before firing
- Miner + hauler economy activates at RCL 4; one miner per container (not per source); `containerId` stamped at spawn; pre-spawn replacement triggered before dying miner expires
- Miners excluded from `rebalanceSources` — they own their specific container and must never be reassigned mid-life
- Hauler count correctly collapses to 1 when `srcLinks >= 1 && receiverLinks >= 1` (not just `linksBuilt >= 2`)
- Link network (RCL 5+) eliminates hauler trips: source links → receiver link near spawn/storage
- Spawns wait for full-capacity body (`energyAvailable >= bodyCost(targetBody)`); income roles bypass wait
- Upgrader count corrected to `rcl>=6?3:2`; GCL farming mode at RCL 8 (5 upgraders when storage > 100k)
- Builders only spawn when construction sites exist
- Hauler idle: tops up from fullest container, then parks at range 1 of spawn
- Hauler always fills towers to 100% (no threshold)
- Renewal at RCL 4+ restricted to haulers only; all roles at RCL 1–3
- Upgraders park near controller at RCL 4+ instead of competing with miners at sources
- Scout: counts by homeRoom in memory; 1500-tick cooldown; reusePath=5 (was 50)
- Stamp planner: fixed 11×11 template with full footprint validation before hub commitment
- Tower logic: attack > heal > emergency barriers > repair > barrier maintenance > surplus top-up (unchanged)
- Wall/rampart HP targets from `cache.getWallTarget()`: 10k/50k/150k/300k per RCL
- Unified wall+rampart repair pool sorted by lowest hits via `pickWeakestBarrier()`
- Safe-mode auto-activation when hostile combat creeps present and towers low
- Scout → claimer → pioneer pipeline for automated room expansion (RCL 4+ headroom)
- Remote miner role: travels to `targetRoom`, mines safe sources, drops energy
- Mineral harvester role: RCL 6+, harvests minerals into terminal then storage

**In progress / known fragile:**
- Remote miner and mineral harvester are coded but untested in live game
- Multi-room expansion untested at scale (pioneer + claimer logic exists but is lightly tested)
- `defense.js` stripped to only chokepoint wall placement; rampart placement fully owned by `planner.js`
- Stamp planner untested against live rooms — hub footprint validation is new

**Not yet implemented:**
- Hauler withdraw from storage (haulers still drain containers/links only, not storage)
- Automatic nuker management
- Observer/power creep roles
- Hauler-to-remote-room energy logistics (remote miner drops energy; no collector yet)

## Current Goals

### Short-term (next 1–3 sessions)
- Deploy and verify: miner pre-spawn correctly fires before dying miner expires; builder count drops to 0 when no sites; hauler collapses to 1 with link network
- Verify stamp planner hub placement selects a valid footprint on a real room
- Test remote miner by setting `Memory.remoteRooms` and watching in game
- Test mineral harvester at RCL 6 (confirm extractor cooldown handling and terminal deposit)

### Long-term
- Reach RCL 8 in starting room
- Claim and bootstrap a second room
- Add hauler withdraw from storage when storage exists
- Add remote hauler to collect dropped energy from remote miners

## Recent Decisions

- **Miner per container** — binding miner to container (not just source) prevents two miners competing for the same tile when a source has multiple containers. `containerId` stamped at spawn bypasses `assignContainer` entirely.
- **activeMinerCount excludes dying miners** — the pre-spawn race condition was caused by the dying miner keeping `minersForContainer.length === 1`. Filtering by `ticksToLive >= MINER_RESPAWN_TTL` gives a true count of productive miners.
- **Rebalancer skips miners** — miners own a fixed container and should never drift to a different source mid-life; allowing rebalancing caused incorrect source/container pairing.
- **Full-capacity spawn wait** — one large creep is more efficient than two small ones on MMO; `bodyCost()` helper added to accurately cost any body array. Income roles bypass to prevent starvation.
- **Hauler pulls fullest container** — drains the most stocked container first, preventing miner stops when a container overflows while a lighter one is targeted.
- **Stamp over flood-fill** — deterministic, human-readable placement; footprint validated before hub commitment; easier to audit and tune.
- **Scout cooldown** — 1500 ticks prevents energy waste when a scout dies far from home; counting by homeRoom correctly tracks scouts in transit.
- **Upgraders park at RCL 4+** — miners saturate source tiles; upgraders waiting near the controller are more efficient than competing for access.
- **Tower always fills to 100%** — the 50% threshold was allowing towers to run low during sustained combat; removed to keep defensive capability maximal.
- **Hauler link detection via getLinkRoles** — `linksBuilt >= 2` failed when two source links existed with no receiver; `getLinkRoles()` distinguishes source vs receiver links correctly.
- **Emergency guard requires zero harvesters** — the guard was too permissive; it now only fires when all income roles (harvester, miner, hauler) are truly absent.

## Known Issues / Tech Debt

- `defense.js` is mostly dead code (all placement logic moved to planner); only `run()` with chokepoint walls remains. Candidate for deletion.
- The `roles/` subdirectory appears unused — legacy scaffold.
- Remote miner drops energy in place; no remote hauler exists to collect it. Energy is lost unless the remote room is later claimed.
- No CPU profiling at high RCL with full creep roster — high-CPU warning fires at 18 CPU; bucket is the safety net.
- Stamp planner hub selection scores by openness + proximity to spawn/sources/controller; the scoring formula may not produce the best hub for every room layout.

## Next Steps

1. Deploy to MMO and monitor: verify miner pre-spawn fires correctly; builder count drops to 0 with no sites; hauler count collapses to 1 with link network active.
2. Set `Memory.remoteRooms = { 'W1N1': ['W2N1'] }` (example) and watch remote miner travel and mine in live game.
3. At RCL 6, verify mineral harvester spawns and deposits to terminal.
4. Verify stamp planner hub tile selection on current room — check `Memory.rooms[roomName].hub` is sensible.
5. Consider adding a remote hauler that collects dropped energy from remote miners and returns it home.
6. Consider deleting or consolidating `defense.js` since planner now owns all structure placement.
