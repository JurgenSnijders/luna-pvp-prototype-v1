# 01 — Engine Capabilities (Ground Truth)

> **Kind:** Facts. Change only when the code changes.
> **Source anchor:** commit `53e3893` (2026-09-08).
> **Purpose:** what the engine can express and execute *today*, so design work in
> [`04-upgrade-design.md`](04-upgrade-design.md) starts from reality rather than assumption.

---

## Headline

The engine is more capable than the generated spells suggest. Multi-stage ballistic
mechanics — apex cluster splits, ground bounces with restitution and friction, airburst
detonation, plumb sky drops, obstacle clearance — are **fully implemented and correct**.
The reference proof is the `Cluster Mortar` preset
([`verticalRecipes.ts`](../../src/devtools/presetPacks/verticalRecipes.ts) → `clusterMortar`,
L52), which lobs a ballistic parent, splits into a fan of three bomblets at apex, and
detonates a field on each bounce. It works end to end in game. `[Verified]`

Nothing in docs 02–04 should be read as "the engine can't do this." Almost always it can,
and the intent was destroyed before it arrived.

---

## The contract

A spell is a JSON `AbilitySchema`. Four independent axes:

| Axis | Field | Meaning |
|---|---|---|
| Motion | `trajectory` | How the projectile moves |
| Behaviour | `triggers[]` | What happens, and when |
| Casting | `inputProfile`, `resourceCost` | How the player fires it |
| Appearance | `visuals` | How it looks |

```ts
export interface AbilitySchema {
  id: string;
  name: string;
  tagline?: string;
  description?: string;
  archetype?: SpellArchetype;
  cooldownMs: number;
  recoilKick: number;
  trajectory?: TrajectoryConfig;
  triggers: TriggerNode[];
  visuals?: VisualDescriptor;
  metadata?: Record<string, unknown>;
  inputProfile?: InputProfile;
  resourceCost?: ResourceCost;
  targetingMode?: TargetingMode;
  maxTargetRange?: number;
}
```

`trajectory` is optional. A spell with no root trajectory is valid — it must instead have an
`ON_CAST` node that spawns something (`SPAWN_PROJECTILE`, `SPAWN_FIELD`, `SPAWN_ACTOR`,
`SPAWN_OBSTACLE`, `TELEPORT`). This "spawn path" requirement is enforced in
[`sanitize/ability.ts`](../../src/ai/budget/sanitize/ability.ts) via `hasOnCastEffect` (L96). `[Verified]`

---

## Trajectory types

Six types, exclusive — `trajectory.type` selects exactly one planar motion model.
Implemented as a switch in
[`Trajectories.ts`](../../src/primitives/Trajectories.ts) → `updateTrajectory` (L52). `[Verified]`

| Type | Motion | Terminates on |
|---|---|---|
| `LINEAR` | Constant velocity along fixed `aimAngle` | `maxRange` |
| `RETURN_TO_SOURCE` | Out to half range, then homes back to caster | Caster contact (24px) |
| `ORBIT_ANCHOR` | Circles the caster at `orbitRadius` | 3000ms lifetime |
| `HOMING_SLERP` | Rotates toward nearest non-allied target at `turnAccel` | `maxRange` |
| `DISCONTINUOUS_BLINK` | Teleports `blinkDistance` every 150ms | `maxRange` |
| `BALLISTIC_ARC` | Planar motion + vertical arc; lob or sky drop | Ground, range, or `detonateAtZ` |

```ts
export interface TrajectoryConfig {
  type: TrajectoryType;
  speed?: number;
  turnAccel?: number;
  maxRange?: number;
  piercing?: number;
  orbitRadius?: number;
  orbitSpeed?: number;
  blinkDistance?: number;
  gravityScale?: number;
  lobApex?: number;
  bounces?: number;
  bounceRestitution?: number;
  groundFriction?: number;
  clearanceHeight?: number;
  detonateAtZ?: number;
  spawnAltitude?: number;
  fallSpeed?: number;
}
```

**Important structural note.** `LINEAR` re-derives velocity from a fixed angle every frame:

```ts
proj.vel = Vector2D.fromAngle(proj.aimAngle, speed);
proj.pos = proj.pos.add(proj.vel.scale(dt));
```

