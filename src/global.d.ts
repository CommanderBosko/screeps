// Ambient type augmentations for this project's custom Memory fields.
// TypeScript merges these with the base interfaces from @types/screeps.

interface CreepMemory {
    role?: string;
    homeRoom?: string;
    sourceId?: Id<Source>;
    containerId?: Id<StructureContainer>;
    linkId?: Id<StructureLink>;
    delivering?: boolean;
    harvesting?: boolean;
    upgrading?: boolean;
    building?: boolean;
    repairing?: boolean;
    targetRoom?: string;
    claimTarget?: string;
}

interface RoomMemory {
    plan?: {
        hub?: { x: number; y: number };
        lastRCL?: number;
        [key: string]: unknown;
    };
    cache?: { [key: string]: { data: unknown; tick: number } };
}

interface Memory {
    scoutData?: {
        [roomName: string]: {
            sources: number;
            owner: string | null;
            reservedBy: string | null;
            rcl: number;
            towers: number;
            spawns: number;
            safeMode: boolean;
            hostile: boolean;
            scoutedAt: number;
        };
    };
}
