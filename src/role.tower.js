const towerLogic = {
    run: function(tower) {
        const closestHostile = tower.pos.findClosestByRange(FIND_HOSTILE_CREEPS);

        if (closestHostile) {
            tower.attack(closestHostile);
        } else {
            const damagedStructures = tower.room.find(FIND_STRUCTURES, {
                filter: (structure) => structure.hits < structure.hitsMax
            });

            if (damagedStructures.length > 0) {
                damagedStructures.sort((a, b) => a.hits - b.hits);
                tower.repair(damagedStructures[0]);
            } else {
                tower.room.visual.text('💤 Idle', tower.pos.x, tower.pos.y - 1, { align: 'center', opacity: 0.8 });
            }
        }
    }
};

module.exports = towerLogic;
