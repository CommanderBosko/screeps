const cache = require('cache');

const towerLogic = {
    run: function (tower) {
        const hostiles = cache.find(tower.room, FIND_HOSTILE_CREEPS);
        if (hostiles.length > 0) {
            tower.attack(tower.pos.findClosestByRange(hostiles));
            return;
        }

        const damaged = cache.find(tower.room, FIND_STRUCTURES)
            .filter(s => s.hits < s.hitsMax);
        if (damaged.length > 0) {
            damaged.sort((a, b) => a.hits - b.hits);
            tower.repair(damaged[0]);
        } else {
            tower.room.visual.text('💤', tower.pos.x, tower.pos.y - 1, { align: 'center', opacity: 0.8 });
        }
    }
};

module.exports = towerLogic;
