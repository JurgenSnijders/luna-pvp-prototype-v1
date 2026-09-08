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

Three of the four capabilities we want already have a composable substrate sitting underneath
a non-composable enum:

| Want | Substrate that already composes | Enum blocking it |
|---|---|---|
| Combined motion (homing + bouncing) | `PhysicsWorld.integrateProjectile` handles z/bounce for *any* projectile | `trajectory.type` is exclusive |
| Novel visual effects | `spawnRing` / `spawnFlash` / `spawnStreak` / `burstSparks` | `impactVfx` is one of ten |
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

## Suggested sequencing

| Phase | Work | Why here |
|---|---|---|
| 1 | RC-1 one-line fix + round-trip invariant test | Smallest change, biggest unlock, creates the regression net |
| 2 | §1 semantic repair modes + the two mode-independent bugs | Prerequisite for the tree; nothing above it is safe without it |
| 3 | §2 composable motion (Part A, then Part B) | Large expressive gain, contained change |
| 4 | §7 preview fidelity | Makes phases 3 and 5 visible and therefore verifiable |
| 5 | §3 layered VFX | Same architectural pattern as §2; cheaper once §2 is done |
| 6 | §4 evolution tree (stat nodes first, then generative) | Depends on 1–5 |
| 7 | §5 read-only node graph | Useful from phase 1 onward; slot in whenever convenient |
| 8 | §5 drawn trajectories | Genuinely optional |

§6's build-time guards are independent and can land at any point; earlier is better, since
each subsequent phase adds vocabulary.

Each phase is independently verifiable in the inspector, and none requires the Evolution Tree
to exist yet.
