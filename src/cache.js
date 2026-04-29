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

    // Cached filtered find — avoids re-filtering the same constant multiple times per tick.
    // filterKey must be a stable string unique to the filter predicate.
    findFiltered: function (room, constant, filterKey, filterFn) {
        this._refresh();
        const key = room.name + ':' + constant + ':' + filterKey;
        if (!(key in this._data)) {
            this._data[key] = room.find(constant, { filter: filterFn });
        }
        return this._data[key];
    },

    // Cached lookup for which links are source links vs receiver links in a room.
    // Returns { srcLinks: [], receiverLinks: [] }. Recomputed once per RCL change.
    getLinkRoles: function (room) {
        this._refresh();
        const key = room.name + ':linkRoles';
        if (key in this._data) return this._data[key];

        const allLinks = this.find(room, FIND_MY_STRUCTURES)
            .filter(s => s.structureType === STRUCTURE_LINK);
        const sources = this.find(room, FIND_SOURCES);

        const srcLinks = [];
        const receiverLinks = [];

        for (const link of allLinks) {
            const nearSource = sources.some(s => link.pos.inRangeTo(s, 2));
            if (nearSource) srcLinks.push(link);
            else receiverLinks.push(link);
        }

        const result = { srcLinks, receiverLinks };
        this._data[key] = result;
        return result;
    },

    // Return the least-contested source ID for a given room across all roles.
    pickSource: function (room) {
        const sources = this.find(room, FIND_SOURCES);
        if (sources.length === 0) return null;
        const counts = {};
        for (const s of sources) counts[s.id] = 0;
        for (const name in Game.creeps) {
            const c = Game.creeps[name];
            if (c.memory.homeRoom !== room.name) continue;
            if (c.memory.sourceId && counts[c.memory.sourceId] !== undefined) {
                counts[c.memory.sourceId]++;
            }
        }
        return sources.reduce((a, b) => counts[a.id] <= counts[b.id] ? a : b).id;
    },

    // Assign the least-contested source to creep.memory.sourceId.
    assignSource: function (creep) {
        const id = this.pickSource(creep.room);
        if (id) creep.memory.sourceId = id;
    },

    // Pick up dropped energy or withdraw from tombstones/ruins. Returns true if acted.
    pickupNearby: function (creep, maxRange = Infinity) {
        const inRange = t => maxRange === Infinity || creep.pos.inRangeTo(t, maxRange);
        const dropped = this.find(creep.room, FIND_DROPPED_RESOURCES)
            .filter(r => r.resourceType === RESOURCE_ENERGY && r.amount >= 50 && inRange(r));
        const tombstones = this.find(creep.room, FIND_TOMBSTONES)
            .filter(t => t.store[RESOURCE_ENERGY] > 0 && inRange(t));
        const ruins = this.find(creep.room, FIND_RUINS)
            .filter(r => r.store[RESOURCE_ENERGY] > 0 && inRange(r));
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

// Returns the HP cap for walls/ramparts at the given RCL.
// Repairers and towers use this to avoid dumping energy into maxing defenses.
cache.getWallTarget = function (room) {
    const rcl = room.controller ? room.controller.level : 1;
    if (rcl >= 8) return 300000;
    if (rcl >= 6) return 150000;
    if (rcl >= 4) return 50000;
    return 10000;
};

module.exports = cache;
