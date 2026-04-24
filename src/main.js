const roleHarvester = require('role.harvester');
const roleUpgrader = require('role.upgrader');
const roleBuilder = require('role.builder');
const roleRepairer = require('role.repairer');
const roleMiner = require('role.miner');
const roleClaimer = require('role.claimer');
const roleDefender = require('role.defender');
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

function spawnCreeps() {
    const spawn = Game.spawns['Spawn1'];
    if (!spawn) return;

    // Defenders — reactive, spawn up to 2 when hostiles present
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

    // Standard roles — 2 each, in priority order
    const roles = ['harvester', 'builder', 'upgrader', 'repairer'];
    for (const role of roles) {
        const count = _.filter(Game.creeps, c => c.memory.role === role).length;
        if (count < 2 && spawn.room.energyAvailable >= 300) {
            spawnStandardCreep(spawn, role);
            return;
        }
    }

    // Claimer — only when Memory.claimTarget is set
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
    checkSafeMode();
    spawnCreeps();
    setRoles();
    runTowers();
};
