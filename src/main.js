const roleHarvester = require('role.harvester');
const roleUpgrader = require('role.upgrader');
const roleBuilder = require('role.builder');
const roleRepairer = require('role.repairer');
const roleMiner = require('role.miner');
const roleClaimer = require('role.claimer');
const roleDefender = require('role.defender');
const roleScout = require('role.scout');
const rolePioneer = require('role.pioneer');
const towerLogic = require('role.tower');
const cache = require('cache');

function wipeMemory() {
    for (const name in Memory.creeps) {
        if (!Game.creeps[name]) {
            delete Memory.creeps[name];
        }
    }
}

function setRoles() {
    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        const roleObj = {
            'harvester': roleHarvester,
            'upgrader': roleUpgrader,
            'builder': roleBuilder,
            'repairer': roleRepairer,
            'miner': roleMiner,
            'claimer': roleClaimer,
            'defender': roleDefender,
            'scout': roleScout,
            'pioneer': rolePioneer,
        }[creep.memory.role];
        if (roleObj) roleObj.run(creep);
    }
}

function runTowers() {
    for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName];
        const towers = cache.find(room, FIND_MY_STRUCTURES)
            .filter(s => s.structureType === STRUCTURE_TOWER);
        for (const tower of towers) towerLogic.run(tower);
    }
}

function checkSafeMode() {
    for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName];
        if (!room.controller || !room.controller.my) continue;
        if (room.controller.safeMode || !room.controller.safeModeAvailable) continue;

        const dangerous = cache.find(room, FIND_HOSTILE_CREEPS).filter(h =>
            h.body.some(p => p.type === ATTACK || p.type === RANGED_ATTACK || p.type === WORK)
        );
        if (dangerous.length === 0) continue;

        const towers = cache.find(room, FIND_MY_STRUCTURES)
            .filter(s => s.structureType === STRUCTURE_TOWER);
        const towerEnergy = towers.reduce((sum, t) => sum + t.store[RESOURCE_ENERGY], 0);
        if (towers.length === 0 || towerEnergy < 500) {
            room.controller.activateSafeMode();
            console.log('⚠️ Safe mode activated in ' + roomName);
        }
    }
}

function selectClaimTarget() {
    if (Memory.claimTarget) return;
    const ownedRooms = Object.values(Game.rooms)
        .filter(r => r.controller && r.controller.my).length;
    if (Game.gcl.level <= ownedRooms) return;

    const data = Memory.scoutData || {};
    const candidates = Object.entries(data)
        .filter(([, d]) => !d.owner && !d.hostile && d.sources > 0)
        .sort(([, a], [, b]) => b.sources - a.sources);

    if (candidates.length > 0) {
        Memory.claimTarget = candidates[0][0];
        console.log('🗺️ Auto-selected claim target: ' + Memory.claimTarget);
    }
}

function bootstrapNewRooms() {
    for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName];
        if (!room.controller || !room.controller.my) continue;

        const hasSpawn = cache.find(room, FIND_MY_STRUCTURES)
            .some(s => s.structureType === STRUCTURE_SPAWN);
        const hasSpawnSite = room.find(FIND_CONSTRUCTION_SITES)
            .some(s => s.structureType === STRUCTURE_SPAWN);

        if (!hasSpawn && !hasSpawnSite) placeSpawnNearController(room);
        if (Memory.claimTarget === roomName) Memory.claimTarget = null;
    }
}

function placeSpawnNearController(room) {
    const ctrl = room.controller;
    if (!ctrl) return;
    const terrain = room.getTerrain();
    for (let r = 2; r <= 6; r++) {
        for (let dx = -r; dx <= r; dx++) {
            for (let dy = -r; dy <= r; dy++) {
                if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                const x = ctrl.pos.x + dx;
                const y = ctrl.pos.y + dy;
                if (x < 2 || x > 47 || y < 2 || y > 47) continue;
                if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
                if (room.createConstructionSite(x, y, STRUCTURE_SPAWN) === OK) {
                    console.log('🏠 Placed spawn site in ' + room.name);
                    return;
                }
            }
        }
    }
}

// Count creeps by role scoped to a specific home room
function roomCreeps(role, roomName) {
    return _.filter(Game.creeps, c => c.memory.role === role && c.memory.homeRoom === roomName).length;
}

