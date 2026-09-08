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
