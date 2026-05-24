---
description: Summarize current Screeps bot status from the console log
allowed-tools: Bash
---

Read the last 200 lines of the console log and produce a concise status summary.

```bash
tail -200 /home/bosko/projects/screeps/screeps-console.log 2>/dev/null || echo "NO LOG — run /screeps-watch first to start the watcher"
```

From the output, extract and report:

**Spawning** — What roles were recently spawned? Any spawn failures or emergency spawns?

**Creep states** — Based on state-flip log lines (`[harvester]`, `[hauler]`, `[builder]`, etc.), what is each active creep currently doing?

**Energy flow** — Is energy being collected and deposited? Are haulers picking up and dropping off?

**Errors** — Any JavaScript errors, `Cannot read`, `undefined`, or `null` reference lines?

**Anomalies** — Creeps oscillating between states rapidly, roles missing entirely, repeated emergency spawns, or long gaps with no activity.

Keep the summary tight — bullet points only, no padding. If the log is missing or empty, say so and stop.
