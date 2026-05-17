# Project State

_Last updated: 2026-05-17 (session 2)_

## Current Project State

The bot is in active mid-game development. Two sessions today: the first fixed source link delivery and added `watch.js`; the second eliminated all TypeScript lint errors and broke the link-mode hauler spawn deadlock. All changes are deployed to the MMO server and pushed to GitHub. Haulers are confirmed spawning and the console watcher shows no errors.

**What works:**
- **TypeScript checking**: `@types/screeps` + `@types/node` injected; `moduleResolution: "node10"`; `baseUrl: "./src"`; `lib: ["ES2017", "dom"]`; `src/global.d.ts` augments `CreepMemory`, `RoomMemory`, and `Memory` with all project-specific fields; JSDoc casts on `getObjectById` call sites; `.vscode/settings.json` suppresses TS80001 at workspace level
- **Link-mode hauler spawn deadlock resolved**: hauler spawn path uses `room.energyAvailable` (not `energyCapacityAvailable`), so a hauler spawns at minimum 300 energy immediately after a wipe rather than waiting for extensions to fill (which required a hauler to exist — deadlock)
- **Emergency bootstrap is link-aware**: checks receiver links in addition to containers for available energy; previously skipped spawn in link mode because energy was arriving via links not containers
- **Idle hauler top-up is link-aware**: pre-fills from receiver links before falling back to containers
- Full RCL 1–8 spawn logic with role prioritization and emergency fallback
- Emergency guard correctly requires zero harvesters AND zero miners/haulers before firing
- **Emergency hauler bootstrap**: 150-energy `[CARRY,CARRY,MOVE]` spawns before the normal hauler block whenever miners are alive but no haulers exist — breaks permanent economy deadlock after hauler wipe
- Emergency spawn creates a miner (not harvester) when a source container exists, preventing ghost haulers
- Miner + hauler economy activates at RCL 4; one miner per container; `containerId` stamped at spawn; pre-spawn replacement triggered before dying miner expires
- **600-energy miner body fixed**: `[WORK×5, CARRY, MOVE]` — 1 CARRY gives 50 energy capacity; miners can now accumulate energy and `transfer()` directly to adjacent source links. Previously the body was `[WORK×6, MOVE]` with no CARRY, making the link delivery path unreachable
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
- **Repairer spawn gate**: demand-driven; only spawns when emergency rampart (<500 HP) exists, or barriers below `barrierCap(rcl)`, or non-barrier damage with no energized tower
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
- **`watch.js`**: real-time Screeps MMO console streaming via WebSocket; reads auth token from `.screeps.json`; exponential backoff reconnection; HTML tag stripping; tick number prefixes
- **tsconfig.json**: correctly targets `src/**/*.js` with `allowJs: true`, `commonjs`/`node` module resolution; utility scripts excluded

**In progress / known fragile:**
- Link-mode hauler fix deployed and confirmed working (haulers spawning, no console errors) but a deliberate hauler-wipe test has not been run
- Miner link delivery fix deployed — not yet confirmed in live game that miners are filling source links (no drops to ground)
- Remote miner behavior with returning pattern not yet fully verified in live game
- Mineral harvester untested in live game (requires RCL 6)
- Multi-room expansion untested at scale
- `defense.js` stripped to only chokepoint wall placement; candidate for deletion
- Stamp planner not yet verified against live room hub placement

**Not yet implemented:**
- Hauler withdraw from storage (haulers still drain containers/links only)
- Remote hauler to collect energy from remote miners (returning pattern reduces this urgency)
- Automatic nuker management
- Observer/power creep roles

## Current Goals

### Short-term (next 1–3 sessions)
- Verify 600-energy miners are transferring energy directly to source links in live game (not just dropping to ground)
- Confirm emergency hauler fires correctly when hauler count reaches zero with miners running
- Monitor link network throughput now that miners can fill source links
- Monitor RCL 5 unlock: 2nd tower built, `desiredUpgraders()` activates as storage fills
- Observe infrastructure-aware upgrader body selection in live game

### Long-term
- Reach RCL 8 in starting room
- Claim and bootstrap a second room
- Add hauler withdraw from storage when storage exists
- Consider remote hauler role (returning remote miners reduce urgency)
- Re-add ranged defender if player raids with healers become a problem

