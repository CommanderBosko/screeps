# Project State

_Last updated: 2026-05-03_

## Current Project State

The bot is in active mid-game development. Core economic and defensive systems are stable. This session fixed the repairer's fundamental bug: it was clearing the barrier target lock the moment a structure reached the HP cap (causing mid-trip re-sorting), and was dumping its entire energy store into towers before doing any barrier repair. Both issues are resolved — the repairer now commits its full energy load to one barrier per trip and ignores tower energy levels entirely.

**What works:**
- Full RCL 1–8 spawn logic with role prioritization and emergency fallback
- Emergency guard correctly requires zero harvesters AND zero miners/haulers before firing
- Emergency spawn now creates a miner (not harvester) when a source container exists, preventing ghost haulers
- Miner + hauler economy activates at RCL 4; one miner per container; `containerId` stamped at spawn; pre-spawn replacement triggered before dying miner expires
- Miners excluded from `rebalanceSources`; miner source assignment filtered to `homeRoom` (no cross-room conflicts)
- Hauler count collapses to 1 when `srcLinks >= 1 && receiverLinks >= 1`
- Hauler total-count ceiling: cannot exceed number of source containers regardless of per-container pinning state
- Hauler delivery flip at 100% store full (was 50%); pickup radius capped at range 5
- Link network (RCL 5+) eliminates hauler trips; link single-transfer-per-receiver enforced (break after first OK)
- Spawns wait for full-capacity body; income roles bypass wait
- **Upgrader bodies**: 1W (200e) → 3W (450e) → 5W (700e) → 8W (1050e) → 12W (1500e); RCL-8-safe (12W < 15W cap)
- **Upgrader count by storage energy**: no storage → 2; <50k → 1; <150k → 2; <300k → 3; 300k+ → 4
- Builders only spawn when construction sites exist
- Upgraders park near controller at RCL 4+; fall back to source containers if no non-source containers available
- Renewal at RCL 4+ restricted to haulers only; all roles at RCL 1–3
- Scout: counts by homeRoom; 1500-tick cooldown; reusePath=5; single `room.find()` for structures
- Stamp planner: fixed 11×11 template with full footprint validation; `countType()` and `needsReplanning()` use cache
- **Repairer barrier caps**: RCL 1–3 → 10k; RCL 4–5 → 50k; RCL 6–7 → 200k/1M; RCL 8 → 5M; `barrierCap()` exported
- **Repairer spawn gate**: demand-driven; only spawns when emergency rampart (<500 HP) exists, or barriers below cap, or non-barrier damage with no energized tower
- Repairer hasTower bug fixed: gate now checks `hasTowerWithEnergy` (not just `hasTower`)
- **Repairer target-lock bug fixed**: `_resolveTarget` now clears the lock only when the structure is destroyed (`Game.getObjectById` returns null), not when it reaches the HP cap — eliminates mid-trip target switching
- **Repairer tower-fill removed**: the `transfer()` to towers block deleted from `doRepair`; harvesters and builders handle tower fill; the old block immediately emptied the repairer's store before any barrier repair could happen
- **Repairer store-empty check normalized**: uses `getUsedCapacity() === 0`; full energy load is committed to repair before refueling
- **Tower simplified**: handles only emergency ramparts (< 500 HP) and non-barrier structure repair
- **Defender spawn gated on invader core**: defenders only spawn when `STRUCTURE_INVADER_CORE` is detected; towers handle normal NPC creep waves reliably before a defender can finish spawning
- **Defender melee-only**: ranged branch removed; `role.defender.js` targets invader cores first, falls back to nearest hostile creep; retreat to rampart at 40% HP retained
- Retreat logic: defender flees to nearest rampart below 40% HP
- Safe-mode auto-activation when hostile combat creeps present and towers low
- Scout → claimer → pioneer pipeline for automated room expansion (RCL 4+ headroom)
- Remote miner: full-store check moved before `harvest()` to avoid harvest then drop on same tick
- Mineral harvester role: RCL 6+, harvests minerals into terminal then storage; uses cache.find()
- Builder source container fallback threshold lowered to 0 (was 500 energy)
- Repairer source container fallback threshold lowered to 0 (was 500 energy)
- Defender and defender-ranged body energy gates corrected to exact body costs (removed padding)

**In progress / known fragile:**
- Remote miner and mineral harvester are coded but untested in live game
- Multi-room expansion untested at scale
- `defense.js` stripped to only chokepoint wall placement; candidate for deletion
- Stamp planner untested against live rooms

**Not yet implemented:**
- Hauler withdraw from storage (haulers still drain containers/links only)
- Remote hauler to collect dropped energy from remote miners
- Automatic nuker management
- Observer/power creep roles

## Current Goals

### Short-term (next 1–3 sessions)
- Observe RCL 5 unlock tonight: storage placed, 2nd tower built, link network activates, hauler count collapses to 1
- Watch `desiredUpgraders()` activate once storage is built and scale as storage fills
- Verify invader core detection: defender spawns only when a core appears; no spawn for ordinary NPC creep waves
- Verify repairer barrier caps trending toward 50k (RCL 4–5 cap)
- Test remote miner by setting `Memory.remoteRooms` and watching in game

