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
    }
};

module.exports = cache;
