// Mineral Harvester: harvests room minerals and deposits into storage or terminal.
// Only active when the mineral has supply, the extractor exists, and extractor is not on cooldown.
// Heavy WORK body for fast harvest; uses reusePath: 5 (short trips within room).
//
// Memory: { role: 'mineralHarvester', homeRoom: roomName }

const roleMineralHarvester = {
    run: function (creep) {
        // Flip state on empty/full
        if (creep.memory.depositing && creep.store.getUsedCapacity() === 0) {
            creep.memory.depositing = false;
        }
        if (!creep.memory.depositing && creep.store.getFreeCapacity() === 0) {
            creep.memory.depositing = true;
        }

        if (creep.memory.depositing) {
            roleMineralHarvester.deposit(creep);
        } else {
            roleMineralHarvester.harvest(creep);
        }
    },

    harvest: function (creep) {
        const room = creep.room;

        // Find extractor
        const extractors = room.find(FIND_MY_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_EXTRACTOR
        });
        if (extractors.length === 0) {
            creep.say('no ext');
            return;
        }
        const extractor = extractors[0];

        // Find mineral
        const minerals = room.find(FIND_MINERALS);
        if (minerals.length === 0) {
            creep.say('no min');
            return;
        }
        const mineral = minerals[0];

        // Only harvest when mineral has supply and extractor is not on cooldown
        if (mineral.mineralAmount === 0) {
            creep.say('empty');
            return;
        }
        if (extractor.cooldown > 0) {
            creep.say('cool');
            return;
        }

        const result = creep.harvest(mineral);
        if (result === ERR_NOT_IN_RANGE) {
            creep.moveTo(mineral, { visualizePathStyle: { stroke: '#00ff88' }, reusePath: 5 });
        }
        creep.say('⛏️M');
    },

    deposit: function (creep) {
        const room = creep.room;

        // Prefer terminal for minerals (market access), fall back to storage
        const terminal = room.terminal;
        if (terminal && terminal.store.getFreeCapacity() > 0) {
            const result = creep.transfer(terminal, Object.keys(creep.store)[0]);
            if (result === ERR_NOT_IN_RANGE) {
                creep.moveTo(terminal, { visualizePathStyle: { stroke: '#00ff88' }, reusePath: 5 });
            }
            creep.say('terminal');
            return;
        }

        const storage = room.storage;
        if (storage && storage.store.getFreeCapacity() > 0) {
            // Transfer all resources in store
            for (const resourceType in creep.store) {
                const result = creep.transfer(storage, resourceType);
                if (result === ERR_NOT_IN_RANGE) {
                    creep.moveTo(storage, { visualizePathStyle: { stroke: '#00ff88' }, reusePath: 5 });
                    return;
                }
                if (result === OK) return; // one transfer per tick
            }
        } else {
            // Nowhere to deposit — drop to avoid blocking
            for (const resourceType in creep.store) {
                creep.drop(resourceType);
                break;
            }
        }
        creep.say('deposit');
    }
};

module.exports = roleMineralHarvester;
