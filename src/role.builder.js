const cache = require('cache');

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
    run: function (creep) {
        if (creep.memory.building && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.building = false;
            creep.say('🔄 Harvest');
        }
        if (!creep.memory.building && creep.store.getFreeCapacity() === 0) {
            creep.memory.building = true;
            creep.say('🚧 Build');
        }

        if (creep.memory.building) {
            const targets = cache.find(creep.room, FIND_CONSTRUCTION_SITES);
            if (targets.length > 0) {
                targets.sort((a, b) => {
                    const pa = constructionPriority.indexOf(a.structureType);
                    const pb = constructionPriority.indexOf(b.structureType);
                    return (pa === -1 ? constructionPriority.length : pa) -
                           (pb === -1 ? constructionPriority.length : pb);
                });
                if (creep.build(targets[0]) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(targets[0], { visualizePathStyle: { stroke: '#ffffff' } });
                }
            } else {
                const myStructs = cache.find(creep.room, FIND_MY_STRUCTURES);
                const towers = myStructs.filter(s => s.structureType === STRUCTURE_TOWER && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
                const spawns = myStructs.filter(s => s.structureType === STRUCTURE_SPAWN && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0);

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
                    const roomSpawns = cache.find(creep.room, FIND_MY_SPAWNS);
                    if (roomSpawns.length > 0) {
                        creep.moveTo(roomSpawns[0].pos, { visualizePathStyle: { stroke: '#ffaa00' } });
                    }
                    creep.say('💤 Idle');
                }
            }
        } else {
            roleBuilder.getEnergy(creep);
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
        const sources = cache.find(creep.room, FIND_SOURCES);
        if (sources.length === 0) return;
        const target = creep.pos.findClosestByRange(sources);
        if (creep.harvest(target) === ERR_NOT_IN_RANGE) {
            creep.moveTo(target, { visualizePathStyle: { stroke: '#ffaa00' } });
        }
    }
};

module.exports = roleBuilder;
