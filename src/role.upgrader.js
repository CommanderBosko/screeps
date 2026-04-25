const cache = require('cache');

const roleUpgrader = {
    run: function (creep) {
        if (creep.memory.upgrading && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.upgrading = false;
            creep.say('🔄 harvest');
        }
        if (!creep.memory.upgrading && creep.store.getFreeCapacity() === 0) {
            creep.memory.upgrading = true;
            creep.say('⚡ upgrade');
        }

        if (creep.memory.upgrading) {
            if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
                creep.moveTo(creep.room.controller, { visualizePathStyle: { stroke: '#ffffff' } });
            }
        } else {
            roleUpgrader.getEnergy(creep);
        }
    },

    getEnergy: function (creep) {
        if (cache.pickupNearby(creep)) return;
        const containers = cache.find(creep.room, FIND_STRUCTURES)
            .filter(s => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0);
        if (containers.length > 0) {
            const target = creep.pos.findClosestByRange(containers);
            if (creep.withdraw(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(target, { visualizePathStyle: { stroke: '#ffaa00' } });
            }
            return;
        }
        if (!creep.memory.sourceId) cache.assignSource(creep);
        let source = Game.getObjectById(creep.memory.sourceId);
        if (!source || source.energy === 0) {
            const active = cache.find(creep.room, FIND_SOURCES).filter(s => s.energy > 0);
            source = active.length > 0 ? creep.pos.findClosestByRange(active) : source;
        }
        if (!source) return;
        if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
            creep.moveTo(source, { visualizePathStyle: { stroke: '#ffaa00' } });
        }
    }
};

module.exports = roleUpgrader;
