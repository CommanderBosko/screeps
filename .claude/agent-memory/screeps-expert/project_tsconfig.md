---
name: project-tsconfig
description: TypeScript/checkJs setup for this plain-JS Screeps project — how globals, module resolution, and memory augmentation work
metadata:
  type: project
---

# tsconfig setup for Screeps plain-JS project

## Key settings that make it work

- `"types": ["screeps", "node"]` — `screeps` injects ambient Screeps globals; `node` provides typed `require`, `module`, `exports`. Both are required. Without `node`, TypeScript 6's language server cannot resolve `require` as a CommonJS function and emits TS80001 ("File is a CommonJS module; it may be converted to an ES module") as a suggestion on files that use `require()`.
- `"baseUrl": "./src"` — makes bare `require('cache')`, `require('role.harvester')`, etc. resolve to `./src/cache.js`, `./src/role.harvester.js`. This matches Screeps runtime module resolution. Without this, tsc gives TS2307 "Cannot find module" for every Screeps-style bare require.
- `"lib": ["ES2017", "dom"]` — `dom` is needed for `console`. `@types/screeps` does NOT declare `console`. The dom lib only adds type declarations, no runtime effect.
- `"checkJs": false` in tsconfig (the default) — `tsc --noEmit` is always clean. Use `tsc --noEmit --checkJs` for a deeper check pass.
- `"moduleResolution": "node10"` — suppresses TS80001 at the compiler level. Combined with `@types/node` in `types`, fully silences the hint in both tsc and the language server.

## TS80001 root cause (TypeScript 6 specific)

TS80001 fires in the TypeScript 6 language service on any file where `require()` cannot be resolved to a typed CJS function. This happens when `@types/node` is absent — `@types/screeps` does not declare `require`. The fix is to install `@types/node` as a devDependency AND add `"node"` to the `types` array in tsconfig. Setting `moduleResolution: "node10"` alone is not sufficient for the language server in TS6; both changes are needed together. `// @ts-nocheck` does NOT suppress TS80001 because it is a suggestion (severity: message), not an error.

## src/global.d.ts — custom Memory augmentations

Augments `CreepMemory`, `RoomMemory`, `Memory` with project-specific fields:
- `CreepMemory`: `role`, `homeRoom`, `sourceId: Id<Source>`, `containerId: Id<StructureContainer>`, `linkId`, `delivering`, `harvesting`, `upgrading`, `building`, `repairing`, `targetRoom`, `claimTarget`
- `RoomMemory`: `plan: { hub, lastRCL, ... }`
- `Memory`: `scoutData: { [roomName]: ScoutRecord }`

Must be included via `"include": ["src/**/*.d.ts"]` in tsconfig alongside `.js` files.

## getObjectById in JS files — JSDoc cast pattern

TypeScript checkJs cannot resolve `getObjectById` overloads from `Id<T>` when the property type is inferred from JS data flow (not TS declarations). Fix: JSDoc cast at the call site:

```js
const source = /** @type {Source|null} */ (Game.getObjectById(creep.memory.sourceId));
const container = /** @type {StructureContainer|null} */ (Game.getObjectById(creep.memory.containerId));
```

Files with these casts: `role.miner.js` (lines 11, 17, 24, 76), `role.hauler.js` (line 92).

**Why:** In `.js` files under checkJs, TypeScript infers argument types from data flow rather than from interface declarations. Even with `Id<StructureContainer>` declared in `CreepMemory`, tsc infers the runtime type as `string` (from prior assignments), causing overload resolution to fall back to `getObjectById<T>(id: string): T | null` which returns `_HasId | null`.

## Related memories
- [[project-architecture]] for module list
