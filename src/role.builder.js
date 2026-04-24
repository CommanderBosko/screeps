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
                    creep.say('💤 Idle');
                    creep.moveTo(Game.spawns['Spawn1'].pos, { visualizePathStyle: { stroke: '#ffaa00' } });
                }
            }
        } else {
            roleBuilder.getEnergy(creep);
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

module.exports = roleBuilder;
