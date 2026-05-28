const cache = require('cache');

// Upgrader: gets energy from controller link (RCL 6+), storage, containers, or mines.
// Stationary play near controller is the optimal pattern once infrastructure exists.

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

const roleUpgrader = {
    run: function (creep) {
        if (creep.memory.upgrading && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.upgrading = false;
        }
        if (!creep.memory.upgrading) {
            const storeFull = creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0;
            const ctrl = creep.room.controller;
            const nearCtrl = ctrl && creep.pos.inRangeTo(ctrl, 3);
            if (storeFull || (nearCtrl && creep.store[RESOURCE_ENERGY] > 0)) {
                creep.memory.upgrading = true;
            }
        }

        if (creep.memory.upgrading) {
            const ctrl = creep.room.controller;
            if (!ctrl) return;
            const result = creep.upgradeController(ctrl);
            if (result === ERR_NOT_IN_RANGE) {
                // Use ignoreCreeps:false so PathFinder routes around packed upgraders
                // rather than returning ERR_NO_PATH when all adj tiles are occupied.
                const moveResult = creep.moveTo(ctrl, { visualizePathStyle: { stroke: '#ffffff' }, reusePath: 1, range: 3 });
                if (moveResult === ERR_NO_PATH) {
                    creep.memory.noPathTicks = (creep.memory.noPathTicks || 0) + 1;
                    // Only warn after 5 consecutive blocked ticks to suppress transient
                    // congestion noise (other upgraders occupying adj tiles for 1-2 ticks).
                    if (creep.memory.noPathTicks >= 5) {
                        console.log('[upgrader] ' + creep.name + ' | ' + eStr(creep) + ' | upgrading | controller UNREACHABLE (ERR_NO_PATH) noPathTicks=' + creep.memory.noPathTicks);
                    }
                } else {
                    creep.memory.noPathTicks = 0;
                    console.log('[upgrader] ' + creep.name + ' | ' + eStr(creep) + ' | upgrading | upgradeController -> ERR_NOT_IN_RANGE | moving');
                }
            } else {
                console.log('[upgrader] ' + creep.name + ' | ' + eStr(creep) + ' | upgrading | upgradeController -> ' + errName(result));
            }
            creep.say('⚡');
        } else {
            roleUpgrader.getEnergy(creep);
        }
    },

    getEnergy: function (creep) {
        // Check for a controller-adjacent link (receiver link near controller).
        const ctrl = creep.room.controller;
        if (ctrl) {
            const { receiverLinks } = cache.getLinkRoles(creep.room);
            const ctrlLink = receiverLinks.find(l => l.pos.inRangeTo(ctrl, 3));
            if (ctrlLink && !creep.memory.ctrlLinkBlocked) {
                if (ctrlLink.store[RESOURCE_ENERGY] > 0) {
                    const result = creep.withdraw(ctrlLink, RESOURCE_ENERGY);
                    if (result === ERR_NOT_IN_RANGE) {
                        const moveResult = creep.moveTo(ctrlLink, { visualizePathStyle: { stroke: '#aa00ff' }, reusePath: 1 });
                        if (moveResult === ERR_NO_PATH) {
                            // Link is physically inaccessible — flag permanently and fall through
                            creep.memory.ctrlLinkBlocked = true;
                            console.log('[upgrader] ' + creep.name + ' | link#' + ctrlLink.id.slice(-4) + ' inaccessible (ERR_NO_PATH) — flagged ctrlLinkBlocked, falling through to storage');
                        } else {
                            console.log('[upgrader] ' + creep.name + ' | ' + eStr(creep) + ' | collect | withdraw link#' + ctrlLink.id.slice(-4) + ' -> ERR_NOT_IN_RANGE | moving');
                            creep.say('🔗⚡');
                            return;
                        }
                    } else {
                        console.log('[upgrader] ' + creep.name + ' | ' + eStr(creep) + ' | collect | withdraw link#' + ctrlLink.id.slice(-4) + ' -> ' + errName(result));
                        creep.say('🔗⚡');
                        return;
                    }
                } else {
                    // Link empty — park next to it and wait, unless it is inaccessible
                    if (!creep.pos.inRangeTo(ctrlLink, 1)) {
                        const moveResult = creep.moveTo(ctrlLink, { visualizePathStyle: { stroke: '#aa00ff' }, reusePath: 1 });
                        if (moveResult === ERR_NO_PATH) {
                            // Link is physically inaccessible — flag permanently and fall through
                            creep.memory.ctrlLinkBlocked = true;
                            console.log('[upgrader] ' + creep.name + ' | link#' + ctrlLink.id.slice(-4) + ' inaccessible while empty (ERR_NO_PATH) — flagged ctrlLinkBlocked, falling through to storage');
                        } else {
                            console.log('[upgrader] ' + creep.name + ' | ' + eStr(creep) + ' | collect | link#' + ctrlLink.id.slice(-4) + ' empty | moving to park');
                            creep.say('⏳🔗');
                            return;
                        }
                    } else {
                        console.log('[upgrader] ' + creep.name + ' | ' + eStr(creep) + ' | collect | link#' + ctrlLink.id.slice(-4) + ' empty | waiting');
                        creep.say('⏳🔗');
                        return;
                    }
                }
                // Intentional fall-through: link was found but is physically inaccessible
            }
        }

        if (cache.pickupNearby(creep, 5)) {
            console.log('[upgrader] ' + creep.name + ' | ' + eStr(creep) + ' | collect | pickupNearby -> OK');
            return;
        }

        // Storage: the best long-term energy source (only when no ctrl link exists)
        const storage = creep.room.storage;
        if (storage && storage.store[RESOURCE_ENERGY] > 5000) {
            const result = creep.withdraw(storage, RESOURCE_ENERGY);
            if (result === ERR_NOT_IN_RANGE) {
                creep.moveTo(storage, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 3 });
                console.log('[upgrader] ' + creep.name + ' | ' + eStr(creep) + ' | collect | withdraw storage -> ERR_NOT_IN_RANGE | moving');
            } else {
                console.log('[upgrader] ' + creep.name + ' | ' + eStr(creep) + ' | collect | withdraw storage -> ' + errName(result));
            }
            creep.say('🏦');
            return;
        }

        // Container adjacent to controller
        if (ctrl) {
            const nearby = ctrl.pos.findInRange(FIND_STRUCTURES, 3)
                .filter(s => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0);
            if (nearby.length > 0) {
                const target = creep.pos.findClosestByRange(nearby);
                const result = creep.withdraw(target, RESOURCE_ENERGY);
                if (result === ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 3 });
                    console.log('[upgrader] ' + creep.name + ' | ' + eStr(creep) + ' | collect | withdraw ctrl-container#' + target.id.slice(-4) + ' -> ERR_NOT_IN_RANGE | moving');
                } else {
                    console.log('[upgrader] ' + creep.name + ' | ' + eStr(creep) + ' | collect | withdraw ctrl-container#' + target.id.slice(-4) + ' -> ' + errName(result));
                }
                creep.say('📦');
                return;
            }
        }

        // Any non-source container
        const sources = cache.find(creep.room, FIND_SOURCES);
        const allContainers = cache.find(creep.room, FIND_STRUCTURES)
            .filter(s => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0);
        const nonSourceContainers = allContainers.filter(
            s => !sources.some(src => s.pos.inRangeTo(src, 1))
        );
        const containerPool = nonSourceContainers.length > 0 ? nonSourceContainers : allContainers;
        if (containerPool.length > 0) {
            const target = creep.pos.findClosestByRange(containerPool);
            const result = creep.withdraw(target, RESOURCE_ENERGY);
            if (result === ERR_NOT_IN_RANGE) {
                creep.moveTo(target, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 3 });
                console.log('[upgrader] ' + creep.name + ' | ' + eStr(creep) + ' | collect | withdraw container#' + target.id.slice(-4) + ' -> ERR_NOT_IN_RANGE | moving');
            } else {
                console.log('[upgrader] ' + creep.name + ' | ' + eStr(creep) + ' | collect | withdraw container#' + target.id.slice(-4) + ' -> ' + errName(result));
            }
            creep.say('📦');
            return;
        }

        // Don't compete with harvesters for source access when spawn is low
        if (creep.room.energyAvailable < creep.room.energyCapacityAvailable * 0.5) {
            console.log('[upgrader] ' + creep.name + ' | ' + eStr(creep) + ' | collect | spawn low — waiting');
            return;
        }

        // At RCL 4+ miners own the sources — park near controller and wait
        const rcl = creep.room.controller ? creep.room.controller.level : 0;
        if (rcl >= 4) {
            const ctrl4 = creep.room.controller;
            if (ctrl4 && !creep.pos.inRangeTo(ctrl4, 3)) {
                creep.moveTo(ctrl4, { visualizePathStyle: { stroke: '#aa00ff' }, reusePath: 3 });
                console.log('[upgrader] ' + creep.name + ' | ' + eStr(creep) + ' | collect | RCL4+ no energy — moving to ctrl');
            } else {
                console.log('[upgrader] ' + creep.name + ' | ' + eStr(creep) + ' | collect | RCL4+ no energy — waiting near ctrl');
            }
            creep.say('⏳');
            return;
        }

        // Last resort: mine directly (RCL 1-3 only)
        if (!creep.memory.sourceId) cache.assignSource(creep);
        const source = Game.getObjectById(creep.memory.sourceId);
        if (!source) return;
        const mineResult = creep.harvest(source);
        if (mineResult === ERR_NOT_IN_RANGE) {
            creep.moveTo(source, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 3 });
            console.log('[upgrader] ' + creep.name + ' | ' + eStr(creep) + ' | collect | harvest src#' + source.id.slice(-4) + ' -> ERR_NOT_IN_RANGE | moving');
        } else {
            console.log('[upgrader] ' + creep.name + ' | ' + eStr(creep) + ' | collect | harvest src#' + source.id.slice(-4) + ' -> ' + errName(mineResult));
        }
        creep.say('⛏️');
    }
};

module.exports = roleUpgrader;
