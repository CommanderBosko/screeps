const cache = require('cache');

const roleRepairer = {
    run: function (creep) {
        if (creep.memory.repairing && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.repairing = false;
        }
        if (!creep.memory.repairing && creep.store.getFreeCapacity() === 0) {
            creep.memory.repairing = true;
        }

        if (creep.memory.repairing) {
            roleRepairer.doRepair(creep);
        } else {
            roleRepairer.getEnergy(creep);
        }
    },

    doRepair: function (creep) {
        const myStructs = cache.find(creep.room, FIND_MY_STRUCTURES);

        // Fill towers first (top priority for towers below 50%)
        const towers = myStructs.filter(s =>
            s.structureType === STRUCTURE_TOWER &&
            s.store[RESOURCE_ENERGY] < s.store.getCapacity(RESOURCE_ENERGY) * 0.5
        );
        if (towers.length > 0) {
            const target = creep.pos.findClosestByRange(towers);
            if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(target, { visualizePathStyle: { stroke: '#ffffff' } });
            }
            creep.say('🗼');
            return;
        }

        // Emergency: repair ramparts critically close to 0 HP before normal maintenance.
        // 1 HP/tick decay means a 500-HP rampart survives only ~500 ticks without repair.
        const RAMPART_EMERGENCY = 500;
        const dyingRamparts = cache.find(creep.room, FIND_STRUCTURES)
            .filter(s => s.structureType === STRUCTURE_RAMPART && s.hits < RAMPART_EMERGENCY);
        if (dyingRamparts.length > 0) {
            dyingRamparts.sort((a, b) => a.hits - b.hits);
            const target = dyingRamparts[0];
            if (creep.repair(target) === ERR_NOT_IN_RANGE) {
                creep.moveTo(target, { visualizePathStyle: { stroke: '#ff0000' } });
            }
            creep.say('🚨');
            return;
        }

        // Repair damaged non-wall structures (roads, containers, spawn, etc.)
        const damaged = cache.find(creep.room, FIND_STRUCTURES)
            .filter(s =>
                s.hits < s.hitsMax &&
                s.structureType !== STRUCTURE_WALL &&
                s.structureType !== STRUCTURE_RAMPART
            );
        if (damaged.length > 0) {
            // Sort by hit % so most degraded gets fixed first
            damaged.sort((a, b) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax));
            const target = damaged[0];
            if (creep.repair(target) === ERR_NOT_IN_RANGE) {
                creep.moveTo(target, { visualizePathStyle: { stroke: '#ffffff' } });
            }
            creep.say('🔧');
            return;
        }

        // Repair walls/ramparts below HP floor
        const hpTarget = cache.getWallTarget(creep.room);
        const weakBarrier = cache.find(creep.room, FIND_STRUCTURES)
            .filter(s =>
                (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) &&
                s.hits < hpTarget
            );
        if (weakBarrier.length > 0) {
            weakBarrier.sort((a, b) => a.hits - b.hits);
            if (creep.repair(weakBarrier[0]) === ERR_NOT_IN_RANGE) {
                creep.moveTo(weakBarrier[0], { visualizePathStyle: { stroke: '#aaaaaa' } });
            }
            creep.say('🧱');
            return;
        }

        // Nothing to repair — dump energy into storage or park near spawn
        const storage = creep.room.storage;
        if (storage && storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            if (creep.transfer(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(storage, { visualizePathStyle: { stroke: '#ffaa00' } });
            }
            creep.say('🏦');
            return;
        }

        const spawns = cache.find(creep.room, FIND_MY_SPAWNS);
        if (spawns.length > 0 && !creep.pos.inRangeTo(spawns[0], 3)) {
            creep.moveTo(spawns[0], { visualizePathStyle: { stroke: '#ffaa00' } });
        }
        creep.say('💤');
    },

    getEnergy: function (creep) {
        if (cache.pickupNearby(creep)) return;

        // Prefer storage (don't compete for containers)
        const storage = creep.room.storage;
        if (storage && storage.store[RESOURCE_ENERGY] > 1000) {
            if (creep.withdraw(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(storage, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 5 });
            }
            creep.say('🏦');
            return;
        }

        // Non-source containers first (don't drain miner containers)
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

        // Source containers as last resort before mining (only tap when overflowing)
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

        if (!creep.memory.sourceId) cache.assignSource(creep);
        const source = Game.getObjectById(creep.memory.sourceId);
        if (!source) { creep.memory.sourceId = null; return; }
        if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
            creep.moveTo(source, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 5 });
        }
        creep.say('⛏️');
    }
};

module.exports = roleRepairer;