## Recent Decisions

- **Spawn hauler from `energyAvailable` in link mode** — the full-capacity wait creates a deadlock unique to the hauler: no hauler → extensions drain → energy never reaches cap → no hauler spawns. All other roles still wait for full capacity. The `getBody('hauler', room.energyAvailable)` call produces a minimum-viable hauler immediately; it will be recycled and replaced by a full-capacity hauler once extensions refill.
- **`moduleResolution: "node10"` to suppress TS80001** — the hint fires on `require()` calls when module resolution cannot locate `@types/node`; `"node10"` is the correct resolution strategy for a CommonJS workspace.
- **`src/global.d.ts` for project memory fields** — TypeScript's declaration merging against `@types/screeps` base interfaces is the correct mechanism; avoids forking the type package and keeps augmentations co-located with the source.
- **Workspace-level TS80001 suppression** — Screeps runtime cannot support ESM `import`; per-file `@ts-ignore` would need to be added to every source file. `.vscode/settings.json` suppresses the hint once for the entire workspace.
- **1 CARRY on the 600-energy miner** — trading one WORK part for CARRY is a net win: 5 WORK × 2 energy/tick still saturates a source at full regeneration rate (10/tick), and the link delivery path becomes reachable. The previous 6-WORK / no-CARRY body silently broke the entire link network by making `transfer()` always fail.
- **Emergency hauler at 150 energy** — 150 is the exact cost of `[CARRY, CARRY, MOVE]`; the threshold must be low enough to fire before extensions are full. Gated on `minersAlive >= 1` so a hauler is not spawned into a room with no income.
- **`watch.js` reads `.screeps.json`** — reusing the same config file as `push.js` avoids a second credential location; the token is already gitignored.
- **Utility scripts excluded from tsconfig** — `push.js` and `watch.js` are Node.js CommonJS scripts, not Screeps modules; including them caused false-positive ESM diagnostics that could not be cleanly suppressed.
- **Infrastructure-aware upgrader spawning** — a WORK-heavy body wastes 70–80% of tick time walking empty when the upgrader has no adjacent energy source; body selection checks for a receiver link or container within range 3 of the controller before picking the heavy tier.
- **barrierCap into cache.js** — single canonical location eliminates synchronization risk between role.repairer.js and main.js.
- **Repairer target lock cleared only on destruction** — clearing the lock at HP cap caused mid-trip re-sorting; the correct moment to pick a new target is when the store is empty.
- **Invader core-gated defender spawn** — towers kill NPC invaders before a defender finishes spawning; invader cores require a melee attacker since towers cannot target structures.
- **Storage-scaled upgrader count** — `desiredUpgraders()` provides four tiers to avoid starving the economy at low storage while hammering the controller when energy is plentiful.

## Known Issues / Tech Debt

- `defense.js` is mostly dead code (all placement logic moved to planner); only `run()` with chokepoint walls remains. Candidate for deletion.
- The `roles/` subdirectory appears unused — legacy scaffold.
- No CPU profiling at high RCL with full creep roster.
- Stamp planner hub scoring formula may not produce the best hub for every room layout.
- `checkJs` is `false` in `tsconfig.json`; the TypeScript language server provides hover types but does not actively report JS errors. If deeper checking is desired, `checkJs: true` can be enabled — the ambient declarations in `global.d.ts` and the JSDoc casts should handle all current call sites cleanly.

## Next Steps

1. Observe live game: confirm haulers spawn immediately in link mode after a wipe (no deadlock).
2. Verify receiver link is recognized by both the emergency bootstrap and idle top-up paths.
3. Observe miners at the 600-energy tier: confirm energy is transferring to source links (not dropping to ground).
4. Monitor link network throughput with the full fix chain live; verify hauler count stays at 1.
5. Continue watching RCL 5 unlock: 2nd tower built, `desiredUpgraders()` scales as storage fills past 50k/150k/300k thresholds.
6. Verify infrastructure-aware upgrader body selection in live game (carried over).
7. Verify invader core detection: defender spawns only when a core is present.
8. At RCL 6, verify mineral harvester spawns and deposits to terminal.
9. Consider deleting or consolidating `defense.js` since planner now owns all structure placement.
10. If player raids with healers become a problem, re-add the ranged defender variant.
