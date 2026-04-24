const cache = require('cache');

const roleDefender = {
    run: function (creep) {
        const hostiles = cache.find(creep.room, FIND_HOSTILE_CREEPS);
        if (hostiles.length === 0) {
            const spawn = Game.spawns['Spawn1'];
            if (spawn && !creep.pos.inRangeTo(spawn, 3)) {
                creep.moveTo(spawn, { visualizePathStyle: { stroke: '#ff0000' } });
            }
            creep.say('👀');
            return;
        }

        const target = creep.pos.findClosestByRange(hostiles);
        if (creep.attack(target) === ERR_NOT_IN_RANGE) {
            creep.moveTo(target, { visualizePathStyle: { stroke: '#ff0000' }, reusePath: 0 });
        }
        creep.say('⚔️');
    }
};

module.exports = roleDefender;
