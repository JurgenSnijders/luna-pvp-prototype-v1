# 08 — Capability Audit

> **Kind:** Facts. Change when the code changes.
> **Written:** 2026-09-21, after the spell-pipeline runbook (phases 0–13) and the combat-profile UI slices.
> **Purpose:** the current capability set. Docs
> [`01-engine-capabilities.md`](01-engine-capabilities.md),
> [`02-pipeline-audit.md`](02-pipeline-audit.md), and
> [`03-repair-rules-matrix.md`](03-repair-rules-matrix.md) stay as the snapshot from commit
> `53e3893`. Do not treat their line numbers or "the engine cannot…" claims as current.

Shipped checklist: [`07-backlog.md`](07-backlog.md). Product decisions: [`05-open-questions.md`](05-open-questions.md).

---

## Headline

A spell is still an `AbilitySchema`. The engine executes multi-stage ballistics, contact
ramps, slams, directional parries, phased summons, drawn paths, and layered VFX. The
workshop reads one combat profile for forge cards, the tactical inspector, vault sorts, and
the action-bar tooltip.

Display estimates are not the physics integrator. Ring-out distance in the UI is a closed-form
heuristic. Live knockback still comes from `PhysicsWorld`.

---

## Schema vocabulary

Authoritative lists: [`src/types/schema/constants.ts`](../../src/types/schema/constants.ts).

| Axis | Values added or notable since doc 01 |
|---|---|
| Trajectory | The original six, plus `DRAWN_PATH`. Optional `motion` (wobble, jitter, drift, spiral, `speedCurve`) with seeded `motionSeed`. |
| Triggers | `ON_RAM` (rammer-owned, no arming, node `minRamSpeed`, default gate 350). `ON_SLAM` for high-speed hex wall, obstacle, and ground hits without arming. `ON_HIT_WALL` and `ON_GROUND_SLAM` are unchanged. |
| Actions | `PLAY_VFX` scores 0, so visuals do not raise cooldown. `REFLECT_PROJECTILES` takes `arcDeg` / `arcFacing` / `arcOffsetDeg`, optional `durationMs`, and `whileHeld` for hold-guard. |
| Fields | `arcDeg` wedge with `CASTER_FACING`, `CAST_HEADING`, or `FIXED`. Affects filters: `ENEMIES`, `ALLIES`, `CASTER_ONLY`, `ALL`. |
| Visuals | `impactLayers` and `trailLayers` (`RING`, `FLASH`, `STREAK`, `SPARKS`). LOW particle budget clamps a max legal stack to 16 spawns. |
| Casting | Cast phases live on `Entity` (`activeCastPhase`, `tickCastPhases`). Optional `ActorConfig.inputProfile` telegraphs summon `ON_TICK` / turret fire. Player slot input is unchanged. |
| Ceilings | `MAX_DEPTH` 4, `MAX_ENTITIES` 512. Saturation chips stay. Evolution upgrades are not refused at the ceiling. |

Canonical cluster recipe in the forge prompt: `ON_AIR_APEX` + `SPAWN_PROJECTILE`. The old
`ON_EXPIRY` + `CAST_CHILD_PAYLOAD` cluster line is gone.

Forward `BALLISTIC_ARC` mortars keep authored `lobApex` and solve `speed` from the clamped
cursor range. Fan pellets share that center-aim speed. Sky drops and `GROUND_POINT` stay on
their own paths.

`FIRST_GENERATION` repair runs on the initial forge from a raw prompt. `EVOLUTION` repair
runs everywhere else, including evolution tiers, so structural flavor does not flatten a
`BALLISTIC_ARC` or its apex split.

---

## Evolution tree

Store: [`src/game/EvolutionStore.ts`](../../src/game/EvolutionStore.ts), key `spell_evolution_v1`.

| Choice | What the code does |
|---|---|
| Q5 balance | `balanceAbilitySchema(schema, category, tier)` is tier-aware. A higher tier is stronger at a similar cooldown. |
| Q5 cadence | Trees persist across rounds and matches. `MatchManager.startMatch` does not clear them. The evolution panel **RESET TREE** button does. |
| Q6 shape | Stat nodes store modifiers. Mechanic nodes store `resolvedSchema`. |
| Q6 reversibility | `setActivePath` and **RESET TREE** re-resolve from `baseSchema` plus the mechanic nodes still on the path, then reapply stat modifiers. Mechanic nodes are not JSON patches. |

---

## Combat profile (display)

Module: [`src/primitives/combatProfile.ts`](../../src/primitives/combatProfile.ts).

`computeSpellCombatProfile` is the single readout for peak force, direction tag, instability
yield, direct damage, resource, delivery, and recoil. `compareCombatProfiles` emits
polarity-aware deltas and mechanic chips.

Kinetic lethality is attached beside `peakForce`. It does not change impulse extraction or
`PhysicsWorld`:

| Constant | Value | Role |
|---|---|---|
| Target mass | 50 | Documented standard combatant. Not read by the integrator. |
| Arena radius | 500 px | Center to lava, for the reach percentage. |
| Force-to-distance | 0.28 | `baseTravelPx = round(peakForce × 0.28)` |
| Instability heuristic | ×2 | `maxTravelPx` is the 100% instability travel estimate |

Ring-out tiers on `maxTravelPx`: `LETHAL_FINISHER` at 400, `HEAVY_SHOVE` at 220,
`TACTICAL_REPOSITION` at 100, otherwise `MICRO_INTERRUPT`. Pull labels are `LETHAL VORTEX`
and `HEAVY DRAG`.

Surfaces that read the profile:

- Forge cards: equipped-slot deltas, mechanic chips, `~Npx reach` on the repulse line.
- Tactical inspector: solo grid with the lethality badge, or the tale-of-the-tape drawer when the spell is not already in its target slot.
- Action-bar tooltip: cadence, recoil, displacement range, instability, tactical verb lines.
- Vault sort: peak force, cooldown, instability.

---

## How to check

```bash
npx tsc --noEmit
npm run test:combat-profile
npm run test:invariants
npm run test:interpreter
npm run test:fidelity
```

`test:invariants` covers apex split, homing-plus-arc, cursor-solved fans, `ON_RAM`,
`ON_SLAM`, wedge hits, parry and hold-guard, summon phases, drawn paths, seeded motion, and
the LOW VFX cap. `test:fidelity` covers evolution repair keeping `BALLISTIC_ARC` and child
bounces. `test:combat-profile` covers lethality tier boundaries.

A live 12-point playtest is still a confirmation pass. File a backlog item only if a check
disagrees with those tests. See [`07-backlog.md`](07-backlog.md).

---

## Not in this snapshot

- Loadout role meter, kit warnings, and cross-slot synergy tags.
- Vault tile verb icons and name strips.
- Any change to runtime knockback integration.
- Networked determinism. Seeded motion noise is local.
