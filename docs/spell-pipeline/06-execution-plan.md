# 06 — Execution Plan (Runbook)

> **Kind:** Executable runbook. This is the entry point for implementation work.
> **Read this file first.** Docs 01–05 are reference; you do not need to read them all before
> starting. Each phase below names the specific sections it depends on.

---

## How to use this document

Work **one phase at a time**, in order. Each phase is written to be executable from a **cold
start** with no memory of previous phases or conversations — because switching between Agent
and Plan mode starts a fresh context window in Cursor, and you will be working across
sessions and machines.

To start a phase, open a new chat and say:

> Execute Phase N from `docs/spell-pipeline/06-execution-plan.md`. Follow the standing rules
> in that file. Do not ask me questions unless you hit a listed Stop-if condition.

### Standing rules for the executing agent

1. **Decisions are already made.** Section "Pre-decided decisions" below settles every design
   question that would otherwise block you. Do not re-open them. Do not ask which option to
   pick. If implementation reveals a decision is *wrong* (not merely debatable), stop and say
   so with the specific contradiction.
2. **Do not ask permission to proceed.** Read the phase, do the work, run the gate, report.
3. **Do not use browser tools, screenshots, or in-page CDP.** The user tests in the browser
   themselves. After implementation: run the acceptance gate, summarize what changed, stop.
4. **Scope discipline.** Touch only the files listed in the phase. If a change seems to require
   a file not listed, that is a Stop-if condition.
5. **One phase per commit.** Commit message format: `phase N: <short description>`.
6. **Never regenerate a snapshot unless the phase explicitly says to.** See "Snapshot policy".
7. Respect [`../ARCHITECTURE.md`](../ARCHITECTURE.md) principles — especially barrel/shell
   import stability and "the contract is JSON" (schema changes must update validators,
   sanitizers, interpreter, and VFX in sync).

### Mode and model per phase

| Phase | Cursor mode | Model tier | Why |
|---|---|---|---|
| 0 Pre-flight | Agent | Fast | Mechanical verification |
| 1 RC-1 fix + invariant | Agent | Fast | Fully specified, one-line change plus a test |
| 2 Bind apex/bounce VFX | Agent | Fast | Two call sites, pattern already exists to copy |
| 3 Semantic repair modes | **Plan → Build** | **High reasoning** | 14 passes, subtle behaviour, snapshot impact |
| 4 Composable motion A | Agent | Mid | Contained, but touches shared trajectory code |
| 5 `ON_RAM` trigger | Agent | Mid | Follows the `ON_BOUNCE` pattern exactly |
| 6 Preview fidelity | **Plan → Build** | High reasoning | Architectural choice inside the render path |
| 7 Layered VFX + `PLAY_VFX` | **Plan → Build** | **High reasoning** | New action type across six vocabulary sites |
| 8 Derived impact intensity | Agent | Mid | Specified formula; tuning is a slider |
| 9 Angular hit regions | Agent | Mid | One dot-product test plus offset rotation |
| 10 Evolution Tree | **Plan → Build** | **High reasoning** | Largest feature; needs its own plan |
| 11 Timing phases | **Plan → Build** | High reasoning | New caster state machine |
| 12 Node graph (read-only) | Agent | Mid | Self-contained inspector view |
| 13 Drawn trajectories | Plan → Build | High reasoning | Optional |

**Model guidance.** "High reasoning" means the strongest thinking model available to you —
in this environment `claude-opus-5-thinking-max` or `cursor-grok-4.6-xhigh`. "Mid" and "Fast"
mean `composer-2.5` and `composer-2.5-fast` respectively. If those exact names are unavailable
on your machine, substitute by tier: strongest reasoning model for High, default agent model
for Mid, fastest model for Fast.

**On Plan mode.** Plan mode researches the codebase and produces a single plan document, then
you press **Build** to execute it. Use it for the phases marked above: they involve genuine
architectural choices where reviewing the approach before code is cheaper than reverting.
Note that Plan mode's output lives in Cursor's plans location, not in this repo — use
**Save to workspace** if you want to keep it.