[`Trajectories.ts`](../../src/primitives/Trajectories.ts) → `updateLinear` (L89). There is
**no acceleration model** and external forces on a projectile are overwritten each frame.
Any future motion modifier must either perturb `aimAngle` or post-adjust after the switch. `[Verified]`

---

## Vertical physics is orthogonal to trajectory type

This is the single most important architectural fact in this document.

Vertical integration — gravity, ground contact, bounce restitution, ground friction,
settling — lives in
[`PhysicsWorld.ts`](../../src/engine/PhysicsWorld.ts) → `integrateProjectile` (L767) and
**never inspects `trajectory.type`**. It operates on any `Projectile` with a non-zero
`gravityScale` or `vz`. Bounce events are emitted from there (L821), also type-agnostic. `[Verified]`

Meanwhile the planar updaters (`updateLinear`, `updateHomingSlerp`, `updateOrbitAnchor`,
`updateReturnToSource`, `updateDiscontinuousBlink`) only touch `pos` and `vel`. None touches `z`. `[Verified]`

Only **two** things bind vertical behaviour to the enum:

| Gate | Location |
|---|---|
| `initBallisticKinematics` call | [`actions.ts`](../../src/primitives/interpreter/actions.ts) L125 and [`Interpreter.ts`](../../src/primitives/interpreter/Interpreter.ts) L113, both `if (type === 'BALLISTIC_ARC')` |
| Apex event emission | [`Trajectories.ts`](../../src/primitives/Trajectories.ts) L263, inside `updateBallisticArc` only |