### Long-term
- Reach RCL 8 in starting room
- Claim and bootstrap a second room
- Add hauler withdraw from storage when storage exists
- Add remote hauler to collect dropped energy from remote miners

## Recent Decisions

- **Repairer target lock cleared only on destruction** — clearing the lock at HP cap caused the repairer to re-sort every tick once the current target hit cap but the store was still full; the correct moment to pick a new target is at the start of the next energy load (store empty).
- **Repairer must not fill towers** — the old transfer block made the repairer compete with harvesters/builders for a job they already do, and guaranteed the repairer never reached its assigned barrier on any trip where a tower was below 50%. Removed entirely.
- **Invader core-gated defender spawn** — towers kill NPC invaders before a defender finishes spawning (minimum 190e body takes multiple ticks); spawning defenders for ordinary creep waves wasted energy and occupied the spawn. Invader cores require a melee attacker since towers cannot target structures — the core is the actual threat.
- **Melee-only defender** — the ranged variant (for healer-accompanied raids) added complexity without frequent payoff; removed to simplify the spawn path. Can be re-added if player raids with healers become common.
- **RCL-tiered barrier caps** — repairing to hitsMax (300M) at low RCL wastes repairer time; caps scaled with RCL ensure barriers are defensively adequate without over-investing; `barrierCap()` is the single source of truth used in both repairer and spawn gate.
- **Demand-based repairer spawn** — an idle repairer is pure energy drain; gating on actual repair demand eliminates the deadweight repairer that would otherwise spawn into an empty queue.
- **Tower-aware spawn gate** — non-barrier damage does not warrant a repairer when towers have energy; towers handle roads and containers at idle; this prevents spawning a redundant repairer that competes with towers.
- **Storage-scaled upgrader count** — at low storage, upgraders starve the economy; at high storage, they are the best use of energy; `desiredUpgraders()` provides four tiers rather than a fixed count or simple RCL gate.
- **Hauler total-count ceiling** — per-container assignment alone failed to account for legacy unassigned haulers (created by the emergency path's old harvester spawn); a total ceiling prevents unbounded hauler accumulation.
- **Emergency path spawns miner when container exists** — spawning a harvester with no container infrastructure causes it to deliver directly and be invisible to the per-container hauler count; spawning a miner instead keeps the economy on the normal miner/hauler path.
- **Hauler delivery flip at 100% (full store)** — the 50% flip improved delivery speed but caused haulers to make twice as many trips, wasting MOVE energy and congesting paths; full-store delivery is more efficient per trip at the cost of slightly slower extension fill.
- **Miner source assignment filtered to homeRoom** — cross-room miners were conflicting with home-room miners for source IDs; filtering by homeRoom ensures each room's miners assign independently.
- **Link single-transfer-per-receiver** — the old loop transferred from every source link each tick, potentially double-sending to the same receiver when the cooldown cleared; `break` after the first `OK` result prevents this.
- **Repairer targets barriers to maxHits** — the old HP-floor approach left walls far below their structural maximum; with a tower managing non-barrier upkeep, the repairer can focus entirely on barriers until they are fully healed.
- **Persistent repairTarget** — re-sorting walls (up to 300M maxHits each) every tick was wasteful; locking onto one target per energy load is O(1) per tick after selection and prevents the repairer orbiting between walls.
- **Full-capacity spawn wait** — one large creep is more efficient than two small ones on MMO.

## Known Issues / Tech Debt

- `defense.js` is mostly dead code (all placement logic moved to planner); only `run()` with chokepoint walls remains. Candidate for deletion.
- The `roles/` subdirectory appears unused — legacy scaffold.
- Remote miner drops energy in place; no remote hauler exists to collect it.
- No CPU profiling at high RCL with full creep roster.
- Stamp planner hub scoring formula may not produce the best hub for every room layout.

## Next Steps

1. Observe repairer in live game: confirm it travels to one barrier per trip and stays until store is empty; confirm it never calls `transfer` on a tower.
2. Continue monitoring RCL 5 unlock: storage placed, 2nd tower built, link network activates, hauler count collapses to 1.
3. Watch `desiredUpgraders()` activate once storage is built; upgrader count should shift at 50k/150k/300k storage thresholds.
4. Monitor barrier HP trending toward 50k (RCL 4–5 cap); confirm demand-based repairer spawn gate still correct.
5. Verify invader core detection in live game: defender spawns only when a core is present.
6. If player raids with healers become a problem, re-add the ranged defender variant.
7. Set `Memory.remoteRooms = { 'W1N1': ['W2N1'] }` (example) and watch remote miner in live game.
8. At RCL 6, verify mineral harvester spawns and deposits to terminal.
9. Verify stamp planner hub tile selection on current room.
10. Consider deleting or consolidating `defense.js` since planner now owns all structure placement.
