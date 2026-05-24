---
name: feedback_miner_spawn_deadlock
description: Three spawn-queue bugs that cause total income loss at RCL 4+ when containers are missing or a hauler exists with no miners
metadata:
  type: feedback
---

## Bug 1: Emergency bootstrap silently skips when a hauler exists but no containers do

The emergency block for RCL 4+ originally required `miner=0 AND hauler=0 AND harvester=0`. If a lone hauler survived but all containers were gone, the emergency never fired — the hauler existed but had nothing to haul. The room produced zero income indefinitely.

**Fix:** The emergency now fires if `miner=0 AND harvester=0 AND (!haulerAlive OR !anySourceContainer)`. A hauler with no containers is useless for income purposes.

## Bug 2: `return` inside the miner container loop freezes the entire spawn queue

When a dying miner existed and energy was below the full-capacity body cost, the code did `return` to wait for full energy. But `return` exits `spawnForRoom` completely — no other roles (builder, upgrader, etc.) could spawn that tick. This should be `continue` to skip that container and keep evaluating.

**Fix:** Changed `if (!trueZeroCoverage && room.energyAvailable < targetMinerCost) return;` to `continue`.

## Bug 3: No income fallback when RCL 4+ has no source containers

At RCL 4+, `harvesterMax` was hardcoded to 0. If containers were destroyed or not yet built, the miner loop iterated over zero containers and spawned nothing. Harvesters were also blocked. The room was completely deadlocked.

**Fix:** `harvesterMax = rcl <= 3 ? 3 : (!anySourceContainer ? 2 : 0)` — at RCL 4+ with no source containers, fall back to 2 harvesters to keep income alive while containers are being rebuilt.

**Why:** These three bugs combine to produce total income death at RCL 4+ in any scenario where the room loses its containers (decay, enemy attack, planner demolish-for-rebuild). The room had a hauler, the spawning logic saw it and skipped the emergency, then the miner loop found no containers and skipped, and harvesterMax was 0.

**How to apply:** Whenever editing the spawn emergency or miner loop logic, verify the three invariants: (1) emergency fires when income is truly zero regardless of hauler, (2) the miner container loop uses `continue` not `return` on wait conditions, (3) harvesterMax has a container-existence fallback at RCL 4+.

Related: [[feedback_state_machine]]
