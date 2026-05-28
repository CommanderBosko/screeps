const cache = require('cache');
const barrierCap = cache.barrierCap;

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

const roleRepairer = {
    run: function (creep) {
        if (creep.memory.repairing && creep.store.getUsedCapacity() === 0) {
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
                        const result = creep.transfer(storage, RESOURCE_ENERGY);
                        if (result === ERR_NOT_IN_RANGE) {
                            creep.moveTo(storage, { visualizePathStyle: { stroke: '#ffaa00' } });
                            console.log('[repairer] ' + creep.name + ' | ' + eStr(creep) + ' | idle | dump to storage -> ERR_NOT_IN_RANGE | moving');
                        } else {
                            console.log('[repairer] ' + creep.name + ' | ' + eStr(creep) + ' | idle | dump to storage -> ' + errName(result));
                        }
                        return;
                    }
                }
                console.log('[repairer] ' + creep.name + ' | ' + eStr(creep) + ' | idle | no work');
                creep.say('💤');
            }
        }
    },

    // Validate and return a persisted repair target, or null if it is stale or at cap.
    // isValid(obj) is called with the live game object to check if it still needs work.
    _resolveTarget: function (creep, isValid) {
        if (!creep.memory.repairTarget) return null;
        const obj = Game.getObjectById(creep.memory.repairTarget);
        if (obj && isValid(obj)) return obj;
        creep.memory.repairTarget = null;
        return null;
    },

    // Lock onto a target for the rest of this energy load.
    _lockTarget: function (creep, target) {
        creep.memory.repairTarget = target ? target.id : null;
    },

    doRepair: function (creep) {
        const room = creep.room;
        const rcl = room.controller ? room.controller.level : 1;
        const myStructs = cache.find(room, FIND_MY_STRUCTURES);
        const allStructures = cache.find(room, FIND_STRUCTURES);
        const roomTowers = myStructs.filter(s => s.structureType === STRUCTURE_TOWER);
        // Use hasTowerWithEnergy to match hasWork() logic — an empty tower cannot repair
        // roads/containers for us, so the repairer must still do that work itself.
        const hasTowerWithEnergy = roomTowers.some(t => t.store[RESOURCE_ENERGY] > 0);

        // --- Emergency rampart rescue (always, regardless of tower presence) ---
        // Persist the target so the full load goes to one dying rampart.
        const RAMPART_EMERGENCY = 500;
        const dyingRamparts = allStructures
            .filter(s => s.structureType === STRUCTURE_RAMPART && s.hits < RAMPART_EMERGENCY);
        if (dyingRamparts.length > 0) {
            let target = roleRepairer._resolveTarget(creep, s =>
                s.structureType === STRUCTURE_RAMPART && s.hits < RAMPART_EMERGENCY
            );
            if (!target) {
                dyingRamparts.sort((a, b) => a.hits - b.hits);
                target = dyingRamparts[0];
                roleRepairer._lockTarget(creep, target);
            }
            const result = creep.repair(target);
            if (result === ERR_NOT_IN_RANGE) {
                creep.moveTo(target, { visualizePathStyle: { stroke: '#ff0000' } });
                console.log('[repairer] ' + creep.name + ' | ' + eStr(creep) + ' | repair | SOS rampart#' + target.id.slice(-4) + ' hits=' + target.hits + ' -> ERR_NOT_IN_RANGE | moving');
            } else {
                console.log('[repairer] ' + creep.name + ' | ' + eStr(creep) + ' | repair | SOS rampart#' + target.id.slice(-4) + ' hits=' + target.hits + ' -> ' + errName(result));
            }
            creep.say('SOS');
            return;
        }

        // --- Tower present: dump entire energy load into one barrier ---
        // Pick the weakest barrier once at the start of each energy load.
        // Only switch targets if the locked structure was destroyed.
        // Never abandon mid-trip because a target reached cap — stay until store is empty.
        if (hasTowerWithEnergy) {
            let barrierTarget = creep.memory.repairTarget
                ? Game.getObjectById(creep.memory.repairTarget)
                : null;

            if (!barrierTarget) {
                const cap = barrierCap(rcl);
                const weakBarriers = allStructures.filter(s =>
                    (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) &&
                    s.hits < cap
                );
                if (weakBarriers.length === 0) {
                    creep.memory.repairTarget = null;
                    creep.say('💤');
                    return;
                }
                weakBarriers.sort((a, b) => a.hits - b.hits);
                barrierTarget = weakBarriers[0];
                creep.memory.repairTarget = barrierTarget.id;
            }

            const barrierResult = creep.repair(barrierTarget);
            if (barrierResult === ERR_NOT_IN_RANGE) {
                creep.moveTo(barrierTarget, { visualizePathStyle: { stroke: '#aaaaaa' } });
                console.log('[repairer] ' + creep.name + ' | ' + eStr(creep) + ' | repair | barrier#' + barrierTarget.id.slice(-4) + ' hits=' + barrierTarget.hits + ' -> ERR_NOT_IN_RANGE | moving');
            } else {
                console.log('[repairer] ' + creep.name + ' | ' + eStr(creep) + ' | repair | barrier#' + barrierTarget.id.slice(-4) + ' hits=' + barrierTarget.hits + ' -> ' + errName(barrierResult));
            }
            creep.say('🧱');
            return;
        }

        // --- No tower: repair roads/containers/etc. by damage percentage first ---
        const damaged = allStructures.filter(s =>
            s.hits < s.hitsMax &&
            s.structureType !== STRUCTURE_WALL &&
            s.structureType !== STRUCTURE_RAMPART
        );
        if (damaged.length > 0) {
            let target = roleRepairer._resolveTarget(creep, s =>
                s.hits < s.hitsMax &&
                s.structureType !== STRUCTURE_WALL &&
                s.structureType !== STRUCTURE_RAMPART
            );
            if (!target) {
                damaged.sort((a, b) => (a.hits / a.hitsMax) - (b.hits / b.hitsMax));
                target = damaged[0];
                roleRepairer._lockTarget(creep, target);
            }
            const fixResult = creep.repair(target);
            if (fixResult === ERR_NOT_IN_RANGE) {
                creep.moveTo(target, { visualizePathStyle: { stroke: '#ffffff' } });
                console.log('[repairer] ' + creep.name + ' | ' + eStr(creep) + ' | repair | fix ' + target.structureType + '#' + target.id.slice(-4) + ' -> ERR_NOT_IN_RANGE | moving');
            } else {
                console.log('[repairer] ' + creep.name + ' | ' + eStr(creep) + ' | repair | fix ' + target.structureType + '#' + target.id.slice(-4) + ' hits=' + target.hits + '/' + target.hitsMax + ' -> ' + errName(fixResult));
            }
            creep.say('fix');
            return;
        }

        // --- No tower: repair barriers below barrierCap when no other work remains ---
        const cap = barrierCap(rcl);
        const weakBarriersNoTower = allStructures.filter(s =>
            (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) &&
            s.hits < cap
        );
        if (weakBarriersNoTower.length > 0) {
            let target = roleRepairer._resolveTarget(creep, s =>
                (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) &&
                s.hits < cap
            );
            if (!target) {
                weakBarriersNoTower.sort((a, b) => a.hits - b.hits);
                target = weakBarriersNoTower[0];
                roleRepairer._lockTarget(creep, target);
            }
            const barrierNTResult = creep.repair(target);
            if (barrierNTResult === ERR_NOT_IN_RANGE) {
                creep.moveTo(target, { visualizePathStyle: { stroke: '#aaaaaa' } });
                console.log('[repairer] ' + creep.name + ' | ' + eStr(creep) + ' | repair | barrier-notower#' + target.id.slice(-4) + ' hits=' + target.hits + ' -> ERR_NOT_IN_RANGE | moving');
            } else {
                console.log('[repairer] ' + creep.name + ' | ' + eStr(creep) + ' | repair | barrier-notower#' + target.id.slice(-4) + ' hits=' + target.hits + ' -> ' + errName(barrierNTResult));
            }
            creep.say('🧱');
            return;
        }

        // Nothing to repair — dump energy into storage or park near spawn
        const storage = creep.room.storage;
        if (storage && storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            const bankResult = creep.transfer(storage, RESOURCE_ENERGY);
            if (bankResult === ERR_NOT_IN_RANGE) {
                creep.moveTo(storage, { visualizePathStyle: { stroke: '#ffaa00' } });
                console.log('[repairer] ' + creep.name + ' | ' + eStr(creep) + ' | repair | bank storage -> ERR_NOT_IN_RANGE | moving');
            } else {
                console.log('[repairer] ' + creep.name + ' | ' + eStr(creep) + ' | repair | bank storage -> ' + errName(bankResult));
            }
            creep.say('bank');
            return;
        }

        // FIND_MY_STRUCTURES excludes spawns — must use FIND_MY_SPAWNS
        const spawns = cache.find(creep.room, FIND_MY_SPAWNS);
        if (spawns.length > 0 && !creep.pos.inRangeTo(spawns[0], 3)) {
            creep.moveTo(spawns[0], { visualizePathStyle: { stroke: '#ffaa00' } });
        }
        console.log('[repairer] ' + creep.name + ' | ' + eStr(creep) + ' | repair | nothing to repair | idle');
        creep.say('💤');
    },

    getEnergy: function (creep) {
        if (cache.pickupNearby(creep)) {
            console.log('[repairer] ' + creep.name + ' | ' + eStr(creep) + ' | collect | pickupNearby -> OK');
            return;
        }

        // Prefer storage (don't compete for containers)
        const storage = creep.room.storage;
        if (storage && storage.store[RESOURCE_ENERGY] > 300) {
            const result = creep.withdraw(storage, RESOURCE_ENERGY);
            if (result === ERR_NOT_IN_RANGE) {
                creep.moveTo(storage, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 1 });
                console.log('[repairer] ' + creep.name + ' | ' + eStr(creep) + ' | collect | withdraw storage -> ERR_NOT_IN_RANGE | moving');
            } else {
                console.log('[repairer] ' + creep.name + ' | ' + eStr(creep) + ' | collect | withdraw storage -> ' + errName(result));
            }
            creep.say('stg');
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
            const result = creep.withdraw(target, RESOURCE_ENERGY);
            if (result === ERR_NOT_IN_RANGE) {
                creep.moveTo(target, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 1 });
                console.log('[repairer] ' + creep.name + ' | ' + eStr(creep) + ' | collect | withdraw container#' + target.id.slice(-4) + ' -> ERR_NOT_IN_RANGE | moving');
            } else {
                console.log('[repairer] ' + creep.name + ' | ' + eStr(creep) + ' | collect | withdraw container#' + target.id.slice(-4) + ' -> ' + errName(result));
            }
            creep.say('ctn');
            return;
        }

        // Source containers as last resort before mining
        const srcContainers = cache.find(creep.room, FIND_STRUCTURES)
            .filter(s =>
                s.structureType === STRUCTURE_CONTAINER &&
                s.store[RESOURCE_ENERGY] > 0
            );
        if (srcContainers.length > 0) {
            const target = creep.pos.findClosestByRange(srcContainers);
            const result = creep.withdraw(target, RESOURCE_ENERGY);
            if (result === ERR_NOT_IN_RANGE) {
                creep.moveTo(target, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 1 });
                console.log('[repairer] ' + creep.name + ' | ' + eStr(creep) + ' | collect | withdraw src-container#' + target.id.slice(-4) + ' -> ERR_NOT_IN_RANGE | moving');
            } else {
                console.log('[repairer] ' + creep.name + ' | ' + eStr(creep) + ' | collect | withdraw src-container#' + target.id.slice(-4) + ' -> ' + errName(result));
            }
            creep.say('src');
            return;
        }

        // Don't compete with harvesters for source access when spawn is low
        if (creep.room.energyAvailable < creep.room.energyCapacityAvailable * 0.5) {
            console.log('[repairer] ' + creep.name + ' | ' + eStr(creep) + ' | collect | spawn low — waiting');
            return;
        }

        if (!creep.memory.sourceId) cache.assignSource(creep);
        const source = Game.getObjectById(creep.memory.sourceId);
        if (!source) { creep.memory.sourceId = null; return; }
        const mineResult = creep.harvest(source);
        if (mineResult === ERR_NOT_IN_RANGE) {
            creep.moveTo(source, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 1 });
            console.log('[repairer] ' + creep.name + ' | ' + eStr(creep) + ' | collect | harvest src#' + source.id.slice(-4) + ' -> ERR_NOT_IN_RANGE | moving');
        } else {
            console.log('[repairer] ' + creep.name + ' | ' + eStr(creep) + ' | collect | harvest src#' + source.id.slice(-4) + ' -> ' + errName(mineResult));
        }
        creep.say('mine');
    },

    hasWork: function (creep) {
        const room = creep.room;
        const rcl = room.controller ? room.controller.level : 1;
        const myStructs = cache.find(room, FIND_MY_STRUCTURES);
        const towers = myStructs.filter(s => s.structureType === STRUCTURE_TOWER);
        const hasTowerWithEnergy = towers.some(t => t.store[RESOURCE_ENERGY] > 0);
        const allStructures = cache.find(room, FIND_STRUCTURES);

        // Emergency ramparts always count as work
        if (allStructures.some(s => s.structureType === STRUCTURE_RAMPART && s.hits < 500)) return true;

        // Non-barrier structures (roads, containers, etc.) — only count as work when no tower
        // has energy. A tower with energy handles road/container upkeep; repairer should not compete.
        if (!hasTowerWithEnergy && allStructures.some(s =>
            s.hits < s.hitsMax &&
            s.structureType !== STRUCTURE_WALL &&
            s.structureType !== STRUCTURE_RAMPART
        )) return true;

        // Any barrier below barrierCap counts as work — tower presence determines priority
        // but the repairer handles barriers regardless of whether a tower exists.
        const cap = barrierCap(rcl);
        if (allStructures.some(s =>
            (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) &&
            s.hits < cap
        )) return true;

        return false;
    }
};

module.exports = roleRepairer;
