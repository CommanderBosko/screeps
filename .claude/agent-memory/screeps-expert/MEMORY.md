# Memory Index

- [Architecture snapshot](project_architecture.md) — Module list, roles, spawn logic, link topology as of April 2026
- [Optimization patterns](feedback_optimizations.md) — CPU and energy optimizations applied to this codebase
- [tsconfig / checkJs setup](project_tsconfig.md) — How Screeps globals, bare requires, and memory augmentation work; getObjectById JSDoc cast pattern
- [State machine flip triggers](feedback_state_machine.md) — Upgrader needs storeFull||nearCtrl to flip; builder uses store>0; bare store>0 causes oscillation on WORK-heavy upgraders
- [pickupNearby ordering in upgrader](feedback_pickupnearby_ordering.md) — pickupNearby must be last in upgrader getEnergy; first-position grabs tiny piles triggering premature flip
- [Upgrader link parking](feedback_upgrader_link_parking.md) — Upgrader must park at controller link even when empty; never walk to storage when link exists
- [reusePath on build moveTo](feedback_reusePath_build.md) — reusePath:0 required on build moveTo; stale paths cause wandering
- [Miner spawn deadlock (3 bugs)](feedback_miner_spawn_deadlock.md) — Emergency, return-vs-continue, and harvesterMax=0 all combine to kill income at RCL 4+ with no containers
- [Hauler-alive deadlock](feedback_hauler_alive_deadlock.md) — Emergency skip fires when hauler+containers exist but containers are empty; must check container energy not just container existence
- [No-container miner deadlock](feedback_no_container_miner_deadlock.md) — Miner loop requires containers; when none exist at RCL>=4 (post-downgrade), miners=0 permanently and energy deadlocks below upgrader/builder cost
- [Spawn buffer deadlock](feedback_spawn_buffer_deadlock.md) — Body tier selected from energyCapacityAvailable-buffer; at partial fill (e.g. 1150/1800) spawn never fires; fix: min(cap, energyAvailable)
- [Tower repair threshold](feedback_tower_repair_threshold.md) — Towers repairing hits<hitsMax drains 20-40e/tick idle; must gate on 70% health threshold to stop energy sink
