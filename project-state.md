# Project State

_Last updated: 2026-05-06_

## Current Project State

The bot is in active mid-game development. Core economic and defensive systems are well-hardened. This session addressed seven systemic issues: upgrader body selection is now infrastructure-aware (balanced WORK/CARRY when no link or container exists near the controller); `barrierCap()` is consolidated into `cache.js` as the single source of truth; the repairer spawn gate bug (dangling import after prior consolidation) is fixed; remote miners now carry energy home instead of dropping it; `cache.getTowers()` extracts a repeated inline filter; storage floors are lowered to keep builders and repairers functional at lower reserves; and several raw `room.find()` calls in `planner.js` and `main.js` are routed through `cache.find()`.

**What works:**
- Full RCL 1–8 spawn logic with role prioritization and emergency fallback
- Emergency guard correctly requires zero harvesters AND zero miners/haulers before firing
- Emergency spawn now creates a miner (not harvester) when a source container exists, preventing ghost haulers
- Miner + hauler economy activates at RCL 4; one miner per container; `containerId` stamped at spawn; pre-spawn replacement triggered before dying miner expires
- Miners excluded from `rebalanceSources`; miner source assignment filtered to `homeRoom` (no cross-room conflicts)
- Hauler count collapses to 1 when `srcLinks >= 1 && receiverLinks >= 1`
- Hauler total-count ceiling: cannot exceed number of source containers regardless of per-container pinning state
- Hauler delivery flip at 100% store full; pickup radius capped at range 5
- Link network (RCL 5+) eliminates hauler trips; link single-transfer-per-receiver enforced (`break` after first OK)
- Spawns wait for full-capacity body; income roles bypass wait
- **Upgrader bodies**: infrastructure-aware via `getUpgraderBody(energy, hasAdjacentEnergy)`. WORK-heavy (1W→3W→5W→8W→12W) when link/container near controller; balanced WORK/CARRY (1W/1C→2W/2C→3W/3C→5W/5C→7W/6C) when not. All tiers RCL-8-safe (< 15W cap).
- **Upgrader count by storage energy**: no storage → 2; <50k → 1; <150k → 2; <300k → 3; 300k+ → 4
- Builders only spawn when construction sites exist
- Upgraders park near controller at RCL 4+; fall back to source containers if no non-source containers available
- Renewal at RCL 4+ restricted to haulers only; all roles at RCL 1–3
- Scout: counts by homeRoom; 1500-tick cooldown; reusePath=5; single `room.find()` for structures
- Stamp planner: fixed 11×11 template with full footprint validation; `countType()`, `needsReplanning()`, `totalSites()`, and `placeRoads()` all use `cache.find()`
- **Repairer barrier caps**: `cache.barrierCap(rcl)` — RCL 1–3 → 10k; RCL 4–5 → 50k; RCL 6 → 200k; RCL 7 → 1M; RCL 8 → 5M; single source of truth shared by role.repairer.js and the spawn gate in main.js
- **Repairer spawn gate**: demand-driven; only spawns when emergency rampart (<500 HP) exists, or barriers below `barrierCap(rcl)`, or non-barrier damage with no energized tower; gate was broken by a dangling import (now fixed to call `cache.barrierCap()` directly)
- **Repairer target-lock**: `_resolveTarget` clears the lock only on structure destruction (not HP cap); full energy load committed to one barrier per trip
- **Repairer tower-fill removed**: harvesters and builders own tower fill; repairer ignores tower energy level
- **Tower simplified**: handles only emergency ramparts (< 500 HP) and non-barrier structure repair
- **Defender spawn gated on invader core**: defenders only spawn when `STRUCTURE_INVADER_CORE` is detected; towers handle normal NPC creep waves
- **Defender melee-only**: targets invader cores first, falls back to nearest hostile creep; retreat to rampart at 40% HP
- Safe-mode auto-activation when hostile combat creeps present and towers low
- Scout → claimer → pioneer pipeline for automated room expansion (RCL 4+ headroom)
- **Remote miner**: two-flag returning pattern; carries energy home and deposits to storage; body rebalanced with heavier CARRY (no more drop-on-full)
- Mineral harvester role: RCL 6+, harvests minerals into terminal then storage; uses `cache.find()`
- Builder storage withdraw floor lowered to 500 (was 2000)
- Repairer storage withdraw floor lowered to 300 (was 1000)
- `cache.getTowers(room)` helper used by `runTowers()` and `checkSafeMode()`
- `checkAttackComplete()` uses `cache.find()` for hostile and structure queries

**In progress / known fragile:**
- Remote miner behavior with returning pattern not yet observed in live game
- Mineral harvester untested in live game (requires RCL 6)
- Multi-room expansion untested at scale
- `defense.js` stripped to only chokepoint wall placement; candidate for deletion
- Stamp planner untested against live rooms

