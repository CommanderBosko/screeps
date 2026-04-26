const cache = require('cache');

// Harvester: active at RCL 1-3, mines and delivers to spawn/extensions/towers/storage.
// Replaced by miner+hauler at RCL 4+.

const roleHarvester = {
    run: function (creep) {
        if (creep.memory.delivering && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.delivering = false;
        }
        if (!creep.memory.delivering && creep.store.getFreeCapacity() === 0) {
            creep.memory.delivering = true;
        }

        if (creep.memory.delivering) {
            const target = roleHarvester.getTransferTarget(creep);
            if (target) {
                if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, { visualizePathStyle: { stroke: '#ffffff' }, reusePath: 2 });
                }
                creep.say('🏭');
            } else {
                // Fallback: upgrade controller
                const ctrl = creep.room.controller;
                if (ctrl) {
                    if (creep.upgradeController(ctrl) === ERR_NOT_IN_RANGE) {
                        creep.moveTo(ctrl, { visualizePathStyle: { stroke: '#ffffff' }, reusePath: 2 });
                    }
                    creep.say('⬆️');
                }
            }
            return;
        }

        roleHarvester.getEnergy(creep);
    },

    getEnergy: function (creep) {
        if (cache.pickupNearby(creep)) return;

        if (!creep.memory.sourceId) cache.assignSource(creep);
        const source = Game.getObjectById(creep.memory.sourceId);
        if (!source) return;
        if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
            creep.moveTo(source, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 2 });
        }
        creep.say('⛏️');
    },

    getTransferTarget: function (creep) {
        const myStructs = cache.find(creep.room, FIND_MY_STRUCTURES);

        const spawns = myStructs.filter(s =>
            s.structureType === STRUCTURE_SPAWN && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        );
        if (spawns.length > 0) return creep.pos.findClosestByRange(spawns);

        const extensions = myStructs.filter(s =>
            s.structureType === STRUCTURE_EXTENSION && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        );
        if (extensions.length > 0) return creep.pos.findClosestByRange(extensions);

        const towers = myStructs.filter(s =>
            s.structureType === STRUCTURE_TOWER && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        );
        if (towers.length > 0) return creep.pos.findClosestByRange(towers);

        // Storage if it exists (RCL 4 edge case where harvester still alive)
        const storage = creep.room.storage;
        if (storage && storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0) return storage;

        return null;
    }
};

module.exports = roleHarvester;
