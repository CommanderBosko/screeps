const roleHarvester = require('role.harvester');
const roleUpgrader = require('role.upgrader');
const roleBuilder = require('role.builder');
const roleRepairer = require('role.repairer');
const roleMiner = require('role.miner');
const roleClaimer = require('role.claimer');
const roleDefender = require('role.defender');
const roleScout = require('role.scout');
const rolePioneer = require('role.pioneer');
const roleAttacker = require('role.attacker');
const roleHauler = require('role.hauler');
const towerLogic = require('role.tower');
const defense = require('defense');
const cache = require('cache');
const planner = require('planner');

function wipeMemory() {
    for (const name in Memory.creeps) {
        if (!Game.creeps[name]) {
            delete Memory.creeps[name];
        }
    }
}

function migrateCreepMemory() {
    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        if (!creep.memory.homeRoom) {
            creep.memory.homeRoom = creep.room.name;
        }
    }
}

const ROLE_MAP = {
    'harvester': roleHarvester,
    'upgrader': roleUpgrader,
    'builder': roleBuilder,
    'repairer': roleRepairer,
    'miner': roleMiner,
    'claimer': roleClaimer,
    'defender': roleDefender,
    'scout': roleScout,
    'pioneer': rolePioneer,
    'attacker': roleAttacker,
    'hauler': roleHauler,
};

function setRoles() {
    for (const name in Game.creeps) {
        const creep = Game.creeps[name];
        const roleObj = ROLE_MAP[creep.memory.role];
        if (roleObj) roleObj.run(creep);
    }
}