**On external review.** Do not send docs 01–05 out for general review; the design is settled.
Bring in an outside model only at the checkpoints marked **Review gate** below, and only with
the specific question stated there.

---

## Pre-decided decisions

These resolve the open questions in [`05-open-questions.md`](05-open-questions.md) for
execution purposes. Recorded here so no phase blocks on them.

| Ref | Decision |
|---|---|
| Q1 | `FIRST_GENERATION` mode **only** for the initial LLM forge/compile from a raw player prompt. `EVOLUTION` everywhere else: evolution tiers, modifier application, preset load, inspector JSON paste, offline fallbacks. |
| Q2 | Accept semantic drift in `EVOLUTION` mode. Do not build provenance tracking. Unpredictability is on-brand. |
| Q3 | `placementKey` for `SPAWN_PROJECTILE` becomes `SPAWN_PROJECTILE:${trajectory.type}:${emitter?.count ?? 1}`. `CAST_CHILD_PAYLOAD` becomes `CAST_CHILD_PAYLOAD:${payload.id}`. |
| Q4 | Ceilings stay as they are for now. Do **not** raise `MAX_DEPTH` or `MAX_ENTITIES` in these phases. Surfacing saturation in UI is deferred to Phase 10. |
| Q5 | Budget becomes tier-aware in Phase 10 only. Earlier phases leave `balance.ts` cooldown/recoil formulas untouched. |
| Q6 | Evolution Tree stores **hybrid**: stat nodes as modifiers, mechanic nodes as resolved schemas. |
| Q7 | Assume **local-only** for now, but implement seeded per-projectile noise anyway (Phase 4). No global `Math.random` patching outside the existing preview sandbox. |
| Q8 | `ON_AIR_APEX` + `SPAWN_PROJECTILE` is the canonical cluster pattern. Prompt changes are deferred until after Phase 3. |
| Q10 | `ON_RAM` is **rammer-owned**, fires without arming, supports node-level `minRamSpeed`. Summons included. |
| Q12 | Intensity curve is asymptotic `x / (x + k)`, per-channel response curves, exposed as devtools sliders. Shake gets a lower ceiling than blur/glitch. |
| Q13 | `PLAY_VFX` is an **action** with **zero budget cost** — add an explicit `case 'PLAY_VFX': return 0;` in `score.ts` so flashier visuals never raise cooldown. |

---

## Acceptance gate

Run after **every** phase. From [`../ARCHITECTURE.md`](../ARCHITECTURE.md):

```bash
npx tsc --noEmit
npm run test:schemas
npm run test:offline
npm run test:interpreter
npm run test:settings
npm run test:render
npm run build
```

Additionally run these for phases touching physics, synthesis, or VFX:

```bash
npm run test:invariants
npm run test:fidelity
npm run test:audit-presets
```

A phase is **not complete** until the gate is green.

### Snapshot policy

Three harnesses compare against committed snapshots and accept `-- --update-snapshot`:

| Harness | Snapshot | Guards |
|---|---|---|
| `test:schemas` | `scripts/schema-scores.snapshot.json` | Preset power scores after sanitize |
| `test:interpreter` | `scripts/interpreter-casts.snapshot.json` | Headless cast entity counts (8 presets) |
| `test:render` | `scripts/render-helpers.snapshot.json` | Color helpers, sprite keys, spawn priority |

Update with `npm run <script> -- --update-snapshot`.

> **The `test:schemas` snapshot is stale at handoff** — it predates four vertical presets and
> therefore fails on a clean tree. Phase 0 refreshes it. Everything below assumes that has
> already happened.

**Expected snapshot movement per phase:**

