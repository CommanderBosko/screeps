const roleHarvester = require('role.harvester');
const roleUpgrader = require('role.upgrader');
const roleBuilder = require('role.builder');
const roleRepairer = require('role.repairer');
const roleMiner = require('role.miner');
const roleClaimer = require('role.claimer');
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

function spawnCreeps() {
    const spawn = Game.spawns['Spawn1'];
    if (!spawn) return;

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
    spawnCreeps();
    setRoles();
    runTowers();
};
