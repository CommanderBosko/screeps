// Remote Miner: travels to a target room, mines an assigned source, then returns
// home to deposit energy into storage.
// Uses the same two-flag memory pattern as all other roles:
//   returning=false → travel to target room and mine
//   returning=true  → return home and deposit to storage (then flip back)
// Avoids source keeper lairs (SK rooms) by skipping sources within range 5 of a lair.
//
// Memory: { role: 'remoteMiner', targetRoom: 'W1N1', sourceIdx: 0, homeRoom: 'W2N2' }

const roleRemoteMiner = {
    run: function (creep) {
        const targetRoom = creep.memory.targetRoom;
        const homeRoom = creep.memory.homeRoom;
        if (!targetRoom || !homeRoom) return;

        // State transitions
        if (creep.memory.returning && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.returning = false;
        }
        if (!creep.memory.returning && creep.store.getFreeCapacity() === 0) {
            creep.memory.returning = true;
        }

        if (creep.memory.returning) {
            roleRemoteMiner.doReturn(creep, homeRoom);
        } else {
            roleRemoteMiner.doMine(creep, targetRoom);
        }
    },

    doReturn: function (creep, homeRoom) {
        // Travel home first
        if (creep.room.name !== homeRoom) {
            const exitDir = creep.room.findExitTo(homeRoom);
            const exitPos = creep.pos.findClosestByRange(exitDir);
            creep.moveTo(exitPos, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 20 });
            creep.say('🏠');
            return;
        }

        // In home room — deposit to storage
        const storage = creep.room.storage;
        if (storage) {
            if (creep.transfer(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(storage, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 3 });
            }
            creep.say('📥');
            return;
        }

        // No storage yet — fall back to spawn/extensions
        const spawn = creep.room.find(FIND_MY_SPAWNS)[0];
        if (spawn && spawn.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            if (creep.transfer(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                creep.moveTo(spawn, { visualizePathStyle: { stroke: '#ffaa00' }, reusePath: 3 });
            }
            creep.say('📥');
            return;
        }

        // Nowhere to deposit — drop to avoid being stuck
        creep.drop(RESOURCE_ENERGY);
    },

    doMine: function (creep, targetRoom) {
        // Travel to the target room if not already there
        if (creep.room.name !== targetRoom) {
            const exitDir = creep.room.findExitTo(targetRoom);
            const exitPos = creep.pos.findClosestByRange(exitDir);
            creep.moveTo(exitPos, { visualizePathStyle: { stroke: '#ff6600' }, reusePath: 20 });
            creep.say('🚀');
            return;
        }

        // In the target room — find sources
        const sources = creep.room.find(FIND_SOURCES);
        if (sources.length === 0) {
            creep.say('❌');
            return;
        }

        // Filter out sources near keeper lairs (SK rooms)
        const keeperLairs = creep.room.find(FIND_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_KEEPER_LAIR
        });
        const safeSources = sources.filter(src =>
            !keeperLairs.some(lair => lair.pos.inRangeTo(src, 5))
        );

        // Pick source by index; fall back to nearest safe source if index out of bounds
        const sourceIdx = creep.memory.sourceIdx || 0;
        let source = safeSources[sourceIdx] || safeSources[0];

        // If no safe sources, fall back to all sources (non-SK room or willing to risk it)
        if (!source) source = sources[sourceIdx] || sources[0];
        if (!source) return;

        const result = creep.harvest(source);
        if (result === ERR_NOT_IN_RANGE) {
            creep.moveTo(source, { visualizePathStyle: { stroke: '#ff6600' }, reusePath: 20 });
            creep.say('⛏️');
        } else if (result === OK) {
            creep.say('⛏️');
        }
    }
};

module.exports = roleRemoteMiner;
