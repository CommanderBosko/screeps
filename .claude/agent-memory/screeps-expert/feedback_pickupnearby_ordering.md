---
name: feedback-pickupnearby-ordering
description: pickupNearby must come LAST in upgrader getEnergy — first-position grabs tiny piles that trigger premature upgrading flip
metadata:
  type: feedback
---

Do NOT call `cache.pickupNearby()` first in `roleUpgrader.getEnergy()`. Call it last, after link/storage/container checks.

**Why:** `pickupNearby(creep, 5)` grabs any dropped energy >= 50 within range 5. After pickup, `store[RESOURCE_ENERGY] > 0`. With the old `store > 0` flip trigger (now fixed to `storeFull || nearCtrl`), this immediately set `upgrading = true`. The creep then walked to the controller with 50 energy, upgraded for 4 ticks, ran empty, walked back — perpetual thrashing. Even with the corrected flip trigger, putting pickupNearby first wastes the tick moving toward a tiny pile when a link or storage would give a full load.

**Correct order in upgrader getEnergy:**
1. Controller link (park and wait if empty)
2. Storage
3. Controller-adjacent container
4. Any non-source container
5. `cache.pickupNearby(creep, 5)` — opportunistic only
6. Mine directly (last resort)

**How to apply:** This ordering applies to `role.upgrader.js` only. The builder calls `pickupNearby` first without a range limit — that is acceptable because builders have a large carry capacity and the immediate opportunistic pickup does not cause oscillation.
