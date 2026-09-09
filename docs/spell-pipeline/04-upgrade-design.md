# 04 — Upgrade Design (Proposals)

> **Kind:** Proposals. This document is meant to be argued with.
> **Depends on:** [`01-engine-capabilities.md`](01-engine-capabilities.md),
> [`02-pipeline-audit.md`](02-pipeline-audit.md),
> [`03-repair-rules-matrix.md`](03-repair-rules-matrix.md) — treat those as given.
> **Goal being served:** a player describes any spell, receives something playable and
> visually distinct, then evolves it through a tree of upgrades that stay unpredictable and
> fun. Breadth and surprise matter more than competitive balance.

Each section uses the same shape: **Problem → Options → Recommendation → Risk → Verification.**

---

## The unifying observation

Nearly every capability we want already has a composable substrate sitting underneath a
non-composable enum or a missing parameter:

| Want | Substrate that already composes | What blocks it |
|---|---|---|
| Combined motion (homing + bouncing) | `PhysicsWorld.integrateProjectile` handles z/bounce for *any* projectile | `trajectory.type` is exclusive |
| Novel visual effects | `spawnRing` / `spawnFlash` / `spawnStreak` / `burstSparks` | `impactVfx` is one of ten |
| Directional melee hit regions | `applyField` distance falloff + parent-following `SpatialZone` | Radial-only test; world-space offsets |
| Scriptable close combat | `applyRammingImpulse` computes rammer, target, closing speed, knock direction | No trigger queue — telemetry only |
| Per-moment visual identity | Particle primitives + `LifecycleFx` seam | One `impactVfx` per projectile; VFX unreachable from the trigger tree |
| Impact that scales with power | `scoreAbilitySchema` already quantifies spell power | `reactiveFx.pulse` takes a boolean |
| If/then spell logic | `TriggerNode` tree with conditions, children, nesting | *(none — already composable)* |

So the recurring move is: **keep the enum as a named preset, add an optional parametric layer
beside it.** Backward compatible, and it is what lets the LLM produce novelty rather than
recombination. Adding more enum values is the wrong instinct — see
[`05-open-questions.md`](05-open-questions.md) "Rejected options".

---

## §1 — Lossless re-entry for the Evolution Tree

### Problem

`sanitizeAbilitySchema` re-runs all semantic repair rules on every pass with the current
flavor text ([`03`](03-repair-rules-matrix.md)). Nine passes overwrite or delete authored
values. An evolution tier that adds the word `ring`, `burst`, `self`, or `wall` destroys work
from earlier tiers. Compounded over five or six tiers, the tree cannot hold state.

This is the **prerequisite for everything else in this document.**

### Options

1. **Skip semantic repair entirely on evolution.** Simple, but loses genuine gap-filling
   (a tier that adds a field with no displacement should still get one).
2. **Make every rule gap-fill-only, always.** Cleanest conceptually, but weakens one-shot
   generation, which is currently the main quality lever.
3. **Mode parameter.** Two behaviours, selected by caller.

### Recommendation — Option 3

Add `SemanticRepairMode = 'FIRST_GENERATION' | 'EVOLUTION'`, threaded exactly as
`isHeadlessMode` already is through `sanitizeAbilitySchema` → `repairAbilitySemantics`.

- `FIRST_GENERATION` — current behaviour, unchanged.
- `EVOLUTION` — gap-fillers only (Rules A, B, `ensureProjectileTriggerDisplacement`,
  `ensureDisplacementSemantics`). Rules E, F, G, H, I, C's emitter overwrite,
  `repairImpulseSemantics`' direction overwrite, and `clampContinuousFieldStrength` are
  skipped.

Independently of mode, fix the two bugs that are wrong in *both* modes:

- `ensureFanEmitter` dropping `inheritVelocityRatio` and forcing `RADIAL` → `FAN`.
- `placementKey` returning an undiscriminated `'SPAWN_PROJECTILE'`, so structurally different
  spawns on `ON_HIT` and `ON_EXPIRY` collapse.

`EVOLUTION` should be the default for every re-entry path: evolution tiers, stat-modifier
application, preset reload, and inspector paste.

### Risk

Evolved spells could drift semantically — description says "pulls" but physics pushes,
because the rule that would have corrected it is skipped. Mitigated by the fact that
evolution starts from an already-repaired base; only the *delta* is unrepaired.

### Verification

