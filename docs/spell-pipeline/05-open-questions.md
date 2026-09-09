# 05 — Open Questions & Rejected Options

> **Kind:** Decisions. Expected to change as design is settled.
> **Purpose:** capture what is genuinely undecided, and record what has already been ruled out
> so it does not get re-proposed every time a new model joins the conversation.

---

## How to use this document

When discussing design with an LLM, supply this file alongside
[`04-upgrade-design.md`](04-upgrade-design.md) with framing like:

> Section "Rejected options" lists approaches already considered and declined, with reasons.
> Do not re-propose them unless you have an argument the reason does not address.

Fill in the Decision Log at the bottom as questions close. A closed question with a recorded
rationale is worth more than a clean document.

---

## Open questions

### Q1 — Which entry points default to `EVOLUTION` mode?

`sanitizeAbilitySchema` is called from at least six places
([`02-pipeline-audit.md`](02-pipeline-audit.md)). Evolution tiers clearly want `EVOLUTION`.
Less obvious:

- **Inspector JSON paste** — the user hand-authored this; overwriting their choices is
  hostile. Argues for `EVOLUTION`.
- **Preset load** (`loadout.ts`) — presets are already correct and don't need repair at all.
  Arguably should skip semantic repair entirely.
- **Offline forge/evolution fallbacks** — generated from hardcoded recipes, so also already
  correct.

*Leaning:* `FIRST_GENERATION` only for the initial LLM forge/compile from a raw player prompt;
`EVOLUTION` everywhere else. Needs confirmation that offline recipe quality does not depend on
the repair rules firing.

---

### Q2 — How do we detect semantic drift in `EVOLUTION` mode?

Skipping overwrite rules means an evolved spell can end up describing one thing and doing
another — *"now it pulls enemies inward"* layered onto a spell whose impulses push.

Options:

1. Accept it. Unpredictability is a stated design goal; a spell that surprises you is on-brand.
2. Warn only — surface a mismatch indicator in the inspector, take no action.
3. Apply overwrite rules **only to the newly added subtree**, leaving prior tiers untouched.

Option 3 is most correct and hardest: it requires tracking provenance per node. Worth deciding
whether the Evolution Tree stores per-tier deltas (which would make it cheap) or resolved
schemas (which would make it expensive). Related to Q6.

---

### Q3 — How granular should `placementKey` become?

Today `SPAWN_PROJECTILE` and `CAST_CHILD_PAYLOAD` return undiscriminated keys, so structurally
different spawns on `ON_HIT` and `ON_EXPIRY` collapse
([`03-repair-rules-matrix.md`](03-repair-rules-matrix.md)).

Options: include `trajectory.type`; include type + `emitter.count`; hash the whole action; or
skip dedup entirely when the actions are not deeply equal.

The original intent — stopping LLMs from copying the same detonation onto both triggers "to be
safe" — is legitimate and worth preserving. A structural-equality check probably serves both
goals, at the cost of being slower and less predictable than a key.

---

### Q4 — What happens when a spell exceeds a ceiling?

`MAX_DEPTH = 3`, `MAX_ENTITIES = 256`, and the `clampSchemaValues` caps all fail silently
([`01-engine-capabilities.md`](01-engine-capabilities.md)). For a game whose selling point is
"your idea works", a tier-6 spell quietly emitting six bomblets instead of twelve is a bad
outcome.

Options:

1. **Refuse at generation time** — never offer an upgrade that cannot fit. Best UX, requires
   the tree to model limits.
2. **Show saturation in the card UI** — "+2 projectiles (capped)". Honest, cheap, slightly
   deflating.
3. **Raise the ceilings** — `MAX_DEPTH` to 4–5, `MAX_ENTITIES` higher. Needs profiling; entity
   count drives collision cost.

These are not exclusive. Note `MAX_DEPTH` is duplicated in
[`interpreter/constants.ts`](../../src/primitives/interpreter/constants.ts) and
[`budget/constants.ts`](../../src/ai/budget/constants.ts) — raising it means changing both,
which is itself an instance of the drift problem in §6.

---

### Q5 — How much balance are we willing to trade for fun?

