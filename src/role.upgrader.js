const cache = require('cache');

// Upgrader: gets energy from controller link (RCL 6+), storage, containers, or mines.
// Stationary play near controller is the optimal pattern once infrastructure exists.

const roleUpgrader = {
    run: function (creep) {
        if (creep.memory.upgrading && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.upgrading = false;
        }
        if (!creep.memory.upgrading && creep.store.getFreeCapacity() === 0) {
            creep.memory.upgrading = true;
        }

        if (creep.memory.upgrading) {
            const ctrl = creep.room.controller;
            if (!ctrl) return;
            const result = creep.upgradeController(ctrl);
            if (result === ERR_NOT_IN_RANGE) {
                creep.moveTo(ctrl, { visualizePathStyle: { stroke: '#ffffff' }, reusePath: 5 });
            }
            creep.say('⚡');
        } else {
            roleUpgrader.getEnergy(creep);
        }
    },

    getEnergy: function (creep) {
        if (cache.pickupNearby(creep)) return;

        // Check for a controller-adjacent link (receiver link near controller)
        // This is the RCL 6+ upgrader link pattern — withdraw without moving
        const ctrl = creep.room.controller;
        if (ctrl) {
            const { receiverLinks } = cache.getLinkRoles(creep.room);
            // A receiver link near the controller acts as the upgrader link
            const ctrlLink = receiverLinks.find(l => l.pos.inRangeTo(ctrl, 3));
            if (ctrlLink && ctrlLink.store[RESOURCE_ENERGY] > 0) {
                if (creep.withdraw(ctrlLink, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(ctrlLink, { visualizePathStyle: { stroke: '#aa00ff' }, reusePath: 5 });
                }
                creep.say('🔗⚡');
                return;
            }
        }

        // Storage: the best long-term energy source
        const storage = creep.room.storage;
        if (storage && storage.store[RESOURCE_ENERGY] > 5000) {
            if (creep.withdraw(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(storage, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 5 });
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
                    creep.moveTo(target, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 5 });
                }
                creep.say('📦');
                return;
            }
        }

        // Any non-source container
        const sources = cache.find(creep.room, FIND_SOURCES);
        const containers = cache.find(creep.room, FIND_STRUCTURES)
            .filter(s =>
                s.structureType === STRUCTURE_CONTAINER &&
                s.store[RESOURCE_ENERGY] > 0 &&
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

        // Don't compete with harvesters for source access when spawn is low
        if (creep.room.energyAvailable < creep.room.energyCapacityAvailable * 0.5) return;

        // Last resort: mine directly
        if (!creep.memory.sourceId) cache.assignSource(creep);
        const source = Game.getObjectById(creep.memory.sourceId);
        if (!source) return;
        if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
            creep.moveTo(source, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 5 });
        }
        creep.say('⛏️');
    }
};

module.exports = roleUpgrader;