Round-trip regression test in [`scripts/test-physics-invariants.ts`](../../scripts/test-physics-invariants.ts),
which already has the right harness shape (`assertGroundBounceDamping`,
`assertBallisticArcTrajectorySampling`):

> Take `clusterMortar`, attach evolved flavor text containing `ring`, `burst`, and `self`, run
> `sanitizeAbilitySchema(..., 'EVOLUTION')`, assert: parent still `BALLISTIC_ARC`;
> `ON_AIR_APEX` node present; child `bounces >= 1`; no field forced to `CASTER_ONLY`.

Fails today in any mode. This is the single most valuable test to add.

---

## §2 — Composable motion

### Problem

Player intent is additive — *"splitting homing needles"*, *"orbiting bouncing shields"*,
*"a fireball that also arcs"* — but `trajectory.type` selects exactly one motion model. An
Evolution Tree is inherently additive, so this mismatch bites hardest exactly where we're
heading.

Separately, there is no way to express *unpredictable* motion: a bazooka missile that
struggles, wobbles, or accelerates. `updateLinear` re-derives velocity from a fixed angle each
frame, so there is no acceleration model at all.

### Options

1. **Add trajectory enum values** (`SPIRAL_WAVE`, `BOUNCE_SURFACE`, …). Rejected — see
   [`05`](05-open-questions.md).
2. **Full motion-graph rewrite.** Correct long-term, disproportionate now.
3. **Decouple vertical physics + add a modifier block.** Two contained changes.

### Recommendation — Option 3, in two parts

**Part A — decouple vertical kinematics from the type enum.**

