const cache = require('cache');

const roleMiner = {
    run: function (creep) {
        if (!creep.memory.sourceId) roleMiner.assignSource(creep);
        if (!creep.memory.containerId) roleMiner.assignContainer(creep);

        const source = Game.getObjectById(creep.memory.sourceId);
        const container = Game.getObjectById(creep.memory.containerId);

        if (!source) return;

        if (container) {
            if (!creep.pos.isEqualTo(container.pos)) {
                creep.moveTo(container.pos, { visualizePathStyle: { stroke: '#ffaa00' } });
                return;
            }
            if (creep.store.getFreeCapacity() === 0) {
                creep.transfer(container, RESOURCE_ENERGY);
            }
        }

        if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
            creep.moveTo(source, { visualizePathStyle: { stroke: '#ffaa00' } });
        }
        creep.say('⛏️');
    },

    assignSource: function (creep) {
        const sources = cache.find(creep.room, FIND_SOURCES);
        const takenIds = Object.values(Game.creeps)
            .filter(c => c.memory.role === 'miner' && c.id !== creep.id)
            .map(c => c.memory.sourceId);
        const free = sources.find(s => !takenIds.includes(s.id));
        creep.memory.sourceId = (free || sources[0] || { id: null }).id;
    },

    assignContainer: function (creep) {
        const source = Game.getObjectById(creep.memory.sourceId);
        if (!source) return;
        const nearby = source.pos.findInRange(FIND_STRUCTURES, 1, {
            filter: s => s.structureType === STRUCTURE_CONTAINER
        });
        if (nearby.length > 0) creep.memory.containerId = nearby[0].id;
    }
};

module.exports = roleMiner;
