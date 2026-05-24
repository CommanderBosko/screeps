const cache = require('cache');

const ATTACK_PARTS = new Set([ATTACK, RANGED_ATTACK]);
const RAMPART_EMERGENCY = 500;

function pickAttackTarget(tower, hostiles) {
    const attackers = hostiles.filter(h => h.body.some(p => ATTACK_PARTS.has(p.type)));
    const pool = attackers.length > 0 ? attackers : hostiles;
    return tower.pos.findClosestByRange(pool);
}

const towerLogic = {
    run: function (tower) {
        const hostiles = cache.find(tower.room, FIND_HOSTILE_CREEPS);
        if (hostiles.length > 0) {
            tower.attack(pickAttackTarget(tower, hostiles));
            return;
        }

        // Heal the most-wounded friendly creep
        const wounded = cache.find(tower.room, FIND_MY_CREEPS)
            .filter(c => c.hits < c.hitsMax);
        if (wounded.length > 0) {
            wounded.sort((a, b) => a.hits - b.hits);
            tower.heal(wounded[0]);
            return;
        }

        const allStructures = cache.find(tower.room, FIND_STRUCTURES);

        // Emergency: save ramparts critically close to 0 (newly built ones decay at 1 HP/tick)
        const dying = allStructures.filter(
            s => s.structureType === STRUCTURE_RAMPART && s.hits < RAMPART_EMERGENCY
        );
        if (dying.length > 0) {
            dying.sort((a, b) => a.hits - b.hits);
            tower.repair(dying[0]);
            return;
        }

        // Repair roads, containers, and other non-barrier structures only when meaningfully
        // damaged (below 70% health). Repairing at any hits < hitsMax wastes energy every tick
        // on structures that have decayed only a few HP — this was draining ~20-30 energy/tick
        // with 2 towers and preventing upgrader/builder spawning.
        // Roads:      max 5000 — repair at < 3500 (70%)
        // Containers: max 250000 — repair at < 175000 (70%)
        // Other:      use 70% of hitsMax as general threshold
        const TOWER_REPAIR_THRESHOLD = 0.7;
        const damaged = allStructures.filter(s =>
            s.hits < s.hitsMax * TOWER_REPAIR_THRESHOLD &&
            s.structureType !== STRUCTURE_WALL &&
            s.structureType !== STRUCTURE_RAMPART
        );
        if (damaged.length > 0) {
            damaged.sort((a, b) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax));
            tower.repair(damaged[0]);
        }
    }
};

module.exports = towerLogic;
