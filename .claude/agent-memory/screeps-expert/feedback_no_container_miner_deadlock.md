---
name: no-container-miner-deadlock
description: Miner loop requires containers to iterate — when no containers exist at RCL>=4 (e.g. after downgrade from RCL 6), no miners ever spawn and the room energy deadlocks below upgrader/builder spawn thresholds
metadata:
  type: feedback
---

At RCL>=4 with source links but no source containers (destroyed during downgrade from RCL 6, or never built), the miner spawn loop silently skips because it only iterates `sourceContainers` per source. With no containers, the inner for-loop body never runs.

The room then falls through to upgrader/builder spawning, but their bodies cost 1300-1500 energy (at RCL 5: energyCapacityAvailable=1800, SPAWN_BUFFER=300, budgetCap=1500). With energy stuck at ~1130 (slow harvester delivery, hauler pulling from storage), neither spawns. The room is permanently deadlocked.

**Fix applied:** Added a "no-container miner bootstrap" block between the main miner loop and the harvester fallback. When RCL>=4 and a source has no adjacent container and no active miner, spawn a miner with only a sourceId (no containerId). `role.miner` handles no-container gracefully: it drop-mines adjacent to the source and self-assigns a container via `assignContainer` once one is placed by the planner.

**Why:** The miner loop was designed around containers being the primary anchor point. It never anticipated the container-free state at RCL>=4, which occurs after a room downgrade strips structure access without removing the physical containers (or if containers decayed). The no-container miner block makes miners independent of containers for their initial spawn.

**How to apply:** If you see `miners=0` persisting in spawn-diag despite energy being available and RCL>=4, suspect this deadlock. Check whether source containers exist. If not, the no-container miner bootstrap block should fire. If it doesn't, check that it appears BEFORE the harvester fallback in `spawnForRoom`.

See also: [[miner-spawn-deadlock]], [[hauler-alive-deadlock]]