| Phase | Expected? | Notes |
|---|---|---|
| 1 | **No** | The fix is in `llmRepair.ts`, which presets bypass. If `test:schemas` moves, something is wrong — investigate, do not update. |
| 2 | **No** | Particles are not entities; `test:interpreter` counts must not change. |
| 3 | **Yes — `test:schemas`** | Presets route through `sanitizeAbilitySchema` → `repairAbilitySemantics`. Giving presets `EVOLUTION` mode changes which rules fire, so scores move. Review the diff preset-by-preset before updating; a score moving *down* on a preset that previously got an injected field is expected and correct. |
| 4 | Possibly `test:interpreter` | Only if apex events now fire for non-ballistic trajectories. Verify intentional. |
| 5 | **No** | New trigger, no preset uses it yet. |
| 7 | Possibly `test:schemas` | Must **not** move if Q13 is implemented correctly (zero budget cost). If it moves, the scorer is charging for `PLAY_VFX`. |
| 8 | **No** | VFX intensity is not scored. |

When updating a snapshot, do it in the same commit as the change that caused it, and state
in the commit body why the movement is correct.

---

## Phase 0 — Pre-flight

**Mode:** Agent · **Model:** Fast

1. Confirm working tree state: `git status --porcelain`. Commit or stash anything unrelated
   before starting.
2. Run the full acceptance gate **before** changing anything, to establish a baseline.
3. Resolve the **known pre-existing failure** described below.
4. Record the current HEAD hash in your report so later phases can be diffed against it.

### Known pre-existing failure — `test:schemas`

Verified 2026-09-10 on a clean tree. This is **expected** and is not caused by any phase in
this runbook. Do not stop and ask about it.

```
test:schemas  FAIL  preset name mismatch
  extra: Cluster Mortar, Flak Cannon, Meteor Strike, Thermal Geyser
```

The four vertical presets exist in
[`presetPacks/verticalRecipes.ts`](../../src/devtools/presetPacks/verticalRecipes.ts) but were
never added to `scripts/schema-scores.snapshot.json`. The failure is *extra presets*, not
changed scores, so regenerating is a pure baseline correction:

```bash
npm run test:schemas -- --update-snapshot
npm run test:schemas
```

Commit that on its own as `phase 0: refresh schema score snapshot for vertical presets`.
Doing it as a separate commit matters: Phase 3 legitimately moves preset scores, and you want
to read that movement against a correct baseline rather than a stale one.

### Expected baseline after Phase 0

All of these were verified green on 2026-09-10:

