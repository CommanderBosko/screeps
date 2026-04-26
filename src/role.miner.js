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

            // When full, dump to link (teleports to receiver near spawn) or overflow to container.
            // After a successful transfer the store has free capacity, so fall through to harvest
            // on the same tick rather than wasting it.
            if (creep.store.getFreeCapacity() === 0) {
                const link = creep.pos.findInRange(FIND_MY_STRUCTURES, 1, {
                    filter: s => s.structureType === STRUCTURE_LINK &&
                                 s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
                })[0];
                const result = link
                    ? creep.transfer(link, RESOURCE_ENERGY)
                    : creep.transfer(container, RESOURCE_ENERGY);
                creep.say('📤');
                // If transfer failed (link full, container full) we truly can't act — stop
                if (result !== OK) return;
                // Transfer succeeded — store now has free capacity, fall through to harvest
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