`balanceAbilitySchema` converts power into cooldown and self-knockback. Making it tier-aware
([`04-upgrade-design.md`](04-upgrade-design.md) §4) means an evolved spell is strictly stronger
than a base spell at the same cooldown.

Given the stated goal — brawling for fun, not competitive integrity — this seems right. But it
should be an explicit decision, because it changes what a match feels like when one player has
climbed further than another. Worth deciding alongside: does the tree reset per match?

---

### Q6 — Does the tree store deltas or resolved schemas?

[`04`](04-upgrade-design.md) §4 recommends base + ordered modifier list. That works cleanly for
*stat* nodes. It is less obvious for *mechanic* nodes, which are LLM-generated structural
changes rather than field edits.

Options:

1. **Deltas all the way** — mechanic nodes store a JSON patch. Reversible and re-derivable,
   but patches against a schema that itself changed are fragile.
2. **Hybrid** — mechanic nodes store the resolved schema at that tier; stat nodes stay as
   modifiers applied on top. Simpler, loses reversibility of mechanic nodes.
3. **Resolved only** — simplest, no reversibility, no re-derivation when balance changes.

Hybrid is probably the pragmatic answer. This decision also determines whether Q2 option 3
(repair only the new subtree) is feasible.

---

### Q7 — Is the game networked, and does that harden the determinism requirement?

[`04`](04-upgrade-design.md) §2 requires seeded per-projectile noise so preview and live cast
agree. If the game is or will be networked, determinism becomes a correctness requirement
rather than a polish one — two clients must simulate identically.

`recordSpellPlayback` currently monkey-patches global `Math.random` during its sandbox run,
which is fine for a local preview and would not survive as a general strategy. Worth settling
early because it constrains how modifiers and VFX layers are implemented.

---

### Q8 — Which cluster recipe is canonical in the prompt grammar?

[`prompts.ts`](../../src/ai/synthesizer/prompts.ts) L203–204 offer two patterns for the same
player intent, and the older one's reference implementation is entirely `LINEAR`
([`02-pipeline-audit.md`](02-pipeline-audit.md) RC-5).

Proposal: `ON_AIR_APEX` + `SPAWN_PROJECTILE` is canonical for anything ballistic or bouncing;
`ON_EXPIRY` + `CAST_CHILD_PAYLOAD` is reserved for expiry-triggered splits that genuinely need
a full nested `AbilitySchema` (different archetype, own visuals, own resource cost). Both need
a complete JSON few-shot rather than a prose one-liner.

Deferred deliberately: prompt changes should land *after* RC-1 and §1, so that a bad result can
be attributed to the prompt rather than to the pipeline.

---

### Q9 — Where does the caster action state machine live?

[`04-upgrade-design.md`](04-upgrade-design.md) §8 Part C needs per-caster phase state (windup /
active / recovery) with movement scaling and a delayed `ON_CAST` dispatch. Today the only
"cannot act" states are per-slot cooldown, `resourceCost` lockout, and `APPLY_STASIS`, and
`Interpreter.executeAbility` dispatches synchronously.

Options:

1. **On `Player`**, alongside `slotInputs`. Matches where charge/channel/combo state already
   lives, but bots and summons then can't use phases.
2. **On `Entity`**, so summons and bots inherit it. Wider blast radius, more correct.
3. **A scheduler on the interpreter**, with phases as queued dispatches rather than entity
   state. Cleanest separation, but movement scaling still needs to touch the entity.

Related: `moveScale` must revert on phase exit. `applyModifyStat` writes `Player.moveSpeed`
directly with no restore mechanism, so phases need something the morph system already has
(`morphRemainingMs`) rather than reusing `MODIFY_STAT`.

---

### Q10 — What are the semantics of the contact trigger?

[`04`](04-upgrade-design.md) §8 Part A proposes `ON_RAM`. Undecided:

- **Who owns the trigger?** The rammer's spell, the target's spell, or both? The collision site
  already picks a rammer and a target (`PhysicsWorld.ts` L932), so either is available.
- **Does it need an armed spell?** Vertical slams use `groundSlamArmed` on the entity, set at
  cast time. Ram could follow that pattern, or fire on any collision for any spell holding an
  `ON_RAM` node.
