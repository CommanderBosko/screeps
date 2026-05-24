---
name: tower-repair-threshold
description: Towers must use a 70% HP threshold for idle repair; repairing any hits<hitsMax drains energy fast enough to block all spawning
metadata:
  type: feedback
---

Tower idle repair (non-combat, non-emergency) must only trigger when a structure is below
**70% of hitsMax** (`hits < hitsMax * 0.7`), not at any `hits < hitsMax`.

**Why:** Roads and containers decay slowly and are rarely at exactly hitsMax. With the naive
`hits < hitsMax` check, 2 towers fire every single idle tick repairing structures that have
lost a few HP. At mid-range tower distance this drains 20-40 energy/tick, fast enough to
cancel out a hauler delivering 850 energy per trip and keep energyAvailable permanently
below upgrader/builder spawn thresholds.

**The symptom:** Energy stuck at a plateau (e.g. 1150/1800) for many consecutive diag cycles
despite active miners and haulers depositing. No upgraders or builders ever spawn.

**How to apply:** In `role.tower.js`, the idle-repair filter for non-barrier structures uses:
```js
s.hits < s.hitsMax * TOWER_REPAIR_THRESHOLD  // TOWER_REPAIR_THRESHOLD = 0.7
```
The emergency rampart block (hits < 500) is unchanged — new ramparts decay to 0 instantly.

**Related:** [[spawn-buffer-deadlock]] — both bugs compounded to keep energy at 1150.
With tower drain removed AND spawn body selection fixed, upgraders spawn at 1150 energy.