function spawnCreeps() {
    for (const spawnName in Game.spawns) {
        const spawn = Game.spawns[spawnName];
        if (spawn.spawning) continue;
        spawnForRoom(spawn);
    }
}

function spawnForRoom(spawn) {
    const room = spawn.room;
    const rn = room.name;

    // Defenders — reactive priority
    const hostiles = cache.find(room, FIND_HOSTILE_CREEPS);
    if (hostiles.length > 0 && roomCreeps('defender', rn) < 2 && room.energyAvailable >= 200) {
        const body = room.energyAvailable >= 380
            ? [TOUGH, TOUGH, ATTACK, ATTACK, MOVE, MOVE]
            : [TOUGH, ATTACK, MOVE, MOVE];
        spawn.spawnCreep(body, 'Defender' + Game.time, { memory: { role: 'defender', homeRoom: rn } });
        return;
    }

    // Miners — one per source with adjacent container
    for (const source of cache.find(room, FIND_SOURCES)) {
        const hasContainer = source.pos.findInRange(FIND_STRUCTURES, 1, {
            filter: s => s.structureType === STRUCTURE_CONTAINER
        }).length > 0;
        if (!hasContainer) continue;
        const minersForSource = _.filter(Game.creeps, c =>
            c.memory.role === 'miner' && c.memory.sourceId === source.id
        ).length;
        if (minersForSource === 0 && room.energyAvailable >= 300) {
            spawn.spawnCreep([WORK, WORK, CARRY, MOVE], 'Miner' + Game.time, {
                memory: { role: 'miner', sourceId: source.id, homeRoom: rn }
            });
            return;
        }
    }

    // Harvesters — always keep 2 in room
    if (roomCreeps('harvester', rn) < 2 && room.energyAvailable >= 300) {
        spawnStandard(spawn, 'harvester', rn);
        return;
    }

    // Pioneers — for each claimed room without its own spawn
    for (const targetRoomName in Game.rooms) {
        const targetRoom = Game.rooms[targetRoomName];
        if (!targetRoom.controller || !targetRoom.controller.my) continue;
        if (targetRoom.name === rn) continue;
        const targetHasSpawn = cache.find(targetRoom, FIND_MY_STRUCTURES)
            .some(s => s.structureType === STRUCTURE_SPAWN);
        if (targetHasSpawn) continue;
        const pioneers = _.filter(Game.creeps, c =>
            c.memory.role === 'pioneer' && c.memory.targetRoom === targetRoomName
        ).length;
        if (pioneers < 3 && room.energyAvailable >= 550) {
            spawn.spawnCreep([WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE], 'Pioneer' + Game.time, {
                memory: { role: 'pioneer', targetRoom: targetRoomName, homeRoom: rn }
            });
            return;
        }
    }

    // Standard roles — 2 each per room
    for (const role of ['builder', 'upgrader', 'repairer']) {
        if (roomCreeps(role, rn) < 2 && room.energyAvailable >= 300) {
            spawnStandard(spawn, role, rn);
            return;
        }
    }

    // Scout — 1 per room
    if (roomCreeps('scout', rn) === 0 && room.energyAvailable >= 50) {
        spawn.spawnCreep([MOVE], 'Scout' + Game.time, { memory: { role: 'scout', homeRoom: rn } });
        return;
    }

    // Claimer — when a target is set (auto or manual)
    if (Memory.claimTarget) {
        const claimers = _.filter(Game.creeps, c => c.memory.role === 'claimer').length;
        if (claimers === 0 && room.energyAvailable >= 650) {
            spawn.spawnCreep([CLAIM, MOVE], 'Claimer' + Game.time, {
                memory: { role: 'claimer', targetRoom: Memory.claimTarget, homeRoom: rn }
            });
        }
    }
}

function spawnStandard(spawn, role, homeRoom) {
    const name = role.charAt(0).toUpperCase() + role.slice(1) + Game.time;
    const body = [WORK, CARRY, MOVE, MOVE];
    const energy = spawn.room.energyAvailable;
    if (energy >= 400) body.push(CARRY, MOVE);
    if (energy >= 500) body.push(CARRY, MOVE);
    spawn.spawnCreep(body, name, { memory: { role, homeRoom } });
}

module.exports.loop = function () {
    wipeMemory();
    selectClaimTarget();
    bootstrapNewRooms();
    checkSafeMode();
    spawnCreeps();
    setRoles();
    runTowers();
};
