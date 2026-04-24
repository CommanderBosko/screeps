const STALE_AFTER = 5000;

const roleScout = {
    run: function (creep) {
        if (creep.room.name === creep.memory.targetRoom || !creep.memory.targetRoom) {
            roleScout.recordRoom(creep.room);
            roleScout.pickNextRoom(creep);
        }

        if (creep.memory.targetRoom) {
            creep.moveTo(new RoomPosition(25, 25, creep.memory.targetRoom), {
                visualizePathStyle: { stroke: '#00ff88' },
                reusePath: 50
            });
        }
        creep.say('🔍');
    },

    recordRoom: function (room) {
        if (!Memory.scoutData) Memory.scoutData = {};
        Memory.scoutData[room.name] = {
            sources: room.find(FIND_SOURCES).length,
            owner: room.controller && room.controller.owner ? room.controller.owner.username : null,
            reservedBy: room.controller && room.controller.reservation ? room.controller.reservation.username : null,
            hostile: room.find(FIND_HOSTILE_STRUCTURES).length > 0,
            scoutedAt: Game.time
        };
    },

    pickNextRoom: function (creep) {
        const exits = Object.values(Game.map.describeExits(creep.room.name));
        const data = Memory.scoutData || {};
        const unvisited = exits.filter(r => !data[r] || Game.time - data[r].scoutedAt > STALE_AFTER);
        const candidates = unvisited.length > 0 ? unvisited : exits;
        candidates.sort((a, b) => (data[a] ? data[a].scoutedAt : 0) - (data[b] ? data[b].scoutedAt : 0));
        creep.memory.targetRoom = candidates[0] || null;
    }
};

module.exports = roleScout;
