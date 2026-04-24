const roleAttacker = {
    run: function (creep) {
        const targetRoom = creep.memory.targetRoom;
        if (!targetRoom) { creep.say('No target'); return; }

        if (creep.room.name !== targetRoom) {
            creep.moveTo(new RoomPosition(25, 25, targetRoom), {
                visualizePathStyle: { stroke: '#ff0000' },
                reusePath: 0
            });
            return;
        }

        // Priority 1: kill hostile creeps
        const hostiles = creep.room.find(FIND_HOSTILE_CREEPS);
        if (hostiles.length > 0) {
            const target = creep.pos.findClosestByRange(hostiles);
            if (creep.attack(target) === ERR_NOT_IN_RANGE) {
                creep.moveTo(target, { visualizePathStyle: { stroke: '#ff0000' }, reusePath: 0 });
            }
            creep.say('⚔️');
            return;
        }

        // Priority 2: destroy structures (spawn → tower → extension → storage → other)
        const structurePriority = [
            STRUCTURE_SPAWN,
            STRUCTURE_TOWER,
            STRUCTURE_EXTENSION,
            STRUCTURE_STORAGE,
            STRUCTURE_CONTAINER,
        ];
        const hostileStructures = creep.room.find(FIND_HOSTILE_STRUCTURES);
        for (const type of structurePriority) {
            const targets = hostileStructures.filter(s => s.structureType === type);
            if (targets.length > 0) {
                const target = creep.pos.findClosestByRange(targets);
                if (creep.attack(target) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(target, { visualizePathStyle: { stroke: '#ff4400' } });
                }
                creep.say('💥');
                return;
            }
        }

        creep.say('✅ Clear');
    }
};

module.exports = roleAttacker;
