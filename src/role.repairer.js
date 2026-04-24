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
            const towers = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) => structure.structureType === STRUCTURE_TOWER &&
                    structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            });

            if (towers.length > 0) {
                towers.sort((a, b) => a.store.getFreeCapacity(RESOURCE_ENERGY) - b.store.getFreeCapacity(RESOURCE_ENERGY));
                if (creep.transfer(towers[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(towers[0], { visualizePathStyle: { stroke: '#ffffff' } });
                }
                creep.say('🚀 Delivering');
            } else {
                const targets = creep.room.find(FIND_STRUCTURES, {
                    filter: (structure) => structure.hits < structure.hitsMax &&
                        structure.structureType !== STRUCTURE_WALL &&
                        structure.structureType !== STRUCTURE_RAMPART
                });

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
            const sources = creep.room.find(FIND_SOURCES);
            let targetSource;
            if (sources.length > 1) {
                const spawn = Game.spawns['Spawn1'];
                const distanceToSource0 = spawn.pos.getRangeTo(sources[0]);
                const distanceToSource1 = spawn.pos.getRangeTo(sources[1]);
                targetSource = distanceToSource0 > distanceToSource1 ? sources[0] : sources[1];
            } else {
                targetSource = sources[0];
            }

            if (creep.harvest(targetSource) === ERR_NOT_IN_RANGE) {
                creep.moveTo(targetSource, { visualizePathStyle: { stroke: '#ffaa00' } });
            }
        }
    }
};

module.exports = roleRepairer;
