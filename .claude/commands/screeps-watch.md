---
description: Start the Screeps console watcher and monitor log for events
allowed-tools: Bash, Monitor
---

Start the real-time console watcher and arm a persistent log monitor.

## Step 1 — Start watch.js if not running

Check if it's already running:
```bash
pgrep -f "node watch.js"
```

If not running, start it in the background:
```bash
cd /home/bosko/projects/screeps && nix-shell -p nodejs --run "node watch.js"
```

Wait 4 seconds, then verify it connected by reading the last few lines of the output file or log:
```bash
tail -5 /home/bosko/projects/screeps/screeps-console.log 2>/dev/null || echo "log not yet created"
```

## Step 2 — Arm the Monitor

Start a **persistent** Monitor with this command:
```
tail -f /home/bosko/projects/screeps/screeps-console.log | grep --line-buffered -E "spawn|harvester|hauler|builder|upgrader|miner|repairer|ERROR|error|Cannot|undefined|null|dead"
```

Description: `Screeps console — spawns, role flips, errors`
Set `persistent: true`.

## Step 3 — Confirm

Report that the watcher is running and the monitor is armed. If the log already has content, show the last 5 lines as a sanity check.