- **Threshold.** Reuse `RAMMING_SPEED_THRESHOLD` (350), or expose `minRamSpeed` per node as
  `ON_BOUNCE` does with `minBounceSpeed`?
- **Summons.** Should a charging turret or decoy trigger it? They already participate in
  collision resolution.

Leaning: rammer-owned, node-level `minRamSpeed`, fires without arming (simpler than
`groundSlamArmed` and there is no ambiguity about which spell is responsible).

---

### Q11 — Should melee hit regions interact with projectiles?

`applyField` returns early for anything not tagged `combatant`
([`Fields.ts`](../../src/primitives/Fields.ts) L68–69), so an arc-constrained swing cannot bat
away incoming shots. `REFLECT_PROJECTILES` exists as a separate action and already does this
with a radius.

Options: leave it (melee is anti-personnel, parry stays a distinct action); let `arcDeg` fields
optionally affect projectiles; or generalise `REFLECT_PROJECTILES` to accept the same arc
parameters so a directional parry is expressible.

The third is most consistent with the composable-parameter thesis, and cheap — `REFLECT_PROJECTILES`
already takes a `radius`.

---

### Q12 — What curve maps spell power to visual intensity?

[`04-upgrade-design.md`](04-upgrade-design.md) §9 Part C derives impact intensity from
`scoreAbilitySchema` normalized against `CATEGORY_BUDGETS[category].targetPower`. The mapping
curve is undecided and it matters more than the inputs do.

Power grows fast with nesting — `scoreAction` multiplies `SPAWN_PROJECTILE` by emitter count and
recurses into child triggers — so a linear mapping saturates quickly and a late-tree spell
produces permanent full-screen glitch. Options: asymptotic (`x / (x + k)`), logarithmic, or a
hand-authored piecewise curve per channel.

Related sub-questions:

- **Per-channel or shared?** Shake almost certainly wants a lower ceiling than blur or particle
  count. One normalized signal with per-channel response curves is probably right.
- **Is intensity capped at the top tier, or does it keep growing?** Uncapped growth makes late
  spells feel escalating but eventually unreadable.
- **Does a glancing hit from a huge spell outrank a solid hit from a small one?** This is the
  floor-versus-punch weighting between static scope and runtime impact.

This is a feel question, so it likely wants a devtools slider before it wants a decision. The
graphics inspector already hosts comparable tuning (`fctClusterConfig`, `hitFeedbackConfig`,
reactive tuning).

---

### Q13 — Is `PLAY_VFX` an action, or a field on `TriggerNode`?

[`04`](04-upgrade-design.md) §9 Part B proposes an action. The alternative is a `vfx` property on
`TriggerNode` itself, so every node can carry a visual without occupying an action slot.

Action favours: reuses the whole existing pipeline (schema branch, sanitizer, validator, budget
scorer, `dispatchAction`), can be targeted, can appear in `ifFalseActions`, and the Evolution
Tree can add one as a mutation like any other action.

`TriggerNode` field favours: visuals are not gameplay, so they arguably should not consume
action ordering or be scored by `scoreAbilitySchema` at all — an LLM adding flashier visuals
should not raise a spell's cooldown.

That last point is the strongest argument and cuts against the action form. A hybrid is
possible: `PLAY_VFX` as an action with a zero budget cost. Worth settling before implementing,
because it determines whether visual upgrades in the Evolution Tree are free.

---

## Rejected options

Recorded with reasons. Re-propose only with an argument the reason does not address.

### Adding trajectory enum values (`SPIRAL_WAVE`, `BOUNCE_SURFACE`, `CLUSTER_BURST`, `CHAOS_JITTER`)

**Rejected.** The existing six types are underutilized rather than insufficient.
`BALLISTIC_ARC` alone already supports apex splits, ground bounces with restitution and
friction, airburst altitude, obstacle clearance, and sky drops — and the runtime executes all
of it correctly today. The observed failures are preservation failures, not expressiveness
failures ([`02-pipeline-audit.md`](02-pipeline-audit.md)).

Adding types before fixing preservation means new types get stripped by the same code path.
More fundamentally, an exclusive enum is the wrong shape for an additive evolution system —
composable modifiers ([`04`](04-upgrade-design.md) §2) address the same intents without
multiplying the vocabulary that §6 says is already drifting.

