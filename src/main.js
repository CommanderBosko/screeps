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
            console.log('Clearing non-existing creep memory:', name);
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
        for (const tower of towers) {
            towerLogic.run(tower);
        }
    }
}

function checkSafeMode() {
    for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName];
        if (!room.controller || !room.controller.my) continue;
        if (room.controller.safeMode) continue;
        if (!room.controller.safeModeAvailable) continue;

        const hostiles = cache.find(room, FIND_HOSTILE_CREEPS);
        const dangerous = hostiles.filter(h =>
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

// Auto-select the best scouted room to claim when GCL allows expansion
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

// Place a spawn construction site near the controller for newly claimed rooms
function bootstrapNewRooms() {
    for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName];
        if (!room.controller || !room.controller.my) continue;

        const hasSpawn = cache.find(room, FIND_MY_STRUCTURES)
            .some(s => s.structureType === STRUCTURE_SPAWN);
        const hasSpawnSite = room.find(FIND_CONSTRUCTION_SITES)
            .some(s => s.structureType === STRUCTURE_SPAWN);

        if (!hasSpawn && !hasSpawnSite) {
            placeSpawnNearController(room);
        }

        // Clear claim target once claimed
        if (Memory.claimTarget === roomName) {
            Memory.claimTarget = null;
        }
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

function spawnCreeps() {
    const spawn = Game.spawns['Spawn1'];
    if (!spawn) return;

    // Defenders — reactive, priority spawn when hostiles present
    const hostiles = cache.find(spawn.room, FIND_HOSTILE_CREEPS);
    if (hostiles.length > 0) {
        const defenders = _.filter(Game.creeps, c => c.memory.role === 'defender');
        if (defenders.length < 2 && spawn.room.energyAvailable >= 200) {
            const body = spawn.room.energyAvailable >= 380
                ? [TOUGH, TOUGH, ATTACK, ATTACK, MOVE, MOVE]
                : [TOUGH, ATTACK, MOVE, MOVE];
            spawn.spawnCreep(body, 'Defender' + Game.time, { memory: { role: 'defender' } });
            return;
        }
    }

    // Miners — one per source that has an adjacent container
    const sources = cache.find(spawn.room, FIND_SOURCES);
    for (const source of sources) {
        const hasContainer = source.pos.findInRange(FIND_STRUCTURES, 1, {
            filter: s => s.structureType === STRUCTURE_CONTAINER
        }).length > 0;
        if (!hasContainer) continue;
        const minersForSource = _.filter(Game.creeps, c =>
            c.memory.role === 'miner' && c.memory.sourceId === source.id
        );
        if (minersForSource.length === 0 && spawn.room.energyAvailable >= 300) {
            spawn.spawnCreep([WORK, WORK, CARRY, MOVE], 'Miner' + Game.time, {
                memory: { role: 'miner', sourceId: source.id }
            });
            return;
        }
    }

    // Harvesters — always maintain 2 in home room first
    const harvesterCount = _.filter(Game.creeps, c => c.memory.role === 'harvester').length;
    if (harvesterCount < 2 && spawn.room.energyAvailable >= 300) {
        spawnStandardCreep(spawn, 'harvester');
        return;
    }

    // Pioneers — 3 per newly claimed room without a spawn
    for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName];
        if (!room.controller || !room.controller.my) continue;
        if (room.name === spawn.room.name) continue;
        const hasSpawn = cache.find(room, FIND_MY_STRUCTURES)
            .some(s => s.structureType === STRUCTURE_SPAWN);
        if (hasSpawn) continue;
        const pioneers = _.filter(Game.creeps, c =>
            c.memory.role === 'pioneer' && c.memory.targetRoom === roomName
        );
        if (pioneers.length < 3 && spawn.room.energyAvailable >= 550) {
            spawn.spawnCreep([WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE], 'Pioneer' + Game.time, {
                memory: { role: 'pioneer', targetRoom: roomName }
            });
            return;
        }
    }

    // Standard roles — 2 each
    const roles = ['builder', 'upgrader', 'repairer'];
    for (const role of roles) {
        const count = _.filter(Game.creeps, c => c.memory.role === role).length;
        if (count < 2 && spawn.room.energyAvailable >= 300) {
            spawnStandardCreep(spawn, role);
            return;
        }
    }

    // Scout — 1 per home room, low priority
    const scouts = _.filter(Game.creeps, c => c.memory.role === 'scout');
    if (scouts.length === 0 && spawn.room.energyAvailable >= 50) {
        spawn.spawnCreep([MOVE], 'Scout' + Game.time, { memory: { role: 'scout' } });
        return;
    }

    // Claimer — when Memory.claimTarget is set (auto or manual)
    if (Memory.claimTarget) {
        const claimers = _.filter(Game.creeps, c => c.memory.role === 'claimer');
        if (claimers.length === 0 && spawn.room.energyAvailable >= 650) {
            spawn.spawnCreep([CLAIM, MOVE], 'Claimer' + Game.time, {
                memory: { role: 'claimer', targetRoom: Memory.claimTarget }
            });
        }
    }
}

function spawnStandardCreep(spawn, role) {
    const name = role.charAt(0).toUpperCase() + role.slice(1) + Game.time;
    console.log('Spawning new ' + role + ': ' + name);
    const body = [WORK, CARRY, MOVE, MOVE];
    const energy = spawn.room.energyAvailable;
    if (energy >= 400) { body.push(CARRY, MOVE); }
    if (energy >= 500) { body.push(CARRY, MOVE); }
    spawn.spawnCreep(body, name, { memory: { role } });
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
