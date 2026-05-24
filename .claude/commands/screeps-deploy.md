---
description: Deploy Screeps bot source files to the MMO server
allowed-tools: Bash
---

Upload all `src/*.js` files to the Screeps MMO server by running:

```bash
cd /home/bosko/projects/screeps && nix-shell -p nodejs --run "node push.js"
```

Report whether the upload succeeded or failed. On success you'll see a list of uploaded modules. On failure show the full error output.
