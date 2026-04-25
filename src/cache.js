const cache = {
    _data: {},
    _tick: -1,

    _refresh: function () {
        if (Game.time !== this._tick) {
            this._data = {};
            this._tick = Game.time;
        }
    },

    find: function (room, constant) {
        this._refresh();
        const key = room.name + ':' + constant;
        if (!(key in this._data)) {
            this._data[key] = room.find(constant);
        }
        return this._data[key];
    },

    // Return the least-contested source ID for a given room and role group.
    pickSource: function (room, role) {
        const sources = this.find(room, FIND_SOURCES);
        if (sources.length === 0) return null;
        const counts = {};
        for (const s of sources) counts[s.id] = 0;
        for (const name in Game.creeps) {
            const c = Game.creeps[name];
            if (c.memory.role === role && c.memory.sourceId) {
                if (counts[c.memory.sourceId] !== undefined) counts[c.memory.sourceId]++;
            }
        }
        return sources.reduce((a, b) => counts[a.id] <= counts[b.id] ? a : b).id;
    },

    // Assign the least-contested source to creep.memory.sourceId, balancing across a role group.
    assignSource: function (creep, role) {
        const id = this.pickSource(creep.room, role);
        if (id) creep.memory.sourceId = id;
    },

    // Pick up dropped energy or withdraw from tombstones/ruins. Returns true if acted.
    pickupNearby: function (creep) {
        const dropped = this.find(creep.room, FIND_DROPPED_RESOURCES)
            .filter(r => r.resourceType === RESOURCE_ENERGY);
        const tombstones = this.find(creep.room, FIND_TOMBSTONES)
            .filter(t => t.store[RESOURCE_ENERGY] > 0);
        const ruins = this.find(creep.room, FIND_RUINS)
            .filter(r => r.store[RESOURCE_ENERGY] > 0);
        const targets = [...dropped, ...tombstones, ...ruins];
        if (targets.length === 0) return false;
        const target = creep.pos.findClosestByRange(targets);
        const result = target.resourceType
            ? creep.pickup(target)
            : creep.withdraw(target, RESOURCE_ENERGY);
        if (result === ERR_NOT_IN_RANGE) {
            creep.moveTo(target, { visualizePathStyle: { stroke: '#ffff00' } });
        }
        creep.say('💀');
        return true;
    }
};

module.exports = cache;