**Consequence `[Inferred]`:** a homing or orbiting projectile given `vz > 0` and
`bouncesRemaining > 0` would already arc and bounce correctly; it simply never receives those
values, and would not fire `ON_AIR_APEX`. Combined motion ("homing mortar", "bouncing
boomerang") is therefore close to free — see [`04-upgrade-design.md`](04-upgrade-design.md) §2.
Some pairings need behavioural testing before being exposed.

`initBallisticKinematics` maps schema → runtime fields
([`Trajectories.ts`](../../src/primitives/Trajectories.ts) L11): `bounces → bouncesRemaining`,
`bounceRestitution → groundRestitution`, `groundFriction`, `clearanceHeight`, `detonateAtZ`,
and either `spawnAltitude`/`fallSpeed` (sky drop) or `lobApex → vz` (forward lob). `[Verified]`

---

## Triggers

Eleven trigger types. Full list in
[`constants.ts`](../../src/types/schema/constants.ts) → `TRIGGER_TYPES`. `[Verified]`

| Trigger | Fires when | Dispatch site |
|---|---|---|
| `ON_CAST` | Ability executes | `Interpreter.executeAbility` L76 |
| `ON_TICK` | Every `tickIntervalMs` while alive | `lifecycle.ts` → `dispatchHostTicks` |
| `ON_HIT` | Projectile contacts an entity | `lifecycle.ts` L623 |
| `ON_EXPIRY` | Range / lifetime / ground death; also on hit-death unless `fireOnHitDeath: false` | `lifecycle.ts` L752 |
| `ON_RETURN` | `RETURN_TO_SOURCE` reaches caster | `lifecycle.ts` L643 |
| `ON_RECAST` | Player re-presses the hotkey; root-cast projectiles only | `lifecycle.ts` → `dispatchRecast` |
| `ON_HIT_WALL` | Wall collision death | `lifecycle.ts` L785 |
| `ON_DISTANCE_TRAVELED` | `distanceTraveled >= triggerDistance`, once per node | `lifecycle.ts` L804 |
| `ON_HAZARD_CONTACT` | Enters lava surface | `lifecycle.ts` L827 |
| `ON_BOUNCE` | Ground bounce; filterable by `bounceIndex` / `minBounceSpeed` | `lifecycle.ts` L671 |
| `ON_AIR_APEX` | Ballistic projectile reaches peak altitude, once | `lifecycle.ts` L657 |
| `ON_GROUND_SLAM` | Ground impact at `|vz| >= 300` with no bounce remaining | `lifecycle.ts` L694 |

```ts
export interface TriggerNode {
  trigger: TriggerType;
  tickIntervalMs?: number;
  triggerDistance?: number;
  fireOnHitDeath?: boolean;
  minBounceSpeed?: number;
  bounceIndex?: number;
  conditions?: ConditionNode[];
  actions: ActionPayload[];
  ifFalseActions?: ActionPayload[];
  children?: TriggerNode[];
}
```

`conditions` + `ifFalseActions` give per-node branching; `children` gives nesting. **The
trigger tree is already a general if/then graph** — relevant to the Spell Designer idea in
[`04-upgrade-design.md`](04-upgrade-design.md) §5.

Six condition queries exist: `STAT_THRESHOLD`, `TAG_CHECK`, `PROXIMITY_COUNT`,
`SURFACE_TYPE`, `COMBO_STEP`, `ELEVATION`. `[Verified]`

---

## Actions

Nineteen action payload variants (`ActionPayload` union,
[`types.ts`](../../src/types/schema/types.ts) L443). Composition-relevant ones:

| Action | Nests? | Notes |
|---|---|---|
| `SPAWN_PROJECTILE` | Yes — `triggers[]` + `emitter` | Primary cluster mechanism |
| `CAST_CHILD_PAYLOAD` | Yes — full nested `AbilitySchema` | Alternate MIRV pattern; `maxRecursionDepth` 1–3 |
| `SPAWN_ACTOR` | Yes — `actor.triggers[]` | Turrets/decoys with autonomous behaviour |
| `SPAWN_FIELD` | No | Four field types; `verticalForce` for jump pads |
| `APPLY_IMPULSE` | No | Six `directionMode` values |
| `LAUNCH_VERTICAL`, `SET_GRAVITY_SCALE` | No | Vertical control on combatants |

Emitters fan a single `SPAWN_PROJECTILE` into up to 12 projectiles:

```ts
export interface EmitterConfig {
  count: number;
  spreadDeg: number;
  aimOffsetDeg?: number;
  distribution: EmitterDistribution;   // FAN | RADIAL | RANDOM_CONE | PARALLEL
  inheritVelocityRatio?: number;
}
```

---

## Casting model

Four `InputProfile` modes, handled in
[`Player.ts`](../../src/entities/Player.ts) → `handleSlotInput` (L~380) and
`updateSlotInputs` (L455). `[Verified]`

| Mode | Behaviour |
|---|---|
| `INSTANT` | Fires once on press |
| `CHARGE_AND_RELEASE` | Press starts a timer, hold accumulates, release fires once |
| `CHANNELED` | Re-fires `ON_CAST` every `channelIntervalMs` while held |
| `COMBO_CHAIN` | Increments `comboStep`, resets after `comboWindowMs` idle |

**`CHARGE_AND_RELEASE` scales magnitudes and nothing else.** On release
([`Player.ts`](../../src/entities/Player.ts) L424) it computes
`ratio = min(1, chargeMs / maxChargeMs)` and passes it as `chargeRatio`. The only downstream
consumer is a single multiplier ([`actions.ts`](../../src/primitives/interpreter/actions.ts) L150):

```ts
const scale = 1.0 + (ctx.chargeRatio ?? 0);
```

which multiplies impulse `baseForce`, `ADD_INSTABILITY` amount, `SPAWN_FIELD` strength, and
`MODIFY_STAT` value. It cannot change radius, duration, emitter count, or any other shape
parameter.

**What the casting model does not have.** `[Verified]`

- **No windup.** `Interpreter.executeAbility` dispatches `ON_CAST` synchronously; there is no
  mechanism to delay a cast.
- **No active window.** A cast is a single instantaneous dispatch. Nothing expresses "this hit
  region is live from t=120ms to t=280ms".
- **No recovery or commitment.** Nothing restricts the caster after firing. Holding a charge is
  free — movement is unaffected, holding is unbounded, and releasing below `minChargeMs`
  silently cancels with no cost.
- **No caster action state.** The only "cannot act" states are per-slot cooldown, `resourceCost`
  lockout (HEAT overheat / AMMO reload, `lockoutTimerMs`), and `APPLY_STASIS`.

There is one scheduling primitive available indirectly: a projectile is a timer carrier with
`ON_TICK` / `ON_EXPIRY`, so delayed effects can be faked in schema by parenting a short-lived
projectile to the caster. `[Inferred]`

---

## Close combat

**There is no melee concept in the codebase.** `[Verified]` A search across `src/` for
`melee|swing|slash|punch|cleave|blade|sword|fist|piston|bash|smash` returns no gameplay
mechanic — only a `BLADE → SHURIKEN` visual alias in
[`llmRepair.ts`](../../src/ai/synthesizer/llmRepair.ts) L336 and unrelated UI naming. No melee
action, trigger, hit-region shape, weapon, or reach concept exists in the schema, and the
prompt grammar contains no melee recipe.

### What does exist

**A complete body-collision combat system**, implemented but not addressable from a spell.
[`PhysicsWorld.ts`](../../src/engine/PhysicsWorld.ts) → `applyRammingImpulse` (L417), called
from combatant collision resolution (L929) when approach speed exceeds threshold:

```ts
const J = closingSpeed * RAMMING_IMPULSE_FACTOR * reducedMass;
...
const rammingInstability = Math.min(
  RAMMING_INSTABILITY_CAP,
  (closingSpeed - RAMMING_SPEED_THRESHOLD) * RAMMING_INSTABILITY_SCALE,
);
```

| Constant | Value | Location |
|---|---|---|
| `RAMMING_SPEED_THRESHOLD` | 350 | `PhysicsWorld.ts` L49 |
| `RAMMING_IMPULSE_FACTOR` | 0.6 | L50 |
| `RAMMING_RECOIL_FACTOR` | 0.35 | L51 |
| `RAMMING_INSTABILITY_CAP` | 45 | L53 |
| `SLAM_SPEED_THRESHOLD` | 400 | L54 |
| `SLAM_INSTABILITY_CAP` | 50 | L56 |
| `DEFAULT_COLLISION_RESTITUTION` | 0.3 | L47 |

Knockback scales with reduced mass, the rammer takes 35% recoil, and wall/obstacle slams add
up to 50 instability. This is functioning bare-hands melee. It is covered by an existing
regression case (`BODY_RAM_COLLISION` in
[`test-physics-invariants.ts`](../../scripts/test-physics-invariants.ts)).

**Melee-adjacent primitives that compose today:** `[Inferred]`

| Pattern | Built from |
|---|---|
| Shoulder charge | `APPLY_IMPULSE` on `CASTER` → ram system does the rest |
| Heavy body slam | `MORPH_ENTITY` raising `mass`/`radius` feeds the reduced-mass term |
| Gap-closer + shockwave | `TELEPORT` + `attachToSource` `RADIAL_IMPULSE` (the `Dash Ram` benchmark) |
| Parry | `REFLECT_PROJECTILES` |
| Spinning blades | `ORBIT_ANCHOR` trajectory |
| Grapple | `SPAWN_CONSTRAINT` `SPRING_TETHER` |
| Sword slash approximation | `LINEAR` projectile at `maxRange: 50` (the sanitizer floor), speed ≥150 → ~0.3s life |

### What blocks real melee

**Hit regions are circles only.** [`Fields.ts`](../../src/primitives/Fields.ts) → `applyField`
(L105) tests distance and computes a radial falloff; there is no angular constraint anywhere in
the field system. A directional swing arc is inexpressible. `[Verified]`

**Attached fields do not rotate with the caster.**
[`SpatialZone.ts`](../../src/entities/SpatialZone.ts) → `update` (L46) follows the parent's
position but applies `offset` in world space:

```ts
this.pos.copyFrom(this.parentRef.pos).addMut(this.offset);
```

`facingAngle` exists on both `Player` (L101) and `Summon` (L30) but the field system never
reads it, so a hitbox cannot be placed "in front of" a turning player. `[Verified]`

**There is no contact trigger.** Ram and slam collisions apply their effects and write a
`RAM_COLLISION` / `SLAM_COLLISION` telemetry record, but never dispatch a `TriggerNode`. Note
the contrast with vertical impacts, which *do* queue (`pendingGroundImpacts` → `ON_GROUND_SLAM`)
and with bounces (`pendingBounceEvents` → `ON_BOUNCE`). Entity-vs-entity and entity-vs-wall
contact have no equivalent queue, so no spell can react to them. `[Verified]`

**Fields ignore projectiles.** `applyField` returns early for anything not tagged `combatant`
(L68–69), so a swing cannot deflect incoming shots; `REFLECT_PROJECTILES` is the only
deflection path. `[Verified]`

**No melee visual vocabulary.** All ten `ProjectileStyle` values are ranged-flavored
(`DISC`, `BEAM`, `PULSING_ORB`, `SHURIKEN`, `VOID_RIFT`, …) and no `ImpactVfx` reads as a
weapon arc. `[Verified]`

Design proposal: [`04-upgrade-design.md`](04-upgrade-design.md) §8.

---

## Composition limits

| Limit | Value | Location | Failure mode |
|---|---|---|---|
| Nesting depth | `MAX_DEPTH = 3` | [`interpreter/constants.ts`](../../src/primitives/interpreter/constants.ts) L4 and [`budget/constants.ts`](../../src/ai/budget/constants.ts) L24 | Silent early return |
| Live entities | `MAX_ENTITIES = 256` | [`PhysicsWorld.ts`](../../src/engine/PhysicsWorld.ts) L36 | `addProjectile` returns `false`; emitter loop breaks |
| Emitter count | 1–12 | `balance.ts` → `clampSchemaValues` L43 | Clamped |
| Projectile speed | 150–1600 (0 allowed for sky drops) | `balance.ts` L14 | Clamped |
| Field radius / duration | ≤200 / ≤5000ms | `balance.ts` L38 | Clamped |
| Piercing | ≤4 | `balance.ts` L30 | Clamped |
| Max range | ≤1200 | `balance.ts` L27 | Clamped |

**All of these fail silently.** `[Verified]` For a game whose premise is "your idea works,"
this matters — see [`05-open-questions.md`](05-open-questions.md) Q4.

---

## Visual vocabulary

Three enums plus a continuous parameter block:

```ts
export interface VisualDescriptor {
  color: string;
  size: number;                    // 4–32
  projectileStyle: ProjectileStyle; // 10 values
  trailType: TrailType;             // 10 values
  impactVfx: ImpactVfx;             // 10 values
  vfx?: VfxParams;
}

export interface VfxParams {
  glowIntensity?: number;  trailDensity?: number;  trailLengthMs?: number;
  impactScale?: number;    secondaryColor?: string; blendMode?: VfxBlendMode;
  shakeIntensity?: number; distortion?: number;
}
```

**The enums are recipes, not atoms.** Each `ImpactVfx` value is a hardcoded composition of
four spawn primitives — `spawnRing`, `spawnFlash`, `spawnStreak`, `burstSparks` — in
[`vfxRecipes.ts`](../../src/render/backends/webgl/vfxRecipes.ts) → `triggerImpactBurst` (L37):

```ts
case 'MINI_NUKE':
  spawnRing(ctx, pos, 50 * scale, 4, color, 0.95, 0.5, 'CORE');
  spawnRing(ctx, pos, 90 * scale, 2, color, 0.6, 0.65, 'CORE');
  spawnFlash(ctx, pos, 55 * scale, secondaryColor, 0.85, 0.25, 'CORE');
  burstSparks(ctx, pos, 14, color, 'PRIMARY');
  burstSparks(ctx, pos, 6, secondaryColor, 'SECONDARY');
  break;
```

So the underlying particle system can express far more than ten impacts; the schema simply
has no way to address it. `[Verified]` Design implication in
[`04-upgrade-design.md`](04-upgrade-design.md) §3.

`VisualDescriptor` carries exactly **one** `impactVfx`. A projectile therefore uses the same
effect for its hit, its expiry, its bounce, and its apex. Children spawned via
`SPAWN_PROJECTILE.visuals` can differ from their parent, so effects vary *per projectile* but
never *per event within one projectile's life*. `[Verified]`

---

## Reactive feedback and event bindings

### Which gameplay events produce a visual

`[Verified]` Bindings live in
[`lifecycle.ts`](../../src/primitives/interpreter/lifecycle.ts) → `processLifecycleEvents`
(L582) except where noted.

| Event | Visual response |
|---|---|
| Projectile hit | Impact burst, decal, ripple, shake, reactive pulse, hitstop (L588–635) |
| Ground slam (vertical) | Ripple, shake, decal (L694) |
| Expiry — range/lifetime/ground | `triggerImpactBurst` (L762) |
| Return to source | `expandingRing` (L644) |
| Wall impact | 6 sparks, in [`simulation.ts`](../../src/game/simulation.ts) L74–76 |
| Obstacle destruction | Decal, ripple, burst, debris shatter |
| Zone tick / status tick | Throttled particle ticks |
| **`ON_AIR_APEX`** | **None** — L657 dispatches triggers only |
| **`ON_BOUNCE`** | **None** — L671 dispatches triggers only |
| **Ram collision** | **None** — telemetry record only |

The pattern: apex and bounce are the most recently added projectile events and their VFX
bindings were never completed. A cluster mortar splitting at apex and bomblets bouncing
therefore produce no visual feedback at the two moments that define the spell. `[Inferred]`

### Intensity is decided inconsistently per channel

`reactiveFx.pulse` takes a **boolean**, not a magnitude
([`reactiveFx.ts`](../../src/render/gl/reactiveFx.ts) L71):

```ts
  pulse(worldX: number, worldY: number, isHeavy: boolean): void {
    const t = this.tuning;
    this.blurEnvelope = Math.max(this.blurEnvelope, envelope(isHeavy ? t.blurHeavy : t.blurLight));
```

`ReactiveFxTuning` supplies paired `Light`/`Heavy` values for blur, glitch, and shock — two
discrete levels with no interpolation. `isHeavy` itself *is* derived at runtime, quantized at a
hardcoded threshold ([`lifecycle.ts`](../../src/primitives/interpreter/lifecycle.ts) L603):

```ts
    const instabDelta = hit.target.instabilityPct - instabBefore;
    const isHeavy = instabDelta >= 25 || detonated;
```

Across channels there are three different philosophies: `[Verified]`

| Channel | Continuous? | Driven by |
|---|---|---|
| Ripple radius | Yes | Derived — `min(320, 160 + projectileSpeed * 0.2)` (L615) |
| Screen shake | Yes | **Authored** — `vfx.shakeIntensity ?? 0.4`, ×4 (L598) |
| Impact burst scale | Yes | **Authored** — `vfx.impactScale ?? 1` (L593) |
| Decal radius | Yes | Semi-derived — `12 + scale * 8` |
| Reactive blur / glitch / shock | **No — binary** | Derived (`isHeavy`) |
| Hitstop | **No — fixed 2 frames** | Derived (`isHeavy`), gated on `hitFeedbackConfig.microHitstop` |

The authored channels require the LLM to calibrate absolute values with no sense of a spell's
relative power, which it does unreliably.

### Existing user and performance gates

Automatic intensity scaling must respect three pre-existing gates: `[Verified]`

- `screenShake.trigger` already multiplies by `getGraphicsSettings().screenShakeIntensity` and
  early-returns at zero ([`ScreenShake.ts`](../../src/render/ScreenShake.ts) L9–12), so a user
  shake preference exists and is honoured.
- `getTierLimits().particleBudget` caps particle spawns per graphics tier.
- `hitFeedbackConfig` ([`hitFeedbackConfig.ts`](../../src/render/hitFeedbackConfig.ts)) is a set
  of **booleans** — `targetFlash`, `microHitstop`, `bodyDeform`, `directionalBlastRings`, and
  others. These are feature flags, not intensities: scaling decides *how much*, never *whether*.

Design proposal: [`04-upgrade-design.md`](04-upgrade-design.md) §9.

---

## Preview and aiming

Two separate systems with different fidelity. `[Verified]`

**Inventory / draft preview** —
[`InspectorPlaybackSim.ts`](../../src/draft/InspectorPlaybackSim.ts) → `recordSpellPlayback`
(L368), used by [`DraftModal.ts`](../../src/draft/DraftModal.ts) L1270. Runs the **real**
`Interpreter` against a real `PhysicsWorld` for up to 150 frames in a 2000-unit sandbox, seeds
`Math.random` for determinism, and caches by spell id. It therefore displays nested clusters,
apex splits, and bounces correctly.

One gap: `runSandboxSimulation` constructs `new Interpreter()` (L328) and **never calls
`setParticleSystem`**, so every `interp.particles?.…` call is a null no-op. The preview shows
projectiles, zones, and synthetic impact circles fabricated by `seedImpactsFromEvents` — not
actual VFX. It is a schematic, not a visual preview.

**Live aiming indicator** —
[`trajectoryTracer.ts`](../../src/render/canvas/trajectoryTracer.ts) → `resolveLiveAimingPaths`
(L477). Builds paths from closed-form formulas, one per trajectory type
(`buildLinearPath`, `buildBallisticArcPath`, `buildHomingSlerpPath`, …). It traces the **root
cast only** — never child projectiles from `ON_AIR_APEX`/`ON_EXPIRY`, and
`buildBallisticArcPath` (L335) draws a single parabola with no bounce hops.

---

## Budget and balance model

[`balance.ts`](../../src/ai/budget/balance.ts) → `balanceAbilitySchema` (L80). `[Verified]`

Power is scored recursively by [`score.ts`](../../src/ai/budget/score.ts) — nested
`SPAWN_PROJECTILE` multiplies by emitter count and recurses into child triggers, and
`ON_BOUNCE` / `ON_AIR_APEX` / `ON_GROUND_SLAM` carry 1.15× / 1.1× / 1.12× multipliers. Then:

```ts
clamped.cooldownMs = Math.max(
  budget.minCdMs,
  Math.round((totalPower / budget.targetPower) * budget.baseCdScale),
);
// non-MOBILITY:
clamped.recoilKick = Math.max(0, Math.round(totalPower / 2.5));
```

Both fields are **overwritten**, not adjusted. Two consequences for the Evolution Tree:
accumulated power raises cooldown roughly linearly, and raises self-knockback — in a lava
arena, a heavily evolved spell can eject its own caster. `[Inferred]` See
[`04-upgrade-design.md`](04-upgrade-design.md) §4.

---

## Known vocabulary drift

The spell vocabulary is hand-maintained in **six** places: prompt grammar
([`prompts.ts`](../../src/ai/synthesizer/prompts.ts)), LLM response schema
([`abilityResponseSchema.ts`](../../src/ai/synthesizer/abilityResponseSchema.ts)), TS types
([`types.ts`](../../src/types/schema/types.ts)), runtime enums
([`constants.ts`](../../src/types/schema/constants.ts)), sanitizer whitelists
([`sanitize/`](../../src/ai/budget/sanitize/)), and validators
([`validators/`](../../src/types/schema/validators/)) — plus a seventh stale copy inside
[`llmRepair.ts`](../../src/ai/synthesizer/llmRepair.ts).

This mirrors principle 7 in [`../ARCHITECTURE.md`](../ARCHITECTURE.md) ("Schema changes must
update validators, sanitizers, interpreter, and VFX in sync"), which is currently a manual
discipline rather than an enforced one.

Two live drift instances at `53e3893`: `[Verified]`

1. **`VALID_TRAJECTORY_TYPES`** in `llmRepair.ts` (L308) omits `BALLISTIC_ARC`, which
   `TRAJECTORY_TYPES` in `constants.ts` (L28) includes. This is root cause RC-1 in
   [`02-pipeline-audit.md`](02-pipeline-audit.md).
2. **`ActionType`** union in `types.ts` (L54–71) ends at `APPLY_STATUS` and omits
   `LAUNCH_VERTICAL` and `SET_GRAVITY_SCALE`, which both `ACTION_TYPES` in `constants.ts`
   (L68–88) and the `ActionPayload` union (L443) include. Harmless today because the
   build-time coverage check in `abilityResponseSchema.ts` (L417) iterates the runtime
   `ACTION_TYPES` set, not the type — but it demonstrates the drift is ongoing, not historical.

There is exactly one guard of this class in the codebase today: `abilityResponseSchema.ts`
throws at module load if any `ACTION_TYPES` member lacks a schema branch. Generalising that
pattern is proposed in [`04-upgrade-design.md`](04-upgrade-design.md) §6.
