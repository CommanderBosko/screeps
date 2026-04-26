const cache = require('cache');

// Construction priority: critical infrastructure first, then defensive
function constructionPriority(rcl) {
    if (rcl >= 3) return [
        STRUCTURE_TOWER,
        STRUCTURE_EXTENSION,
        STRUCTURE_LINK,
        STRUCTURE_CONTAINER,
        STRUCTURE_STORAGE,
        STRUCTURE_WALL,
        STRUCTURE_RAMPART,
        STRUCTURE_ROAD,
    ];
    return [
        STRUCTURE_EXTENSION,
        STRUCTURE_CONTAINER,
        STRUCTURE_STORAGE,
        STRUCTURE_WALL,
        STRUCTURE_RAMPART,
        STRUCTURE_ROAD,
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
            // Find the highest-priority tier, then among that tier pick the one
            // with the most progress (avoid waste) — break ties by path distance.
            let bestPriority = Infinity;
            for (const site of sites) {
                const p = priority.indexOf(site.structureType);
                const pIdx = p === -1 ? priority.length : p;
                if (pIdx < bestPriority) bestPriority = pIdx;
            }
            const topTier = sites.filter(s => {
                const p = priority.indexOf(s.structureType);
                return (p === -1 ? priority.length : p) === bestPriority;
            });
            // Among top tier: prefer most complete, then closest by path
            topTier.sort((a, b) => {
                const progDiff = (b.progress / b.progressTotal) - (a.progress / a.progressTotal);
                if (Math.abs(progDiff) > 0.1) return progDiff; // >10% difference: pick more complete
                return 0; // let findClosestByPath decide among similar-progress sites
            });
            // Among near-equal progress, pick the path-closest in the top tier
            const best = topTier.length === 1
                ? topTier[0]
                : creep.pos.findClosestByPath(topTier) || topTier[0];
            if (best) {
                if (creep.build(best) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(best, { visualizePathStyle: { stroke: '#ffffff' }, reusePath: 3 });
                }
                creep.say('🚧');
            }
            return;
        }

        // Nothing to build — fill towers then spawns, then upgrade as a bonus
        const myStructs = cache.find(creep.room, FIND_MY_STRUCTURES);
        const towers = myStructs.filter(s =>
            s.structureType === STRUCTURE_TOWER &&
            s.store.getFreeCapacity(RESOURCE_ENERGY) > s.store.getCapacity(RESOURCE_ENERGY) * 0.5
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
                creep.moveTo(ctrl, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 3 });
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
                creep.moveTo(storage, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 3 });
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
                creep.moveTo(target, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 3 });
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
                creep.moveTo(target, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 3 });
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
            creep.moveTo(source, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 3 });
        }
        creep.say('⛏️');
    }
};

module.exports = roleBuilder;
