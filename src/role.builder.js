const constructionPriority = [
    STRUCTURE_ROAD,
    STRUCTURE_TOWER,
    STRUCTURE_EXTENSION,
    STRUCTURE_CONTAINER,
    STRUCTURE_STORAGE,
    STRUCTURE_WALL,
    STRUCTURE_RAMPART,
];

const roleBuilder = {
    run: function(creep) {
        if (creep.memory.building && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.building = false;
            creep.say('🔄 Harvest');
        }
        if (!creep.memory.building && creep.store.getFreeCapacity() === 0) {
            creep.memory.building = true;
            creep.say('🚧 Build');
        }

        if (creep.memory.building) {
            const targets = creep.room.find(FIND_CONSTRUCTION_SITES);
            if (targets.length > 0) {
                targets.sort((a, b) => {
                    const priorityA = constructionPriority.indexOf(a.structureType);
                    const priorityB = constructionPriority.indexOf(b.structureType);
                    const a_ = priorityA === -1 ? constructionPriority.length : priorityA;
                    const b_ = priorityB === -1 ? constructionPriority.length : priorityB;
                    return a_ - b_;
                });

                if (creep.build(targets[0]) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(targets[0], { visualizePathStyle: { stroke: '#ffffff' } });
                }
            } else {
                const towers = creep.room.find(FIND_STRUCTURES, {
                    filter: (structure) => structure.structureType === STRUCTURE_TOWER &&
                        structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
                });
                const spawns = creep.room.find(FIND_MY_SPAWNS, {
                    filter: (spawn) => spawn.store.getFreeCapacity(RESOURCE_ENERGY) > 0
                });

                if (towers.length > 0) {
                    towers.sort((a, b) => creep.pos.getRangeTo(a) - creep.pos.getRangeTo(b));
                    if (creep.transfer(towers[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                        creep.moveTo(towers[0], { visualizePathStyle: { stroke: '#ffffff' } });
                    }
                } else if (spawns.length > 0) {
                    spawns.sort((a, b) => creep.pos.getRangeTo(a) - creep.pos.getRangeTo(b));
                    if (creep.transfer(spawns[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                        creep.moveTo(spawns[0], { visualizePathStyle: { stroke: '#ffffff' } });
                    }
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

module.exports = roleBuilder;
