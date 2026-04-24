const roleHarvester = {
    run: function (creep) {
        if (!creep.memory.sourceId) {
            roleHarvester.setSource(creep);
        }

        if (creep.store.getFreeCapacity() === 0) {
            roleHarvester.transferEnergy(creep);
            return;
        }

        const source = Game.getObjectById(creep.memory.sourceId);
        if (source && creep.harvest(source) === ERR_NOT_IN_RANGE) {
            creep.moveTo(source, { visualizePathStyle: { stroke: '#ffaa00' } });
        }
        creep.say('⛏️ Harvesting');
    },

    setSource: function (creep) {
        const sources = creep.room.find(FIND_SOURCES);
        if (sources.length === 0) return;

        const availableSources = sources.filter(source =>
            source.energy > 0 && !source.pos.findInRange(FIND_MY_CREEPS, 1).length
        );
        if (availableSources.length > 0) {
            creep.memory.sourceId = availableSources[0].id;
        }
        // If no available sources, keep existing sourceId (or stay unset until next tick)
    },

    transferEnergy: function (creep) {
        const transferTarget = roleHarvester.getTransferTarget(creep);
        if (!transferTarget) return;

        if (creep.transfer(transferTarget, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            creep.moveTo(transferTarget, { visualizePathStyle: { stroke: '#ffffff' } });
        }
        creep.say('🏭 Transfer');
    },

    getTransferTarget: function (creep) {
        const spawns = creep.room.find(FIND_MY_STRUCTURES, {
            filter: (structure) => structure.structureType === STRUCTURE_SPAWN && structure.energy < structure.energyCapacity
        });
        if (spawns.length > 0) return spawns[0];

        const extensions = creep.room.find(FIND_MY_STRUCTURES, {
            filter: (structure) => structure.structureType === STRUCTURE_EXTENSION && structure.energy < structure.energyCapacity
        });
        if (extensions.length > 0) return extensions[0];

        const towers = creep.room.find(FIND_MY_STRUCTURES, {
            filter: (structure) => structure.structureType === STRUCTURE_TOWER && structure.energy < structure.energyCapacity
        });
        if (towers.length > 0) return towers[0];

        const containers = creep.room.find(FIND_STRUCTURES, {
            filter: (structure) => structure.structureType === STRUCTURE_CONTAINER && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        });
        if (containers.length > 0) return containers[0];

        return null;
    }
};

module.exports = roleHarvester;
