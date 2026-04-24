const rolePioneer = {
    run: function (creep) {
        const targetRoom = creep.memory.targetRoom;
        if (!targetRoom) { creep.say('No target'); return; }

        if (creep.room.name !== targetRoom) {
            creep.moveTo(new RoomPosition(25, 25, targetRoom), {
                visualizePathStyle: { stroke: '#ff8800' },
                reusePath: 50
            });
            return;
        }

        if (creep.memory.working && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.working = false;
        }
        if (!creep.memory.working && creep.store.getFreeCapacity() === 0) {
            creep.memory.working = true;
        }

        if (creep.memory.working) {
            rolePioneer.doWork(creep);
        } else {
            rolePioneer.getEnergy(creep);
        }
    },

    doWork: function (creep) {
        const sites = creep.room.find(FIND_CONSTRUCTION_SITES);
        if (sites.length > 0) {
            const spawnSite = sites.find(s => s.structureType === STRUCTURE_SPAWN);
            const target = spawnSite || sites[0];
            if (creep.build(target) === ERR_NOT_IN_RANGE) {
                creep.moveTo(target, { visualizePathStyle: { stroke: '#ff8800' } });
            }
            creep.say('🏗️');
            return;
        }

        if (creep.room.controller) {
            if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
                creep.moveTo(creep.room.controller, { visualizePathStyle: { stroke: '#ff8800' } });
            }
            creep.say('⬆️');
        }
    },

    getEnergy: function (creep) {
        const sources = creep.room.find(FIND_SOURCES_ACTIVE);
        if (sources.length === 0) return;
        const target = creep.pos.findClosestByRange(sources);
        if (creep.harvest(target) === ERR_NOT_IN_RANGE) {
            creep.moveTo(target, { visualizePathStyle: { stroke: '#ffaa00' } });
        }
        creep.say('⛏️');
    }
};

module.exports = rolePioneer;
