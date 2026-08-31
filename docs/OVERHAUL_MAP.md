# Universal Kinetic Engine, VFX Upgrade & LLM Sync

This document summarizes the three major initiatives on this branch and maps every touched module.

**Totals:** ~62 source files + 3 config/root files

---

## Table of Contents

1. [Universal Kinetic Engine Overhaul](#1-universal-kinetic-engine-overhaul)
2. [WebGL VFX Upgrade](#2-webgl-vfx-upgrade)
3. [LLM Synthesizer (Spell Forger) Update](#3-llm-synthesizer-spell-forger-update)
4. [How the Pieces Connect](#4-how-the-pieces-connect)
5. [Per-File Module Map](#5-per-file-module-map)
6. [Files by Initiative](#6-files-by-initiative)

---

## 1. Universal Kinetic Engine Overhaul

### Core Idea

Abilities are no longer hardcoded game logic. They are **`AbilitySchema` JSON documents** — validated at load time, interpreted at runtime by `Interpreter.ts`, scored/balanced by `BudgetEngine.ts`, and authored by the Spell Forger in `Synthesizer.ts`.

```typescript
// src/types/schema.ts
export interface AbilitySchema {
  id: string;
  name: string;
  cooldownMs: number;
  recoilKick: number;
  trajectory?: TrajectoryConfig;
  triggers: TriggerNode[];
  visuals?: VisualDescriptor;
  metadata?: Record<string, unknown>;
  inputProfile?: InputProfile;
  resourceCost?: ResourceCost;
}
```

### Grammar Expansion

| Category | Count | Examples |
|---|---|---|
| **Triggers** | 9 | `ON_CAST`, `ON_TICK`, `ON_HIT`, `ON_EXPIRY`, `ON_RETURN`, `ON_RECAST`, `ON_HIT_WALL`, `ON_DISTANCE_TRAVELED`, `ON_HAZARD_CONTACT` |
| **Actions** | 16 | `ADD_INSTABILITY`, `APPLY_IMPULSE`, `SPAWN_FIELD`, `SPAWN_PROJECTILE`, `SPAWN_CONSTRAINT`, `CAST_CHILD_PAYLOAD`, `MODIFY_STAT`, `TELEPORT`, `APPLY_STASIS`, `RELEASE_STASIS`, `REFLECT_PROJECTILES`, `SPAWN_OBSTACLE`, `MUTATE_TERRAIN`, `MORPH_ENTITY`, `SPAWN_ACTOR`, `APPLY_STEALTH` |
| **Conditions** | 5 | `STAT_THRESHOLD`, `TAG_CHECK`, `PROXIMITY_COUNT`, `SURFACE_TYPE`, `COMBO_STEP` (with optional `ifFalseActions` branching) |
| **Trajectories** | 5 | `LINEAR`, `RETURN_TO_SOURCE`, `ORBIT_ANCHOR`, `HOMING_SLERP`, `DISCONTINUOUS_BLINK` |
| **Fields** | 4 | `RADIAL_IMPULSE`, `VORTEX_TANGENT`, `FRICTION_OVERRIDE`, `MASS_ATTRACTOR` |
| **Input profiles** | 4 | `INSTANT`, `CHARGE_AND_RELEASE`, `CHANNELED`, `COMBO_CHAIN` |
| **Resource economies** | 4 | `COOLDOWN`, `HEAT`, `AMMO`, `HEALTH_PCT` |

### Runtime Architecture

| Layer | Role |
|---|---|
| `schema.ts` | Type definitions + `validateAbilitySchema()` |
| `Interpreter.ts` | Walks trigger trees, dispatches actions, resolves targets |
| `Trajectories.ts` | Per-frame projectile motion |
| `Fields.ts` | Spatial zone physics |
| `Player.ts` | Input profiles, resource state (heat/ammo/reload), combo steps |
| `PhysicsWorld.ts` | Entity simulation, terrain queries (`getSurfaceTypeAt`) |
| `BudgetEngine.ts` | Sanitization, power scoring, category balancing |

### Key Behavioral Features

- **Relational impulses** — `APPLY_IMPULSE` uses `directionMode` (`AWAY_FROM_ORIGIN`, `TOWARDS_CASTER`, `ALONG_TRAJECTORY`, etc.) instead of generic outward knockback
- **Nested payloads** — `CAST_CHILD_PAYLOAD` with recursion depth limits and optional velocity/instability inheritance (MIRV bombs, fractal spells)
- **Emitter patterns** — `FAN`, `RADIAL`, `RANDOM_CONE`, `PARALLEL` with count/spread control
- **Lifecycle triggers** — `ON_DISTANCE_TRAVELED` (tripwires), `ON_HIT_WALL`, `ON_RECAST` (detonation), `fireOnHitDeath`
- **World interaction** — obstacles, terrain mutation (SAFE/LAVA patches), stasis freeze/release, morphs, turrets/decoys, stealth

### Grammar Gap Fixes

Three schema features that existed in types but were dead or broken at runtime were wired up:

1. **`ON_HAZARD_CONTACT`** — fires when a projectile enters lava (`Interpreter.ts` checks `getSurfaceTypeAt`)
2. **`SURFACE_TYPE` conditions** — query terrain under a target via `world.getSurfaceTypeAt()`
3. **`REFLECT_PROJECTILES`** — extended beyond single-projectile reflection to work with a `radius` around a caster/zone

### Slot Categories vs. Runtime

`PRIMARY`, `SECONDARY`, `UTILITY`, `ULTIMATE`, `MOBILITY` affect **AI compilation, balancing, and UI flavor only** — not runtime behavior. A teleport in PRIMARY works the same as in MOBILITY; the slot is for loadout organization and power budget targeting.

### Test Preset Pack (~70+ spells across 11 groups)

Organized in `src/devtools/presetPacks/`:

| Group | Focus |
|---|---|
| Tier A — Core Demo | Regression baseline (Railgun, Boomerang, Cryo, etc.) |
| Tier B — Kinetic Recipes | Compiler reference spells |
| Phase 7 — Input Profiles | Charge, channel, combo |
| Phase 8 — Stasis | Freeze, momentum banking |
| Phase 9 — Terrain & Obstacles | Boulders, lava patches, minefields |
| Phase 10 — Metamorphism | Morph, stealth, turrets, decoys |
| Phase 11 — Resources | Heat, ammo, health-cost |
| Tier D — Advanced Grammar | Homing, blink, constraints, wall hits |
| Tier E — Conditional Logic | Branching, proximity checks, recursion |
| VFX Showcase | New visual grammar demos |
| Tier F — Diagnostics | Stress tests, grammar probes |

---

## 2. WebGL VFX Upgrade

### Problem Solved

The old system drew every particle as a separate Canvas2D circle — expensive at scale and visually flat (stacked translucent circles). The new system targets **high FPS under heavy VFX load** through instanced GPU rendering, parametric primitives, and quality tiers.

### Architecture

```
Interpreter / CanvasRenderer
        ↓
  ParticleSystem (facade, legacy API preserved)
        ↓
    VfxDirector (budgets, priorities, anti-overdraw)
        ↓
  ParticleBackend interface
   ├── WebGLBackend (default)
   └── Canvas2DBackend (fallback)
```

**WebGL stack** (`src/render/gl/`):

- `GLContext` — stacked transparent canvas over `#game-canvas`, DPR-capped, context loss/restore
- `InstancedQuadRenderer` — single draw call for thousands of quads via instance buffer
- `shaders.ts` — SDF shapes (disc, glow, ring, star, shard, streak, capsule, etc.)
- `PostFX` — bloom (threshold → separable blur → composite), chromatic aberration (ULTRA)
- `PrimitiveLayer` — parametric one-draw-call effects (shockwave rings, flashes, beams)

**Performance design principles:**

- Structure-of-Arrays particle storage with swap-remove
- Stateless GPU particles — spawn state uploaded once, position computed in vertex shader
- Anti-overdraw rule — `VfxDirector` rejects coincident same-material spawns
- Blend-mode sorted passes — normal instances first, additive second
- Spawn priorities — `CORE` > `PRIMARY` > `SECONDARY` > `AMBIENT` with budget gating

### Extended Visual Grammar

`VisualDescriptor` grew from 5 projectile styles / 5 trail types / 5 impact VFX to:

| Category | Count | Examples |
|---|---|---|
| Projectile styles | 10 | `PRISM`, `VOID_RIFT`, `CRYSTAL_SHARD`, `RUNE_SIGIL`, `PLASMA_TENDRIL` |
| Trail types | 10 | `EMBER_SPIRAL`, `FROST_CRYSTALS`, `VOID_TENDRIL`, `PLASMA_ARC`, `DUST_PUFF` |
| Impact VFX | 10 | `PLASMA_BLOOM`, `IMPLOSION`, `LIGHTNING_FORK`, `RUNE_FLASH`, `SHATTER` |
| VFX params (new) | 8 knobs | `glowIntensity`, `trailDensity`, `impactScale`, `secondaryColor`, `blendMode`, `shakeIntensity`, `distortion` |

The `vfx` block threads through validation (`schema.ts`), sanitization (`BudgetEngine.ts`), runtime (`Interpreter.ts`), and rendering.

### Quality & Performance System

**`graphicsSettings.ts`** — 5 tiers (`LOW` → `ULTRA` + `AUTO`) controlling particle budget, DPR cap, bloom passes, trail density, max primitives, ground decals, refraction.

**`AdaptiveQuality.ts`** — watches p95 frame time, steps tier down/up with hysteresis and cooldowns.

**`PerfMonitor.ts`** — rolling FPS, p50/p95 frame times, sim vs render split, live particle/primitive/draw-call counts, GPU capability probe.

**Inspector Graphics tab** — tier buttons, perf overlay (F3), baseline recording, force GL context loss, Canvas2D fallback toggle.

### Non-Projectile VFX

`CanvasRenderer.ts` was enhanced for palette-driven effects on fields, terrain mutations, obstacles, morphs, stealth shimmer, summons, and stasis crystallization.

### Post-Launch Bug Fixes

1. **Peach screen overlay** — PostFX compositing viewport/DPR mismatch
2. **Giant blobs on cast** — additive/normal instance buffer interleaving corrupting shader attributes
3. **Canvas misalignment** — fixed positioning, z-index layering, unified DPR between game and VFX canvases

---

## 3. LLM Synthesizer (Spell Forger) Update

### Three-Stage Pipeline

| Stage | Prompt | Output |
|---|---|---|
| **Forge** | `FORGE_SYSTEM_PROMPT` | 3 ability *concepts* (title, tagline, description) |
| **Compile** | `COMPILER_SYSTEM_PROMPT` | Full `AbilitySchema` JSON |
| **Evolve** | `EVOLUTION_SYSTEM_PROMPT` | 3 variants of an existing spell |

### What Changed in the Compiler Prompt

The `COMPILER_SYSTEM_PROMPT` was massively expanded to mirror the full engine grammar:

- Complete `inputProfile` and `resourceCost` specs with worked examples
- All 9 triggers, 16 actions, 5 conditions with field-level documentation
- Semantic recipes (charged shot, heat flamer, stasis combo, crowd breaker, morph colossus, tripwire bomb, etc.)
- **Visual recipe book** — archetype → palette mappings (Frost, Fire, Void, Lightning, Holy, Toxic, Kinetic, Arcane)
- Full new VFX enum vocabulary and `vfx` parameter block

### Repair & Validation Sync

- `TRIGGER_TYPES` / `ACTION_TYPES` imported from `schema.ts` (single source of truth)
- `repairVisualDescriptor` handles the `vfx` object
- `repairActionPayload` recursively repairs `CAST_CHILD_PAYLOAD` children
- `repairTriggerNode` preserves `ifFalseActions`
- New `PROJECTILE_STYLE_ALIASES` (CRYSTAL → `CRYSTAL_SHARD`, VOID → `VOID_RIFT`, etc.)
- `resolveKineticRecipe()` keyword routing expanded (charge, heat, combo, morph, stealth, turret, lava)

### Budget & Balancing

- `getCastingResourceModifier()` — channel/combo/charge spells and heat/ammo/health costs adjust power scores
- `CATEGORY_BUDGETS` + `CATEGORY_COMPILE_HINTS` passed into compile prompts
- Parent visual metadata passed during evolution ("mutate palette, don't reroll colors")
- `maxOutputTokens` raised to 3072 for larger schemas

---

## 4. How the Pieces Connect

```
schema.ts ─────────────────────────────────────────────┐
    │                                                   │
    ├── BudgetEngine.ts (sanitize/score)               │
    ├── Synthesizer.ts (LLM compile)                   │
    ├── presetPacks/* (test data)                      │
    │                                                   │
    └── Interpreter.ts (runtime) ◄── Player.ts         │
            │                        PhysicsWorld.ts    │
            ├── Trajectories.ts                         │
            ├── Fields.ts                               │
            └── ParticleSystem.ts ──► VfxDirector.ts   │
                    │                    │              │
                    └── WebGLBackend / Canvas2DBackend │
                              │                         │
                    CanvasRenderer.ts ◄────────────────┘
                    main.ts (loop + perf)
```

**The contract is JSON.** A spell's `triggers[]` define *what happens*, `trajectory` defines *how it moves*, `inputProfile`/`resourceCost` define *how the player casts it*, and `visuals` define *how it looks*.

---

## 5. Per-File Module Map

Status is relative to `main`: **New** = added in this branch; **Modified** = changed from existing `main` files.

### Root & Config (3 files)

| File | Status | Role |
|---|---|---|
| `index.html` | Modified | Canvas z-index layering (`#game-canvas` z-index 0, `#inspector-root` z-index 10) for WebGL VFX overlay stacking |
| `package.json` | Modified | Vite/TypeScript project scripts (`dev`, `build`, `preview`) |
| `tsconfig.json` | Modified | Strict ES2022 / ESNext module config for expanded `src/` tree |

### Types & Schema (3 files)

| File | Status | Role |
|---|---|---|
| `src/types/schema.ts` | New | Central grammar contract: `AbilitySchema`, all triggers/actions/conditions, trajectories, fields, emitters, `InputProfile`, `ResourceCost`, extended `VisualDescriptor` + `VfxParams`, validation, `TRIGGER_TYPES` / `ACTION_TYPES` |
| `src/types/triggerContext.ts` | New | `TriggerContext` and `ExecutionOverrides` (origin, heading, caster, target, depth, `chargeRatio`, `comboStep`) |
| `src/types/cards.ts` | New | `SkillCategory`, action slot keys, `CATEGORY_SLOT_MAP` |

### Engine & Game Loop (5 files)

| File | Status | Role |
|---|---|---|
| `src/main.ts` | New | App bootstrap: `ParticleSystem`, `PerfMonitor`, `AdaptiveQuality`, `ScreenShake`; resize/DPR; render loop with perf overlay (F3) |
| `src/engine/Loop.ts` | New | Fixed-timestep game loop with `perfMonitor` sim/render split |
| `src/engine/PhysicsWorld.ts` | New | Core physics: collisions, lava tags, stasis skip, terrain patches, `getSurfaceTypeAt()`, obstacle/zone/summon management |
| `src/game/MatchManager.ts` | New | Match state machine (lobby → active → results) |
| `src/game/ArenaShrink.ts` | New | Hex arena shrink timer and radius logic |

### Primitives — Runtime Interpreter (3 files)

| File | Status | Role |
|---|---|---|
| `src/primitives/Interpreter.ts` | New | Runtime engine core: trigger trees, all 16 actions, conditions, VFX threading from `VisualDescriptor.vfx` |
| `src/primitives/Trajectories.ts` | New | Per-frame projectile motion for all 5 trajectory types |
| `src/primitives/Fields.ts` | New | Spatial zone force application |

### Entities (9 files)

| File | Status | Role |
|---|---|---|
| `src/entities/Entity.ts` | New | Base entity: position, velocity, mass, tags, stasis/morph/stealth timers |
| `src/entities/Player.ts` | New | Input, casting, `inputProfile` modes, `resourceCost` economies, combo tracking |
| `src/entities/Projectile.ts` | New | Projectile lifecycle, `visuals`, `inHazard` flag, per-trigger accumulators |
| `src/entities/SpatialZone.ts` | New | Field zones from `SPAWN_FIELD` |
| `src/entities/Obstacle.ts` | New | Destructible/timed obstacles from `SPAWN_OBSTACLE` |
| `src/entities/ConstraintJoint.ts` | New | Spring tether, distance rod, surface pin from `SPAWN_CONSTRAINT` |
| `src/entities/Summon.ts` | New | Turret/decoy actors from `SPAWN_ACTOR` |
| `src/entities/Dummy.ts` | New | Training dummy combatant |
| `src/entities/BotController.ts` | New | Simple AI movement for bot dummies |

### Rendering — Canvas World (3 files)

| File | Status | Role |
|---|---|---|
| `src/render/CanvasRenderer.ts` | New | Canvas2D world draw: hex arena, entities, enhanced zones/terrain/obstacles, morph/stealth/stasis effects |
| `src/render/ActionBarHUD.ts` | New | Ability bar UI with resource badges, charge meter, cooldown display |
| `src/render/MatchHUD.ts` | New | Match overlay (start, state, winner) |

### Rendering — WebGL VFX Stack (15 files)

| File | Status | Role |
|---|---|---|
| `src/render/ParticleSystem.ts` | New | Public VFX facade — preserves legacy API, delegates to `VfxDirector` |
| `src/render/VfxDirector.ts` | New | Budget enforcement, spawn priorities, anti-overdraw rejection |
| `src/render/PrimitiveLayer.ts` | New | Parametric one-draw-call effects: rings, flashes, streaks, beams |
| `src/render/AdaptiveQuality.ts` | New | p95-driven tier stepping when `tier: AUTO` |
| `src/render/ScreenShake.ts` | New | Impact screen shake, scaled by graphics settings |
| `src/render/backends/ParticleBackend.ts` | New | Backend interface: spawn methods, counters, `SpawnPriority` |
| `src/render/backends/WebGLBackend.ts` | New | WebGL2: SoA particles, instance packing, blend passes, PostFX |
| `src/render/backends/Canvas2DBackend.ts` | New | Canvas2D fallback implementing same API |
| `src/render/backends/createParticleBackend.ts` | New | Factory: probes WebGL2, selects backend, inspector override |
| `src/render/gl/GLContext.ts` | New | Stacked transparent WebGL2 canvas, DPR-capped resize, context loss/restore |
| `src/render/gl/InstancedQuadRenderer.ts` | New | Instanced quad draw, dynamic instance buffer, blend-sorted passes |
| `src/render/gl/shaders.ts` | New | GLSL shaders: SDF shapes, bloom threshold/blur/composite |
| `src/render/gl/PostFX.ts` | New | FBO scene render, bloom pipeline, chromatic aberration (ULTRA) |
| `src/render/gl/framebuffers.ts` | New | FBO creation, fullscreen quad, shader compile/link helpers |
| `src/render/gl/NoiseTexture.ts` | New | Random noise texture for organic shader shapes |

### AI / LLM Pipeline (2 files)

| File | Status | Role |
|---|---|---|
| `src/ai/Synthesizer.ts` | New | Spell Forger: Forge/Compile/Evolve prompts, repair functions, `resolveKineticRecipe()`, visual recipe book |
| `src/ai/BudgetEngine.ts` | New | Schema sanitization, power scoring, `CATEGORY_BUDGETS`, `sanitizeVisuals` for `vfx` params |

### DevTools & Presets (16 files)

| File | Status | Role |
|---|---|---|
| `src/devtools/graphicsSettings.ts` | New | Quality tiers, `TierLimits`, DPR cap, bloom/refraction toggles |
| `src/devtools/PerfMonitor.ts` | New | Rolling FPS/p50/p95, sim vs render split, GPU capability probe |
| `src/devtools/InspectorUI.ts` | New | Debug inspector: presets, graphics tab, perf box, GL diagnostics |
| `src/devtools/Presets.ts` | New | Re-exports from `presetPacks/index` |
| `src/devtools/SpellLibrary.ts` | New | Searchable preset browser with grouped collapsible list |
| `src/devtools/presetPacks/index.ts` | New | Merges all preset packs into `PRESETS` + `PRESET_GROUPS` |
| `src/devtools/presetPacks/core.ts` | New | 5 baseline demo spells (Tier A) |
| `src/devtools/presetPacks/kineticRecipes.ts` | New | `KINETIC_RECIPES` compiler references + Tier B recipe presets |
| `src/devtools/presetPacks/inputProfiles.ts` | New | 5 charge/channel/combo casting presets |
| `src/devtools/presetPacks/stasis.ts` | New | 3 stasis freeze/release presets |
| `src/devtools/presetPacks/terrain.ts` | New | 4 terrain mutation + obstacle presets |
| `src/devtools/presetPacks/metamorph.ts` | New | 7 morph/stealth/turret/decoy presets |
| `src/devtools/presetPacks/resources.ts` | New | 5 heat/ammo/health-cost presets |
| `src/devtools/presetPacks/advanced.ts` | New | 10 advanced grammar presets |
| `src/devtools/presetPacks/conditional.ts` | New | 5 conditional/branching presets |
| `src/devtools/presetPacks/diagnostics.ts` | New | 7 stress/grammar probe presets including `VFX Stress Storm` |
| `src/devtools/presetPacks/vfxShowcase.ts` | New | 4 new VFX grammar showcase spells |

### UI / Draft (1 file)

| File | Status | Role |
|---|---|---|
| `src/draft/DraftModal.ts` | New | Spell Forger draft UI; mechanic badges for input profiles, resources, stasis, morph |

### Math Utilities (2 files)

| File | Status | Role |
|---|---|---|
| `src/math/Vector2D.ts` | New | 2D vector math used throughout physics and rendering |
| `src/math/HexMath.ts` | New | Hex containment, edge distance, `clampToHex` for arena bounds |

---

## 6. Files by Initiative

| Initiative | Files |
|---|---|
| **Kinetic Engine** | `schema.ts`, `triggerContext.ts`, `Interpreter.ts`, `Trajectories.ts`, `Fields.ts`, `PhysicsWorld.ts`, all `entities/*`, `Player.ts`, `cards.ts`, all `presetPacks/*`, `ActionBarHUD.ts`, `DraftModal.ts` |
| **VFX Upgrade** | All `render/*` (except `MatchHUD.ts`), `graphicsSettings.ts`, `PerfMonitor.ts`, `AdaptiveQuality.ts`, `ScreenShake.ts`, `index.html`, VFX parts of `Interpreter.ts`, `main.ts`, `Loop.ts`, `CanvasRenderer.ts`, `vfxShowcase.ts`, `diagnostics.ts` |
| **LLM Sync** | `Synthesizer.ts`, `BudgetEngine.ts`, `DraftModal.ts`, `schema.ts` (validation enums), `kineticRecipes.ts` |

### Notable Absences

- No new npm dependencies (`package.json` only has `typescript` + `vite`)
- No test files were added
- No CI/config beyond `tsconfig.json`
