const cache = require('cache');

// Hauler: drains receiver links / containers, fills spawns → extensions → towers → storage.
// At RCL 4+ with links, this is the primary energy distribution role.

// Container selection: if both containers are at or above this fill ratio, prefer the
// closest one (less travel) rather than the marginally fuller one.
const CONTAINER_FULL_THRESHOLD = 0.8;

/**
 * A simple deterministic hash of a string to a non-negative integer.
 * Used to assign haulers to containers without Memory writes.
 */
function nameHash(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) {
        h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    }
    return h >>> 0; // unsigned
}

/**
 * Pick the best container for a hauler to withdraw from.
 * - If all containers are near-full (>= CONTAINER_FULL_THRESHOLD), distribute haulers
 *   across them using a stable name-hash modulo — avoids both haulers converging on the
 *   same "closest" container when positions happen to be symmetric.
 * - If one container is meaningfully fuller than the others, prefer it.
 * - Otherwise fall back to the most-full container.
 */
function pickContainer(creep, containers) {
    if (containers.length === 1) return containers[0];

    const allNearFull = containers.every(
        c => c.store[RESOURCE_ENERGY] / c.store.getCapacity(RESOURCE_ENERGY) >= CONTAINER_FULL_THRESHOLD
    );

    if (allNearFull) {
        // Stable round-robin: each hauler gets a fixed slot based on name hash.
        // Sorts containers by id for a consistent ordering across all creeps.
        const sorted = containers.slice().sort((a, b) => a.id < b.id ? -1 : 1);
        return sorted[nameHash(creep.name) % sorted.length];
    }

    return containers.reduce((a, b) =>
        a.store[RESOURCE_ENERGY] >= b.store[RESOURCE_ENERGY] ? a : b);
}

function errName(code) {
    const MAP = {
        [OK]: 'OK',
        [ERR_NOT_IN_RANGE]: 'ERR_NOT_IN_RANGE',
        [ERR_NOT_ENOUGH_ENERGY]: 'ERR_NOT_ENOUGH_ENERGY',
        [ERR_INVALID_TARGET]: 'ERR_INVALID_TARGET',
        [ERR_FULL]: 'ERR_FULL',
        [ERR_BUSY]: 'ERR_BUSY',
        [ERR_NO_PATH]: 'ERR_NO_PATH',
        [ERR_NOT_OWNER]: 'ERR_NOT_OWNER',
        [ERR_TIRED]: 'ERR_TIRED',
    };
    return MAP[code] !== undefined ? MAP[code] : 'ERR(' + code + ')';
}

function eStr(creep) {
    return 'E:' + creep.store[RESOURCE_ENERGY] + '/' + creep.store.getCapacity(RESOURCE_ENERGY);
}

