const cache = require('cache');

// Stationary miner: parks on container, mines source, fills source link > container.
// 5 WORK parts saturates a source (10 energy/tick harvest rate).

const roleMiner = {
    run: function (creep) {
        if (!creep.memory.sourceId) roleMiner.assignSource(creep);
        if (!creep.memory.containerId) roleMiner.assignContainer(creep);

        const source = Game.getObjectById(creep.memory.sourceId);
        if (!source) return;

        const container = Game.getObjectById(creep.memory.containerId);

        // Move to container position first — stationary mining is most efficient
        if (container) {
            if (!creep.pos.isEqualTo(container.pos)) {
                creep.moveTo(container.pos, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 10 });
                return; // Don't harvest until in position
            }

            // When full, dump to link (teleports to receiver near spawn) or overflow to container
            if (creep.store.getFreeCapacity() === 0) {
                const link = creep.pos.findInRange(FIND_MY_STRUCTURES, 1, {
                    filter: s => s.structureType === STRUCTURE_LINK &&
                                 s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
                })[0];
                if (link) {
                    creep.transfer(link, RESOURCE_ENERGY);
                } else {
                    creep.transfer(container, RESOURCE_ENERGY);
                }
                // Don't harvest when full — the energy would be wasted
                creep.say('📤');
                return;
            }
        } else {
            // No container yet — move adjacent to source
            if (!creep.pos.inRangeTo(source, 1)) {
                creep.moveTo(source, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 10 });
                return;
            }
        }

        // Harvest
        creep.harvest(source);
        creep.say('⛏️');
    },

    assignSource: function (creep) {
        const sources = cache.find(creep.room, FIND_SOURCES);
        if (sources.length === 0) return;
        const takenIds = Object.values(Game.creeps)
            .filter(c => c.memory.role === 'miner' && c.id !== creep.id)
            .map(c => c.memory.sourceId);
        const free = sources.find(s => !takenIds.includes(s.id));
        creep.memory.sourceId = (free || sources[0]).id;
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
