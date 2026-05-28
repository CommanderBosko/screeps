const cache = require('cache');

// Harvester: active at RCL 1-3, mines and delivers to spawn/extensions/towers/storage.
// Replaced by miner+hauler at RCL 4+.

/**
 * Pick the best structure for a harvester to transfer energy into.
 * Priority: spawns → extensions → towers → storage.
 * Returns null if everything is full or absent.
 * @param {Creep} creep
 * @returns {StructureSpawn|StructureExtension|StructureTower|StructureStorage|null}
 */
function pickTransferTarget(creep) {
    const myStructs = cache.find(creep.room, FIND_MY_STRUCTURES);

    // FIND_MY_STRUCTURES excludes spawns — must use FIND_MY_SPAWNS separately
    const spawns = cache.find(creep.room, FIND_MY_SPAWNS).filter(s =>
        s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    );
    if (spawns.length > 0) return creep.pos.findClosestByRange(spawns);

    const extensions = myStructs.filter(s =>
        s.structureType === STRUCTURE_EXTENSION && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    );
    if (extensions.length > 0) return creep.pos.findClosestByPath(extensions);

    // Gate tower delivery at >= 100 free capacity — a near-full tower (996/1000) traps
    // the harvester in deliver mode for many ticks and blocks it from returning to mine.
    const TOWER_MIN_FREE = 100;
    const towers = myStructs.filter(s =>
        s.structureType === STRUCTURE_TOWER &&
        s.store.getFreeCapacity(RESOURCE_ENERGY) >= TOWER_MIN_FREE
    );
    if (towers.length > 0) return creep.pos.findClosestByRange(towers);

    // Storage if it exists (RCL 4 edge case where harvester still alive)
    const storage = creep.room.storage;
    if (storage && storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0) return storage;

    return null;
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

const roleHarvester = {
    run: function (creep) {
        if (creep.memory.delivering && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.delivering = false;
        }
        if (!creep.memory.delivering && creep.store.getFreeCapacity() === 0) {
            creep.memory.delivering = true;
        }

        const state = creep.memory.delivering ? 'deliver' : 'harvest';

        if (creep.memory.delivering) {
            const target = pickTransferTarget(creep);
            if (target) {
                const result = creep.transfer(target, RESOURCE_ENERGY);
                if (result === ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, { visualizePathStyle: { stroke: '#ffffff' }, reusePath: 2 });
                    console.log('[harvester] ' + creep.name + ' | ' + eStr(creep) + ' | ' + state + ' | transfer ' + target.structureType + '#' + target.id.slice(-4) + ' -> ERR_NOT_IN_RANGE | moving');
                } else {
                    console.log('[harvester] ' + creep.name + ' | ' + eStr(creep) + ' | ' + state + ' | transfer ' + target.structureType + '#' + target.id.slice(-4) + ' -> ' + errName(result));
                }
                creep.say('🏭');
            } else {
                // All priority targets full — fall back to storage, then drift toward spawn
                const storage = creep.room.storage;
                if (storage && storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
                    const result = creep.transfer(storage, RESOURCE_ENERGY);
                    if (result === ERR_NOT_IN_RANGE) {
                        creep.moveTo(storage, { visualizePathStyle: { stroke: '#ffffff' }, reusePath: 2 });
                        console.log('[harvester] ' + creep.name + ' | ' + eStr(creep) + ' | ' + state + ' | transfer storage#' + storage.id.slice(-4) + ' -> ERR_NOT_IN_RANGE | moving');
                    } else {
                        console.log('[harvester] ' + creep.name + ' | ' + eStr(creep) + ' | ' + state + ' | transfer storage#' + storage.id.slice(-4) + ' -> ' + errName(result));
                    }
                    creep.say('🏦');
                } else {
                    // Storage full or absent — drift toward spawn to stay out of the way
                    // FIND_MY_STRUCTURES excludes spawns — must use FIND_MY_SPAWNS
                    const spawns = cache.find(creep.room, FIND_MY_SPAWNS);
                    if (spawns.length > 0 && !creep.pos.inRangeTo(spawns[0], 3)) {
                        creep.moveTo(spawns[0], { visualizePathStyle: { stroke: '#ffffff' }, reusePath: 3 });
                        console.log('[harvester] ' + creep.name + ' | ' + eStr(creep) + ' | ' + state + ' | no target | drifting to spawn');
                    } else {
                        console.log('[harvester] ' + creep.name + ' | ' + eStr(creep) + ' | ' + state + ' | no target | idle near spawn');
                    }
                }
            }
            return;
        }

        roleHarvester.getEnergy(creep);
    },

    getEnergy: function (creep) {
        if (cache.pickupNearby(creep)) {
            console.log('[harvester] ' + creep.name + ' | ' + eStr(creep) + ' | harvest | pickupNearby -> OK');
            return;
        }

        if (!creep.memory.sourceId) cache.assignSource(creep);
        const source = Game.getObjectById(creep.memory.sourceId);
        if (!source) {
            console.log('[harvester] ' + creep.name + ' | ' + eStr(creep) + ' | harvest | no source assigned');
            return;
        }
        const result = creep.harvest(source);
        if (result === ERR_NOT_IN_RANGE) {
            creep.moveTo(source, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 2 });
            console.log('[harvester] ' + creep.name + ' | ' + eStr(creep) + ' | harvest | harvest src#' + source.id.slice(-4) + ' -> ERR_NOT_IN_RANGE | moving');
        } else {
            console.log('[harvester] ' + creep.name + ' | ' + eStr(creep) + ' | harvest | harvest src#' + source.id.slice(-4) + ' -> ' + errName(result));
        }
        creep.say('⛏️');
    }
};

module.exports = roleHarvester;
