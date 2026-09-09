# Spell Pipeline — Documentation Set

> Reference set for the spell generation, repair, execution, and visualization pipeline.
> Written for humans **and** for pasting into LLM design conversations.
>
> **Source anchor:** commit `53e3893` (2026-09-08). All line numbers are as of this commit,
> except `trajectoryTracer.ts` anchors, re-derived 2026-09-09 against uncommitted work that
> added a `startZ` parameter for elevated casting. That change did not affect any finding.
> **Scope:** prompt → LLM → repair → sanitize → balance → interpreter → physics → render,
> plus the capability gaps blocking the planned Evolution Tree and melee combat.
> See also [`../ARCHITECTURE.md`](../ARCHITECTURE.md) for the wider system.

---

## Why this set exists

The prototype's premise is that a player can describe *any* spell and get something playable
and visually distinct. Today that premise partially fails: prompts like *"Cluster Bomblets
that bounce"* return flat linear projectiles. A full pipeline audit found the cause is not
missing engine capability — the engine executes multi-stage ballistic spells correctly — but
**lossy repair passes** between the LLM and the interpreter.

These docs capture that finding precisely enough to design the fix, and to plan the larger
Evolution Tree feature that depends on it.

---

## Reading order

| Doc | Contains | Kind |
|---|---|---|
| [`01-engine-capabilities.md`](01-engine-capabilities.md) | What the engine can express and execute today | Facts |
| [`02-pipeline-audit.md`](02-pipeline-audit.md) | Where authored intent is lost, with anchors | Facts |
| [`03-repair-rules-matrix.md`](03-repair-rules-matrix.md) | Rule-by-rule classification of semantic repair | Facts |
| [`04-upgrade-design.md`](04-upgrade-design.md) | Proposed architecture changes | **Proposals** |
| [`05-open-questions.md`](05-open-questions.md) | Unresolved decisions + rejected options | Decisions |

**The facts/proposals split is deliberate.** Docs 01–03 describe the codebase as it is and
should only change when the code changes. Doc 04 describes what we think we should build and
is expected to be argued with. When discussing design with an LLM, supply 01–03 as context
and 04 as the thing under review — otherwise the model will "improve" the factual claims.

---

## Status legend

Every non-obvious claim in docs 01–03 carries one of these tags:

- **`[Verified]`** — read directly from source at commit `53e3893`. Anchors given.
- **`[Inferred]`** — follows logically from verified code but was not executed or observed.
- **`[Assumption]`** — believed true, not checked. Treat as a question, not a fact.

If you extend these docs, keep tagging. The distinction between "I read this" and "this
follows" is what keeps the set trustworthy as it ages.

---

## Anchor convention

Claims cite **symbol first, line second**:

> `repair.ts → applyRuleE_Orbit` (L492)

Line numbers drift on the first edit; symbol names survive. If a line number no longer
matches, trust the symbol and re-derive the line. Do not "fix" a line number without
re-reading the code.

---

## How to verify a claim yourself

The highest-value claims and their one-command checks:

```bash
# BALLISTIC_ARC is absent from the LLM repair whitelist (root cause RC-1)
rg -n "VALID_TRAJECTORY_TYPES" -A 8 src/ai/synthesizer/llmRepair.ts

# Semantic repair runs on every sanitize pass (root cause of evolution fragility)
rg -n "repairAbilitySemantics" src/ai/budget/sanitize/ability.ts

# Ballistic kinematics is gated on trajectory type at exactly two call sites
rg -n "initBallisticKinematics" src/

# Apex events fire only from the ballistic updater
rg -n "pendingApexEvents.push" src/

# The preview sandbox never attaches a particle system
rg -n "setParticleSystem" src/draft/InspectorPlaybackSim.ts

# No melee concept exists anywhere in the codebase
rg -ni "melee|swing|slash|cleave|piston" src/

# ...yet a full body-collision combat system does, reachable only by physics
rg -n "applyRammingImpulse|RAMMING_" src/engine/PhysicsWorld.ts

# Hit regions are radial only — no angular test in the field system
rg -n "falloff|arcDeg" src/primitives/Fields.ts
```

The decisive **behavioural** check, requiring no code reading: load the `Cluster Mortar`
preset in-game (it splits at apex and bounces), then paste that same JSON into the Inspector
JSON tab and cast it. Presets bypass `repairAbilityPayload`; pasted JSON does not. If the
pasted version flies flat, RC-1 is confirmed.

---

## Using this set with an LLM

Suggested framing when handing these to a design model:

> Docs 01–03 are verified facts about an existing codebase; treat them as given and do not
> revise them. Doc 04 is a proposal I want you to critique. Doc 05 lists options already
> rejected and why — do not re-propose them without new argument.

Each file is self-contained enough to paste individually. If context is tight, 03 and 04
are the two that matter for the repair redesign; 01 and 02 are background.

---

## One-paragraph summary

The engine's expressive ceiling is higher than it appears. Multi-stage ballistic spells
(apex cluster splits, ground bounces with restitution, airburst detonation, sky drops) are
fully implemented and executed correctly — the `Cluster Mortar` preset proves it end to end.
What breaks is the path from LLM output to interpreter: `repairTrajectoryConfig` silently
downgrades `BALLISTIC_ARC` to `LINEAR`, and a set of keyword-driven semantic repair rules
overwrite authored values rather than filling gaps. The second problem is mild for one-shot
generation and severe for the planned Evolution Tree, because those rules re-run on every
pass with the current flavor text and therefore compound. Fixing preservation before
building the tree is the load-bearing sequencing decision.

The same pattern recurs everywhere we looked. Vertical physics, particle effects, and body
collision are all implemented as general systems sitting under an exclusive enum or an absent
parameter — combined motion, novel VFX, and melee are each blocked by a small missing
addressing mechanism rather than by missing capability. A full body-collision combat system
with knockback, recoil, and instability already runs in `PhysicsWorld`; no spell can reach it
because contact dispatches no trigger. Screen-impact intensity is already derived from real
runtime force, but `reactiveFx.pulse` quantizes it to a boolean, so a tier-6 ultimate lands
like a basic secondary. The recommended move throughout is to keep each enum as a named preset
and add an optional parametric layer beside it — engine derives, schema modulates.
