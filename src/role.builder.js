const cache = require('cache');

function constructionPriority(rcl) {
    if (rcl >= 3) return [
        STRUCTURE_TOWER,
        STRUCTURE_EXTENSION,
        STRUCTURE_CONTAINER,
        STRUCTURE_STORAGE,
        STRUCTURE_ROAD,
        STRUCTURE_WALL,
        STRUCTURE_RAMPART,
    ];
    return [
        STRUCTURE_EXTENSION,
        STRUCTURE_CONTAINER,
        STRUCTURE_STORAGE,
        STRUCTURE_ROAD,
        STRUCTURE_WALL,
        STRUCTURE_RAMPART,
    ];
}

const roleBuilder = {
    run: function (creep) {
        if (creep.memory.building && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.building = false;
            creep.memory.sourceId = null;
            creep.say('🔄 Harvest');
        }
        if (!creep.memory.building && creep.store.getFreeCapacity() === 0) {
            creep.memory.building = true;
            creep.say('🚧 Build');
        }

        if (creep.memory.building) {
            const targets = cache.find(creep.room, FIND_CONSTRUCTION_SITES);
            if (targets.length > 0) {
                const priority = constructionPriority(creep.room.controller ? creep.room.controller.level : 0);
                targets.sort((a, b) => {
                    const pa = priority.indexOf(a.structureType);
                    const pb = priority.indexOf(b.structureType);
                    return (pa === -1 ? priority.length : pa) -
                           (pb === -1 ? priority.length : pb);
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
                    const controller = creep.room.controller;
                    if (controller) {
                        if (creep.upgradeController(controller) === ERR_NOT_IN_RANGE) {
                            creep.moveTo(controller, { visualizePathStyle: { stroke: '#ffaa00' } });
                        }
                        creep.say('⬆ Upgrade');
                    }
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
        if (!creep.memory.sourceId) cache.assignSource(creep, 'builder');
        const source = Game.getObjectById(creep.memory.sourceId);
        if (!source) { creep.memory.sourceId = null; return; }
        if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
            creep.moveTo(source, { visualizePathStyle: { stroke: '#ffaa00' } });
        }
    }
};

module.exports = roleBuilder;
