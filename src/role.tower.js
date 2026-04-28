const cache = require('cache');

const ATTACK_PARTS = new Set([ATTACK, RANGED_ATTACK]);
const REPAIR_RESERVE = 200;
const SURPLUS_THRESHOLD = 700; // energy above which the tower tops up barriers to full hitsMax

function pickAttackTarget(tower, hostiles) {
    // Prefer creeps that have attack parts — they're the actual threat
    const attackers = hostiles.filter(h => h.body.some(p => ATTACK_PARTS.has(p.type)));
    const pool = attackers.length > 0 ? attackers : hostiles;
    return tower.pos.findClosestByRange(pool);
}

// Returns the single wall-or-rampart with the absolute lowest hits that is also below
// maxHits. Walls and ramparts compete in one unified pool — type is irrelevant, only hits
// count. No proximity preference: picking a rampart at 1M HP because it is near the tower
// while a wall sits at 10k elsewhere is wrong, and the tower efficiency delta (~150 vs
// ~300 HP/tick) is never worth choosing the wrong target.
// Returns null if none qualify.
function pickWeakestBarrier(structures, maxHits) {
    const candidates = structures.filter(
        s => (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) &&
             s.hits < maxHits
    );
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.hits - b.hits);
    return candidates[0];
}

const towerLogic = {
    run: function (tower) {
        const hostiles = cache.find(tower.room, FIND_HOSTILE_CREEPS);
        if (hostiles.length > 0) {
            tower.attack(pickAttackTarget(tower, hostiles));
            return;
        }

        // Heal the most-wounded friendly creep
        const wounded = cache.find(tower.room, FIND_MY_CREEPS)
            .filter(c => c.hits < c.hitsMax);
        if (wounded.length > 0) {
            wounded.sort((a, b) => a.hits - b.hits);
            tower.heal(wounded[0]);
            return;
        }

        if (tower.store[RESOURCE_ENERGY] <= REPAIR_RESERVE) return;

        const allStructures = cache.find(tower.room, FIND_STRUCTURES);

        // Emergency: any barrier (wall or rampart) critically close to 0 HP gets immediate
        // attention before regular structure repair. Ramparts decay 1 HP/tick and die at 0;
        // walls newly placed start at 1 HP. Unified pool — lowest hits wins.
        const BARRIER_EMERGENCY = 500;
        const emergencyTarget = pickWeakestBarrier(allStructures, BARRIER_EMERGENCY);
        if (emergencyTarget) {
            tower.repair(emergencyTarget);
            return;
        }

        // Repair non-wall/rampart structures.
        // Prefer the most-damaged structure within range 10 (tower is most efficient close up);
        // fall back to the globally most-damaged if nothing nearby needs work.
        const damaged = allStructures.filter(
            s => s.hits < s.hitsMax &&
                 s.structureType !== STRUCTURE_WALL &&
                 s.structureType !== STRUCTURE_RAMPART
        );
        if (damaged.length > 0) {
            const nearby = damaged.filter(s => tower.pos.inRangeTo(s, 10));
            const pool = nearby.length > 0 ? nearby : damaged;
            pool.sort((a, b) => a.hits - b.hits);
            tower.repair(pool[0]);
            return;
        }

        // Repair walls and ramparts below the RCL-scaled HP floor.
        // Both types compete in a single pool — the one with the lowest hits is repaired first.
        const hpTarget = cache.getWallTarget(tower.room);
        const floorTarget = pickWeakestBarrier(allStructures, hpTarget);
        if (floorTarget) {
            tower.repair(floorTarget);
            return;
        }

        // Surplus mode: all barriers are at or above the RCL floor — if the tower has ample
        // energy, top them up toward hitsMax so they are as thick as possible before combat.
        // Walls and ramparts share a single pool; lowest hits wins.
        if (tower.store[RESOURCE_ENERGY] > SURPLUS_THRESHOLD) {
            const surplusTarget = pickWeakestBarrier(allStructures, Infinity);
            if (surplusTarget) {
                tower.repair(surplusTarget);
            }
        }
    }
};

module.exports = towerLogic;
