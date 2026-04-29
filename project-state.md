# Project State

_Last updated: 2026-04-29_

## Current Project State

The bot is in active mid-game development. Core economic and defensive systems are stable. This session overhauled the repairer to bring walls and ramparts to full maxHits (when a tower is present), added persistent repair targeting, fixed barrier queue priority, and hardened the defender role with a ranged variant and rampart-hold tactics. The hauler was also refined with per-container pinning and smarter pickup radius.

**What works:**
- Full RCL 1–8 spawn logic with role prioritization and emergency fallback
- Emergency guard correctly requires zero harvesters AND zero miners/haulers before firing
- Miner + hauler economy activates at RCL 4; one miner per container; `containerId` stamped at spawn; pre-spawn replacement triggered before dying miner expires
- Miners excluded from `rebalanceSources`
- Hauler count collapses to 1 when `srcLinks >= 1 && receiverLinks >= 1`
- Link network (RCL 5+) eliminates hauler trips; source links → receiver link near spawn/storage
- Hauler per-container pinning: each hauler carries `containerId` in memory (container mode); link mode spawns one unassigned hauler
- Hauler delivery flip at 50% capacity; pickup radius capped at range 5
- Spawns wait for full-capacity body; income roles bypass wait
- Upgrader count `rcl>=6?3:2`; GCL farming at RCL 8 (5 upgraders when storage > 100k)
- Builders only spawn when construction sites exist
- Upgraders park near controller at RCL 4+; fall back to source containers if no non-source containers available
- Renewal at RCL 4+ restricted to haulers only; all roles at RCL 1–3
- Scout: counts by homeRoom; 1500-tick cooldown; reusePath=5
- Stamp planner: fixed 11×11 template with full footprint validation
- **Repairer barrier overhaul**: brings walls/ramparts to full maxHits when tower present; barriers ranked above containers/roads in repair queue; persistent `repairTarget` in memory commits full energy load to one barrier; `hasWork()` helper prevents harvesting when idle; without a tower, handles only roads/containers
- **Tower simplified**: handles only emergency ramparts (< 500 HP) and non-barrier structure repair; walls/ramparts fully delegated to repairer
- Repairer always spawns (max=1) regardless of tower presence
- **Defender ranged variant**: spawned when hostiles have HEAL parts; uses RANGED_ATTACK, rangedMassAttack() for multi-target; melee variant holds rampart position before engaging
- Retreat logic: defender flees to nearest rampart below 40% HP
- Safe-mode auto-activation when hostile combat creeps present and towers low
- Scout → claimer → pioneer pipeline for automated room expansion (RCL 4+ headroom)
- Remote miner role: travels to `targetRoom`, mines safe sources, drops energy
- Mineral harvester role: RCL 6+, harvests minerals into terminal then storage

**In progress / known fragile:**
- Remote miner and mineral harvester are coded but untested in live game
- Multi-room expansion untested at scale
- `defense.js` stripped to only chokepoint wall placement; candidate for deletion
- Stamp planner untested against live rooms

**Not yet implemented:**
- Hauler withdraw from storage (haulers still drain containers/links only)
- Automatic nuker management
- Observer/power creep roles
- Remote hauler to collect dropped energy from remote miners

## Current Goals

### Short-term (next 1–3 sessions)
- Deploy and verify in-game: repairer correctly commits to one wall/rampart per energy load; barriers reach maxHits over time
- Verify ranged defender spawns and engages healer-accompanied raiders correctly
- Deploy and verify miner pre-spawn, builder count gating, hauler link collapse
- Test remote miner by setting `Memory.remoteRooms` and watching in game

### Long-term
- Reach RCL 8 in starting room
- Claim and bootstrap a second room
- Add hauler withdraw from storage when storage exists
- Add remote hauler to collect dropped energy from remote miners

## Recent Decisions

- **Repairer targets barriers to maxHits** — the old HP-floor approach left walls far below their structural maximum; with a tower managing non-barrier upkeep, the repairer can focus entirely on barriers until they are fully healed.
- **Persistent repairTarget** — re-sorting walls (up to 300M maxHits each) every tick was wasteful; locking onto one target per energy load is O(1) per tick after selection and prevents the repairer orbiting between walls.
- **Barriers before containers in repair queue** — containers were draining the repairer's energy while walls degraded; tower already handles container upkeep at idle, so repairer should prioritize what the tower cannot raise high enough.
- **Tower delegates walls/ramparts to repairer** — tower repair passes for barriers beyond emergency were removed; a dedicated repairer with persistent targeting is more efficient than tower pulses at long range.
- **Ranged defender for healer squads** — melee defenders cannot out-DPS a healer repairing the attacker; ranged attack + mass attack bypasses this by dealing consistent chip damage from outside melee range.
- **Rampart-hold tactic** — a melee defender on a rampart takes reduced damage; holding position and waiting for hostiles to approach in range 1 is more efficient than charging into the open.
- **Hauler 50% flip threshold** — waiting for 100% capacity before delivering meant haulers sat at containers while extensions starved; flipping at 50% ensures faster energy distribution at the cost of two trips.
- **Pickup range 5** — unlimited pickup radius was causing haulers and upgraders to cross the room for small drops; capping at 5 keeps behavior local and predictable.
- **Miner per container** — binding miner to container prevents two miners competing for the same tile.
- **Full-capacity spawn wait** — one large creep is more efficient than two small ones on MMO.
- **Hauler link detection via getLinkRoles** — `linksBuilt >= 2` failed when two source links existed with no receiver.
- **Emergency guard requires zero harvesters** — the guard only fires when all income roles are truly absent.

## Known Issues / Tech Debt

- `defense.js` is mostly dead code (all placement logic moved to planner); only `run()` with chokepoint walls remains. Candidate for deletion.
- The `roles/` subdirectory appears unused — legacy scaffold.
- Remote miner drops energy in place; no remote hauler exists to collect it.
- No CPU profiling at high RCL with full creep roster.
- Stamp planner hub scoring formula may not produce the best hub for every room layout.

## Next Steps

1. Deploy to MMO and monitor: watch repairer lock onto one wall/rampart per energy load; confirm barriers trend toward maxHits.
2. Observe ranged defender behavior when a healer-accompanied raid occurs.
3. Set `Memory.remoteRooms = { 'W1N1': ['W2N1'] }` (example) and watch remote miner in live game.
4. At RCL 6, verify mineral harvester spawns and deposits to terminal.
5. Verify stamp planner hub tile selection on current room.
6. Consider deleting or consolidating `defense.js` since planner now owns all structure placement.
