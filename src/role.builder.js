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
        STRUCTURE_WALL,
        STRUCTURE_RAMPART,
    ];
    return [
        STRUCTURE_EXTENSION,
        STRUCTURE_CONTAINER,
        STRUCTURE_STORAGE,
        STRUCTURE_ROAD,
        STRUCTURE_WALL,
        STRUCTURE_RAMPART,
    ];
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

            // Build a sorted list of unique priority indices that are present in sites.
            // We iterate from best to worst so that if the top tier is fully unreachable
            // (e.g. planner placed sites in an enclosed area), we fall through to the next
            // tier rather than logging "no reachable site" and spinning idle every tick.
            const presentTiers = [];
            for (const site of sites) {
                const p = priority.indexOf(site.structureType);
                const pIdx = p === -1 ? priority.length : p;
                if (!presentTiers.includes(pIdx)) presentTiers.push(pIdx);
            }
            presentTiers.sort((a, b) => a - b);

            let best = null;
            for (const tierIdx of presentTiers) {
                const tier = sites.filter(s => {
                    const p = priority.indexOf(s.structureType);
                    return (p === -1 ? priority.length : p) === tierIdx;
                });
                tier.sort((a, b) => {
                    const progDiff = (b.progress / b.progressTotal) - (a.progress / a.progressTotal);
                    if (Math.abs(progDiff) > 0.1) return progDiff;
                    return 0;
                });
                const candidate = creep.pos.findClosestByPath(tier, { ignoreCreeps: true });
                if (candidate) { best = candidate; break; }
            }

            if (best) {
                const result = creep.build(best);
                if (result === ERR_NOT_IN_RANGE) {
                    creep.moveTo(best, { visualizePathStyle: { stroke: '#ffffff' }, reusePath: 0, ignoreCreeps: true });
                    console.log('[builder] ' + creep.name + ' | ' + eStr(creep) + ' | build | build ' + best.structureType + '@(' + best.pos.x + ',' + best.pos.y + ') -> ERR_NOT_IN_RANGE | moving');
                } else {
                    console.log('[builder] ' + creep.name + ' | ' + eStr(creep) + ' | build | build ' + best.structureType + '@(' + best.pos.x + ',' + best.pos.y + ') -> ' + errName(result));
                }
                creep.say('🚧');
                return;
            }
            // No reachable site — fall through to tower/spawn fill below.
            // Don't flip building=false here; the builder has a full store.
            console.log('[builder] ' + creep.name + ' | no reachable site in any tier (' + sites.length + ' sites) — trying tower/spawn fill');
        }

        // No sites, or all sites unreachable — fill towers then spawns.
        // IMPORTANT: use FIND_MY_SPAWNS, not FIND_MY_STRUCTURES filtered for STRUCTURE_SPAWN.
        // FIND_MY_STRUCTURES does NOT return spawns in the Screeps API.
        const myStructs = cache.find(creep.room, FIND_MY_STRUCTURES);
        const towers = myStructs.filter(s =>
            s.structureType === STRUCTURE_TOWER &&
            s.store.getFreeCapacity(RESOURCE_ENERGY) > s.store.getCapacity(RESOURCE_ENERGY) * 0.5
        );
        if (towers.length > 0) {
            const target = creep.pos.findClosestByRange(towers);
            const result = creep.transfer(target, RESOURCE_ENERGY);
            if (result === ERR_NOT_IN_RANGE) {
                creep.moveTo(target, { visualizePathStyle: { stroke: '#ffffff' } });
                console.log('[builder] ' + creep.name + ' | ' + eStr(creep) + ' | build | fill tower#' + target.id.slice(-4) + ' -> ERR_NOT_IN_RANGE | moving');
            } else {
                console.log('[builder] ' + creep.name + ' | ' + eStr(creep) + ' | build | fill tower#' + target.id.slice(-4) + ' -> ' + errName(result));
            }
            creep.say('🗼');
            return;
        }

        // FIND_MY_STRUCTURES excludes spawns — must use FIND_MY_SPAWNS
        const spawns = cache.find(creep.room, FIND_MY_SPAWNS).filter(s =>
            s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        );
        if (spawns.length > 0) {
            const target = creep.pos.findClosestByRange(spawns);
            const result = creep.transfer(target, RESOURCE_ENERGY);
            if (result === ERR_NOT_IN_RANGE) {
                creep.moveTo(target, { visualizePathStyle: { stroke: '#ffffff' } });
                console.log('[builder] ' + creep.name + ' | ' + eStr(creep) + ' | build | fill spawn#' + target.id.slice(-4) + ' -> ERR_NOT_IN_RANGE | moving');
            } else {
                console.log('[builder] ' + creep.name + ' | ' + eStr(creep) + ' | build | fill spawn#' + target.id.slice(-4) + ' -> ' + errName(result));
            }
            creep.say('🏭');
            return;
        }

        // No sites, towers full, spawn full — flip back to harvesting so we don't burn
        // energy on upgrade and trigger a getEnergy→controller-container→upgrade oscillation loop.
        creep.memory.building = false;
        console.log('[builder] ' + creep.name + ' | ' + eStr(creep) + ' | build | no work — idle (building=false)');
    },

    getEnergy: function (creep) {
        if (cache.pickupNearby(creep)) {
            console.log('[builder] ' + creep.name + ' | ' + eStr(creep) + ' | collect | pickupNearby -> OK');
            return;
        }

        // Storage first (don't compete with miners for container energy)
        const storage = creep.room.storage;
        if (storage && storage.store[RESOURCE_ENERGY] > 500) {
            const result = creep.withdraw(storage, RESOURCE_ENERGY);
            if (result === ERR_NOT_IN_RANGE) {
                creep.moveTo(storage, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 3 });
                console.log('[builder] ' + creep.name + ' | ' + eStr(creep) + ' | collect | withdraw storage -> ERR_NOT_IN_RANGE | moving');
            } else {
                console.log('[builder] ' + creep.name + ' | ' + eStr(creep) + ' | collect | withdraw storage -> ' + errName(result));
            }
            creep.say('🏦');
            return;
        }

        // Containers that are NOT adjacent to sources
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
                creep.moveTo(target, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 3 });
                console.log('[builder] ' + creep.name + ' | ' + eStr(creep) + ' | collect | withdraw container#' + target.id.slice(-4) + ' -> ERR_NOT_IN_RANGE | moving');
            } else {
                console.log('[builder] ' + creep.name + ' | ' + eStr(creep) + ' | collect | withdraw container#' + target.id.slice(-4) + ' -> ' + errName(result));
            }
            creep.say('📦');
            return;
        }

        // Source containers as last resort before mining.
        // At RCL 4+ miners park ON their container tile — builder will circle forever
        // trying to path to a tile that is perpetually occupied. Skip this path and fall
        // through to direct mining or idle-wait instead.
        const rcl = creep.room.controller ? creep.room.controller.level : 0;
        if (rcl < 4) {
            const srcContainers = cache.find(creep.room, FIND_STRUCTURES)
                .filter(s =>
                    s.structureType === STRUCTURE_CONTAINER &&
                    s.store[RESOURCE_ENERGY] > 0
                );
            if (srcContainers.length > 0) {
                const target = creep.pos.findClosestByRange(srcContainers);
                const result = creep.withdraw(target, RESOURCE_ENERGY);
                if (result === ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 3 });
                    console.log('[builder] ' + creep.name + ' | ' + eStr(creep) + ' | collect | withdraw src-container#' + target.id.slice(-4) + ' -> ERR_NOT_IN_RANGE | moving');
                } else {
                    console.log('[builder] ' + creep.name + ' | ' + eStr(creep) + ' | collect | withdraw src-container#' + target.id.slice(-4) + ' -> ' + errName(result));
                }
                creep.say('📦');
                return;
            }
        }

        // Don't compete with harvesters for source access when spawn is low
        if (creep.room.energyAvailable < creep.room.energyCapacityAvailable * 0.5) {
            console.log('[builder] ' + creep.name + ' | ' + eStr(creep) + ' | collect | spawn low — waiting');
            return;
        }

        // Mine directly
        if (!creep.memory.sourceId) cache.assignSource(creep);
        const source = Game.getObjectById(creep.memory.sourceId);
        if (!source) { creep.memory.sourceId = null; return; }
        const mineResult = creep.harvest(source);
        if (mineResult === ERR_NOT_IN_RANGE) {
            creep.moveTo(source, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 3 });
            console.log('[builder] ' + creep.name + ' | ' + eStr(creep) + ' | collect | harvest src#' + source.id.slice(-4) + ' -> ERR_NOT_IN_RANGE | moving');
        } else {
            console.log('[builder] ' + creep.name + ' | ' + eStr(creep) + ' | collect | harvest src#' + source.id.slice(-4) + ' -> ' + errName(mineResult));
        }
        creep.say('⛏️');
    }
};

module.exports = roleBuilder;
