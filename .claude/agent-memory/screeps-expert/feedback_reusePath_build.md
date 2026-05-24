---
name: feedback-reusePath-build
description: reusePath on build moveTo causes wandering — disable it (reusePath:0) for construction targeting
metadata:
  type: feedback
---

Use `reusePath: 0` on `moveTo` calls inside build loops. Do NOT use `reusePath: 3` or higher when the builder is navigating to construction sites.

**Why:** With `reusePath: 3`, the pathfinder caches the route for 3 ticks. When the builder arrives adjacent to a site and `build()` returns `OK`, the stale cached path still moves the creep away from the site on the next tick. The following tick `build()` returns `ERR_NOT_IN_RANGE` again, triggering another `moveTo`, which caches another path — the creep oscillates and appears to "wander." Additionally, `findClosestByPath` can return null when all sites are unreachable via the pathfinder (e.g., blocked by other construction sites), and the `|| topTier[0]` fallback combined with a stale path compounds the wandering.

**How to apply:** In role.builder doWork, use `reusePath: 0` on the build moveTo. Also pass `{ ignoreCreeps: true }` to `findClosestByPath` so temporary creep blocking doesn't return null and trigger the fallback.

**Related:** [[feedback-state-machine-triggers]]