| Command | Expected |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run test:schemas` | OK after the snapshot refresh above |
| `npm run test:offline` | `OK  5 offline generator checks passed` |
| `npm run test:interpreter` | `OK  8 casts  snapshot matched` |
| `npm run test:settings` | `OK  22 settings checks passed` |
| `npm run test:render` | `OK  15 render helper checks passed` |
| `npm run test:invariants` | `23/23 passed` |

**Stop-if:** any harness other than `test:schemas` is red before you change anything, or
`test:schemas` reports *score* differences rather than only the four extra preset names.

---

## Phase 1 — RC-1 fix + round-trip invariant

**Mode:** Agent · **Model:** Fast
**Rationale:** [`02-pipeline-audit.md`](02-pipeline-audit.md) RC-1.

### Files
- `src/ai/synthesizer/llmRepair.ts`
- `scripts/test-physics-invariants.ts`

### Change

In `llmRepair.ts`:

1. Add `'BALLISTIC_ARC'` to `VALID_TRAJECTORY_TYPES` (currently L308–314).
2. Add trajectory aliases mapping to `BALLISTIC_ARC` in `TRAJECTORY_ALIASES` (L293):
   `MORTAR`, `LOB`, `BALLISTIC`, `ARTILLERY`, `ARCING`.
3. In `repairTrajectoryConfig` (L459), extend the ballistic inference so intent is *recovered*,
   not merely preserved. The existing `isSkyDrop` branch is the pattern to follow — add a
   sibling condition: if `lobApex > 0` or `bounces > 0`, force `type = 'BALLISTIC_ARC'` even
   when the LLM emitted `LINEAR`. Do not touch the `isSkyDrop` branch itself.

In `test-physics-invariants.ts`, add an assertion function following the existing style
(`assertGroundBounceDamping` is the closest model):

```
assertClusterMortarSurvivesPipeline()
```

It must take `VERTICAL_RECIPES.clusterMortar`, attach evolved flavor text containing the words
`ring`, `burst`, and `self`, push it through `repairAbilityPayload` then
`sanitizeAbilitySchema` then `balanceAbilitySchema`, and assert:

- root `trajectory.type === 'BALLISTIC_ARC'`
- an `ON_AIR_APEX` trigger node still exists
- the apex node's `SPAWN_PROJECTILE` child has `projectileTrajectory.bounces >= 1`
- no `SPAWN_FIELD` has `affects === 'CASTER_ONLY'`

Wire it into `run()` alongside the other `assert*` calls **and increment `totalCases`** — the
line is `const totalCases = suite.length + N;` near the end of `run()` (N was 16 on
2026-09-10, and it changes whenever a case is added, so read the current value rather than
assuming). Forgetting this makes the reported pass count wrong even though every case passes,
and the script exits non-zero.

**This applies to every phase that adds an invariant.** It is the single easiest step to miss
in this harness.

### Expected result
The new assertion **fails on the last three checks even after this phase** — that is correct.
Phase 1 fixes only the trajectory type; the `ring`/`self` damage is Phase 3's job. Structure
the assertion so it reports which specific checks failed, and note in your report that the
remaining failures are expected until Phase 3.

If you prefer a green gate at every phase, split the assertion into
`assertClusterMortarTrajectorySurvives()` (Phase 1, must pass) and
`assertClusterMortarStructureSurvives()` (added in Phase 3).

### Acceptance
Full gate green, plus `npm run test:invariants` showing the new trajectory assertion passing.

**Stop-if:** `test:schemas` snapshot moves (see snapshot policy — it should not).

---

## Phase 2 — Bind apex and bounce visuals

**Mode:** Agent · **Model:** Fast
**Rationale:** [`01-engine-capabilities.md`](01-engine-capabilities.md) §"Reactive feedback and
event bindings"; [`04-upgrade-design.md`](04-upgrade-design.md) §9 Part A.

### Files
- `src/primitives/interpreter/lifecycle.ts`

### Change

Two event loops in `processLifecycleEvents` currently dispatch triggers with no visual:

- `world.pendingApexEvents` (L657)
- `world.pendingBounceEvents` (L671)

Add particle feedback to each, using the existing hit and expiry blocks as the pattern
(`interp.particles?.triggerImpactBurst(...)`, `interp.particles?.burstSparks(...)`,
`fx.ripple(...)`, `fx.decal(...)`).

Guidance on feel, since this is authored rather than derived until Phase 8:
- **Apex:** soft and airy. A small `burstSparks` plus a faint `expandingRing` at the projectile
  position. No shake, no decal, no hitstop — apex is not an impact.
- **Bounce:** a short scuff. Small `burstSparks` scaled by `event.impactSpeed`, and a ground
  decal only when `impactSpeed` is high. No shake on early bounces.

Route all world-persistent effects (`fx.decal`, `fx.ripple`) through the `LifecycleFx` interface
so headless runs stay clean — `HEADLESS_LIFECYCLE_FX` must remain a no-op.

### Acceptance
Full gate green. `test:interpreter` entity counts **must not change** — particles are not
entities. If they do, you have spawned a projectile or zone by mistake.

**Stop-if:** `test:interpreter` snapshot moves.

---

## Phase 3 — Semantic repair modes

**Mode:** **Plan → Build** · **Model:** High reasoning
**Rationale:** [`03-repair-rules-matrix.md`](03-repair-rules-matrix.md) in full, plus
[`04-upgrade-design.md`](04-upgrade-design.md) §1.

This is the most consequential phase in the runbook and the prerequisite for the Evolution
Tree. Read `03` completely before planning.

### Files
- `src/ai/budget/repair.ts`
- `src/ai/budget/sanitize/ability.ts`
- `src/ai/synthesizer/geminiClient.ts`
- `src/ai/synthesizer/compile.ts`
- `src/ai/synthesizer/llmRepair.ts` (call site only)
- `src/game/loadout.ts`
- `src/devtools/inspector/jsonTab.ts`
- `scripts/test-physics-invariants.ts`

### Change

1. Add `export type SemanticRepairMode = 'FIRST_GENERATION' | 'EVOLUTION';`
2. Thread it through `sanitizeAbilitySchema` → `repairAbilitySemantics` exactly as
   `isHeadlessMode` is already threaded. Default to `EVOLUTION` — the safe value — so any
   call site not updated fails safe rather than destructively.
3. Set `FIRST_GENERATION` explicitly at the two initial-generation call sites only
   (`geminiClient.ts` universal ability path, `compile.ts` compile path). Per decision Q1,
   everything else stays `EVOLUTION`.
4. In `EVOLUTION` mode, skip: Rule E (`applyRuleE_Orbit`), Rule F's trajectory delete,
   Rule G's trajectory delete, Rule H (`applyRuleH_Meteor`), Rule I
   (`applyRuleI_PersonalField`), `clampContinuousFieldStrength`, Rule C's emitter overwrite,
   and `repairImpulseSemantics`' `directionMode` overwrite. Keep Rules A, B,
   `ensureProjectileTriggerDisplacement`, `ensureDisplacementSemantics` in both modes.
5. Fix in **both** modes (these are bugs, not tradeoffs):
   - `ensureFanEmitter` (L335) — preserve `inheritVelocityRatio`; return the emitter unchanged
     when `count >= 2` regardless of `distribution`.
   - `placementKey` (L980) — apply decision Q3.
6. Add `assertClusterMortarStructureSurvives()` to the invariant harness (or complete the
   Phase 1 assertion), and bump `totalCases`.

### Acceptance
Full gate green **after** reviewing and updating `scripts/schema-scores.snapshot.json`. Expect
movement — see snapshot policy. Before updating, produce a short table of which presets moved
and why, and include it in your report.

**Review gate.** This is a good point for outside review. The specific question to ask:
*"Given this rule classification table and this mode split, are any of the rules I kept in
`EVOLUTION` mode actually destructive, or any I skipped actually necessary?"* Provide `03` and
the diff. Do not ask for a general review of the design.

**Stop-if:** more than 20 of 61 preset scores move, or any preset drops to a score of 0
(implies a collapse to the empty-schema fallback).

---

## Phase 4 — Composable motion, Part A

**Mode:** Agent · **Model:** Mid
**Rationale:** [`04-upgrade-design.md`](04-upgrade-design.md) §2 Part A;
[`01-engine-capabilities.md`](01-engine-capabilities.md) §"Vertical physics is orthogonal".

### Files
- `src/primitives/Trajectories.ts`
- `src/primitives/interpreter/actions.ts`
- `src/primitives/interpreter/Interpreter.ts`
- `scripts/test-physics-invariants.ts`

### Change

1. Replace the two `if (trajectory.type === 'BALLISTIC_ARC')` gates around
   `initBallisticKinematics` (`actions.ts` L125, `Interpreter.ts` L113) with a check for the
   *presence of ballistic parameters*: `lobApex`, `bounces`, `spawnAltitude`, `fallSpeed`, or
   `gravityScale` defined, **or** type is `BALLISTIC_ARC`.
2. Hoist apex detection out of `updateBallisticArc` (`Trajectories.ts` L261) into a shared
   post-switch check in `updateTrajectory`, so any projectile with vertical motion can fire
   `ON_AIR_APEX`.
3. Add an invariant asserting a `HOMING_SLERP` trajectory carrying `lobApex` and `bounces: 2`
   arcs vertically, bounces, and fires an apex event. Bump `totalCases`.

Do **not** add motion modifiers (`wobble`, `speedCurve`) in this phase — that is Part B and is
deliberately deferred; it needs the seeded-noise decision from Q7 and is easier once preview
fidelity (Phase 6) exists to see it.

### Acceptance
Full gate green. `test:interpreter` may move if any of the 8 snapshot presets gains apex
events; verify each change is intentional before updating.

**Stop-if:** any existing preset changes behaviour in a way you cannot explain.

---

## Phase 5 — `ON_RAM` contact trigger

**Mode:** Agent · **Model:** Mid
**Rationale:** [`04-upgrade-design.md`](04-upgrade-design.md) §8 Part A; decision Q10.

### Files
- `src/types/schema/types.ts` (`TriggerType`, `TriggerNode.minRamSpeed`)
- `src/types/schema/constants.ts` (`TRIGGER_TYPES`)
- `src/types/schema/validators/trigger.ts`
- `src/ai/budget/sanitize/trigger.ts` (valid trigger set + `minRamSpeed` clamp)
- `src/ai/synthesizer/abilityResponseSchema.ts` (`triggerNode` properties)
- `src/ai/synthesizer/prompts.ts` (trigger list + one recipe line)
- `src/engine/PhysicsWorld.ts` (queue + push at L929 site)
- `src/primitives/interpreter/lifecycle.ts` (dispatch block)
- `src/ai/budget/score.ts` (multiplier, mirror `ON_BOUNCE`'s 1.15)
- `scripts/test-physics-invariants.ts`

### Change

Mirror the `ON_BOUNCE` implementation end to end — it is the closest existing analogue and
already supports node-level speed filtering.

1. Add `pendingRamEvents: Array<{ rammer: Entity; target: Entity; closingSpeed: number; knockDir: Vector2D }>`
   to `PhysicsWorld`, cleared in the same two places the other pending queues are cleared
   (L540 and L605 regions).
2. Push to it from `applyRammingImpulse` (L417) or its call site (L929).
3. Dispatch in `processLifecycleEvents` following the `pendingBounceEvents` block (L671),
   filtering on `node.minRamSpeed`. Context: rammer is the source entity, target is
   `targetEntity`, origin is the contact midpoint, heading is `knockDir`.
4. Per Q10: rammer-owned, no arming required, summons included.
5. Add particle feedback while you are here (a directional impact ring plus sparks at the
   contact point) — ram currently has no visual at all.
6. Add an invariant driving a caster into a dummy above `RAMMING_SPEED_THRESHOLD` (350) and
   asserting the node dispatches exactly once. Bump `totalCases`.

### Acceptance
Full gate green. No snapshot movement expected — no preset uses `ON_RAM` yet.

**Stop-if:** the trigger fires more than once per collision, or fires for the target as well as
the rammer.

---

## Phase 6 — Preview fidelity

**Mode:** **Plan → Build** · **Model:** High reasoning
**Rationale:** [`04-upgrade-design.md`](04-upgrade-design.md) §7.

### Files (expect the plan to refine this)
- `src/render/backends/` (new recording backend)
- `src/draft/InspectorPlaybackSim.ts`
- `src/render/canvas/AimingIndicator.ts`
- `src/render/canvas/trajectoryTracer.ts`

### Change
Two independent pieces; the plan should sequence them:

1. **Recording particle backend.** `runSandboxSimulation` (`InspectorPlaybackSim.ts` L328)
   never calls `setParticleSystem`, so the preview shows no particles. Add a `ParticleBackend`
   implementation that records spawns into the existing `PlaybackFrame` structure.
2. **Rollout-based aiming.** Replace the closed-form path builders in `resolveLiveAimingPaths`
   with a short headless rollout, cached on `(abilityId, quantizedAimAngle)`. Keep
   `buildBallisticArcPath` exported — `test-physics-invariants.ts` asserts against it directly.

Note this file has uncommitted `startZ` work for elevated casting; preserve that behaviour.

### Acceptance
Full gate green, including `npm run test:render`. Assert the aiming path for `clusterMortar`
contains at least two distinct projectile groups and one bounce, and is identical across two
generations.

**Stop-if:** aiming cost exceeds ~2ms per frame in the worst case, or determinism fails.

---

## Phase 7 — Layered VFX + `PLAY_VFX`

**Mode:** **Plan → Build** · **Model:** High reasoning
**Rationale:** [`04-upgrade-design.md`](04-upgrade-design.md) §3 and §9 Part B; decision Q13.

Do these together — layers supply the vocabulary, `PLAY_VFX` supplies the addressing.

### Files
All six vocabulary sites must move in sync (see
[`01-engine-capabilities.md`](01-engine-capabilities.md) §"Known vocabulary drift"):
`types/schema/types.ts`, `types/schema/constants.ts`, `types/schema/validators/`,
`ai/budget/sanitize/`, `ai/synthesizer/abilityResponseSchema.ts`,
`ai/synthesizer/prompts.ts` — plus `ai/budget/score.ts`,
`primitives/interpreter/actions.ts`, and `render/backends/webgl/vfxRecipes.ts`.

### Change
1. Optional `impactLayers` on `VisualDescriptor`, composed from the four existing primitives
   (`spawnRing`, `spawnFlash`, `spawnStreak`, `burstSparks`). Colors as `PRIMARY`/`SECONDARY`
   references, not free hex. Cap total spawns against `getTierLimits().particleBudget`.
2. New `PLAY_VFX` action. Per Q13, add `case 'PLAY_VFX': return 0;` to `scoreAction` so it
   carries zero budget cost.
3. Extend the build-time coverage guard in `abilityResponseSchema.ts` (L417) — it already
   throws if an `ACTION_TYPES` member lacks a schema branch, which will catch a missed step.
4. While in `types.ts`: `ActionType` (L54–71) is missing `LAUNCH_VERTICAL` and
   `SET_GRAVITY_SCALE`. Fix that drift in this phase.

### Acceptance
Full gate green. `test:schemas` **must not move** — if it does, `PLAY_VFX` is being scored.

**Review gate.** Worth outside review. Ask specifically: *"Is this layer parameterization
expressive enough to produce visually distinct impacts, and are the budget caps sufficient to
prevent a tier-6 spell tanking a low-end machine?"*

**Stop-if:** the build-time guard throws and you cannot resolve it inside the listed files.

---

## Phase 8 — Derived impact intensity

**Mode:** Agent · **Model:** Mid
**Rationale:** [`04-upgrade-design.md`](04-upgrade-design.md) §9 Part C; decision Q12.

### Files
- `src/render/gl/reactiveFx.ts`
- `src/primitives/interpreter/lifecycle.ts`
- `src/ai/budget/score.ts` (read-only use of `scoreAbilitySchema`)
- `src/devtools/inspector/graphicsTab.ts` (tuning sliders)

### Change
1. Widen `reactiveFx.pulse(worldX, worldY, isHeavy: boolean)` to accept a `0..1` intensity and
   lerp between the existing `Light`/`Heavy` tuning values. Keep a boolean-compatible overload
   or update all call sites.
2. Compute `impactIntensity` from static scope (`scoreAbilitySchema` normalized against
   `CATEGORY_BUDGETS[category].targetPower`) and runtime impact (instability delta, projectile
   speed, closing speed). Scope sets the floor, impact the punch.
3. Apply the asymptotic curve `x / (x + k)` per Q12, with per-channel response and a lower
   ceiling for shake.
4. Invert the authored params: `vfx.shakeIntensity` and `vfx.impactScale` become multipliers on
   the derived baseline rather than absolute values.
5. Multiply into `getTierLimits().particleBudget`; never bypass it. `hitFeedbackConfig` booleans
   remain authoritative on/off. `screenShake.trigger` already honours
   `getGraphicsSettings().screenShakeIntensity` — keep that.
6. Expose the curve constant `k` and per-channel ceilings as devtools sliders.

### Acceptance
Full gate green. Assert monotonicity, not absolute values: a nested `ULTIMATE` preset must
produce strictly greater derived intensity than a basic `PRIMARY`, with both within the LOW
tier particle budget.

**Stop-if:** intensity saturates (reaches 1.0) for any preset in `PRESETS` — the curve constant
needs raising.

---

## Phase 9 — Angular hit regions

**Mode:** Agent · **Model:** Mid
**Rationale:** [`04-upgrade-design.md`](04-upgrade-design.md) §8 Part B.

### Files
- `src/types/schema/types.ts` (`FieldConfig`)
- `src/types/schema/validators/field.ts`
- `src/ai/budget/sanitize/action.ts`
- `src/ai/synthesizer/abilityResponseSchema.ts`
- `src/ai/synthesizer/prompts.ts`
- `src/primitives/Fields.ts`
- `src/entities/SpatialZone.ts`
- `src/render/canvas/` (zone rendering — arcs must draw as arcs)

### Change
1. Add `arcDeg?: number`, `arcFacing?: 'CASTER_FACING' | 'CAST_HEADING' | 'FIXED'`,
   `arcOffsetDeg?: number` to `FieldConfig`. Omitted or `360` preserves current behaviour.
2. In `applyField` (`Fields.ts` L105), add a dot-product angular test alongside the existing
   distance check.
3. In `SpatialZone.update` (L46), rotate `offset` by the parent's `facingAngle` when
   `arcFacing === 'CASTER_FACING'`. Gate behind the new field so existing world-space offsets
   are unchanged.
4. Update zone rendering so an arc field draws as a wedge, not a circle.
5. Add a melee recipe line to `prompts.ts`.

### Acceptance
Full gate green. Assert a 90° arc field affects a target in front of the caster and not one
behind, and that a `360`/omitted `arcDeg` behaves identically to today.

**Stop-if:** any existing preset's field behaviour changes.

---

## Phases 10–13 — Deferred, plan individually

These are large enough that each needs its own Plan-mode session. Do not start them until
Phases 1–9 are green and merged.

| Phase | Work | Reference |
|---|---|---|
| 10 | Evolution Tree — stat nodes first, then generative; tier-aware budget; surface ceilings | [`04`](04-upgrade-design.md) §4, decisions Q4–Q6 |
| 11 | Timing phases (windup/active/recovery) — prototype in schema first using a caster-parented projectile as a timer | [`04`](04-upgrade-design.md) §8 Part C, Q9 |
| 12 | Read-only node graph inspector view | [`04`](04-upgrade-design.md) §5 |
| 13 | Drawn trajectories (optional) | [`04`](04-upgrade-design.md) §5 |

Phase 10 should also revisit motion modifiers (§2 Part B) if they were not picked up earlier —
they are more valuable once the tree can offer them as upgrades.

---

## Stop-and-ask conditions

Only these justify interrupting the user. Everything else: decide and proceed.

1. The pre-flight acceptance gate is red before any changes — **except** the documented
   `test:schemas` preset-name mismatch, which Phase 0 tells you how to fix.
2. A phase requires editing a file not in its **Files** list.
3. A snapshot moves in a phase where the policy above says it should not.
4. A pre-decided decision turns out to be **impossible or self-contradictory** in code — not
   merely debatable. State the specific contradiction.
5. A phase's Stop-if condition triggers.
6. `npm run build` fails for a reason unrelated to the phase's changes.

---

## Progress log

Update as phases complete. Keep it in this file so it travels with the repo.

- [x] Phase 0 — Pre-flight
- [x] Phase 1 — RC-1 fix + round-trip invariant
- [x] Phase 2 — Bind apex/bounce visuals
- [x] Phase 3 — Semantic repair modes
- [x] Phase 4 — Composable motion Part A
- [x] Phase 5 — `ON_RAM` contact trigger
- [x] Phase 6 — Preview fidelity
- [ ] Phase 7 — Layered VFX + `PLAY_VFX`
- [ ] Phase 8 — Derived impact intensity
- [ ] Phase 9 — Angular hit regions
- [ ] Phase 10 — Evolution Tree
- [ ] Phase 11 — Timing phases
- [ ] Phase 12 — Node graph
- [ ] Phase 13 — Drawn trajectories
