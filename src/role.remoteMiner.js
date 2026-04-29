// Remote Miner: travels to a target room and mines an assigned source.
// Drops energy on the ground — remote rooms have no infrastructure initially.
// Avoids source keeper lairs (SK rooms) by skipping sources within range 5 of a lair.
//
// Memory: { role: 'remoteMiner', targetRoom: 'W1N1', sourceIdx: 0, homeRoom: 'W2N2' }

const roleRemoteMiner = {
    run: function (creep) {
        const targetRoom = creep.memory.targetRoom;
        if (!targetRoom) return;

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

        // Drop energy when full — no carry infrastructure in remote rooms
        if (creep.store.getFreeCapacity() === 0) {
            creep.drop(RESOURCE_ENERGY);
        }
    }
};

module.exports = roleRemoteMiner;
