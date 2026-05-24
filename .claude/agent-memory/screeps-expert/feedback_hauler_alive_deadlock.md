---
name: hauler-alive-deadlock
description: Emergency bootstrap silently skips when hauler is alive + containers exist but are empty (miners dead) — full income deadlock at RCL 4+
metadata:
  type: feedback
---

The RCL 4+ emergency bootstrap in `spawnForRoom` (main.js) has this guard:

```js
const haulerAlive = roomCreeps('hauler', rn) > 0;
if (!haulerAlive || !anySourceContainer) { /* spawn emergency miner */ }
```

**The bug**: `anySourceContainer` is true whenever a container structure exists near a source — even if that container is completely empty. So when miners die and containers drain, the guard evaluates as `!true || !true` = false and the emergency path never fires. The hauler idles, the spawn stays at 0 energy, and the room deadlocks forever.

**Fix applied (May 2026)**: Added `anyContainerHasEnergy` check — the emergency fires unless the hauler is alive AND at least one source container actually has energy:

```js
const anyContainerHasEnergy = roomSources.some(src =>
    src.pos.findInRange(FIND_STRUCTURES, 1, {
        filter: s => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0
    }).length > 0
);
const haulerHasSomethingToDo = haulerAlive && anyContainerHasEnergy;
if (!haulerHasSomethingToDo) { /* spawn emergency miner/harvester */ }
```

**Why:** The hauler being alive is not sufficient to indicate income health. Containers must also have energy for the hauler to do anything useful.

**How to apply:** Whenever gating emergency spawns on "is there already an income chain running," verify the chain has actual energy flowing through it, not just the structural components present.
