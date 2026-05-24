---
name: spawn-buffer-deadlock
description: SPAWN_BUFFER uses energyCapacityAvailable to pick body tier, causing permanent deadlock when energyAvailable < target cost
metadata:
  type: feedback
---

When spawning non-income roles (upgrader, builder, repairer), the body is selected using
`min(energyCapacityAvailable - SPAWN_BUFFER, energyAvailable)` — NOT just `energyCapacityAvailable - SPAWN_BUFFER`.

**The bug:** Using only the capacity-based cap to pick the body tier means the spawn always
targets the same large body regardless of current energy. A room at 1150/1800 with
`SPAWN_BUFFER=300` targets body cost 1500 → 1150 < 1500 → return, every tick, forever.

**Example (RCL 5, capacity=1800, available=1150):**
- `budgetCap = 1800 - 300 = 1500`
- `getUpgraderBody(1500, true)` → 12W+1C+5M = costs 1500
- `1150 < 1500` → return, never spawns

**Fix:** `spawnBudget = Math.min(budgetCap, room.energyAvailable)` then select body from spawnBudget.
At 1150: `min(1500, 1150) = 1150` → `getUpgraderBody(1150, true)` → 8W+1C+4M = 1050 → 1150 >= 1050 → spawns.

**Why:** The SPAWN_BUFFER intent is to not *drain* energy below 300 for emergencies.
That intent is preserved: a 1050-cost body at 1150 available still leaves 100 in reserve.
The body is slightly smaller than at full capacity, which is correct and expected.

**How to apply:** Any time spawn logic uses `energyCapacityAvailable - buffer` to select a body tier,
verify the actual check uses `min(cap, energyAvailable)`. This pattern appears in both
`spawnStandard()` and `spawnUpgrader()` in main.js.

**Companion issue:** Tower repair drain (see [[tower-repair-threshold]]). With towers repairing
any `hits < hitsMax` structure, 2 towers drain ~20-40 energy/tick idle, keeping available
energy perpetually below spawn thresholds even as the hauler deposits energy.