function runLinks(room) {
    if (!room.controller || !room.controller.my) return;
    const { srcLinks, receiverLinks } = cache.getLinkRoles(room);
    if (srcLinks.length === 0 || receiverLinks.length === 0) return;

    // Pick the receiver with the most free capacity
    let receiver = null;
    let bestFree = 0;
    for (const l of receiverLinks) {
        const free = l.store.getFreeCapacity(RESOURCE_ENERGY);
        if (free > bestFree) { bestFree = free; receiver = l; }
    }
    if (!receiver || bestFree === 0) return;

    for (const link of srcLinks) {
        if (link.cooldown === 0 && link.store[RESOURCE_ENERGY] > 0) {
            link.transferEnergy(receiver);
        }
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

// Only runs when Memory.attackEnabled = true (set manually in console)
function selectAttackTarget() {
    if (!Memory.attackEnabled || Memory.attackTarget) return;

    const ownedRooms = Object.values(Game.rooms)
        .filter(r => r.controller && r.controller.my).length;
    if (Game.gcl.level <= ownedRooms) return; // no GCL headroom

    const data = Memory.scoutData || {};

    // Don't attack if there are peaceful rooms we can claim instead
    const hasClaimableRoom = Object.values(data)
        .some(d => !d.owner && !d.hostile && d.sources > 0);
    if (hasClaimableRoom) return;

    const candidates = Object.entries(data)
        .filter(([, d]) => d.owner && !d.safeMode && d.rcl > 0 && d.rcl <= 4 && d.towers <= 1)
        .sort(([, a], [, b]) => (a.towers * 10 + a.rcl) - (b.towers * 10 + b.rcl));

    if (candidates.length > 0) {
        Memory.attackTarget = candidates[0][0];
        console.log('⚔️ Attack target selected: ' + Memory.attackTarget);
    }
}

function checkAttackComplete() {
    if (!Memory.attackTarget) return;
    const room = Game.rooms[Memory.attackTarget];
    if (!room) return;

    const hostiles = room.find(FIND_HOSTILE_CREEPS);
    const dangerStructures = room.find(FIND_HOSTILE_STRUCTURES, {
        filter: s => s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_TOWER
    });

    if (hostiles.length === 0 && dangerStructures.length === 0) {
        console.log('🏴 ' + Memory.attackTarget + ' cleared — queuing for claim.');
        if (!Memory.claimTarget) Memory.claimTarget = Memory.attackTarget;
        Memory.attackTarget = null;
    }
}

function selectClaimTarget() {
    if (Memory.claimTarget) return;
    const ownedRooms = Object.values(Game.rooms)
        .filter(r => r.controller && r.controller.my);
    if (Game.gcl.level <= ownedRooms.length) return;
    if (!ownedRooms.some(r => r.controller.level >= 4)) return;

    const data = Memory.scoutData || {};

    const adjacentRooms = new Set();
    for (const room of ownedRooms) {
        for (const name of Object.values(Game.map.describeExits(room.name))) {
            adjacentRooms.add(name);
        }
    }

    const candidates = Object.entries(data)
        .filter(([, d]) => !d.owner && !d.hostile && d.sources > 0)
        .sort(([nameA, a], [nameB, b]) => {
            const adjA = adjacentRooms.has(nameA) ? 0 : 1;
            const adjB = adjacentRooms.has(nameB) ? 0 : 1;
            if (adjA !== adjB) return adjA - adjB;
            return b.sources - a.sources;
        });

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

// Redistribute creeps so each source has an equal share. Runs every 50 ticks.
// Fixes drift caused by historical imbalances or simultaneous lazy-assignment.
function rebalanceSources(room) {
    const sources = cache.find(room, FIND_SOURCES);
    if (sources.length < 2) return;

    const bucket = {};
    for (const s of sources) bucket[s.id] = [];

    for (const name in Game.creeps) {
        const c = Game.creeps[name];
        if (c.memory.homeRoom !== room.name) continue;
        if (c.memory.sourceId && bucket[c.memory.sourceId] !== undefined) {
            bucket[c.memory.sourceId].push(c);
        }
    }

    const ids = sources.map(s => s.id);
    let moved = true;
    while (moved) {
        moved = false;
        const maxId = ids.reduce((a, b) => bucket[a].length >= bucket[b].length ? a : b);
        const minId = ids.reduce((a, b) => bucket[a].length <= bucket[b].length ? a : b);
        if (bucket[maxId].length - bucket[minId].length > 1) {
            const creep = bucket[maxId].pop();
            creep.memory.sourceId = minId;
            bucket[minId].push(creep);
            moved = true;
        }
    }
}

// Ticks before death at which we pre-spawn a miner replacement (spawn time + travel buffer)
const MINER_RESPAWN_TTL = 75;
// TTL below which idle spawns will opportunistically renew adjacent creeps
const RENEW_AT_TTL = 400;

// Renew adjacent creeps with low TTL when a spawn would otherwise be idle.
// Haulers and harvesters already visit spawns during normal delivery, so this
// costs nothing extra — they just stay a tick longer and gain back ~100 ticks
// for ~67 energy (9-part body). Prioritise the most urgent creep.
function renewCreeps() {
    for (const spawnName in Game.spawns) {
        const spawn = Game.spawns[spawnName];
        if (spawn.spawning) continue;
        const candidates = spawn.pos.findInRange(FIND_MY_CREEPS, 1)
            .filter(c => c.ticksToLive && c.ticksToLive < RENEW_AT_TTL);
        if (candidates.length === 0) continue;
        candidates.sort((a, b) => a.ticksToLive - b.ticksToLive);
        spawn.renewCreep(candidates[0]);
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

    const rcl = room.controller ? room.controller.level : 0;
    const roomSources = cache.find(room, FIND_SOURCES);
    const roomMyStructs = cache.find(room, FIND_MY_STRUCTURES);

    // Miners — one per source with adjacent container; pre-spawn when current miner is nearly dead
    for (const source of roomSources) {
        const hasContainer = source.pos.findInRange(FIND_STRUCTURES, 1, {
            filter: s => s.structureType === STRUCTURE_CONTAINER
        }).length > 0;
        if (!hasContainer) continue;
        const minersForSource = _.filter(Game.creeps, c =>
            c.memory.role === 'miner' && c.memory.sourceId === source.id
        );
        const dyingMiner = minersForSource.find(c => c.ticksToLive < MINER_RESPAWN_TTL);
        const needsMiner = minersForSource.length === 0 || dyingMiner;
        if (needsMiner && minersForSource.length < 2 && room.energyAvailable >= 200) {
            // Use energyCapacityAvailable so miner body scales with room, but cap at current energy
            const minerEnergy = Math.min(room.energyCapacityAvailable, room.energyAvailable);
            spawn.spawnCreep(getBody('miner', minerEnergy), 'Miner' + Game.time, {
                memory: { role: 'miner', sourceId: source.id, homeRoom: rn }
            });
            return;
        }
    }

    // Harvesters — 3 at RCL 1-3, replaced by miners+haulers at RCL 4+
    const harvesterMax = rcl <= 3 ? 3 : 0;
    if (roomCreeps('harvester', rn) < harvesterMax && room.energyAvailable >= 200) {
        spawnStandard(spawn, 'harvester', rn);
        return;
    }

    // Haulers — scale with sources/containers; collapse to 1 once links are operational
    if (rcl >= 4) {
        const sourcesWithContainer = roomSources.filter(s =>
            s.pos.findInRange(FIND_STRUCTURES, 1, { filter: t => t.structureType === STRUCTURE_CONTAINER }).length > 0
        ).length;
        const linksBuilt = roomMyStructs.filter(s => s.structureType === STRUCTURE_LINK).length;
        // With ≥2 links (receiver + ≥1 source), one hauler drains the receiver near spawn
        const haulerMax = linksBuilt >= 2 ? 1 : sourcesWithContainer;
        if (haulerMax > 0 && roomCreeps('hauler', rn) < haulerMax && room.energyAvailable >= 150) {
            spawnStandard(spawn, 'hauler', rn);
            return;
        }
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

    // Attackers — squad of 5 when an attack target is set
    if (Memory.attackTarget) {
        const attackers = _.filter(Game.creeps, c => c.memory.role === 'attacker').length;
        if (attackers < 5 && room.energyAvailable >= 480) {
            const body = room.energyAvailable >= 720
                ? [TOUGH, TOUGH, TOUGH, ATTACK, ATTACK, ATTACK, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE]
                : [TOUGH, TOUGH, ATTACK, ATTACK, MOVE, MOVE, MOVE, MOVE];
            spawn.spawnCreep(body, 'Attacker' + Game.time, {
                memory: { role: 'attacker', targetRoom: Memory.attackTarget, homeRoom: rn }
            });
            return;
        }
    }

    // Standard roles — 2 each per room
    const hasTower = roomMyStructs.some(s => s.structureType === STRUCTURE_TOWER);
    // Upgraders scale with RCL: more at mid RCL where upgrading matters most.
    // At RCL 8 only 1 upgrader needed (GCL gains tiny, just keep controller alive).
    const upgraderMax = rcl >= 8 ? 1 : (rcl >= 6 ? 2 : (rcl >= 4 ? 4 : 3));
    for (const [role, max] of [['builder', 2], ['upgrader', upgraderMax], ['repairer', hasTower ? 0 : 1]]) {
        if (roomCreeps(role, rn) < max && room.energyAvailable >= 200) {
            spawnStandard(spawn, role, rn);
            return;
        }
    }

    // Scout — only when we have GCL headroom and are ready to expand (RCL 4+)
    const ownedRoomCount = Object.values(Game.rooms).filter(r => r.controller && r.controller.my).length;
    const readyToExpand = rcl >= 4 && Game.gcl.level > ownedRoomCount;
    if (readyToExpand && roomCreeps('scout', rn) === 0 && room.energyAvailable >= 50) {
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

function getBody(role, energy) {
    switch (role) {
        case 'miner':
            // 5-WORK miner saturates a source (10 energy/tick). 3-WORK is a decent interim.
            if (energy >= 550) return [WORK, WORK, WORK, WORK, WORK, MOVE];
            if (energy >= 350) return [WORK, WORK, WORK, MOVE];
            return [WORK, CARRY, MOVE];

        case 'hauler':
            // Scale CARRY with energy; keep roughly 1 MOVE per 2 CARRY on roads
            if (energy >= 600) return [CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE];
            if (energy >= 450) return [CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE];
            if (energy >= 300) return [CARRY, CARRY, CARRY, MOVE, MOVE, MOVE];
            return [CARRY, CARRY, MOVE];

        case 'harvester':
            if (energy >= 550) return [WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE];
            if (energy >= 400) return [WORK, WORK, CARRY, CARRY, MOVE, MOVE];
            return [WORK, CARRY, MOVE];

        case 'upgrader':
            // More WORK = faster RCL progression. Cap MOVE at what's needed.
            if (energy >= 800) return [WORK, WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE];
            if (energy >= 600) return [WORK, WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE];
            if (energy >= 450) return [WORK, WORK, WORK, CARRY, MOVE, MOVE];
            return [WORK, CARRY, MOVE];

        case 'builder':
        case 'repairer':
            if (energy >= 550) return [WORK, WORK, WORK, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE];
            if (energy >= 400) return [WORK, WORK, CARRY, CARRY, MOVE, MOVE];
            return [WORK, CARRY, MOVE];

        default:
            return [WORK, CARRY, MOVE];
    }
}

function spawnStandard(spawn, role, homeRoom) {
    const name = role.charAt(0).toUpperCase() + role.slice(1) + Game.time;
    const memory = { role, homeRoom };
    const sourceId = cache.pickSource(spawn.room);
    if (sourceId) memory.sourceId = sourceId;
    // Use energyCapacityAvailable so bodies scale with room development,
    // but cap at energyAvailable (spawn will reject if we can't afford it).
    const room = spawn.room;
    const energyBudget = Math.min(room.energyCapacityAvailable, room.energyAvailable);
    spawn.spawnCreep(getBody(role, energyBudget), name, { memory });
}

module.exports.loop = function () {
    const tickStart = Game.cpu.getUsed();

    wipeMemory();
    migrateCreepMemory();

    // Heavy periodic tasks — stagger them so they never land on the same tick
    if (Game.time % 100 === 0) {
        for (const roomName in Game.rooms) defense.run(Game.rooms[roomName]);
    }
    if (Game.time % 50 === 0) {
        for (const roomName in Game.rooms) rebalanceSources(Game.rooms[roomName]);
    }
    // Planner only needs to run when RCL changes — check every 10 ticks to keep CPU low
    if (Game.time % 10 === 3) {
        for (const roomName in Game.rooms) planner.run(Game.rooms[roomName]);
    }

    selectAttackTarget();
    checkAttackComplete();
    selectClaimTarget();
    bootstrapNewRooms();
    checkSafeMode();
    spawnCreeps();
    renewCreeps();
    for (const roomName in Game.rooms) runLinks(Game.rooms[roomName]);
    setRoles();
    runTowers();

    // Warn if we're using too much CPU
    const used = Game.cpu.getUsed() - tickStart;
    if (used > 18) {
        console.log('⚠️ High CPU tick ' + Game.time + ': ' + used.toFixed(1) +
            ' bucket=' + Game.cpu.bucket);
    }
};
