const cache = require('cache');

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
                roleHarvester.transferEnergy(creep);
            } else {
                if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(creep.room.controller, { visualizePathStyle: { stroke: '#ffffff' } });
                }
                creep.say('⬆️');
            }
            return;
        }
        roleHarvester.getEnergy(creep);
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
            creep.say('📦');
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
        creep.say('⛏️');
    },

    transferEnergy: function (creep) {
        const target = roleHarvester.getTransferTarget(creep);
        if (!target) return;
        if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            creep.moveTo(target, { visualizePathStyle: { stroke: '#ffffff' } });
        }
        creep.say('🏭');
    },

    getTransferTarget: function (creep) {
        const myStructs = cache.find(creep.room, FIND_MY_STRUCTURES);
        const spawns = myStructs.filter(s => s.structureType === STRUCTURE_SPAWN && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
        if (spawns.length > 0) return spawns[0];
        const extensions = myStructs.filter(s => s.structureType === STRUCTURE_EXTENSION && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
        if (extensions.length > 0) return extensions[0];
        const towers = myStructs.filter(s => s.structureType === STRUCTURE_TOWER && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
        if (towers.length > 0) return towers[0];
        const containers = cache.find(creep.room, FIND_STRUCTURES)
            .filter(s => s.structureType === STRUCTURE_CONTAINER && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
        if (containers.length > 0) return containers[0];
        return null;
    }
};

module.exports = roleHarvester;