Exactly two gates bind them ([`01`](01-engine-capabilities.md) §"Vertical physics is
orthogonal"):

- `initBallisticKinematics` is called only when `type === 'BALLISTIC_ARC'`
  ([`actions.ts`](../../src/primitives/interpreter/actions.ts) L125,
  [`Interpreter.ts`](../../src/primitives/interpreter/Interpreter.ts) L113).
- Apex events fire only from `updateBallisticArc`
  ([`Trajectories.ts`](../../src/primitives/Trajectories.ts) L263).

Change the first to trigger on the *presence of ballistic parameters* rather than the type,
and hoist apex detection into a shared post-update check. `PhysicsWorld.integrateProjectile`
already handles gravity, bounce, restitution, and friction type-agnostically, so homing
mortars and bouncing boomerangs largely come for free.

**Part B — optional motion modifiers on `TrajectoryConfig`.**

```ts
motion?: {
  wobble?:     { amplitudeDeg: number; frequencyHz: number; decay?: number };
  jitter?:     { magnitude: number };
  drift?:      { lateralAccel: number };
  spiral?:     { radius: number; frequencyHz: number };
  speedCurve?: { startScale: number; rampMs: number };   // "struggling missile"
}
```

Applied as a post-pass after the existing switch in `updateTrajectory`. Because `updateLinear`
overwrites `vel` each frame, modifiers must perturb `aimAngle` or post-adjust `pos`/`vel`
after the switch returns — not before.

The bazooka case is then: low `speed`, `speedCurve` ramp, `wobble` with `decay`.

### Risk

- Some motion pairings will be incoherent (`RETURN_TO_SOURCE` + bounces). Gate exposure in the
  prompt grammar rather than in the engine; let the engine permit it and the grammar not
  suggest it.
- Budget scoring does not currently account for modifiers, so they are free power until
  `score.ts` is updated.
- Combined motion increases entity lifetime variance, pressing on `MAX_ENTITIES`.

### Verification — determinism is a hard requirement

**Modifiers must use seeded per-projectile noise, never `Math.random()`.** If motion is truly
random, the preview and the live cast diverge, and two clients see different flight paths.
Note `recordSpellPlayback` seeds `Math.random` globally during its sandbox run
([`InspectorPlaybackSim.ts`](../../src/draft/InspectorPlaybackSim.ts) L383), which would mask
the problem in preview while leaving live play inconsistent. Derive noise from
`(projectileSeed, elapsedMs)` instead.

Test: run the same schema through `recordSpellPlayback` twice and assert identical frames;
then run a headless cast twice and assert identical positions.

---

## §3 — Layered VFX

### Problem

`visuals` exposes three enums. The LLM can only recombine ten impacts, ten trails, ten styles —
it cannot invent a look. For a game whose premise is generative novelty, the visual layer is
the most visible place that premise fails.

Meanwhile `triggerImpactBurst` shows every enum value is already a composition of four
parameterized primitives ([`01`](01-engine-capabilities.md) §"Visual vocabulary").

### Options

1. **Add more enum values.** Linear effort, bounded payoff.
2. **LLM-generated shaders.** Unbounded, unsafe, unpredictable cost.
3. **Expose the existing primitives as an optional layer stack.**

### Recommendation — Option 3

```ts
impactLayers?: Array<{
  kind: 'RING' | 'FLASH' | 'STREAK' | 'SPARKS';
  count?: number;      // streaks/sparks
  size: number;
  speed?: number;
  lifetime: number;
  thickness?: number;  // rings
  spreadDeg?: number;
  colorRef: 'PRIMARY' | 'SECONDARY';
  layer: 'CORE' | 'PRIMARY' | 'SECONDARY';
}>;
```

`impactVfx` stays as the default preset; `impactLayers` overrides when present. Same pattern
for trails once impacts are proven.

Two constraints to design in from the start:

- **Cap total spawns per stack** against the existing tiered `particleBudget`
  (`getTierLimits()`), or a tier-5 spell will tank frame rate on LOW.
- **Colors as references, not free hex.** Keeps evolved spells visually coherent with their
  parent instead of degenerating into confetti.

### Risk

Performance is the main one, addressed by the budget cap. Secondary: the LLM producing
visually incoherent stacks — mitigated by keeping the presets and asking for layers only when
a spell is "unusual".

### Verification

Extend the invariant harness with a particle-count assertion: build a maximal legal layer
stack, spawn it, assert active particle count stays under `getTierLimits().particleBudget` on
the LOW tier.

---

## §4 — Evolution Tree architecture

### Problem

A tree that only offers LLM-generated mutations is slow (network latency per node),
unpredictable in a bad way (can fail validation), and hard to test. It also collides with the
budget curve: power accumulates, and `balanceAbilitySchema` converts power into **cooldown and
self-knockback**, so a heavily evolved spell becomes slower to cast and can eject its own
caster into the lava.

### Options

1. **Purely generative tree.** Maximum surprise, worst latency and reliability.
2. **Purely hardcoded tree.** Reliable, but abandons the premise.
3. **Two-track tree.**

### Recommendation — Option 3, plus a modifier layer and tier-aware budget

**Two tracks.** *Stat nodes* are deterministic, instant, and safe (cooldown reduction, bigger
projectiles, faster speed, +1 bounce, +1 emitter count). *Mechanic nodes* are LLM-generated
and unpredictable. Stat nodes give the player something to click while a generative branch
compiles in the background, and give you a reliable testing backbone.

**Model the tree as base + ordered modifiers, not as a mutated schema.**

```ts
interface SpellModifier { field: string; op: 'ADD' | 'MULTIPLY' | 'SET'; value: number; }
// resolved spell = applyModifiers(balanceAbilitySchema(baseSchema), modifiers)
```

This mirrors the existing `PassiveModifierPayload` shape (`{ stat, op, value }`). Keeping the
list separate makes the tree inspectable, reversible, and re-derivable when balance numbers
change or a branch is regenerated.

**Apply modifiers *after* balancing.** `balanceAbilitySchema`
([`balance.ts`](../../src/ai/budget/balance.ts) L90) **overwrites** `cooldownMs` and
`recoilKick` from the power score:

```ts
clamped.cooldownMs = Math.max(budget.minCdMs,
  Math.round((totalPower / budget.targetPower) * budget.baseCdScale));
clamped.recoilKick = Math.max(0, Math.round(totalPower / 2.5));
```

A "−20% cooldown" modifier applied before balance simply vanishes.

**Make the budget tier-aware.** Scale `targetPower` with evolution tier so cooldown stays
roughly flat as power grows, and clamp `recoilKick` independently of power. The current curve
is correct for a competitive game and backwards for a fun-first one.

**Surface the ceilings.** `MAX_DEPTH = 3`, `MAX_ENTITIES = 256`, and the `clampSchemaValues`
caps all fail silently ([`01`](01-engine-capabilities.md) §"Composition limits"). For a game
selling "your crazy idea works", silent truncation is the worst outcome. Either refuse to
offer an upgrade that cannot fit, or show saturation in the card UI.

### Risk

Tier-aware budgets weaken balance — acceptable given the stated design goal, but it should be
a conscious decision, not a side effect. See [`05`](05-open-questions.md) Q5.

### Verification

Simulate a six-tier evolution in the headless harness: apply a scripted modifier sequence,
assert at each tier that (a) the `ON_AIR_APEX` structure survives, (b) cooldown stays within a
target band, (c) `recoilKick` stays below the self-eject threshold, (d) no silent entity-cap
truncation occurs during a standard cast.

---

## §5 — Spell Designer

### Problem

Player-authored spells are the natural end state of a generative game. The request is a visual
editor with drawn trajectories and if/then sequencing.

### Recommendation — split it, and start with the half that already exists

**The if/then half is a UI over the current schema, not new engine work.** The canonical
example maps one-to-one:

| Player statement | Schema |
|---|---|
| "if I fire, then bounce" | `trajectory.bounces` |
| "if it bounces, then split into 6" | `ON_BOUNCE` → `SPAWN_PROJECTILE`, `emitter.count: 6` |
| "if it hits, then explode" | `ON_HIT` → `SPAWN_FIELD` `RADIAL_IMPULSE` |

That is `clusterMortar` with a different count. The interpreter already executes arbitrary
nesting, and [`jsonTab.ts`](../../src/devtools/inspector/jsonTab.ts) already ingests
hand-authored JSON through the same sanitize path an editor would use.

**Build the read-only node graph early, as an inspector view.** It costs little and closes the
visibility gap that produced this entire audit — a graph showing `LINEAR` where
`BALLISTIC_ARC` was authored would have made RC-1 obvious immediately. It is a debugging tool
first and the editor's foundation second.

**Drawn trajectories are genuinely new work.** A spline/polyline trajectory needs control
points, arc-length parameterization so speed stays sane along the curve, a caster-relative vs
world-space decision, and interaction rules with bounces, homing, and budget scoring. It also
raises a balance question (a drawn path that curves around cover is strong) and a heavier
serialization payload. Correctly filed last — and it benefits from §2 landing first, since
"drawn path + wobble" is most of what people actually want from custom motion.

### Risk

An editable graph lets players author schemas that fail validation in ways the LLM path never
produces. The read-only-first sequencing defers that risk entirely.

### Verification

Round-trip: schema → graph → schema is the identity function for all presets in
[`Presets.ts`](../../src/devtools/Presets.ts).

---

## §6 — Single source of truth for the spell vocabulary

### Problem

The vocabulary is hand-maintained in six places plus a stale seventh
([`01`](01-engine-capabilities.md) §"Known vocabulary drift"). RC-1 is exactly what drift looks
like, and a second live instance exists today (`ActionType` missing `LAUNCH_VERTICAL` and
`SET_GRAVITY_SCALE`). Every capability added by §2, §3, and §4 multiplies this surface.

### Recommendation

Generalise the guard that already exists. `abilityResponseSchema.ts` (L417) throws at module
load if any `ACTION_TYPES` member lacks a schema branch. Extend that pattern to trajectory
types, trigger types, field types, and visual enums, so a missing sanitizer case or schema
branch becomes a startup error rather than a silent downgrade.

Longer term, derive the JSON response schema, the sanitizer whitelists, and the prompt's
grammar section from the same constants. Prompt text is the hardest to derive and the most
valuable — it is where RC-5's ambiguity lives.

### Risk

Full derivation is a large refactor that touches [`../ARCHITECTURE.md`](../ARCHITECTURE.md)'s
barrel/shell boundaries. The build-time guards are cheap and can land independently; treat
derivation as optional.

### Verification

Deliberately remove a trajectory type from one whitelist and confirm the build fails.

---

## §7 — Preview fidelity

### Problem

Two preview systems with different fidelity ([`01`](01-engine-capabilities.md) §"Preview and
aiming"). The inventory preview runs the real interpreter and is faithful to *behaviour*, but
shows no particles at all — `runSandboxSimulation` never calls `setParticleSystem`. The live
aiming indicator uses closed-form formulas and traces only the root cast.

Once §2 and §3 land, both gaps widen: the aiming path cannot express modified motion, and the
preview cannot show generated VFX. Players choose upgrades based on how things look.

### Recommendation

**Keep the inventory preview and extend it.** Add a recording `ParticleBackend` implementation
alongside `Canvas2DBackend` and `WebGLBackend`, capturing particle spawns into the existing
frame structure. The preview then inherits real VFX with no change to surrounding code.

**Move the aiming indicator to a short headless rollout.** The closed-form approach structurally
cannot cover combinations — every new mechanic needs a new formula. A rollout is correct by
construction for anything the engine can execute, including nested clusters and bounce hops.
Cache on `(abilityId, quantizedAimAngle)` and recompute only on material change; reuse the
seeding trick for determinism.

### Risk

Per-frame cost while aiming. Mitigated by caching and a low tick count; `recordSpellPlayback`
already caches by spell id and terminates early via `EARLY_EXIT_TAIL_FRAMES`.

### Verification

Assert the rollout-based aiming path for `clusterMortar` contains at least two distinct
projectile groups (parent + apex children) and at least one bounce, and that generating it
twice yields identical points.

---

## §8 — Melee and close combat

### Problem

The arena favours ranged play, but the design premise is freedom: a player should be able to
build a piston, a sword, or bare hands and have it work. Today they cannot describe one, and
the pieces that exist are unreachable from the schema
([`01-engine-capabilities.md`](01-engine-capabilities.md) §"Close combat"):

- Hit regions are circles only — no directional arc.
- `attachToSource` offsets are world-space, so a hitbox cannot track a turning player.
- Ram and slam collisions are computed and logged but dispatch no trigger, so no spell can
  react to body contact.
- The casting model has no commitment — no windup, no active window, no recovery — and
  commitment is precisely what makes melee interesting rather than "a gun with 50 range".

### Options

1. **A melee subsystem** — weapon entities, reach stats, attack-state machine. Rejected: it
   carves melee out as a category the LLM must be taught separately, and nothing else in the
   game can borrow from it.
2. **Reuse `CHARGE_AND_RELEASE` for windup.** Insufficient — it is a magnitude scaler with no
   active window and no post-cast state ([`01`](01-engine-capabilities.md) §"Casting model").
   Melee built on it is a short-range charged shot, which players can already approximate.
3. **Three orthogonal additions** that any spell can use.

### Recommendation — Option 3, in three parts

**Part A — a contact trigger. Do this first; it is nearly free.**

Add `ON_RAM` (entity contact) and optionally `ON_SLAM` (wall/obstacle contact), queued the same
way bounces already are. The dispatch site at
[`PhysicsWorld.ts`](../../src/engine/PhysicsWorld.ts) L929 already computes rammer, target,
closing speed, and knock direction, and already writes a telemetry record — it needs a
`pendingRamEvents` queue alongside `pendingBounceEvents`, plus a dispatch block in
[`lifecycle.ts`](../../src/primitives/interpreter/lifecycle.ts) mirroring the `ON_BOUNCE` one
(which already supports node-level filtering via `minBounceSpeed`; `minRamSpeed` is the direct
analogue).

This alone makes bare-hands builds *composable*: charge into someone and trigger a field, a
stasis, a vertical launch. No schema surgery beyond one trigger enum value and its whitelist
entries.

**Part B — angular hit regions.**

Add an optional arc constraint to `FieldConfig`:

```ts
arcDeg?: number;        // 0–360; omitted or 360 = current radial behaviour
arcFacing?: 'CASTER_FACING' | 'CAST_HEADING' | 'FIXED';
arcOffsetDeg?: number;
```

Implementation is one dot-product test in `applyField` alongside the existing distance check,
plus rotating `offset` by the parent's `facingAngle` in `SpatialZone.update` when
`arcFacing === 'CASTER_FACING'`. Gate the rotation behind the new field so existing world-space
offsets keep working.

Together with Part A this is the whole unlock for swords and pistons: a swing is a
short-duration, caster-attached, arc-constrained `RADIAL_IMPULSE`.

**Part C — timing phases as a fourth composable axis.**

Not a new `InputProfile` mode. Optional properties that compose with *every* existing mode:

```ts
windupMs?: number;      // delay before ON_CAST dispatches; telegraph
activeMs?: number;      // how long the hit region stays live
recoveryMs?: number;    // committed vulnerability window after
moveScale?: { windup?: number; active?: number; recovery?: number };
cancelable?: boolean;   // may recovery be interrupted
```

| Composition | Result |
|---|---|
| `INSTANT` + windup/active/recovery | Sword swing |
| `CHARGE_AND_RELEASE` + long recovery | Heavy slam with real whiff punishment |
| `COMBO_CHAIN` + short recovery | Three-hit combo string |
| `CHANNELED` + windup | Spin-to-win that spools up |
| `INSTANT` + windup only | Telegraphed *ranged* shot — no melee involved |

The last row is the argument for this shape over a melee mode: phases are useful to spells that
have nothing to do with close combat, and melee stops being a category the engine must know
about. Melee becomes region shape + timing + contact trigger, all of which the Evolution Tree
already knows how to mutate.

### Risk

Part C is the expensive one. It needs a per-caster action state machine (today the only
"cannot act" states are slot cooldown, resource lockout, and stasis) and a delayed `ON_CAST`
dispatch, which `Interpreter.executeAbility` currently performs synchronously. `moveScale` needs
to write `Player.moveSpeed` — `applyModifyStat` already does exactly that, so there is
precedent for the write path but not for reverting it on phase exit.

Secondary: melee shortens engagement range, which interacts with arena shrink and lava
positioning in ways that only playtesting will surface.

### Verification

Phase durations are a pure feel question, so prototype before hardening. A projectile parented
to the caster is already a timer carrier with `ON_TICK`/`ON_EXPIRY`, so windup → active →
recovery can be faked entirely in schema and playtested before any engine work
([`01`](01-engine-capabilities.md) §"Casting model").

For Part A, the headless harness can assert it directly: drive a caster into a dummy above
`RAMMING_SPEED_THRESHOLD`, assert an `ON_RAM` node dispatches exactly once and its actions
resolve against the rammed target.

---

## §9 — VFX addressability and impact scaling

### Problem

Two separate complaints, one root cause.

**Spells cannot have their own look per moment.** `VisualDescriptor` carries a single
`impactVfx`, so one projectile uses the same effect for hit, expiry, bounce, and apex. Worse,
the three newest projectile events — apex, bounce, ram — have **no visual binding at all**
([`01-engine-capabilities.md`](01-engine-capabilities.md) §"Reactive feedback and event
bindings"). A cluster mortar's defining moments are currently silent on screen.

**Impact does not scale with power.** Intensity is decided three different ways depending on the
channel: ripple radius is derived and continuous, shake and burst scale are *authored* (the LLM
guesses absolute values with no sense of relative power), and reactive blur/glitch/shock are
**binary** — `reactiveFx.pulse` takes an `isHeavy` boolean quantized at a hardcoded instability
threshold of 25. So a tier-6 evolved ultimate lands with exactly the same screen response as a
basic secondary that happened to cross the same threshold.

### Options

1. **Hardcode a particle call at each new event site.** Cheap per event, but every future
   mechanic (`ON_RAM`, melee phases, motion modifiers) needs another one, and spells can never
   author their own look.
2. **Widen the `impactVfx` enum and add more authored `vfx` params.** Keeps calibration in the
   LLM's hands, which is where it currently fails.
3. **Make VFX schema-addressable and derive intensity from power.**

### Recommendation — Option 3, in three parts

**Part A — bind the unbound events. Do this first regardless of the rest.**

Add particle calls for apex, bounce, and (once §8 Part A exists) ram, in the same place the
existing hit and slam bindings live. Two call sites, immediate improvement to every ballistic
spell in the game. This is a bug fix, not architecture.

**Part B — a `PLAY_VFX` action.**

Make visuals reachable from the trigger tree the same way physics is:

```ts
{ type: 'PLAY_VFX', vfx?: ImpactVfx, layers?: VfxLayer[], scale?: number, target?: ActionTarget }
```

Any trigger can then carry its own visual — a soft puff on `ON_AIR_APEX`, a dust scuff on
`ON_BOUNCE`, a hard detonation on `ON_HIT`, a telegraph during a melee windup. New triggers
inherit visuals for free with no renderer change, and the LLM authors visuals *per moment*
rather than picking one impact for the whole spell. Composes directly with the layer stack from
§3: `vfx` selects a preset, `layers` overrides it.

The `LifecycleFx` interface ([`lifecycle.ts`](../../src/primitives/interpreter/lifecycle.ts)
L99) is the natural seam — it already abstracts decals, ripples, shake, and hitstop behind live
and headless implementations.

**Part C — one derived intensity signal, with the schema as a multiplier.**

Compute a normalized `impactIntensity` from two inputs and feed every channel from it:

- **Static scope**, known at cast time. `scoreAbilitySchema`
  ([`score.ts`](../../src/ai/budget/score.ts)) already quantifies spell power — it recurses
  through nested spawns, multiplies by emitter count, and weighs field radius × duration.
  Normalizing against `CATEGORY_BUDGETS[category].targetPower` yields "how big is this spell for
  its slot". It is currently used only for cooldown and recoil.
- **Runtime impact**, per event. Already measured: instability delta, projectile speed, target
  effective mass, plasma detonation, vertical impact speed, ram closing speed.

Scope sets a floor, impact sets the punch — a big spell always reads big, and a solid connection
reads better than a graze. Then widen `reactiveFx.pulse` to accept a number and lerp between the
existing `Light`/`Heavy` tuning values instead of selecting one; the tuning struct is already the
right shape.

**Invert the authored parameters.** `vfx.shakeIntensity` and `vfx.impactScale` should become
multipliers on the derived baseline, not absolute values. `shakeIntensity: 1.4` means "40%
punchier than a spell this size normally is." Generated spells then get correct weight
automatically, and authored values become stylistic flavour — which is what the LLM is good at.

Because the Evolution Tree raises the power score as it grows, evolved spells scale their screen
presence for free.

### Risk

**Saturation.** Power score grows fast with nesting, so a linear mapping produces permanent
full-screen glitch and an unreadable game at high tiers. Needs an asymptotic or log curve — the
same headroom problem as the budget ceilings in §4. See
[`05-open-questions.md`](05-open-questions.md) Q12.

**Performance.** Derived intensity must multiply *into* `getTierLimits().particleBudget`, never
bypass it, or evolved spells will tank LOW-tier machines.

**Shake fatigue.** Shake scaling with power becomes nauseating faster than blur or particle
count. Note a user preference already exists and is honoured —
`screenShake.trigger` multiplies by `getGraphicsSettings().screenShakeIntensity` and
early-returns at zero — so the gate is present; it may want a lower internal cap than the other
channels.

**User toggles stay authoritative.** `hitFeedbackConfig` is a set of booleans. Scaling decides
how much, never whether.

### Verification

Assert monotonicity rather than absolute values, since the mapping is a tuning question: score a
basic `PRIMARY` preset and a nested `ULTIMATE` preset, and assert derived intensity is strictly
greater for the ultimate while both remain within the tier particle budget on LOW. For Part A,
assert `clusterMortar` produces at least one particle spawn at apex and one per bounce in a
headless run with a recording backend (§7).

### Note on identity versus weight

These are orthogonal axes and both are needed. **Identity** — a unique look — comes from §3
layers plus Part B addressability. **Weight** — feeling as strong as it is — comes from Part C.
A distinctive spell with wrong weight feels floaty; a correctly weighted spell drawn from ten
presets feels generic. They compose: a unique layer stack whose every layer scales with
intensity.

---

## Suggested sequencing

| Phase | Work | Why here |
|---|---|---|
| 1 | RC-1 one-line fix + round-trip invariant test | Smallest change, biggest unlock, creates the regression net |
| 2 | §9 Part A — bind apex/bounce visuals | Pure bug fix, independent of everything, immediately improves every ballistic spell |
| 3 | §1 semantic repair modes + the two mode-independent bugs | Prerequisite for the tree; nothing after it is safe without it |
| 4 | §2 composable motion (Part A, then Part B) | Large expressive gain, contained change |
| 5 | §8 Part A — contact trigger | Cheapest new capability in this document; unlocks a whole build archetype |
| 6 | §7 preview fidelity | Makes later phases visible and therefore verifiable |
| 7 | §3 layered VFX **+** §9 Part B — `PLAY_VFX` | These compose; layers give the vocabulary, `PLAY_VFX` gives the addressing |
| 8 | §9 Part C — derived impact intensity | Needs the layer stack to scale; wants §4's tier decision settled |
| 9 | §8 Part B — angular hit regions | The unlock for weapon-shaped melee |
| 10 | §4 evolution tree (stat nodes first, then generative) | Depends on 1–9 |
| 11 | §8 Part C — timing phases | Largest engine change in the melee set; prototype in schema first |
| 12 | §5 read-only node graph | Useful from phase 1 onward; slot in whenever convenient |
| 13 | §5 drawn trajectories | Genuinely optional |

§6's build-time guards are independent and can land at any point; earlier is better, since
each subsequent phase adds vocabulary.

Each phase is independently verifiable in the inspector, and none requires the Evolution Tree
to exist yet.
