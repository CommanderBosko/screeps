---
name: feedback-state-machine-triggers
description: State machine flip triggers differ by role — upgrader needs store-full OR nearCtrl; builder uses store>0
metadata:
  type: feedback
---

The correct flip-to-work trigger depends on the role's carry capacity and target distance.

**Builder:** `store[RESOURCE_ENERGY] > 0` is correct. Builder has equal WORK/CARRY (large carry), so any energy is worth acting on; the build target doesn't require the creep to travel far with a depleting store.

**Upgrader:** `store[RESOURCE_ENERGY] > 0` is WRONG. Use `storeFull || nearCtrl` instead:
```js
const storeFull = creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0;
const nearCtrl = ctrl && creep.pos.inRangeTo(ctrl, 3);
if (storeFull || nearCtrl) creep.memory.upgrading = true;
```

**Why:** WORK-heavy upgrader bodies (12W+1C = 50 carry) exhaust their store in 4 ticks. If the creep flips to `upgrading=true` mid-walk (e.g. after picking up a 50-energy dropped pile), it walks to the controller, does 4 ticks of upgrading, then walks back. The result is perpetual movement with negligible upgrading throughput. Requiring a full store (or proximity) ensures the creep completes its fetch before switching modes.

**How to apply:** In `role.upgrader.js` run(), gate the flip on `storeFull || nearCtrl`. Do not use bare `store > 0` NOR bare `getFreeCapacity()===0` alone — the latter deadlocks a 12W+1C body (50 carry) when link refills are smaller than carry capacity, leaving the upgrader stuck in getEnergy forever. Confirmed fix (May 2026): both bugs recurred after a code edit and caused complete room idleness.

**Related bug (upgrader link target-switching):** See [[feedback-upgrader-link-parking]].
**Related bug (pickupNearby ordering):** See [[feedback-pickupnearby-ordering]].
