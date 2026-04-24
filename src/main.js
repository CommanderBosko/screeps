const roleHarvester = require('role.harvester');
const roleUpgrader = require('role.upgrader');
const roleBuilder = require('role.builder');
const roleRepairer = require('role.repairer');
const towerLogic = require('role.tower');

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
            'repairer': roleRepairer
        }[creep.memory.role];
        if (roleObj) roleObj.run(creep);
    }
}

function runTowers() {
    for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName];
        const towers = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_TOWER } });
        for (const tower of towers) {
            towerLogic.run(tower);
        }
    }
}

function spawnCreeps() {
    const roles = ['harvester', 'builder', 'upgrader', 'repairer'];
    for (const role of roles) {
        const currentCreeps = _.filter(Game.creeps, (creep) => creep.memory.role === role);
        if (currentCreeps.length < 2 && Game.spawns['Spawn1'].room.energyAvailable >= 300) {
            spawnNewCreep(role);
            return;
        }
    }
}

function spawnNewCreep(role) {
    const newCreepName = role.charAt(0).toUpperCase() + role.slice(1) + Game.time;
    console.log('Spawning new ' + role + ': ' + newCreepName);
    const creepBody = [WORK, CARRY, MOVE, MOVE];
    const roomEnergyAvailable = Game.spawns['Spawn1'].room.energyAvailable;

    if (roomEnergyAvailable >= 400) {
        creepBody.push(CARRY);
        creepBody.push(MOVE);
    }
    if (roomEnergyAvailable >= 500) {
        creepBody.push(CARRY);
        creepBody.push(MOVE);
    }

    Game.spawns['Spawn1'].spawnCreep(creepBody, newCreepName, { memory: { role: role } });
}

module.exports.loop = function () {
    wipeMemory();
    spawnCreeps();
    setRoles();
    runTowers();
};
