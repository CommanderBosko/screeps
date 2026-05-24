---
description: Diagnose Screeps bot issues from logs and code diffs, then fix and deploy
allowed-tools: Bash, Read, Agent
---

Gather full diagnostic context, then delegate to the screeps-expert agent to fix and deploy.

## Step 1 — Collect diagnostics (run in parallel)

**Console log:**
```bash
tail -200 /home/bosko/projects/screeps/screeps-console.log 2>/dev/null || echo "(no log — watcher not running)"
```

**Git state and diffs:**
```bash
cd /home/bosko/projects/screeps && git status && echo "=== STAGED ===" && git diff --cached && echo "=== UNSTAGED ===" && git diff
```

## Step 2 — Delegate to screeps-expert

Spawn the `screeps-expert` agent with ALL of the content gathered above embedded directly in the prompt. Do not summarize — include the raw log lines and raw diff output so the agent can see exactly what happened.

Use this prompt template, replacing the bracketed sections with actual gathered content:

---
Diagnose and fix the Screeps bot at /home/bosko/projects/screeps.

**Console log (last 200 lines):**
[PASTE FULL LOG OUTPUT HERE]

**Git status:**
[PASTE GIT STATUS HERE]

**Staged changes (git diff --cached):**
[PASTE STAGED DIFF HERE]

**Unstaged changes (git diff):**
[PASTE UNSTAGED DIFF HERE]

**Room context:**
- Server: SHARD3, Room W42N59, owner Bosko
- RCL: check game memory or log for current level
- Architecture: main.js game loop → spawnForRoom() → individual role files
- Roles: harvester, hauler, miner, builder, upgrader, repairer, tower, defender
- All roles use two-flag memory state pattern (e.g. creep.memory.harvesting flips when store empty/full)
- watch.js logs state flips ([harvester], [hauler], [builder], [spawn]) and errors to screeps-console.log
- Deploy: `nix-shell -p nodejs --run 'node push.js'` from /home/bosko/projects/screeps

From the log and diffs, identify exactly what is broken. Fix it. Deploy it.
---

## Step 3 — Confirm

After the screeps-expert agent returns, report what was fixed and whether deployment succeeded.