**Not yet implemented:**
- Hauler withdraw from storage (haulers still drain containers/links only)
- Remote hauler to collect energy from remote miners (returning pattern reduces this urgency)
- Automatic nuker management
- Observer/power creep roles

## Current Goals

### Short-term (next 1–3 sessions)
- Deploy and observe infrastructure-aware upgrader: confirm balanced WORK/CARRY body at current RCL if no link/container near controller
- Watch repairer spawn gate now correctly wired to `cache.barrierCap(rcl)` — confirm repairers spawn when barriers are below RCL cap
- Observe remote miner returning home and depositing to storage; verify heavier CARRY body produces meaningful loads per trip
- Monitor RCL 5 unlock (if not yet happened): storage placed, 2nd tower built, link network activates, hauler count collapses to 1
- Watch `desiredUpgraders()` activate and scale as storage fills

### Long-term
- Reach RCL 8 in starting room
- Claim and bootstrap a second room
- Add hauler withdraw from storage when storage exists
- Consider remote hauler role (returning remote miners reduce urgency)
- Re-add ranged defender if player raids with healers become a problem

## Recent Decisions

- **Infrastructure-aware upgrader spawning** — a WORK-heavy body wastes 70–80% of tick time walking empty when the upgrader has no adjacent energy source; body selection now checks for a receiver link or container within range 3 of the controller before picking the heavy tier.
- **barrierCap into cache.js** — the function was duplicated across `role.repairer.js` (definition + export) and `main.js` (import + usage); a single canonical location in `cache.js` eliminates synchronization risk and removes inter-module export coupling.
- **Repairer spawn gate fixed** — the `needsRepair` gate in `main.js` had a dangling import (`barrierCap` from `role.repairer.js`) after the function moved to `cache.js`; gate now calls `cache.barrierCap(rcl)` directly.
- **Remote miner must carry energy home** — dropping energy in a remote room with no hauler is waste; carrying and depositing to storage is net positive even with more CARRY parts; heavier CARRY body makes each trip worthwhile.
- **Storage floors lowered** — the original floors (2000/1000) were overly conservative and prevented builders and repairers from using storage until well-stocked; lowering to 500/300 keeps non-income roles functional at low storage.
- **Repairer target lock cleared only on destruction** — clearing the lock at HP cap caused mid-trip re-sorting; the correct moment to pick a new target is when the store is empty.
- **Repairer must not fill towers** — harvesters and builders own tower fill; the old transfer block emptied the repairer's store before reaching any barrier.
- **Invader core-gated defender spawn** — towers kill NPC invaders before a defender finishes spawning; invader cores require a melee attacker since towers cannot target structures.
- **Melee-only defender** — ranged variant removed; can be re-added if player raids with healers become common.
- **Storage-scaled upgrader count** — `desiredUpgraders()` provides four tiers to avoid starving the economy at low storage while hammering the controller when energy is plentiful.
- **Hauler total-count ceiling** — per-container assignment alone failed to account for legacy unassigned haulers; ceiling prevents unbounded accumulation.
- **Emergency path spawns miner when container exists** — spawning a harvester with no container makes it invisible to per-container hauler count; miner keeps the economy on the correct path.
- **Full-capacity spawn wait** — one large creep is more efficient than two small ones on MMO; income-critical roles bypass the wait.

## Known Issues / Tech Debt

- `defense.js` is mostly dead code (all placement logic moved to planner); only `run()` with chokepoint walls remains. Candidate for deletion.
- The `roles/` subdirectory appears unused — legacy scaffold.
- No CPU profiling at high RCL with full creep roster.
- Stamp planner hub scoring formula may not produce the best hub for every room layout.

## Next Steps

1. Deploy and observe infrastructure-aware upgrader: at current RCL, confirm balanced WORK/CARRY body when no link/container is near the controller. After RCL 5 with a controller container in place, confirm switch to WORK-heavy body.
2. Watch repairer spawn gate — repairers should spawn when barriers are below the RCL cap (previously this was silently broken).
3. Observe remote miner returning home and depositing to storage; verify the heavier CARRY body produces meaningful energy per trip.
4. Continue monitoring RCL 5 unlock: storage placed, 2nd tower built, link network activates, hauler count collapses to 1.
5. Watch `desiredUpgraders()` activate once storage is built; upgrader count should shift at 50k/150k/300k thresholds.
6. Verify invader core detection in live game: defender spawns only when a core is present.
7. At RCL 6, verify mineral harvester spawns and deposits to terminal.
8. Verify stamp planner hub tile selection on current room.
9. Consider deleting or consolidating `defense.js` since planner now owns all structure placement.
10. If player raids with healers become a problem, re-add the ranged defender variant.
