// Lab reaction manager.
// Reads Memory.labReaction[roomName] for the configured product (e.g. 'OH', 'ZK', 'UL').
// Designates input1, input2, output labs based on geometry and stores IDs in
// Memory.rooms[roomName].labs = { input1, input2, output }.
// Only calls runReaction when both inputs are loaded with the correct reagents.
// Does NOT handle hauling minerals into input labs — that is a separate task.

const lab = {

    // Resolves and (if needed) re-designates lab roles for a room.
    // Returns { input1Lab, input2Lab, outputLab } or null if fewer than 3 labs exist.
    _designate: function (room) {
        if (!Memory.rooms) Memory.rooms = {};
        if (!Memory.rooms[room.name]) Memory.rooms[room.name] = {};
        const mem = Memory.rooms[room.name];

        // Validate cached IDs — re-designate if any is missing or stale.
        if (mem.labs) {
            const i1 = Game.getObjectById(mem.labs.input1);
            const i2 = Game.getObjectById(mem.labs.input2);
            const out = Game.getObjectById(mem.labs.output);
            if (i1 && i2 && out) return { input1Lab: i1, input2Lab: i2, outputLab: out };
            // One or more IDs stale — fall through to re-designate.
            delete mem.labs;
        }

        // Collect all labs in the room.
        const allLabs = room.find(FIND_MY_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_LAB
        });
        if (allLabs.length < 3) return null;

        // The output lab is the one closest to the other two (minimises runReaction range
        // requirements — both inputs must be within range 2 of the output lab).
        // We find the lab whose max distance to the other two is smallest.
        let bestLab = null;
        let bestMaxDist = Infinity;
        for (let i = 0; i < allLabs.length; i++) {
            let maxDist = 0;
            for (let j = 0; j < allLabs.length; j++) {
                if (i === j) continue;
                const d = allLabs[i].pos.getRangeTo(allLabs[j]);
                if (d > maxDist) maxDist = d;
            }
            if (maxDist < bestMaxDist) {
                bestMaxDist = maxDist;
                bestLab = allLabs[i];
            }
        }

        const inputs = allLabs.filter(l => l.id !== bestLab.id);
        mem.labs = {
            input1: inputs[0].id,
            input2: inputs[1].id,
            output: bestLab.id,
        };
        console.log('Lab roles designated in ' + room.name +
            ': output=' + bestLab.id +
            ' input1=' + inputs[0].id +
            ' input2=' + inputs[1].id);

        return { input1Lab: inputs[0], input2Lab: inputs[1], outputLab: bestLab };
    },

    run: function (room) {
        if (!room.controller || !room.controller.my) return;

        const reaction = Memory.labReaction && Memory.labReaction[room.name];
        if (!reaction) return; // no reaction configured for this room

        const labs = lab._designate(room);
        if (!labs) return; // fewer than 3 labs present

        const { input1Lab, input2Lab, outputLab } = labs;

        // Determine which reagents are needed for the configured product.
        // REACTIONS[A][B] === product — iterate to find a matching pair.
        let reagentA = null;
        let reagentB = null;
        for (const a in REACTIONS) {
            for (const b in REACTIONS[a]) {
                if (REACTIONS[a][b] === reaction) {
                    reagentA = a;
                    reagentB = b;
                    break;
                }
            }
            if (reagentA) break;
        }
        if (!reagentA) {
            // Unknown product — log once and bail (avoid log spam with a tick gate).
            if (Game.time % 100 === 0) {
                console.log('lab.js: unknown reaction "' + reaction + '" in ' + room.name);
            }
            return;
        }

        // Check that input labs hold the correct reagents with sufficient quantity.
        // We accept either pairing order (reagentA/reagentB or reagentB/reagentA).
        const i1HasA = (input1Lab.store[reagentA] || 0) > 0;
        const i1HasB = (input1Lab.store[reagentB] || 0) > 0;
        const i2HasA = (input2Lab.store[reagentA] || 0) > 0;
        const i2HasB = (input2Lab.store[reagentB] || 0) > 0;

        const pairingAB = i1HasA && i2HasB; // input1=A, input2=B
        const pairingBA = i1HasB && i2HasA; // input1=B, input2=A

        if (!pairingAB && !pairingBA) return; // inputs not loaded yet — hauler will fill them

        // Choose the correct input assignment for the call.
        const srcA = pairingAB ? input1Lab : input2Lab;
        const srcB = pairingAB ? input2Lab : input1Lab;

        // Output must have free capacity.
        if (outputLab.store.getFreeCapacity(reaction) === 0) return;

        const result = outputLab.runReaction(srcA, srcB);
        if (result !== OK && result !== ERR_NOT_ENOUGH_RESOURCES && result !== ERR_TIRED) {
            console.log('lab.js: runReaction unexpected result ' + result +
                ' in ' + room.name + ' for ' + reaction);
        }
    }
};

module.exports = lab;
