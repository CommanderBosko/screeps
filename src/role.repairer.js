const cache = require('cache');

const roleRepairer = {
    run: function (creep) {
        if (creep.memory.repairing && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.repairing = false;
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
            } else {
                const targets = cache.find(creep.room, FIND_STRUCTURES)
                    .filter(s => s.hits < s.hitsMax &&
                        s.structureType !== STRUCTURE_WALL &&
                        s.structureType !== STRUCTURE_RAMPART);

                if (targets.length > 0) {
                    targets.sort((a, b) => a.hits - b.hits);
                    if (creep.repair(targets[0]) === ERR_NOT_IN_RANGE) {
                        creep.moveTo(targets[0], { visualizePathStyle: { stroke: '#ffffff' } });
                    }
                    creep.say('🔧 Repairing');
                } else {
                    creep.say('💤 Idle');
                    creep.moveTo(Game.spawns['Spawn1'].pos, { visualizePathStyle: { stroke: '#ffaa00' } });
                }
            }
        } else {
            roleRepairer.getEnergy(creep);
        }
    },

    getEnergy: function (creep) {
        const containers = cache.find(creep.room, FIND_STRUCTURES)
            .filter(s => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0);
        if (containers.length > 0) {
            const target = creep.pos.findClosestByRange(containers);
            if (creep.withdraw(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(target, { visualizePathStyle: { stroke: '#ffaa00' } });
            }
            return;
        }
        const sources = cache.find(creep.room, FIND_SOURCES);
        if (sources.length === 0) return;
        const spawn = Game.spawns['Spawn1'];
        const target = sources.length > 1
            ? (spawn.pos.getRangeTo(sources[0]) > spawn.pos.getRangeTo(sources[1]) ? sources[0] : sources[1])
            : sources[0];
        if (creep.harvest(target) === ERR_NOT_IN_RANGE) {
            creep.moveTo(target, { visualizePathStyle: { stroke: '#ffaa00' } });
        }
    }
};

module.exports = roleRepairer;
