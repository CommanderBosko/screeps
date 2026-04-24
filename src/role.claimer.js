const roleClaimer = {
    run: function (creep) {
        const targetRoom = creep.memory.targetRoom;
        if (!targetRoom) { creep.say('No target'); return; }

        if (creep.room.name !== targetRoom) {
            creep.moveTo(new RoomPosition(25, 25, targetRoom), { visualizePathStyle: { stroke: '#ff00ff' } });
            return;
        }

        const controller = creep.room.controller;
        if (!controller) return;

        if (creep.claimController(controller) === ERR_NOT_IN_RANGE) {
            creep.moveTo(controller, { visualizePathStyle: { stroke: '#ff00ff' } });
        }
        creep.say('🚩');
    }
};

module.exports = roleClaimer;
