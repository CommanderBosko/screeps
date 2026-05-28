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
const roleRemoteMiner = require('role.remoteMiner');
const roleMineralHarvester = require('role.mineralHarvester');
const towerLogic = require('role.tower');
const defense = require('defense');
const cache = require('cache');
const planner = require('planner');
const lab = require('lab');

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
    'remoteMiner': roleRemoteMiner,
    'mineralHarvester': roleMineralHarvester,
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
            if (link.transferEnergy(receiver) === OK) break;
        }
    }
}

function runTowers() {
    for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName];
        for (const tower of cache.getTowers(room)) towerLogic.run(tower);
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

        const towers = cache.getTowers(room);
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

    const hostiles = cache.find(room, FIND_HOSTILE_CREEPS);
    const dangerStructures = cache.find(room, FIND_HOSTILE_STRUCTURES)
        .filter(s => s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_TOWER);

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

        const hasSpawn = cache.find(room, FIND_MY_SPAWNS).length > 0;
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
        // Miners own their specific container and must never be rebalanced — skip them.
        if (c.memory.role === 'miner') continue;
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
// At RCL 1-3: renew any role (harvesters are hard to replace).
// At RCL 4+: only renew haulers (already parked adjacent to spawn when idle).
function renewCreeps() {
    for (const spawnName in Game.spawns) {
        const spawn = Game.spawns[spawnName];
        if (spawn.spawning) continue;
        const rcl = spawn.room.controller ? spawn.room.controller.level : 1;
        const candidates = spawn.pos.findInRange(FIND_MY_CREEPS, 1)
            .filter(c => {
                if (!c.ticksToLive || c.ticksToLive >= RENEW_AT_TTL) return false;
                if (rcl >= 4 && c.memory.role !== 'hauler') return false;
                return true;
            });
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

// Returns how many upgraders this room should maintain based on storage energy.
// Pre-storage (RCL 1-4): fixed at 2 — upgrading is the primary progress driver.
// RCL 5+ with storage: scale with stored energy so upgraders don't starve the economy
// at low reserves, but hammer the controller hard when energy is plentiful.
//
// RCL 8 upgrade cap: the controller accepts AT MOST 15 WORK-parts/tick input TOTAL
// across all concurrent upgraders. The top-tier body is 12W (1500e). Two 12W upgraders
// = 24W applied — the excess 9W is silently discarded by the game engine every tick.
// This wastes energy, so at RCL 8 the correct count is 1 upgrader (for downgrade protection)
// OR intentionally more for GCL farming (set Memory.upgraderFarm[room] = true in console).
// Scaling returns max 3 at RCL 8 (for GCL farming) — the 3rd upgrader has a smaller body
// selected at spawn based on infrastructure, so total WORK stays ~15 in practice.
function desiredUpgraders(room) {
    const rcl = room.controller ? room.controller.level : 0;
    if (!room.storage) return 2;
    const energy = room.storage.store[RESOURCE_ENERGY];
    // At RCL 8: 1 normally (15W cap), up to 3 for GCL farming when energy is plentiful
    if (rcl >= 8) {
        const farming = Memory.upgraderFarm && Memory.upgraderFarm[room.name];
        if (farming && energy > 300000) return 3;
        if (farming && energy > 100000) return 2;
        return 1;
    }
    if (energy < 50000)  return 1;
    if (energy < 150000) return 2;
    if (energy < 300000) return 3;
    return 4;
}

function spawnForRoom(spawn) {
    const room = spawn.room;
    const rn = room.name;

    // Diagnostic: always log energy and population so we can see deadlocks in the console.
    if (Game.time % 10 === 0) {
        const rcl0 = room.controller ? room.controller.level : 0;
        console.log('[spawn-diag] ' + rn +
            ' RCL=' + rcl0 +
            ' energy=' + room.energyAvailable + '/' + room.energyCapacityAvailable +
            ' miners=' + roomCreeps('miner', rn) +
            ' harvesters=' + roomCreeps('harvester', rn) +
            ' haulers=' + roomCreeps('hauler', rn) +
            ' upgraders=' + roomCreeps('upgrader', rn) +
            ' builders=' + roomCreeps('builder', rn));
    }

    // Defenders — only when an invader core is present in the room
    const invaderCores = cache.find(room, FIND_STRUCTURES).filter(s => s.structureType === STRUCTURE_INVADER_CORE);
    if (invaderCores.length > 0 && roomCreeps('defender', rn) < 2) {
        const defBody = getBody('defender', room.energyCapacityAvailable);
        const defCost = bodyCost(defBody);
        if (room.energyAvailable >= defCost) {
            const defResult = spawn.spawnCreep(defBody, 'Defender' + Game.time, { memory: { role: 'defender', homeRoom: rn } });
            if (defResult === OK) console.log('[spawn] ' + rn + ' defender ' + JSON.stringify(defBody));
            return;
        }
        // Can't afford ideal body yet — spawn minimum viable defender immediately if no coverage
        if (roomCreeps('defender', rn) === 0 && room.energyAvailable >= 190) {
            const emergBody = room.energyAvailable >= 280
                ? [TOUGH, TOUGH, ATTACK, ATTACK, MOVE, MOVE]
                : [TOUGH, ATTACK, MOVE, MOVE];
            const emergDefResult = spawn.spawnCreep(emergBody, 'Defender' + Game.time, { memory: { role: 'defender', homeRoom: rn } });
            if (emergDefResult === OK) console.log('[spawn] ' + rn + ' defender(emerg) ' + JSON.stringify(emergBody));
            return;
        }
    }

    const rcl = room.controller ? room.controller.level : 0;
    const roomSources = cache.find(room, FIND_SOURCES);
    const roomMyStructs = cache.find(room, FIND_MY_STRUCTURES);

    // Emergency: if all income creeps are gone and spawn is starving, skip normal thresholds
    if (rcl <= 3 && roomCreeps('harvester', rn) === 0 && room.energyAvailable >= 200) {
        const r = spawn.spawnCreep([WORK, CARRY, MOVE], 'Emergency' + Game.time, {
            memory: { role: 'harvester', homeRoom: rn }
        });
        if (r === OK) console.log('[spawn] ' + rn + ' harvester(emerg) [WORK,CARRY,MOVE]');
        return;
    }
    // Determine whether any source containers exist in this room.
    // Used by the emergency bootstrap and the miner-loop fallback below.
    let anySourceContainer = false;
    let emergContainerId = null;
    let emergSourceId = null;
    for (const src of roomSources) {
        const sc = src.pos.findInRange(FIND_STRUCTURES, 1, {
            filter: s => s.structureType === STRUCTURE_CONTAINER
        })[0];
        if (sc) {
            anySourceContainer = true;
            if (!emergSourceId) { emergContainerId = sc.id; emergSourceId = src.id; }
        }
    }

    if (rcl >= 4 && roomCreeps('miner', rn) === 0 && roomCreeps('harvester', rn) === 0 && room.energyAvailable >= 200) {
        // Fire when ALL income creeps are gone, OR when a hauler exists but has nothing to
        // pull from — the hauler alone generates zero income.
        // IMPORTANT: also check that source containers actually have energy. A hauler with
        // live containers that are empty (miners dead) is equally deadlocked.
        const haulerAlive = roomCreeps('hauler', rn) > 0;
        const anyContainerHasEnergy = roomSources.some(src =>
            src.pos.findInRange(FIND_STRUCTURES, 1, {
                filter: s => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0
            }).length > 0
        );
        const haulerHasSomethingToDo = haulerAlive && anyContainerHasEnergy;
        if (!haulerHasSomethingToDo) {
            if (emergSourceId) {
                // Container exists — spawn as miner so it will be renewed on the normal miner path
                const r = spawn.spawnCreep([WORK, CARRY, MOVE], 'Emergency' + Game.time, {
                    memory: { role: 'miner', sourceId: emergSourceId, containerId: emergContainerId, homeRoom: rn }
                });
                if (r === OK) console.log('[spawn] ' + rn + ' miner(emerg) [WORK,CARRY,MOVE]');
            } else {
                // No container yet — spawn a minimal harvester to bootstrap income.
                // A hauler with no container to pull from is useless and, worse, would be
                // counted as a "live hauler" with no containerId, making it invisible to
                // the per-container assigned check and permanently inflating hauler count by 1.
                const r = spawn.spawnCreep([WORK, CARRY, MOVE], 'Emergency' + Game.time, {
                    memory: { role: 'harvester', homeRoom: rn }
                });
                if (r === OK) console.log('[spawn] ' + rn + ' harvester(emerg-nocontainer) [WORK,CARRY,MOVE]');
            }
            return;
        }
    }

    // Miners — one per container adjacent to a source; pre-spawn when current miner is nearly dead.
    // Only at RCL 4+ where haulers can also exist; harvesters cover RCL 1-3.
    // Each miner is assigned both sourceId and containerId at spawn so it parks on its exact container.
    if (rcl >= 4) for (const source of roomSources) {
        const sourceContainers = source.pos.findInRange(FIND_STRUCTURES, 1, {
            filter: s => s.structureType === STRUCTURE_CONTAINER
        });
        for (const container of sourceContainers) {
            const minersForContainer = _.filter(Game.creeps, c =>
                c.memory.role === 'miner' && c.memory.containerId === container.id
            );
            const dyingMiner = minersForContainer.find(c => c.ticksToLive < MINER_RESPAWN_TTL);
            const needsMiner = minersForContainer.length === 0 || dyingMiner;
            // Don't spawn a miner unless a hauler already exists or the room can afford one.
            // A miner with no hauler will clog its container/receiver link and stop producing.
            const haulerReady = roomCreeps('hauler', rn) > 0 || room.energyAvailable >= 300;
            // Only count miners that are not about to die — prevents the race where a dying
            // miner blocks spawning its replacement because minersForContainer.length is still 1.
            const activeMinerCount = minersForContainer.filter(c => !c.ticksToLive || c.ticksToLive >= MINER_RESPAWN_TTL).length;
            if (needsMiner && haulerReady && activeMinerCount < 1 && room.energyAvailable >= 150) {
                // Compute the max-capacity miner body and its cost.
                const targetMinerBody = getBody('miner', room.energyCapacityAvailable);
                const targetMinerCost = bodyCost(targetMinerBody);
                // Wait for full-capacity energy unless this source has NO active miner
                // (activeMinerCount === 0 and dyingMiner is undefined = true zero-coverage).
                // If a dying miner is still alive (dyingMiner set), wait for the best body
                // because the dying miner still covers income for now.
                // If there is truly no miner at all, spawn immediately at whatever energy
                // is available to avoid a source going idle.
                const trueZeroCoverage = minersForContainer.length === 0;
                // Use continue (not return) so we skip this container and keep evaluating
                // other containers/sources — return would freeze the entire spawn queue.
                if (!trueZeroCoverage && room.energyAvailable < targetMinerCost) continue;
                const minerEnergy = trueZeroCoverage
                    ? Math.min(room.energyCapacityAvailable, room.energyAvailable)
                    : room.energyCapacityAvailable;
                const minerBody = getBody('miner', minerEnergy);
                const minerResult = spawn.spawnCreep(minerBody, 'Miner' + Game.time, {
                    memory: { role: 'miner', sourceId: source.id, containerId: container.id, homeRoom: rn }
                });
                if (minerResult === OK) console.log('[spawn] ' + rn + ' miner ' + JSON.stringify(minerBody));
                return;
            }
        }
    }

    // No-container miner bootstrap — fires when RCL>=4 and a source has no adjacent container
    // AND no miner is currently assigned to that source. The main miner loop above only iterates
    // containers (for container-aware parking), so it can never spawn a miner when containers are
    // absent (e.g. containers were destroyed after a downgrade from RCL 6, or never yet built).
    // Without this block the room deadlocks: harvesters fill spawn/extensions slowly, energy never
    // reaches the 1300–1500 required for an upgrader/builder, and no miner ever spawns.
    // A miner spawned without a containerId will drop-mine adjacent to the source (role.miner
    // handles the no-container case on lines 49-55) and self-assign a container once one is placed.
    if (rcl >= 4) {
        for (const source of roomSources) {
            const hasContainer = source.pos.findInRange(FIND_STRUCTURES, 1, {
                filter: s => s.structureType === STRUCTURE_CONTAINER
            }).length > 0;
            if (hasContainer) continue; // covered by the container-aware miner loop above
            const minersForSource = _.filter(Game.creeps, c =>
                c.memory.role === 'miner' && c.memory.sourceId === source.id &&
                c.memory.homeRoom === rn
            );
            const activeMinerCount = minersForSource.filter(
                c => !c.ticksToLive || c.ticksToLive >= MINER_RESPAWN_TTL
            ).length;
            if (activeMinerCount < 1 && room.energyAvailable >= 150) {
                const minerBody = getBody('miner', Math.min(room.energyCapacityAvailable, room.energyAvailable));
                const minerResult = spawn.spawnCreep(minerBody, 'Miner' + Game.time, {
                    memory: { role: 'miner', sourceId: source.id, homeRoom: rn }
                });
                if (minerResult === OK) console.log('[spawn] ' + rn + ' miner(no-container) ' + JSON.stringify(minerBody));
                return;
            }
        }
    }

    // Harvesters — 3 at RCL 1-3, replaced by miners+haulers at RCL 4+.
    // Exception: at RCL 4+ if no source containers exist yet (containers not yet built or
    // recently destroyed), fall back to harvesters so income doesn't die while waiting
    // for containers to be constructed.
    const harvesterMax = rcl <= 3 ? 3 : (!anySourceContainer ? 2 : 0);
    if (roomCreeps('harvester', rn) < harvesterMax && room.energyAvailable >= 200) {
        spawnStandard(spawn, 'harvester', rn);
        return;
    }

    // Emergency hauler bootstrap: miners running + energy available somewhere + zero haulers + spawn starved.
    // A [CARRY,CARRY,MOVE] (150 energy) is enough to ferry one load and break the deadlock.
    // This must fire BEFORE the normal hauler block, which waits for a full-capacity body.
    // NOTE: In link mode, miners deposit into source links (not containers), so we check both
    // containers AND receiver links for available energy to avoid a false negative.
    if (rcl >= 4 && room.energyAvailable >= 150 && room.energyAvailable < 300) {
        const activeHaulersNow = _.filter(Game.creeps, c =>
            c.memory.role === 'hauler' && c.memory.homeRoom === rn &&
            (!c.ticksToLive || c.ticksToLive >= MINER_RESPAWN_TTL)
        ).length;
        if (activeHaulersNow === 0) {
            const hasMiners = roomCreeps('miner', rn) > 0;
            const containerHasEnergy = roomSources.some(src =>
                src.pos.findInRange(FIND_STRUCTURES, 1, {
                    filter: s => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0
                }).length > 0
            );
            // Also check receiver links — in link mode, energy lands here not in containers
            const { receiverLinks } = cache.getLinkRoles(room);
            const linkHasEnergy = receiverLinks.some(l => l.store[RESOURCE_ENERGY] > 0);
            if (hasMiners && (containerHasEnergy || linkHasEnergy)) {
                const r = spawn.spawnCreep([CARRY, CARRY, MOVE], 'EmergHauler' + Game.time, {
                    memory: { role: 'hauler', homeRoom: rn }
                });
                if (r === OK) console.log('[spawn] ' + rn + ' hauler(emerg) [CARRY,CARRY,MOVE]');
                return;
            }
        }
    }

    // Haulers — one per source container; collapse to 1 (unassigned) once links are operational
    if (rcl >= 4) {
        const { srcLinks, receiverLinks } = cache.getLinkRoles(room);
        const linkNetworkOperational = srcLinks.length >= 1 && receiverLinks.length >= 1;

        if (linkNetworkOperational) {
            // Link mode: single unassigned hauler drains receiver link
            const activeHaulers = _.filter(Game.creeps, c =>
                c.memory.role === 'hauler' && c.memory.homeRoom === rn &&
                (!c.ticksToLive || c.ticksToLive >= MINER_RESPAWN_TTL)
            ).length;
            if (activeHaulers < 1 && room.energyAvailable >= 300) {
                // Use energyAvailable (not energyCapacityAvailable) so we spawn immediately
                // even when extensions are drained. Without this, spawnStandard targets the
                // full-capacity cost and bails every tick, deadlocking the room permanently.
                const body = getBody('hauler', room.energyAvailable);
                const r = spawn.spawnCreep(body, 'Hauler' + Game.time, {
                    memory: { role: 'hauler', homeRoom: rn }
                });
                if (r === OK) console.log('[spawn] ' + rn + ' hauler(link-mode) ' + JSON.stringify(body));
                return;
            }
        } else {
            // Container mode: one hauler pinned to each source container.
            // Count ALL live haulers for this room first (including any without a containerId
            // from old emergency spawns) so we never exceed the number of source containers.
            const totalLiveHaulers = _.filter(Game.creeps, c =>
                c.memory.role === 'hauler' && c.memory.homeRoom === rn &&
                (!c.ticksToLive || c.ticksToLive >= MINER_RESPAWN_TTL)
            ).length;
            // Count how many source containers exist — that is the hauler ceiling.
            let sourceContainerCount = 0;
            for (const source of roomSources) {
                sourceContainerCount += source.pos.findInRange(FIND_STRUCTURES, 1, {
                    filter: s => s.structureType === STRUCTURE_CONTAINER
                }).length;
            }
            if (totalLiveHaulers >= sourceContainerCount) {
                // Already at or above ceiling — do not spawn another hauler regardless of
                // per-container pinning (handles legacy unassigned haulers gracefully).
            } else {
                for (const source of roomSources) {
                    const containers = source.pos.findInRange(FIND_STRUCTURES, 1, {
                        filter: s => s.structureType === STRUCTURE_CONTAINER
                    });
                    for (const container of containers) {
                        const assigned = _.filter(Game.creeps, c =>
                            c.memory.role === 'hauler' && c.memory.containerId === container.id &&
                            (!c.ticksToLive || c.ticksToLive >= MINER_RESPAWN_TTL)
                        ).length;
                        if (assigned < 1 && room.energyAvailable >= 200) {
                            const targetBody = getBody('hauler', room.energyCapacityAvailable);
                            const targetCost = bodyCost(targetBody);
                            const body = getBody('hauler', room.energyAvailable);
                            // Wait for full-capacity body so we spawn one large hauler, not two small ones.
                            // Exception: if energyAvailable is already enough for the target body, spawn now.
                            if (room.energyAvailable < targetCost) continue;
                            if (room.energyAvailable >= bodyCost(body)) {
                                spawn.spawnCreep(body, 'Hauler' + Game.time, {
                                    memory: { role: 'hauler', containerId: container.id, homeRoom: rn }
                                });
                                return;
                            }
                        }
                    }
                }
            }
        }
    }

    // Pioneers — for each claimed room without its own spawn
    for (const targetRoomName in Game.rooms) {
        const targetRoom = Game.rooms[targetRoomName];
        if (!targetRoom.controller || !targetRoom.controller.my) continue;
        if (targetRoom.name === rn) continue;
        // FIND_MY_STRUCTURES excludes spawns — must use FIND_MY_SPAWNS
        const targetHasSpawn = cache.find(targetRoom, FIND_MY_SPAWNS).length > 0;
        if (targetHasSpawn) continue;
        const pioneers = _.filter(Game.creeps, c =>
            c.memory.role === 'pioneer' && c.memory.targetRoom === targetRoomName
        ).length;
        if (pioneers < 3 && room.energyAvailable >= 450) {
            // [WORK×2,CARRY×2,MOVE×3] = 200+100+150 = 450
            spawn.spawnCreep([WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE], 'Pioneer' + Game.time, {
                memory: { role: 'pioneer', targetRoom: targetRoomName, homeRoom: rn }
            });
            return;
        }
    }

    // Attackers — squad of 5 when an attack target is set
    if (Memory.attackTarget) {
        const attackers = _.filter(Game.creeps, c => c.memory.role === 'attacker').length;
        if (attackers < 5 && room.energyAvailable >= 380) {
            // [TOUGH×2,ATTACK×2,MOVE×4] = 20+160+200 = 380
            // [TOUGH×3,ATTACK×3,MOVE×6] = 30+240+300 = 570
            const body = room.energyAvailable >= 570
                ? [TOUGH, TOUGH, TOUGH, ATTACK, ATTACK, ATTACK, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE]
                : [TOUGH, TOUGH, ATTACK, ATTACK, MOVE, MOVE, MOVE, MOVE];
            spawn.spawnCreep(body, 'Attacker' + Game.time, {
                memory: { role: 'attacker', targetRoom: Memory.attackTarget, homeRoom: rn }
            });
            return;
        }
    }

    // Remote Miners — RCL 4+ with storage, targeting rooms in Memory.remoteRooms[roomName]
    if (rcl >= 4 && room.storage && Memory.remoteRooms && Memory.remoteRooms[rn] && Memory.remoteRooms[rn].length > 0) {
        const remoteRoomList = Memory.remoteRooms[rn];
        for (let i = 0; i < remoteRoomList.length; i++) {
            const remoteRoomName = remoteRoomList[i];
            // Count remote miners assigned to this specific remote room
            const minersForRemote = _.filter(Game.creeps, c =>
                c.memory.role === 'remoteMiner' &&
                c.memory.homeRoom === rn &&
                c.memory.targetRoom === remoteRoomName
            ).length;
            if (minersForRemote < 2 && room.energyAvailable >= 200) {
                // Remote miners must carry energy home — balance WORK for throughput
                // with CARRY so each trip is worthwhile. Full road speed (1M per 2 non-M).
                // Body costs:
                //   3W+6C+5M = 300+300+250 = 850
                //   3W+4C+4M = 300+200+200 = 700
                //   2W+3C+3M = 200+150+150 = 500
                //   1W+2C+2M = 100+100+100 = 300
                //   1W+1C+1M = 100+ 50+ 50 = 200
                let remoteMinerBody;
                const re = room.energyAvailable;
                if (re >= 850)      remoteMinerBody = [WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE];
                else if (re >= 700) remoteMinerBody = [WORK, WORK, WORK, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE];
                else if (re >= 500) remoteMinerBody = [WORK, WORK, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE];
                else if (re >= 300) remoteMinerBody = [WORK, CARRY, CARRY, MOVE, MOVE];
                else                remoteMinerBody = [WORK, CARRY, MOVE];
                // Assign source index round-robin based on miner slot
                const sourceIdx = minersForRemote % 2;
                spawn.spawnCreep(remoteMinerBody, 'RemoteMiner' + Game.time, {
                    memory: { role: 'remoteMiner', targetRoom: remoteRoomName, sourceIdx, homeRoom: rn }
                });
                return;
            }
        }
    }

    // Mineral Harvesters — RCL 6+, one per room, only when extractor + mineral exist
    if (rcl >= 6) {
        const extractors = roomMyStructs.filter(s => s.structureType === STRUCTURE_EXTRACTOR);
        if (extractors.length > 0) {
            const minerals = room.find(FIND_MINERALS);
            const hasMineral = minerals.length > 0 && minerals[0].mineralAmount > 0;
            if (hasMineral && roomCreeps('mineralHarvester', rn) < 1) {
                const mineralBody = [WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE]; // 5W+2C+3M = 850
                if (room.energyAvailable >= 850) {
                    spawn.spawnCreep(mineralBody, 'MineralHarvester' + Game.time, {
                        memory: { role: 'mineralHarvester', homeRoom: rn }
                    });
                    return;
                }
            }
        }
    }

    // Standard roles — 2 each per room
    // Gate builders on whether construction sites actually exist — idle builders waste energy.
    const constructionSites = room.find(FIND_CONSTRUCTION_SITES);
    const builderMax = constructionSites.length > 0 ? 2 : 0;
    // Upgraders scale with stored energy — see desiredUpgraders() above.
    const upgraderMaxFinal = desiredUpgraders(room);
    // Gate repairer on actual repair demand — idle repairers waste energy.
    const allStructsCached = cache.find(room, FIND_STRUCTURES);
    const roomTowers = roomMyStructs.filter(s => s.structureType === STRUCTURE_TOWER);
    const hasTowerWithEnergy = roomTowers.some(t => t.store[RESOURCE_ENERGY] > 0);
    const needsRepair = (
        // Emergency: any rampart critically low — always spawn regardless of towers
        allStructsCached.some(s => s.structureType === STRUCTURE_RAMPART && s.hits < 500) ||
        // Non-barrier structures (roads, containers, etc.) — only spawn if no tower is present.
        // When towers exist with energy they handle road/container upkeep; a repairer would be idle.
        (!hasTowerWithEnergy && allStructsCached.some(s =>
            s.hits < s.hitsMax &&
            s.structureType !== STRUCTURE_WALL &&
            s.structureType !== STRUCTURE_RAMPART
        )) ||
        // Barriers below barrierCap — matches the hasWork() check in role.repairer.js.
        // Towers alone cannot raise barriers to barrierCap; the repairer is needed for that.
        allStructsCached.some(s =>
            (s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART) &&
            s.hits < cache.barrierCap(rcl)
        )
    );
    const repairerMax = needsRepair ? 1 : 0;
    // Builder and repairer use standard body selection.
    // Upgrader uses infrastructure-aware body selection — see spawnUpgrader().
    for (const [role, max] of [['builder', builderMax], ['repairer', repairerMax]]) {
        if (roomCreeps(role, rn) < max && room.energyAvailable >= 200) {
            spawnStandard(spawn, role, rn);
            return;
        }
    }
    if (roomCreeps('upgrader', rn) < upgraderMaxFinal && room.energyAvailable >= 200) {
        spawnUpgrader(spawn, rn);
        return;
    }

    // Scout — only when we have GCL headroom and are ready to expand (RCL 4+)
    // 1500 tick cooldown between scouts so we don't spam-replace a scout dying far from home
    const ownedRoomCount = Object.values(Game.rooms).filter(r => r.controller && r.controller.my).length;
    const readyToExpand = rcl >= 4 && Game.gcl.level > ownedRoomCount;
    const scoutsForRoom = _.filter(Game.creeps, c => c.memory.role === 'scout' && c.memory.homeRoom === rn).length;
    const roomMem = Memory.rooms[rn] || (Memory.rooms[rn] = {});
    const lastScout = roomMem.lastScoutSpawn || 0;
    if (readyToExpand && scoutsForRoom === 0 && Game.time - lastScout > 1500 && room.energyAvailable >= 50) {
        roomMem.lastScoutSpawn = Game.time;
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

    // All quota checks passed without spawning — log so we can distinguish "correct idle"
    // from a silent deadlock. Runs every 10 ticks alongside spawn-diag to avoid log flood.
    if (Game.time % 10 === 0) {
        const rcl0 = room.controller ? room.controller.level : 0;
        const uf = desiredUpgraders(room);
        const bf = constructionSites.length > 0 ? 2 : 0;
        console.log('[spawn-idle] ' + rn +
            ' RCL=' + rcl0 +
            ' harvMax=' + (rcl0 <= 3 ? 3 : 0) +
            ' upgMax=' + uf + '(cur=' + roomCreeps('upgrader', rn) + ')' +
            ' bldMax=' + bf + '(cur=' + roomCreeps('builder', rn) + ')');
    }
}

const PART_COSTS = {
    [WORK]: 100,
    [CARRY]: 50,
    [MOVE]: 50,
    [ATTACK]: 80,
    [RANGED_ATTACK]: 150,
    [HEAL]: 250,
    [CLAIM]: 600,
    [TOUGH]: 10,
};

function bodyCost(body) {
    let total = 0;
    for (let i = 0; i < body.length; i++) total += PART_COSTS[body[i]] || 0;
    return total;
}

function getBody(role, energy) {
    switch (role) {
        case 'miner':
            // 5-WORK saturates a source (10 energy/tick). Stationary — only needs 1 MOVE.
            // Top tier adds 1 CARRY so the miner can accumulate energy and transfer to a
            // source link (RCL 5+). Without CARRY, store.getFreeCapacity() is always 0 and
            // creep.transfer() always fails — links never receive energy from the miner.
            // Lower tiers have no CARRY because links don't exist at those RCLs; drop-mining
            // into the adjacent container is the correct strategy there.
            // Breakpoints match exact body costs to prevent spawn rejection.
            if (energy >= 600) return [WORK, WORK, WORK, WORK, WORK, CARRY, MOVE];  // 600 cost (5W+1C+1M)
            if (energy >= 400) return [WORK, WORK, WORK, MOVE];                     // 400 cost
            if (energy >= 250) return [WORK, WORK, MOVE];                            // 250 cost (no CARRY — stationary)
            return [WORK, MOVE];                                                      // 150 cost

        case 'hauler':
            // 1 MOVE per 2 CARRY on roads. Scale aggressively — hauler throughput = energy economy.
            // Breakpoints match exact body costs.
            if (energy >= 1800) return [CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY,
                                        CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY,
                                        CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY,
                                        MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
                                        MOVE, MOVE, MOVE, MOVE];             // 24C+12M = 1800
            if (energy >= 1300) return [CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY,
                                        CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY,
                                        CARRY,
                                        MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE]; // 17C+9M = 1300
            if (energy >= 1000) return [CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY,
                                        CARRY, CARRY, CARRY, CARRY, CARRY,
                                        MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE];             // 13C+7M = 1000
            if (energy >= 750)  return [CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY,
                                        CARRY, CARRY,
                                        MOVE, MOVE, MOVE, MOVE, MOVE];                         // 10C+5M = 750
            if (energy >= 600)  return [CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY,
                                        MOVE, MOVE, MOVE, MOVE];                               // 8C+4M = 600
            if (energy >= 450)  return [CARRY, CARRY, CARRY, CARRY, CARRY, CARRY,
                                        MOVE, MOVE, MOVE];                                      // 6C+3M = 450
            if (energy >= 300)  return [CARRY, CARRY, CARRY, CARRY, MOVE, MOVE];               // 4C+2M = 300
            return [CARRY, CARRY, MOVE];                                                        // 2C+1M = 150

        case 'harvester':
            // RCL 1-3 jack-of-all-trades. WORK for mining, CARRY for transport, MOVE for travel.
            // Road ratio: 1 MOVE per 2 non-MOVE. Breakpoints match exact costs.
            if (energy >= 800) return [WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE]; // 5W+2C+4M = 800
            if (energy >= 550) return [WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE];             // 3W+2C+3M = 550
            if (energy >= 500) return [WORK, WORK, CARRY, CARRY, MOVE, MOVE];                         // 2W+2C+2M = 500
            if (energy >= 400) return [WORK, WORK, CARRY, MOVE, MOVE];                                // 2W+1C+2M = 400
            if (energy >= 300) return [WORK, CARRY, CARRY, MOVE, MOVE];                               // 1W+2C+2M = 300 (more carry = faster fill at RCL1)
            return [WORK, CARRY, MOVE];                                                                // 1W+1C+1M = 200

        case 'upgrader':
            // Maximize WORK — each part = 1 energy/tick to controller.
            // Upgrader is nearly stationary (walks to controller once), so MOVE is minimal.
            // 1 CARRY is enough buffer; scale WORK aggressively for controller throughput.
            // Breakpoints match exact body costs (not the energy tier labels).
            // RCL 8 cap: controller accepts at most 15 WORK-parts/tick of upgrade input.
            // Top tier is 12W — safely under cap. Do NOT add a tier with more than 15W.
            // NOTE: Only used when infrastructure-aware spawning is not applicable (fallback).
            // See getUpgraderBody() for the full infrastructure-aware selector.
            if (energy >= 1500) return [WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK,
                                        CARRY,
                                        MOVE, MOVE, MOVE, MOVE, MOVE];      // 12W+1C+5M = 1500 (RCL8-safe: 12W < 15W cap)
            if (energy >= 1050) return [WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK,
                                        CARRY,
                                        MOVE, MOVE, MOVE, MOVE];            // 8W+1C+4M = 1050
            if (energy >= 700)  return [WORK, WORK, WORK, WORK, WORK,
                                        CARRY,
                                        MOVE, MOVE, MOVE];                  // 5W+1C+3M = 700
            if (energy >= 450)  return [WORK, WORK, WORK, CARRY, MOVE, MOVE];               // 3W+1C+2M = 450
            return [WORK, CARRY, MOVE];                                                      // 1W+1C+1M = 200

        case 'builder':
        case 'repairer':
            // Equal WORK/CARRY split for balanced build/repair throughput; full road speed.
            // 1 MOVE per 2 non-MOVE (WORK+CARRY). Breakpoints match exact costs.
            if (energy >= 1300) return [WORK, WORK, WORK, WORK, WORK, WORK, WORK,
                                        CARRY, CARRY, CARRY, CARRY, CARRY, CARRY,
                                        MOVE, MOVE, MOVE, MOVE, MOVE, MOVE];       // 7W+6C+6M = 1300 (road: 13 non-MOVE → 7 MOVE ideal, 6 = ~85% speed)
            if (energy >= 1000) return [WORK, WORK, WORK, WORK, WORK,
                                        CARRY, CARRY, CARRY, CARRY, CARRY,
                                        MOVE, MOVE, MOVE, MOVE, MOVE];             // 5W+5C+5M = 1000 (full road speed)
            if (energy >= 800)  return [WORK, WORK, WORK, WORK,
                                        CARRY, CARRY, CARRY, CARRY,
                                        MOVE, MOVE, MOVE, MOVE];                   // 4W+4C+4M = 800 (full road speed)
            if (energy >= 600)  return [WORK, WORK, WORK, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE]; // 3W+3C+3M = 600 (full road speed)
            if (energy >= 500)  return [WORK, WORK, CARRY, CARRY, MOVE, MOVE];             // 2W+2C+2M = 500 (4 non-MOVE → 2 MOVE = full speed)
            if (energy >= 400)  return [WORK, WORK, CARRY, MOVE, MOVE];                    // 2W+1C+2M = 400 (3 non-MOVE → 2 MOVE ≈ full speed)
            return [WORK, CARRY, MOVE];                                                     // 1W+1C+1M = 200

        case 'defender':
            // Melee: TOUGH soaks boosted-tower damage, ATTACK kills, MOVE at full road speed.
            // Ordered TOUGH first so tower heals are most efficient.
            // Body costs: 6T+6A+6M = 6*10+6*80+6*50 = 60+480+300 = 840
            //             4T+4A+4M = 4*10+4*80+4*50 = 40+320+200 = 560
            //             2T+3A+3M = 2*10+3*80+3*50 = 20+240+150 = 410
            //             2T+2A+2M = 2*10+2*80+2*50 = 20+160+100 = 280
            //             1T+1A+2M = 1*10+1*80+2*50 = 10+80+100  = 190
            if (energy >= 840)  return [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
                                        ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
                                        MOVE, MOVE, MOVE, MOVE, MOVE, MOVE];           // 6T+6A+6M = 840
            if (energy >= 560)  return [TOUGH, TOUGH, TOUGH, TOUGH,
                                        ATTACK, ATTACK, ATTACK, ATTACK,
                                        MOVE, MOVE, MOVE, MOVE];                        // 4T+4A+4M = 560
            if (energy >= 410)  return [TOUGH, TOUGH, ATTACK, ATTACK, ATTACK,
                                        MOVE, MOVE, MOVE];                              // 2T+3A+3M = 410
            if (energy >= 280)  return [TOUGH, TOUGH, ATTACK, ATTACK, MOVE, MOVE];     // 2T+2A+2M = 280
            return [TOUGH, ATTACK, MOVE, MOVE];                                         // 1T+1A+2M = 190

        case 'defender-ranged':
            // Ranged: counters healer+ranged squads. TOUGH soaks, RANGED_ATTACK bypasses healing
            // by dealing consistent damage from distance. 1 MOVE per 2 non-MOVE on roads.
            // Body costs: 4T+4RA+4M = 4*10+4*150+4*50 = 40+600+200 = 840
            //             3T+3RA+3M = 3*10+3*150+3*50 = 30+450+150 = 630
            //             2T+2RA+3M = 2*10+2*150+3*50 = 20+300+150 = 470
            //             2T+1RA+3M = 2*10+1*150+3*50 = 20+150+150 = 320
            //             1T+1RA+2M = 1*10+1*150+2*50 = 10+150+100 = 260
            if (energy >= 840)  return [TOUGH, TOUGH, TOUGH, TOUGH,
                                        RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
                                        MOVE, MOVE, MOVE, MOVE];                        // 4T+4RA+4M = 840
            if (energy >= 630)  return [TOUGH, TOUGH, TOUGH,
                                        RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
                                        MOVE, MOVE, MOVE];                              // 3T+3RA+3M = 630
            if (energy >= 470)  return [TOUGH, TOUGH, RANGED_ATTACK, RANGED_ATTACK,
                                        MOVE, MOVE, MOVE];                              // 2T+2RA+3M = 470
            if (energy >= 320)  return [TOUGH, TOUGH, RANGED_ATTACK, MOVE, MOVE, MOVE]; // 2T+1RA+3M = 320
            return [TOUGH, RANGED_ATTACK, MOVE, MOVE];                                  // 1T+1RA+2M = 260

        default:
            return [WORK, CARRY, MOVE];
    }
}

// Infrastructure-aware upgrader body selector.
// hasAdjacentEnergy = true  → controller link or controller-adjacent container exists.
//   In this case the upgrader is nearly stationary; maximize WORK for throughput.
//   These are the same tiers as getBody('upgrader', ...) above.
// hasAdjacentEnergy = false → upgrader must travel to fetch energy itself.
//   Balanced WORK/CARRY so it doesn't spend 70-80% of its time walking empty.
//   Road speed maintained: 1 MOVE per 2 non-MOVE parts.
// RCL 8 cap: controller accepts at most 15 WORK-parts/tick. All tiers stay under that.
function getUpgraderBody(energy, hasAdjacentEnergy) {
    if (hasAdjacentEnergy) {
        // WORK-heavy tiers — stationary upgrader parked next to link/container
        if (energy >= 1500) return [WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK,
                                    CARRY,
                                    MOVE, MOVE, MOVE, MOVE, MOVE];      // 12W+1C+5M = 1500
        if (energy >= 1050) return [WORK, WORK, WORK, WORK, WORK, WORK, WORK, WORK,
                                    CARRY,
                                    MOVE, MOVE, MOVE, MOVE];            // 8W+1C+4M = 1050
        if (energy >= 700)  return [WORK, WORK, WORK, WORK, WORK,
                                    CARRY,
                                    MOVE, MOVE, MOVE];                  // 5W+1C+3M = 700
        if (energy >= 450)  return [WORK, WORK, WORK, CARRY, MOVE, MOVE];  // 3W+1C+2M = 450
        return [WORK, CARRY, MOVE];                                         // 1W+1C+1M = 200
    } else {
        // Balanced tiers — self-sufficient upgrader that must travel for energy.
        // Equal WORK/CARRY so carry capacity matches harvesting cadence; full road speed.
        if (energy >= 1300) return [WORK, WORK, WORK, WORK, WORK, WORK, WORK,
                                    CARRY, CARRY, CARRY, CARRY, CARRY, CARRY,
                                    MOVE, MOVE, MOVE, MOVE, MOVE, MOVE];    // 7W+6C+6M = 1300
        if (energy >= 1000) return [WORK, WORK, WORK, WORK, WORK,
                                    CARRY, CARRY, CARRY, CARRY, CARRY,
                                    MOVE, MOVE, MOVE, MOVE, MOVE];          // 5W+5C+5M = 1000
        if (energy >= 600)  return [WORK, WORK, WORK,
                                    CARRY, CARRY, CARRY,
                                    MOVE, MOVE, MOVE];                      // 3W+3C+3M = 600
        if (energy >= 400)  return [WORK, WORK, CARRY, CARRY, MOVE, MOVE]; // 2W+2C+2M = 400
        return [WORK, CARRY, MOVE];                                         // 1W+1C+1M = 200
    }
}

// Roles that require a source assignment for positioning / work targeting.
// Haulers pull from receiver links/containers by position — no sourceId needed.
const ROLES_NEEDING_SOURCE = new Set(['harvester', 'upgrader', 'builder', 'repairer']);

// Minimum energy reserve kept back so the spawn can always afford a replacement
// harvester/emergency creep after spending on an upgrader or builder body.
const SPAWN_BUFFER = 300;

// Roles that are income-critical and should always scale to full capacity.
// Upgraders and builders are limited to (energyAvailable - SPAWN_BUFFER) so they
// never drain the spawn to the point where a dead harvester can't be replaced.
const INCOME_ROLES = new Set(['harvester', 'miner', 'hauler']);

function spawnStandard(spawn, role, homeRoom) {
    const room = spawn.room;

    // Determine the target body — the best body this room can ever produce at full capacity.
    // For non-income roles, apply the SPAWN_BUFFER cap so we don't drain below emergency threshold.
    const capBudget = INCOME_ROLES.has(role)
        ? room.energyCapacityAvailable
        : Math.max(200, room.energyCapacityAvailable - SPAWN_BUFFER);
    // Use the lesser of capBudget and energyAvailable to select the body tier.
    // This ensures we pick a tier we can actually afford right now rather than
    // waiting indefinitely for the room to reach the full-capacity budget
    // (e.g. 1150 available / 1800 capacity → target body costs 1300, never spawns).
    const spawnBudget = Math.min(capBudget, room.energyAvailable);
    const targetBody = getBody(role, spawnBudget);
    const targetCost = bodyCost(targetBody);

    if (room.energyAvailable < targetCost) return;

    const name = role.charAt(0).toUpperCase() + role.slice(1) + Game.time;
    const memory = { role, homeRoom };
    if (ROLES_NEEDING_SOURCE.has(role)) {
        const sourceId = cache.pickSource(room);
        if (sourceId) memory.sourceId = sourceId;
    }
    const spawnResult = spawn.spawnCreep(targetBody, name, { memory });
    if (spawnResult === OK) console.log('[spawn] ' + homeRoom + ' ' + role + ' ' + JSON.stringify(targetBody));
}

// Infrastructure-aware upgrader spawn.
// Checks for a controller link (receiver link within range 3 of controller)
// or a controller-adjacent container, then picks the appropriate body tier.
// Falls back to balanced body when neither exists (RCL 1-4 without planner container).
function spawnUpgrader(spawn, homeRoom) {
    const room = spawn.room;
    const ctrl = room.controller;

    // Detect adjacent energy infrastructure
    let hasAdjacentEnergy = false;
    if (ctrl) {
        // 1. Receiver link within range 3 of controller (the upgrader link pattern)
        const { receiverLinks } = cache.getLinkRoles(room);
        if (receiverLinks.some(l => l.pos.inRangeTo(ctrl, 3))) {
            hasAdjacentEnergy = true;
        }
        // 2. Container within range 3 of controller (placed by planner at RCL 3+)
        if (!hasAdjacentEnergy) {
            const ctrlContainers = ctrl.pos.findInRange(FIND_STRUCTURES, 3, {
                filter: s => s.structureType === STRUCTURE_CONTAINER
            });
            if (ctrlContainers.length > 0) hasAdjacentEnergy = true;
        }
    }

    // Apply SPAWN_BUFFER cap — upgraders are non-income, keep energy reserve for emergencies.
    // Use min(capBudget, energyAvailable) so we pick a body tier we can afford right now.
    // Without this, a room at 1150/1800 targets the 1500-cost body and never spawns.
    const budgetCap = Math.max(200, room.energyCapacityAvailable - SPAWN_BUFFER);
    const spawnBudget = Math.min(budgetCap, room.energyAvailable);
    const body = getUpgraderBody(spawnBudget, hasAdjacentEnergy);
    const cost = bodyCost(body);

    if (room.energyAvailable < cost) return;

    const sourceId = cache.pickSource(room);
    const memory = { role: 'upgrader', homeRoom };
    if (sourceId) memory.sourceId = sourceId;
    const upgraderResult = spawn.spawnCreep(body, 'Upgrader' + Game.time, { memory });
    if (upgraderResult === OK) console.log('[spawn] ' + homeRoom + ' upgrader' + (hasAdjacentEnergy ? '(link)' : '(nomad)') + ' ' + JSON.stringify(body));
}

module.exports.loop = function () {
    const tickStart = Game.cpu.getUsed();

    console.log('[main] tick ' + Game.time + ' | bucket=' + Game.cpu.bucket);

    wipeMemory();
    migrateCreepMemory();

    // Periodic tasks — staggered so they never land on the same tick.
    // With ~3 CPU/tick budget usage we have plenty of headroom to run these more often.
    // defense.run: chokepoint walls — cheap early-exit after walls placed; run every 30 ticks
    if (Game.time % 30 === 0) {
        for (const roomName in Game.rooms) defense.run(Game.rooms[roomName]);
    }
    // rebalanceSources: O(creeps) scan — run every 20 ticks so drift is corrected faster
    if (Game.time % 20 === 7) {
        for (const roomName in Game.rooms) rebalanceSources(Game.rooms[roomName]);
    }
    // Planner: needsReplanning() fast-exits when nothing changed — run every 5 ticks
    if (Game.time % 5 === 3) {
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
    for (const roomName in Game.rooms) lab.run(Game.rooms[roomName]);
    setRoles();
    runTowers();

    // Log spawning progress every tick for all spawns
    for (const spawnName in Game.spawns) {
        const sp = Game.spawns[spawnName];
        const spRoom = sp.room;
        const spE = spRoom.energyAvailable + '/' + spRoom.energyCapacityAvailable;
        if (sp.spawning) {
            const remaining = sp.spawning.remainingTime;
            const total = Game.creeps[sp.spawning.name]
                ? sp.spawning.remainingTime  // can't get total directly, show remaining
                : sp.spawning.remainingTime;
            console.log('[spawn] ' + spRoom.name + ' | E:' + spE + ' | spawning ' + sp.spawning.name + ' | ' + remaining + ' ticks left');
        } else {
            console.log('[spawn] ' + spRoom.name + ' | E:' + spE + ' | idle');
        }
    }

    const used = Game.cpu.getUsed() - tickStart;
    console.log('[main] tick ' + Game.time + ' | CPU: ' + used.toFixed(2) + ' used');
    if (used > 18) {
        console.log('[main] WARNING high CPU tick ' + Game.time + ': ' + used.toFixed(1) +
            ' bucket=' + Game.cpu.bucket);
    }
};
