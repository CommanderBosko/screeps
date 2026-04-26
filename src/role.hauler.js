const cache = require('cache');

// Hauler: drains receiver links / containers, fills spawns → extensions → towers → storage.
// At RCL 4+ with links, this is the primary energy distribution role.

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
                    creep.moveTo(target, { visualizePathStyle: { stroke: '#ffffff' }, reusePath: 3 });
                }
                creep.say('🚚');
            } else {
                // Nothing to fill — park near spawn to be useful for renewal
                const spawns = cache.find(creep.room, FIND_MY_SPAWNS);
                if (spawns.length > 0 && !creep.pos.inRangeTo(spawns[0], 2)) {
                    creep.moveTo(spawns[0], { visualizePathStyle: { stroke: '#aaaaaa' }, reusePath: 5 });
                }
                creep.say('💤');
            }
            return;
        }

        if (cache.pickupNearby(creep)) return;

        // Receiver links sit near spawn/storage — withdraw here first (shortest trip)
        const { receiverLinks } = cache.getLinkRoles(creep.room);
        const readyReceivers = receiverLinks.filter(l => l.store[RESOURCE_ENERGY] > 0);
        if (readyReceivers.length > 0) {
            const target = creep.pos.findClosestByRange(readyReceivers);
            if (creep.withdraw(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(target, { visualizePathStyle: { stroke: '#00aaff' }, reusePath: 3 });
            }
            creep.say('🔗');
            return;
        }

        // Fall back to containers (no-link rooms or overflow)
        const containers = cache.find(creep.room, FIND_STRUCTURES)
            .filter(s => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0);
        if (containers.length > 0) {
            const target = creep.pos.findClosestByPath(containers);
            if (creep.withdraw(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(target, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 3 });
            }
            creep.say('📦');
            return;
        }

        creep.say('💤');
    },

    getDeliveryTarget: function (creep) {
        const myStructs = cache.find(creep.room, FIND_MY_STRUCTURES);

        // Priority 1: spawns (keep spawning capacity online)
        const spawns = myStructs.filter(s =>
            s.structureType === STRUCTURE_SPAWN && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        );
        if (spawns.length > 0) return creep.pos.findClosestByRange(spawns);

        // Priority 2: extensions
        const extensions = myStructs.filter(s =>
            s.structureType === STRUCTURE_EXTENSION && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        );
        if (extensions.length > 0) return creep.pos.findClosestByRange(extensions);

        // Priority 3: towers (defensive capability)
        const towers = myStructs.filter(s =>
            s.structureType === STRUCTURE_TOWER &&
            s.store.getFreeCapacity(RESOURCE_ENERGY) > s.store.getCapacity(RESOURCE_ENERGY) * 0.5
        );
        if (towers.length > 0) return creep.pos.findClosestByRange(towers);

        // Priority 4: storage (bank excess energy)
        const storage = creep.room.storage;
        if (storage && storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0) return storage;

        return null;
    }
};

module.exports = roleHauler;
