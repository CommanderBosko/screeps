const cache = require('cache');

// Hauler: drains receiver links / containers, fills spawns → extensions → towers → storage.
// At RCL 4+ with links, this is the primary energy distribution role.

// Container selection: if both containers are at or above this fill ratio, prefer the
// closest one (less travel) rather than the marginally fuller one.
const CONTAINER_FULL_THRESHOLD = 0.8;

/**
 * Pick the best container for a hauler to withdraw from.
 * - If one container is meaningfully fuller than CONTAINER_FULL_THRESHOLD, prefer it.
 * - If both are above the threshold (i.e. both near-full), prefer the closest one.
 * - Otherwise fall back to the most-full container.
 */
function pickContainer(creep, containers) {
    if (containers.length === 1) return containers[0];

    const fullest = containers.reduce((a, b) =>
        a.store[RESOURCE_ENERGY] >= b.store[RESOURCE_ENERGY] ? a : b);

    const allNearFull = containers.every(
        c => c.store[RESOURCE_ENERGY] / c.store.getCapacity(RESOURCE_ENERGY) >= CONTAINER_FULL_THRESHOLD
    );

    if (allNearFull) {
        return creep.pos.findClosestByRange(containers);
    }
    return fullest;
}

const roleHauler = {
    run: function (creep) {
        if (creep.memory.delivering && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.delivering = false;
        }
        if (!creep.memory.delivering &&
            creep.store[RESOURCE_ENERGY] >= creep.store.getCapacity() * 0.5) {
            creep.memory.delivering = true;
        }

        if (creep.memory.delivering) {
            const target = roleHauler.getDeliveryTarget(creep);
            if (target) {
                if (creep.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, { visualizePathStyle: { stroke: '#ffffff' }, reusePath: 10 });
                }
                creep.say('🚚');
            } else {
                // Nothing to fill right now — top up store if possible, then park near spawn.

                // Step 1: if we have room, grab from the fullest container so we're
                // ready to deliver the instant a spawn/extension becomes available.
                if (creep.store.getFreeCapacity() > 0) {
                    const containers = cache.find(creep.room, FIND_STRUCTURES)
                        .filter(s => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0);
                    if (containers.length > 0) {
                        const src = pickContainer(creep, containers);
                        if (creep.withdraw(src, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                            creep.moveTo(src, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 10 });
                        }
                        creep.say('🔋');
                        return;
                    }
                }

                // Step 2: full (or nothing to pull from) — park at range 1 of spawn.
                const spawns = cache.find(creep.room, FIND_MY_SPAWNS);
                if (spawns.length > 0 && !creep.pos.inRangeTo(spawns[0], 1)) {
                    creep.moveTo(spawns[0], { visualizePathStyle: { stroke: '#aaaaaa' }, reusePath: 5 });
                }
                creep.say('💤');
            }
            return;
        }

        if (cache.pickupNearby(creep, 5)) return;

        // Receiver links sit near spawn/storage — withdraw here first (shortest trip)
        const { receiverLinks } = cache.getLinkRoles(creep.room);
        const readyReceivers = receiverLinks.filter(l => l.store[RESOURCE_ENERGY] > 0);
        if (readyReceivers.length > 0) {
            const target = creep.pos.findClosestByRange(readyReceivers);
            if (creep.withdraw(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(target, { visualizePathStyle: { stroke: '#00aaff' }, reusePath: 10 });
            }
            creep.say('🔗');
            return;
        }

        // Pinned to a specific container (pre-link mode)
        if (creep.memory.containerId) {
            const container = Game.getObjectById(creep.memory.containerId);
            if (container && container.store[RESOURCE_ENERGY] > 0) {
                if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(container, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 10 });
                }
                creep.say('📦');
                return;
            }
            // Container empty or gone — wait near it rather than roaming
            if (container && !creep.pos.inRangeTo(container, 2)) {
                creep.moveTo(container, { visualizePathStyle: { stroke: '#aaaaaa' }, reusePath: 10 });
            }
            creep.say('⏳');
            return;
        }

        // Unassigned fallback (should only apply in link mode or edge cases)
        const containers = cache.find(creep.room, FIND_STRUCTURES)
            .filter(s => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0);
        if (containers.length > 0) {
            const target = pickContainer(creep, containers);
            if (creep.withdraw(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(target, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 10 });
            }
            creep.say('📦');
            return;
        }

        creep.say('💤');
    },

    getDeliveryTarget: function (creep) {
        const myStructs = cache.find(creep.room, FIND_MY_STRUCTURES);

        // Priority 1: spawns (keep spawning capacity online)
        const spawns = myStructs.filter(s =>
            s.structureType === STRUCTURE_SPAWN && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        );
        if (spawns.length > 0) return creep.pos.findClosestByRange(spawns);

        // Priority 2: extensions — use findClosestByPath for accurate routing among many targets
        const extensions = myStructs.filter(s =>
            s.structureType === STRUCTURE_EXTENSION && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        );
        if (extensions.length > 0) return creep.pos.findClosestByPath(extensions);

        // Priority 3: towers (keep full for defense and safe mode)
        const towers = myStructs.filter(s =>
            s.structureType === STRUCTURE_TOWER &&
            s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        );
        if (towers.length > 0) return creep.pos.findClosestByRange(towers);

        // Priority 4: storage (bank excess energy)
        const storage = creep.room.storage;
        if (storage && storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0) return storage;

        return null;
    }
};

module.exports = roleHauler;
