const cache = require('cache');

const roleRepairer = {
    run: function (creep) {
        if (creep.memory.repairing && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.repairing = false;
            creep.memory.repairTarget = null;
        }
        if (!creep.memory.repairing && creep.store.getFreeCapacity() === 0) {
            creep.memory.repairing = true;
        }

        if (creep.memory.repairing) {
            roleRepairer.doRepair(creep);
        } else {
            if (roleRepairer.hasWork(creep)) {
                roleRepairer.getEnergy(creep);
            } else {
                // Nothing to repair — dump any carried energy and idle
                if (creep.store[RESOURCE_ENERGY] > 0) {
                    const storage = creep.room.storage;
                    if (storage) {
                        if (creep.transfer(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                            creep.moveTo(storage, { visualizePathStyle: { stroke: '#ffaa00' } });
                        }
                        return;
                    }
                }
                creep.say('💤');
            }
        }
    },

    doRepair: function (creep) {
        const myStructs = cache.find(creep.room, FIND_MY_STRUCTURES);
        const hasTower = myStructs.some(s => s.structureType === STRUCTURE_TOWER);

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

        // Without a tower, repair roads/containers/etc. before barriers
        // (no tower means no other structure is maintaining non-barriers).
        if (!hasTower) {
            const damaged = cache.find(creep.room, FIND_STRUCTURES)
                .filter(s =>
                    s.hits < s.hitsMax &&
                    s.structureType !== STRUCTURE_WALL &&
                    s.structureType !== STRUCTURE_RAMPART
                );
            if (damaged.length > 0) {
                damaged.sort((a, b) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax));
                const target = damaged[0];
                if (creep.repair(target) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, { visualizePathStyle: { stroke: '#ffffff' } });
                }
                creep.say('🔧');
                return;
            }
        }

        // With a tower present: barriers take priority over non-barrier maintenance.
        // Tower already handles road/container upkeep at idle — repairer should focus on
        // walls and ramparts which towers do not raise high enough on their own.
        // Persist target in memory so the creep commits its full energy load to one barrier
        // instead of re-sorting every tick (walls can have up to 300M maxHits).
        if (hasTower) {
            const allStructures2 = cache.find(creep.room, FIND_STRUCTURES);
            const hasWeakBarrier = allStructures2.some(s =>
                (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) &&
                s.hits < s.hitsMax
            );
            if (hasWeakBarrier) {
                // Validate persisted target: must still exist and still be below maxHits
                let barrierTarget = creep.memory.repairTarget
                    ? Game.getObjectById(creep.memory.repairTarget)
                    : null;
                if (!barrierTarget || barrierTarget.hits >= barrierTarget.hitsMax) {
                    // Pick the weakest barrier by absolute HP and lock onto it
                    const weakBarrier = allStructures2.filter(s =>
                        (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) &&
                        s.hits < s.hitsMax
                    );
                    weakBarrier.sort((a, b) => a.hits - b.hits);
                    barrierTarget = weakBarrier[0] || null;
                    creep.memory.repairTarget = barrierTarget ? barrierTarget.id : null;
                }
                if (barrierTarget) {
                    if (creep.repair(barrierTarget) === ERR_NOT_IN_RANGE) {
                        creep.moveTo(barrierTarget, { visualizePathStyle: { stroke: '#aaaaaa' } });
                    }
                    creep.say('🧱');
                    return;
                }
            }
            // No barriers need work — clear any stale target
            creep.memory.repairTarget = null;
        }

        // No barriers need work — fall back to non-barrier maintenance (roads, containers, etc.)
        // Only reached when all walls/ramparts are at maxHits.
        if (hasTower) {
            const damagedNonBarrier = cache.find(creep.room, FIND_STRUCTURES)
                .filter(s =>
                    s.hits < s.hitsMax &&
                    s.structureType !== STRUCTURE_WALL &&
                    s.structureType !== STRUCTURE_RAMPART
                );
            if (damagedNonBarrier.length > 0) {
                damagedNonBarrier.sort((a, b) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax));
                const target = damagedNonBarrier[0];
                if (creep.repair(target) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, { visualizePathStyle: { stroke: '#ffffff' } });
                }
                creep.say('🔧');
                return;
            }
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
                creep.moveTo(storage, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 3 });
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
                creep.moveTo(target, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 3 });
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
                creep.moveTo(target, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 3 });
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
            creep.moveTo(source, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 3 });
        }
        creep.say('⛏️');
    },

    hasWork: function (creep) {
        const myStructs = cache.find(creep.room, FIND_MY_STRUCTURES);
        const hasTower = myStructs.some(s => s.structureType === STRUCTURE_TOWER);
        const allStructures = cache.find(creep.room, FIND_STRUCTURES);

        // Emergency ramparts always count as work
        if (allStructures.some(s => s.structureType === STRUCTURE_RAMPART && s.hits < 500)) return true;

        // Any non-barrier structure below maxHits counts as work (with or without tower)
        if (allStructures.some(s =>
            s.hits < s.hitsMax &&
            s.structureType !== STRUCTURE_WALL &&
            s.structureType !== STRUCTURE_RAMPART
        )) return true;

        // Any barrier below maxHits counts as work when a tower exists
        if (hasTower && allStructures.some(s =>
            (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) &&
            s.hits < s.hitsMax
        )) return true;

        return false;
    }
};

module.exports = roleRepairer;
