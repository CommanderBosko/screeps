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
        const towerE = tower.store[RESOURCE_ENERGY];
        const towerEMax = tower.store.getCapacity(RESOURCE_ENERGY);
        const tId = tower.id.slice(-4);

        // Can't fire without energy — skip entirely to avoid wasted API calls
        if (towerE === 0) {
            console.log('[tower] #' + tId + ' | E:0/' + towerEMax + ' | empty | idle');
            return;
        }

        const hostiles = cache.find(tower.room, FIND_HOSTILE_CREEPS);
        if (hostiles.length > 0) {
            const target = pickAttackTarget(tower, hostiles);
            tower.attack(target);
            const range = tower.pos.getRangeTo(target);
            console.log('[tower] #' + tId + ' | E:' + towerE + '/' + towerEMax + ' | attack | ' + target.name + ' @ range ' + range);
            return;
        }

        // Heal the most-wounded friendly creep
        const wounded = cache.find(tower.room, FIND_MY_CREEPS)
            .filter(c => c.hits < c.hitsMax);
        if (wounded.length > 0) {
            wounded.sort((a, b) => a.hits - b.hits);
            const healTarget = wounded[0];
            tower.heal(healTarget);
            console.log('[tower] #' + tId + ' | E:' + towerE + '/' + towerEMax + ' | heal | ' + healTarget.name + ' hits=' + healTarget.hits + '/' + healTarget.hitsMax);
            return;
        }

        const allStructures = cache.find(tower.room, FIND_STRUCTURES);

        // Emergency: save ramparts critically close to 0
        const dying = allStructures.filter(
            s => s.structureType === STRUCTURE_RAMPART && s.hits < RAMPART_EMERGENCY
        );
        if (dying.length > 0) {
            dying.sort((a, b) => a.hits - b.hits);
            const repTarget = dying[0];
            tower.repair(repTarget);
            console.log('[tower] #' + tId + ' | E:' + towerE + '/' + towerEMax + ' | repair-emergency | rampart#' + repTarget.id.slice(-4) + ' hits=' + repTarget.hits);
            return;
        }

        const TOWER_REPAIR_THRESHOLD = 0.7;
        const damaged = allStructures.filter(s =>
            s.hits < s.hitsMax * TOWER_REPAIR_THRESHOLD &&
            s.structureType !== STRUCTURE_WALL &&
            s.structureType !== STRUCTURE_RAMPART
        );
        if (damaged.length > 0) {
            damaged.sort((a, b) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax));
            const repTarget = damaged[0];
            tower.repair(repTarget);
            console.log('[tower] #' + tId + ' | E:' + towerE + '/' + towerEMax + ' | repair | ' + repTarget.structureType + '#' + repTarget.id.slice(-4) + ' hits=' + repTarget.hits + '/' + repTarget.hitsMax);
            return;
        }

        console.log('[tower] #' + tId + ' | E:' + towerE + '/' + towerEMax + ' | idle');
    }
};

module.exports = towerLogic;
