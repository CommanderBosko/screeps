# Project State

_Last updated: 2026-05-17 (session 3)_

## Current Project State

The bot is in active mid-game development. Three sessions today. The third session focused on hauler energy-source correctness, tower-fill fairness, and the RCL 6 infrastructure foundation (extractor, lab reaction manager, terminal, stamp order, road demolition for blocked sites). All changes are deployed to the MMO server and pushed to GitHub.

**What works:**
- **Hauler energy source (3-link setup)**: hauler now draws from storage when the only non-source link is controller-adjacent (no non-controller receiver link available); previously went idle leaving extensions starved
- **Hauler source container priority**: pickup order is non-controller receiver links → source containers (link overflow energy) → storage; `containerId` deadlock removed — haulers pinned to an empty pre-link container now clear their `containerId` and fall through to the next source
- **Tower fill fairness**: hauler fills the emptiest tower first (most free capacity), not the nearest; prevents a full tower being topped off while a completely empty tower is ignored
- **RCL 6 infrastructure foundation**: `lab.js` reaction manager (designates input/output labs by geometry, runs configured reaction, configurable via `Memory.labReaction['RoomName']`); planner places extractor on mineral tile; `needsReplanning()` checks terminal/labs/extractor; `lastRCL` guard extended; terminal/labs/towers/link placed before extensions in stamp order to avoid the 90-site cap blocking high-value structures; `applyStamp` demolishes roads that were placed at terminal/lab tiles in earlier RCL runs so construction sites appear on next planner tick
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
- Hauler storage fallback deployed but the 3-link live-game scenario (2 src links + 1 ctrl link) has not been observed confirming extensions stay filled
- Lab reaction manager (`lab.js`) deployed but untested — requires RCL 6 with lab structures built; no live reaction data yet
- Road demolition for terminal/lab tiles deployed but not yet confirmed live (no blocked site has been observed clearing)
- Extractor placement deployed but mineral harvester requires RCL 6 and built extractor — untested in live game
- Link-mode hauler fix deployed and confirmed working (haulers spawning, no console errors) but a deliberate hauler-wipe test has not been run
- Miner link delivery fix deployed — not yet confirmed in live game that miners are filling source links (no drops to ground)
- Remote miner behavior with returning pattern not yet fully verified in live game
- Multi-room expansion untested at scale
- `defense.js` stripped to only chokepoint wall placement; candidate for deletion
- Stamp planner not yet verified against live room hub placement

**Not yet implemented:**
- Automatic nuker management
- Observer/power creep roles

## Current Goals

### Short-term (next 1–3 sessions)
- Observe live game: confirm hauler draws from storage correctly in 3-link setup (extensions stay filled)
- Confirm road demolition fires for terminal/lab tiles and those construction sites appear on the next planner tick
- At RCL 6, verify lab reaction manager starts reacting and `Memory.labReaction` controls the product
- Verify extractor placement appears on mineral tile at RCL 6
- Verify 600-energy miners are transferring energy directly to source links in live game (not just dropping to ground)
- Confirm emergency hauler fires correctly when hauler count reaches zero with miners running
- Monitor link network throughput and confirm hauler count stays at 1

### Long-term
- Reach RCL 8 in starting room
- Claim and bootstrap a second room
- Add hauler withdraw from storage when storage exists
- Consider remote hauler role (returning remote miners reduce urgency)
- Re-add ranged defender if player raids with healers become a problem

## Recent Decisions

- **Hauler storage fallback for 3-link rooms** — in a 3-link setup (2 source links + 1 controller receiver link), the hauler correctly filters out the controller-adjacent link but previously had no remaining pickup source, leaving extensions starved. Now falls back to storage. This is the correct fix because storage is the intended energy reservoir when links are carrying energy directly to the controller.
- **Source container pickup before storage** — reordered hauler pickup so source containers (which hold link overflow energy) are preferred over storage. Storage is the last resort, not the second option.
- **`containerId` deadlock fix** — haulers pinned to a pre-link container in `containerId` memory would wait there forever once the room transitioned to link mode and the container emptied. Fixed by clearing `containerId` when the pinned container is empty and falling through to the next source.
- **Emptiest tower wins over nearest tower** — `findClosestByRange` was routing to a nearly-full nearby tower, leaving a fully empty distant tower ignored. Sorting by free capacity first, breaking ties by range, is the correct heuristic: towers fail defense when any one of them is empty.
- **Terminal/labs/link before extensions in stamp order** — the 90-site cap was being exhausted mid-extension-ring before terminal/labs were ever queued. Unique structures (those with a count limit of 1) must claim their tiles before the 60-extension ring is processed; extensions defer gracefully to the next planner run.
- **Road demolition in `applyStamp`** — roads placed at RCL 2–5 permanently blocked terminal/lab construction sites from appearing. The fix is to call `structure.destroy()` on any road occupying a structure tile during `applyStamp`, allowing the construction site to appear on the next planner tick. Roads are cheap; terminal/labs are not.
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
- `lab.js` reaction manager designates input/output labs by geometry (furthest-from-center = input A, second-furthest = input B, center = output) but this heuristic has not been validated for all 10-lab layouts that the stamp produces.

## Next Steps

1. Observe live game: confirm hauler draws from storage in 3-link setup and extensions stay filled.
2. Watch planner tick after reaching RCL 6: confirm terminal/lab construction sites appear (roads on those tiles should be demolished, sites placed next run).
3. Observe miners at the 600-energy tier: confirm energy is transferring to source links (not dropping to ground).
4. Monitor link network throughput with the full fix chain live; verify hauler count stays at 1.
5. At RCL 6, verify lab reaction starts — set `Memory.labReaction['RoomName'] = 'OH'` and confirm lab manager picks input/output labs correctly.
6. Verify extractor on mineral tile at RCL 6.
7. Continue watching RCL 5 unlock: 2nd tower built, `desiredUpgraders()` scales as storage fills past 50k/150k/300k thresholds.
8. Verify invader core detection: defender spawns only when a core is present.
9. Consider deleting or consolidating `defense.js` since planner now owns all structure placement.
10. If player raids with healers become a problem, re-add the ranged defender variant.
