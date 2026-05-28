const cache = require('cache');

// Stationary miner: parks on container, mines source, fills source link > container.
// 5 WORK parts saturates a source (10 energy/tick harvest rate).

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
    const cap = creep.store.getCapacity(RESOURCE_ENERGY);
    return 'E:' + creep.store[RESOURCE_ENERGY] + '/' + (cap !== null ? cap : '?');
}

const roleMiner = {
    run: function (creep) {
        if (!creep.memory.sourceId) roleMiner.assignSource(creep);
        if (!creep.memory.containerId) roleMiner.assignContainer(creep);

        const source = /** @type {Source|null} */ (Game.getObjectById(creep.memory.sourceId));
        if (!source) {
            console.log('[miner] ' + creep.name + ' | ' + eStr(creep) + ' | no source | idle');
            return;
        }

        // Invalidate containerId if it no longer belongs to the assigned source
        if (creep.memory.containerId) {
            const existing = /** @type {StructureContainer|null} */ (Game.getObjectById(creep.memory.containerId));
            if (!existing || !existing.pos.inRangeTo(source.pos, 1)) {
                creep.memory.containerId = null;
                roleMiner.assignContainer(creep);
            }
        }

        const container = /** @type {StructureContainer|null} */ (Game.getObjectById(creep.memory.containerId));

        if (container) {
            if (!creep.pos.isEqualTo(container.pos)) {
                const moveResult = creep.moveTo(container.pos, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 1, range: 0 });
                if (moveResult === ERR_NO_PATH) {
                    console.log('[miner] ' + creep.name + ' | ' + eStr(creep) + ' | container#' + container.id.slice(-4) + ' UNREACHABLE (ERR_NO_PATH) @(' + container.pos.x + ',' + container.pos.y + ')');
                } else {
                    console.log('[miner] ' + creep.name + ' | ' + eStr(creep) + ' | moving to container#' + container.id.slice(-4) + ' @(' + container.pos.x + ',' + container.pos.y + ')');
                }
                return;
            }

            if (creep.store.getFreeCapacity() === 0) {
                // Use range 2 (not 1): planner may place the source link on a tile adjacent
                // to the source but on the opposite side from the container tile, putting the
                // link at miner-to-link distance 2. Range 1 misses that link every time.
                const link = creep.pos.findInRange(FIND_MY_STRUCTURES, 2, {
                    filter: s => s.structureType === STRUCTURE_LINK &&
                                 s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
                })[0];
                const result = link
                    ? creep.transfer(link, RESOURCE_ENERGY)
                    : creep.transfer(container, RESOURCE_ENERGY);
                const targetLabel = link ? 'link#' + link.id.slice(-4) : 'container#' + container.id.slice(-4);
                console.log('[miner] ' + creep.name + ' | ' + eStr(creep) + ' | dump | transfer ' + targetLabel + ' -> ' + errName(result));
                creep.say('📤');
                if (result !== OK) return;
            }
        } else {
            if (!creep.pos.inRangeTo(source, 1)) {
                creep.moveTo(source, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 10 });
                console.log('[miner] ' + creep.name + ' | ' + eStr(creep) + ' | moving to src#' + source.id.slice(-4) + ' (no container)');
                return;
            }
        }

        const harvestResult = creep.harvest(source);
        console.log('[miner] ' + creep.name + ' | ' + eStr(creep) + ' | harvest src#' + source.id.slice(-4) + ' -> ' + errName(harvestResult));
        creep.say('⛏️');
    },

    assignSource: function (creep) {
        const sources = cache.find(creep.room, FIND_SOURCES);
        if (sources.length === 0) return;
        const takenIds = Object.values(Game.creeps)
            .filter(c => c.memory.role === 'miner' && c.id !== creep.id &&
                         c.memory.homeRoom === creep.memory.homeRoom)
            .map(c => c.memory.sourceId);
        const free = sources.find(s => !takenIds.includes(s.id));
        creep.memory.sourceId = (free || sources[0]).id;
    },

    assignContainer: function (creep) {
        // If containerId was set at spawn time, honour it — skip the search.
        if (creep.memory.containerId) return;
        const source = /** @type {Source|null} */ (Game.getObjectById(creep.memory.sourceId));
        if (!source) return;
        const nearby = source.pos.findInRange(FIND_STRUCTURES, 1, {
            filter: s => s.structureType === STRUCTURE_CONTAINER
        });
        if (nearby.length > 0) creep.memory.containerId = nearby[0].id;
    }
};

module.exports = roleMiner;
