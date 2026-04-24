const cache = require('cache');

function rampartTarget(room) {
    return Math.min((room.controller ? room.controller.level : 1) * 10000, 80000);
}

const roleRepairer = {
    run: function (creep) {
        if (creep.memory.repairing && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.repairing = false;
            creep.memory.sourceId = null;
            creep.say('🔄 Harvest');
        }
        if (!creep.memory.repairing && creep.store.getFreeCapacity() === 0) {
            creep.memory.repairing = true;
            creep.say('🔧 Repair');
        }

        if (creep.memory.repairing) {
            const myStructs = cache.find(creep.room, FIND_MY_STRUCTURES);
            const towers = myStructs.filter(s => s.structureType === STRUCTURE_TOWER && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0);

            if (towers.length > 0) {
                towers.sort((a, b) => a.store.getFreeCapacity(RESOURCE_ENERGY) - b.store.getFreeCapacity(RESOURCE_ENERGY));
                if (creep.transfer(towers[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(towers[0], { visualizePathStyle: { stroke: '#ffffff' } });
                }
                creep.say('🚀 Delivering');
                return;
            }

            const damaged = cache.find(creep.room, FIND_STRUCTURES)
                .filter(s => s.hits < s.hitsMax &&
                    s.structureType !== STRUCTURE_WALL &&
                    s.structureType !== STRUCTURE_RAMPART);
            if (damaged.length > 0) {
                damaged.sort((a, b) => a.hits - b.hits);
                if (creep.repair(damaged[0]) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(damaged[0], { visualizePathStyle: { stroke: '#ffffff' } });
                }
                creep.say('🔧 Repairing');
                return;
            }

            const hpTarget = rampartTarget(creep.room);
            const weakBarrier = cache.find(creep.room, FIND_STRUCTURES)
                .filter(s => (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) && s.hits < hpTarget);
            if (weakBarrier.length > 0) {
                weakBarrier.sort((a, b) => a.hits - b.hits);
                if (creep.repair(weakBarrier[0]) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(weakBarrier[0], { visualizePathStyle: { stroke: '#aaaaaa' } });
                }
                creep.say('🧱 Barrier');
                return;
            }

            if (creep.store.getFreeCapacity() > 0) {
                creep.memory.repairing = false;
                creep.memory.sourceId = null;
                roleRepairer.getEnergy(creep);
                return;
            }
            const roomSpawns = cache.find(creep.room, FIND_MY_SPAWNS);
            if (roomSpawns.length > 0) {
                creep.moveTo(roomSpawns[0].pos, { visualizePathStyle: { stroke: '#ffaa00' } });
            }
            creep.say('💤 Idle');
        } else {
            roleRepairer.getEnergy(creep);
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
        if (!creep.memory.sourceId) cache.assignSource(creep, 'repairer');
        const source = Game.getObjectById(creep.memory.sourceId);
        if (!source) { creep.memory.sourceId = null; return; }
        if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
            creep.moveTo(source, { visualizePathStyle: { stroke: '#ffaa00' } });
        }
    }
};

module.exports = roleRepairer;
