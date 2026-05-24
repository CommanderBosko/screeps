---
name: feedback-upgrader-link-parking
description: Upgrader with controller link must park adjacent to the link when empty, never walk to storage
metadata:
  type: feedback
---

When a controller-side receiver link exists, the upgrader must park next to it (range 1) and wait, even if the link is currently empty. Do NOT fall through to storage when the link exists but is empty.

**Why:** Walking to storage causes target-switching. The link refills every ~10 ticks (link cooldown). If the upgrader starts walking to storage and the link refills mid-walk, the next getEnergy tick sees the link has energy and redirects back to the link — the upgrader never arrives anywhere and stays permanently in getEnergy mode, showing ⏳.

**How to apply:** In role.upgrader getEnergy, check `if (ctrlLink)` (link exists) as the outer branch, then `ctrlLink.store[RESOURCE_ENERGY] > 0` as the inner condition. When the link exists but is empty: `moveTo(ctrlLink, range 1)` and return — do NOT fall through to storage. The storage/container fallbacks only fire when NO controller link exists at all.

**Related:** [[feedback-state-machine-triggers]], [[feedback-reusePath-build]]