const roleHauler = {
    run: function (creep) {
        if (creep.memory.delivering && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.delivering = false;
        }
        if (!creep.memory.delivering && creep.store.getFreeCapacity() === 0) {
            creep.memory.delivering = true;
        }

        const state = creep.memory.delivering ? 'deliver' : 'pickup';

        if (creep.memory.delivering) {
            const target = roleHauler.getDeliveryTarget(creep);
            if (target) {
                const result = creep.transfer(target, RESOURCE_ENERGY);
                const tLabel = (target.structureType || 'obj') + '#' + target.id.slice(-4);
                if (result === ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, { visualizePathStyle: { stroke: '#ffffff' }, reusePath: 1 });
                    console.log('[hauler] ' + creep.name + ' | ' + eStr(creep) + ' | ' + state + ' | transfer ' + tLabel + ' -> ERR_NOT_IN_RANGE | moving');
                } else {
                    console.log('[hauler] ' + creep.name + ' | ' + eStr(creep) + ' | ' + state + ' | transfer ' + tLabel + ' -> ' + errName(result));
                }
                creep.say('🚚');
            } else {
                // No delivery target found — dump carried energy into storage if possible,
                // then park near spawn. Do NOT pre-fill from sources here: a hauler in
                // deliver mode that starts picking up energy will loop (deliver=true stays
                // set, re-fills, still no target, re-fills again).
                if (creep.store[RESOURCE_ENERGY] > 0) {
                    const storage = creep.room.storage;
                    if (storage && storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
                        const r = creep.transfer(storage, RESOURCE_ENERGY);
                        if (r === ERR_NOT_IN_RANGE) {
                            creep.moveTo(storage, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 5 });
                            console.log('[hauler] ' + creep.name + ' | ' + eStr(creep) + ' | ' + state + ' | dump storage -> ERR_NOT_IN_RANGE | moving');
                        } else {
                            console.log('[hauler] ' + creep.name + ' | ' + eStr(creep) + ' | ' + state + ' | dump storage -> ' + errName(r));
                        }
                        creep.say('🏦');
                        return;
                    }
                }
                // Full, storage also full, or no storage — park at spawn and wait
                const spawns = cache.find(creep.room, FIND_MY_SPAWNS);
                if (spawns.length > 0 && !creep.pos.inRangeTo(spawns[0], 1)) {
                    creep.moveTo(spawns[0], { visualizePathStyle: { stroke: '#aaaaaa' }, reusePath: 5 });
                }
                console.log('[hauler] ' + creep.name + ' | ' + eStr(creep) + ' | ' + state + ' | no delivery target | parking');
                creep.say('💤');
            }
            return;
        }

        // Pickup phase
        const { receiverLinks } = cache.getLinkRoles(creep.room);
        const ctrl = creep.room.controller;
        const readyReceivers = receiverLinks.filter(l =>
            l.store[RESOURCE_ENERGY] > 0 &&
            !(ctrl && l.pos.inRangeTo(ctrl, 3))
        );
        if (readyReceivers.length > 0) {
            const target = creep.pos.findClosestByRange(readyReceivers);
            const result = creep.withdraw(target, RESOURCE_ENERGY);
            if (result === ERR_NOT_IN_RANGE) {
                creep.moveTo(target, { visualizePathStyle: { stroke: '#00aaff' }, reusePath: 10 });
                console.log('[hauler] ' + creep.name + ' | ' + eStr(creep) + ' | ' + state + ' | withdraw link#' + target.id.slice(-4) + ' -> ERR_NOT_IN_RANGE | moving');
            } else {
                console.log('[hauler] ' + creep.name + ' | ' + eStr(creep) + ' | ' + state + ' | withdraw link#' + target.id.slice(-4) + ' -> ' + errName(result));
            }
            creep.say('🔗');
            return;
        }

        // Pinned to a specific container (pre-link mode)
        if (creep.memory.containerId) {
            const container = /** @type {StructureContainer|null} */ (Game.getObjectById(creep.memory.containerId));
            if (container && container.store[RESOURCE_ENERGY] > 0) {
                const result = creep.withdraw(container, RESOURCE_ENERGY);
                if (result === ERR_NOT_IN_RANGE) {
                    creep.moveTo(container, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 10 });
                    console.log('[hauler] ' + creep.name + ' | ' + eStr(creep) + ' | ' + state + ' | withdraw pinned-container#' + container.id.slice(-4) + ' -> ERR_NOT_IN_RANGE | moving');
                } else {
                    console.log('[hauler] ' + creep.name + ' | ' + eStr(creep) + ' | ' + state + ' | withdraw pinned-container#' + container.id.slice(-4) + ' -> ' + errName(result));
                }
                creep.say('📦');
                return;
            }
            // Container is empty (miner dead or not yet arrived) — if we're carrying
            // enough energy to be useful, switch to delivering now rather than idling
            // next to an empty container waiting for the miner to respawn.
            const PARTIAL_DELIVER_THRESHOLD = 100;
            if (creep.store[RESOURCE_ENERGY] >= PARTIAL_DELIVER_THRESHOLD) {
                creep.memory.delivering = true;
                console.log('[hauler] ' + creep.name + ' | ' + eStr(creep) + ' | ' + state + ' | pinned container empty, carrying ' + creep.store[RESOURCE_ENERGY] + ' — switching to deliver');
                // Re-run as deliver mode this tick
                const target = roleHauler.getDeliveryTarget(creep);
                if (target) {
                    const result = creep.transfer(target, RESOURCE_ENERGY);
                    const tLabel = (target.structureType || 'obj') + '#' + target.id.slice(-4);
                    if (result === ERR_NOT_IN_RANGE) {
                        creep.moveTo(target, { visualizePathStyle: { stroke: '#ffffff' }, reusePath: 1 });
                    }
                    console.log('[hauler] ' + creep.name + ' | partial deliver | transfer ' + tLabel + ' -> ' + errName(result));
                }
                return;
            }
            delete creep.memory.containerId;
        }

        // Unassigned fallback — prefer source-adjacent containers
        {
            const sources = cache.find(creep.room, FIND_SOURCES);
            const allContainers = cache.find(creep.room, FIND_STRUCTURES)
                .filter(s => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0);
            const sourceContainers = allContainers.filter(c =>
                sources.some(s => c.pos.inRangeTo(s, 2))
            );
            const containerPool = sourceContainers.length > 0 ? sourceContainers : allContainers;
            if (containerPool.length > 0) {
                const target = pickContainer(creep, containerPool);
                const result = creep.withdraw(target, RESOURCE_ENERGY);
                if (result === ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 10 });
                    console.log('[hauler] ' + creep.name + ' | ' + eStr(creep) + ' | ' + state + ' | withdraw container#' + target.id.slice(-4) + ' -> ERR_NOT_IN_RANGE | moving');
                } else {
                    console.log('[hauler] ' + creep.name + ' | ' + eStr(creep) + ' | ' + state + ' | withdraw container#' + target.id.slice(-4) + ' -> ' + errName(result));
                }
                creep.say('📦');
                return;
            }
        }

        if (cache.pickupNearby(creep, 5)) {
            console.log('[hauler] ' + creep.name + ' | ' + eStr(creep) + ' | ' + state + ' | pickupNearby -> OK');
            return;
        }

        // Storage fallback
        {
            const storage = creep.room.storage;
            if (storage && storage.store[RESOURCE_ENERGY] > 0) {
                const result = creep.withdraw(storage, RESOURCE_ENERGY);
                if (result === ERR_NOT_IN_RANGE) {
                    creep.moveTo(storage, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 10 });
                    console.log('[hauler] ' + creep.name + ' | ' + eStr(creep) + ' | ' + state + ' | withdraw storage -> ERR_NOT_IN_RANGE | moving');
                } else {
                    console.log('[hauler] ' + creep.name + ' | ' + eStr(creep) + ' | ' + state + ' | withdraw storage -> ' + errName(result));
                }
                creep.say('🏦');
                return;
            }
        }

        console.log('[hauler] ' + creep.name + ' | ' + eStr(creep) + ' | ' + state + ' | no energy source | idle');
        creep.say('💤');
    },

    getDeliveryTarget: function (creep) {
        const myStructs = cache.find(creep.room, FIND_MY_STRUCTURES);

        // Priority 1: spawns (keep spawning capacity online).
        // IMPORTANT: FIND_MY_STRUCTURES does NOT include spawns in Screeps — must use
        // FIND_MY_SPAWNS separately, otherwise this filter always returns an empty array.
        const spawns = cache.find(creep.room, FIND_MY_SPAWNS).filter(s =>
            s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        );
        if (spawns.length > 0) return creep.pos.findClosestByRange(spawns);

        // Priority 2: extensions — use findClosestByPath for accurate routing among many targets.
        // Guard: findClosestByPath returns null when no path exists to any target. Fall through
        // to the next priority rather than returning null and skipping towers/storage entirely.
        const extensions = myStructs.filter(s =>
            s.structureType === STRUCTURE_EXTENSION && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        );
        if (extensions.length > 0) {
            const ext = creep.pos.findClosestByPath(extensions);
            if (ext) return ext;
        }

        // Priority 3: towers — only fill when meaningfully empty (>= 100 free capacity).
        // A tower at 996/1000 wastes hauler trips: the hauler transfers 4 energy and stays
        // in deliver mode for many more ticks, blocking it from draining source containers.
        const TOWER_MIN_FREE = 100;
        const towers = myStructs.filter(s =>
            s.structureType === STRUCTURE_TOWER &&
            s.store.getFreeCapacity(RESOURCE_ENERGY) >= TOWER_MIN_FREE
        );
        if (towers.length > 0) {
            const maxFree = Math.max(...towers.map(t => t.store.getFreeCapacity(RESOURCE_ENERGY)));
            const neediest = towers.filter(t => t.store.getFreeCapacity(RESOURCE_ENERGY) === maxFree);
            return creep.pos.findClosestByRange(neediest);
        }

        // Priority 4: storage (bank excess energy)
        const storage = creep.room.storage;
        if (storage && storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0) return storage;

        return null;
    }
};

module.exports = roleHauler;