### LLM-generated shaders or arbitrary VFX code

**Rejected.** Unbounded output, unsafe execution, unpredictable performance, and impossible to
budget against `particleBudget`. The layered-primitive approach ([`04`](04-upgrade-design.md)
§3) gives most of the novelty with none of those properties.

### Replacing the inventory playback preview

**Rejected.** It already runs the real interpreter and physics and is the most faithful
component in the visualization stack. The proposal is to *extend* it (add particle recording)
and to make the **live aiming indicator** adopt its technique — not to remove it.

### Removing semantic repair entirely

**Rejected.** The gap-filling rules materially improve one-shot generation: they are why a
described pull spell actually pulls. The problem is scope (overwrite vs fill) and re-entry, not
existence.

### Fixing RC-1 by adding `BALLISTIC_ARC` to the whitelist only

**Rejected as insufficient**, though it is the necessary first step. LLMs frequently emit
`type: "LINEAR"` alongside `lobApex: 150`, and a whitelist fix still loses that case.
`repairTrajectoryConfig` already has the right pattern in its `isSkyDrop` branch — infer
ballistic intent from the presence of `lobApex` or `bounces`, so repair *recovers* intent
rather than merely not destroying it ([`02-pipeline-audit.md`](02-pipeline-audit.md) RC-1).

### Leaving VFX calibration in authored `vfx` parameters

**Rejected.** `vfx.shakeIntensity` and `vfx.impactScale` are currently absolute values the LLM
must pick with no sense of a spell's power relative to others, which it does unreliably — and
the same values then apply to a base spell and its tier-6 evolution identically.

The engine already quantifies spell power in `scoreAbilitySchema` and already derives runtime
impact magnitude (instability delta, projectile speed, closing speed). Deriving intensity and
reducing the authored params to *multipliers* on that baseline
([`04-upgrade-design.md`](04-upgrade-design.md) §9 Part C) keeps authored values useful for
style while removing the LLM's responsibility for calibration.

### Widening the `impactVfx` enum instead of addressing the primitives

**Rejected**, for the same reason as the trajectory-enum rejection. Ten hardcoded recipes are
compositions of four parameterized primitives; adding an eleventh recipe adds one look, whereas
exposing the primitives adds a space. It also does not solve the per-moment problem — a spell
would still have one `impactVfx` for hit, expiry, bounce, and apex
([`01-engine-capabilities.md`](01-engine-capabilities.md) §"Visual vocabulary").

### A dedicated `MELEE_SWING` input profile mode

**Rejected.** A fifth `InputProfileMode` would make windup, active window, and recovery
available *only* to melee, which is arbitrary — a telegraphed sniper shot or a ranged spell with
punishing recovery are both good designs that the mode would exclude. It also hardcodes "melee"
as a category the LLM and the Evolution Tree must be taught separately.

Timing phases as optional properties on the existing `InputProfile`
([`04-upgrade-design.md`](04-upgrade-design.md) §8 Part C) give melee everything it needs while
composing with all four current modes and remaining available to ranged spells. Same reasoning
as the trajectory-enum rejection above.

### A dedicated melee subsystem (weapons, reach, attack states)

**Rejected.** Melee is expressible as three orthogonal parameters the rest of the engine already
wants — region shape (`arcDeg`), timing (phases), and a contact trigger (`ON_RAM`) — and
critically, a full body-collision combat system with knockback, recoil, and instability already
exists in `PhysicsWorld.applyRammingImpulse`. It simply isn't reachable from the schema.
Building a parallel weapon subsystem would duplicate working physics and create a second
combat vocabulary for the Evolution Tree to mutate.

### Building the Evolution Tree before fixing repair

**Rejected on sequencing grounds.** Each evolution tier re-runs the destructive rules
([`03-repair-rules-matrix.md`](03-repair-rules-matrix.md)). A tree built on a lossy pipeline
would spend most of its development budget on symptoms whose cause is upstream.

---

## Decision log

Record closed decisions here with date and rationale. Move the question text into the entry so
this file stays self-contained.

| Date | Question | Decision | Rationale |
|---|---|---|---|
| — | — | — | — |
