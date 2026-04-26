const cache = require('cache');

const roleHauler = {
    run: function (creep) {
        if (creep.memory.delivering && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.delivering = false;
        }
        if (!creep.memory.delivering && creep.store.getFreeCapacity() === 0) {
            creep.memory.delivering = true;
        }

        if (creep.memory.delivering) {
            const target = roleHauler.getDeliveryTarget(creep);
            if (target) {
                if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, { visualizePathStyle: { stroke: '#ffffff' } });
                }
                creep.say('🚚');
            }
            return;
        }

        if (cache.pickupNearby(creep)) return;

        // Receiver links sit near spawn — withdraw here first for the shortest possible trip
        const sources = cache.find(creep.room, FIND_SOURCES);
        const receiverLinks = cache.find(creep.room, FIND_MY_STRUCTURES)
            .filter(s => s.structureType === STRUCTURE_LINK &&
                         s.store[RESOURCE_ENERGY] > 0 &&
                         !sources.some(src => s.pos.inRangeTo(src, 2)));
        if (receiverLinks.length > 0) {
            const target = creep.pos.findClosestByPath(receiverLinks);
            if (creep.withdraw(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(target, { visualizePathStyle: { stroke: '#00aaff' } });
            }
            creep.say('🔗');
            return;
        }

        const containers = cache.find(creep.room, FIND_STRUCTURES)
            .filter(s => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0);
        if (containers.length > 0) {
            const target = creep.pos.findClosestByPath(containers);
            if (creep.withdraw(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(target, { visualizePathStyle: { stroke: '#ffaa00' } });
            }
            creep.say('📦');
            return;
        }

        creep.say('💤');
    },

    getDeliveryTarget: function (creep) {
        const myStructs = cache.find(creep.room, FIND_MY_STRUCTURES);
        const spawns = myStructs.filter(s => s.structureType === STRUCTURE_SPAWN && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
        if (spawns.length > 0) return spawns[0];
        const extensions = myStructs.filter(s => s.structureType === STRUCTURE_EXTENSION && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
        if (extensions.length > 0) return extensions[0];
        const towers = myStructs.filter(s => s.structureType === STRUCTURE_TOWER && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
        if (towers.length > 0) return towers[0];
        return null;
    }
};

module.exports = roleHauler;
