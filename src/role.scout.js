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
        const ctrl = room.controller;
        const towers = room.find(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_TOWER });
        const spawns = room.find(FIND_STRUCTURES, { filter: s => s.structureType === STRUCTURE_SPAWN });
        Memory.scoutData[room.name] = {
            sources: room.find(FIND_SOURCES).length,
            owner: ctrl && ctrl.owner ? ctrl.owner.username : null,
            reservedBy: ctrl && ctrl.reservation ? ctrl.reservation.username : null,
            rcl: ctrl ? ctrl.level : 0,
            towers: towers.length,
            spawns: spawns.length,
            safeMode: ctrl ? !!ctrl.safeMode : false,
            hostile: spawns.length > 0 || towers.length > 0,
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
