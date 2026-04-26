const cache = require('cache');

// Construction priority: critical infrastructure first, then defensive
function constructionPriority(rcl) {
    if (rcl >= 3) return [
        STRUCTURE_TOWER,
        STRUCTURE_EXTENSION,
        STRUCTURE_LINK,
        STRUCTURE_CONTAINER,
        STRUCTURE_STORAGE,
        STRUCTURE_ROAD,
        STRUCTURE_RAMPART,
        STRUCTURE_WALL,
    ];
    return [
        STRUCTURE_EXTENSION,
        STRUCTURE_CONTAINER,
        STRUCTURE_STORAGE,
        STRUCTURE_ROAD,
        STRUCTURE_RAMPART,
        STRUCTURE_WALL,
    ];
}

const roleBuilder = {
    run: function (creep) {
        if (creep.memory.building && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.building = false;
        }
        if (!creep.memory.building && creep.store.getFreeCapacity() === 0) {
            creep.memory.building = true;
        }

        if (creep.memory.building) {
            roleBuilder.doWork(creep);
        } else {
            roleBuilder.getEnergy(creep);
        }
    },

    doWork: function (creep) {
        const sites = cache.find(creep.room, FIND_CONSTRUCTION_SITES);
        if (sites.length > 0) {
            const rcl = creep.room.controller ? creep.room.controller.level : 0;
            const priority = constructionPriority(rcl);
            // Sort by priority, then by progress ratio (more complete first to avoid waste)
            let best = null;
            let bestPriority = Infinity;
            let bestProgress = -1;
            for (const site of sites) {
                const p = priority.indexOf(site.structureType);
                const pIdx = p === -1 ? priority.length : p;
                const progress = site.progress / site.progressTotal;
                if (pIdx < bestPriority || (pIdx === bestPriority && progress > bestProgress)) {
                    bestPriority = pIdx;
                    bestProgress = progress;
                    best = site;
                }
            }
            if (best) {
                if (creep.build(best) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(best, { visualizePathStyle: { stroke: '#ffffff' }, reusePath: 5 });
                }
                creep.say('🚧');
            }
            return;
        }

        // Nothing to build — fill towers then spawns, then upgrade as a bonus
        const myStructs = cache.find(creep.room, FIND_MY_STRUCTURES);
        const towers = myStructs.filter(s =>
            s.structureType === STRUCTURE_TOWER &&
            s.store.getFreeCapacity(RESOURCE_ENERGY) > s.store.getCapacity(RESOURCE_ENERGY) * 0.3
        );
        if (towers.length > 0) {
            const target = creep.pos.findClosestByRange(towers);
            if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(target, { visualizePathStyle: { stroke: '#ffffff' } });
            }
            creep.say('🗼');
            return;
        }

        const spawns = myStructs.filter(s =>
            s.structureType === STRUCTURE_SPAWN && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        );
        if (spawns.length > 0) {
            const target = creep.pos.findClosestByRange(spawns);
            if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(target, { visualizePathStyle: { stroke: '#ffffff' } });
            }
            creep.say('🏭');
            return;
        }

        // Bonus upgrade when idle
        const ctrl = creep.room.controller;
        if (ctrl) {
            if (creep.upgradeController(ctrl) === ERR_NOT_IN_RANGE) {
                creep.moveTo(ctrl, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 5 });
            }
            creep.say('⬆');
        }
    },

    getEnergy: function (creep) {
        if (cache.pickupNearby(creep)) return;

        // Storage first (don't compete with miners for container energy)
        const storage = creep.room.storage;
        if (storage && storage.store[RESOURCE_ENERGY] > 2000) {
            if (creep.withdraw(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(storage, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 5 });
            }
            creep.say('🏦');
            return;
        }

        // Containers that are NOT adjacent to sources (avoid draining miner containers)
        const sources = cache.find(creep.room, FIND_SOURCES);
        const containers = cache.find(creep.room, FIND_STRUCTURES)
            .filter(s =>
                s.structureType === STRUCTURE_CONTAINER &&
                s.store[RESOURCE_ENERGY] > 100 &&
                !sources.some(src => s.pos.inRangeTo(src, 1))
            );
        if (containers.length > 0) {
            const target = creep.pos.findClosestByRange(containers);
            if (creep.withdraw(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(target, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 5 });
            }
            creep.say('📦');
            return;
        }

        // Source containers as last resort before mining
        const srcContainers = cache.find(creep.room, FIND_STRUCTURES)
            .filter(s =>
                s.structureType === STRUCTURE_CONTAINER &&
                s.store[RESOURCE_ENERGY] > 500
            );
        if (srcContainers.length > 0) {
            const target = creep.pos.findClosestByRange(srcContainers);
            if (creep.withdraw(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(target, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 5 });
            }
            creep.say('📦');
            return;
        }

        // Don't compete with harvesters for source access when spawn is low
        if (creep.room.energyAvailable < creep.room.energyCapacityAvailable * 0.5) return;

        // Mine directly
        if (!creep.memory.sourceId) cache.assignSource(creep);
        const source = Game.getObjectById(creep.memory.sourceId);
        if (!source) { creep.memory.sourceId = null; return; }
        if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
            creep.moveTo(source, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 5 });
        }
        creep.say('⛏️');
    }
};

module.exports = roleBuilder;
