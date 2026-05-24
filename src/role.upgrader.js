const cache = require('cache');

// Upgrader: gets energy from controller link (RCL 6+), storage, containers, or mines.
// Stationary play near controller is the optimal pattern once infrastructure exists.

const roleUpgrader = {
    run: function (creep) {
        if (creep.memory.upgrading && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.upgrading = false;
        }
        if (!creep.memory.upgrading) {
            const storeFull = creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0;
            const ctrl = creep.room.controller;
            const nearCtrl = ctrl && creep.pos.inRangeTo(ctrl, 3);
            // Flip to upgrading when fully loaded OR already adjacent to controller.
            // Bare getFreeCapacity()===0 deadlocks WORK-heavy bodies (12W+1C = 50 carry)
            // that can never fill from a drip-feeding link — nearCtrl lets them upgrade
            // with whatever partial energy they have rather than idling forever.
            if (storeFull || nearCtrl) creep.memory.upgrading = true;
        }

        if (creep.memory.upgrading) {
            const ctrl = creep.room.controller;
            if (!ctrl) return;
            const result = creep.upgradeController(ctrl);
            if (result === ERR_NOT_IN_RANGE) {
                creep.moveTo(ctrl, { visualizePathStyle: { stroke: '#ffffff' }, reusePath: 3 });
            }
            creep.say('⚡');
        } else {
            roleUpgrader.getEnergy(creep);
        }
    },

    getEnergy: function (creep) {
        // Check for a controller-adjacent link (receiver link near controller).
        // This is the RCL 6+ upgrader link pattern — withdraw without moving.
        // IMPORTANT: when the link exists but is currently empty, park adjacent to it
        // and wait. Do NOT fall through to storage — that causes oscillation where the
        // upgrader walks to storage, the link refills mid-walk, and the creep never
        // arrives anywhere. Storage/container fallbacks only fire when no ctrlLink exists.
        const ctrl = creep.room.controller;
        if (ctrl) {
            const { receiverLinks } = cache.getLinkRoles(creep.room);
            // A receiver link near the controller acts as the upgrader link
            const ctrlLink = receiverLinks.find(l => l.pos.inRangeTo(ctrl, 3));
            if (ctrlLink) {
                if (ctrlLink.store[RESOURCE_ENERGY] > 0) {
                    if (creep.withdraw(ctrlLink, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                        creep.moveTo(ctrlLink, { visualizePathStyle: { stroke: '#aa00ff' }, reusePath: 3 });
                    }
                    creep.say('🔗⚡');
                } else {
                    // Link empty — park next to it and wait for the next transfer.
                    // Range 1 so we can withdraw the instant energy arrives.
                    if (!creep.pos.inRangeTo(ctrlLink, 1)) {
                        creep.moveTo(ctrlLink, { visualizePathStyle: { stroke: '#aa00ff' }, reusePath: 5 });
                    }
                    creep.say('⏳🔗');
                }
                return;
            }
        }

        if (cache.pickupNearby(creep, 5)) return;

        // Storage: the best long-term energy source (only when no ctrl link exists)
        const storage = creep.room.storage;
        if (storage && storage.store[RESOURCE_ENERGY] > 5000) {
            if (creep.withdraw(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(storage, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 3 });
            }
            creep.say('🏦');
            return;
        }

        // Container adjacent to controller — placed by planner at RCL 3+
        if (ctrl) {
            const nearby = ctrl.pos.findInRange(FIND_STRUCTURES, 3)
                .filter(s => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0);
            if (nearby.length > 0) {
                const target = creep.pos.findClosestByRange(nearby);
                if (creep.withdraw(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 3 });
                }
                creep.say('📦');
                return;
            }
        }

        // Any non-source container (prefer not competing with haulers at source containers)
        const sources = cache.find(creep.room, FIND_SOURCES);
        const allContainers = cache.find(creep.room, FIND_STRUCTURES)
            .filter(s => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0);
        const nonSourceContainers = allContainers.filter(
            s => !sources.some(src => s.pos.inRangeTo(src, 1))
        );
        const containerPool = nonSourceContainers.length > 0 ? nonSourceContainers : allContainers;
        if (containerPool.length > 0) {
            const target = creep.pos.findClosestByRange(containerPool);
            if (creep.withdraw(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(target, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 3 });
            }
            creep.say('📦');
            return;
        }

        // Don't compete with harvesters for source access when spawn is low
        if (creep.room.energyAvailable < creep.room.energyCapacityAvailable * 0.5) return;

        // At RCL 4+ miners own the sources — upgraders must not compete for source tiles.
        // Instead, park near the controller and wait for energy to arrive via links/containers.
        const rcl = creep.room.controller ? creep.room.controller.level : 0;
        if (rcl >= 4) {
            const ctrl = creep.room.controller;
            if (ctrl && !creep.pos.inRangeTo(ctrl, 3)) {
                creep.moveTo(ctrl, { visualizePathStyle: { stroke: '#aa00ff' }, reusePath: 3 });
            }
            creep.say('⏳');
            return;
        }

        // Last resort: mine directly (RCL 1-3 only, before miners exist)
        if (!creep.memory.sourceId) cache.assignSource(creep);
        const source = Game.getObjectById(creep.memory.sourceId);
        if (!source) return;
        if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
            creep.moveTo(source, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 3 });
        }
        creep.say('⛏️');
    }
};

module.exports = roleUpgrader;
