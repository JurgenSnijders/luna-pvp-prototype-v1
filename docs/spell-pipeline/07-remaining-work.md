# Remaining work

Phases **0–13 of the execution runbook are done.** This file is everything from the original
spell-pipeline design that was **planned, deferred, or left optional**, and never given its
own numbered phase.

It is written for a human, not as a new runbook. Source docs:

- [04-upgrade-design.md](04-upgrade-design.md) — original proposals
- [05-open-questions.md](05-open-questions.md) — open questions
- [06-execution-plan.md](06-execution-plan.md) — what we actually shipped (all boxes checked)

If a later phase is needed, pick from the sections below and plan it separately.

---

## Already shipped (do not rebuild)

These were the original plan. They are in the game now.

| Item | When |
|---|---|
| Semantic repair modes (`FIRST_GENERATION` vs `EVOLUTION`) | Phase 3 |
| Combined motion: ballistic fields on any trajectory type | Phase 4 Part A |
| `ON_RAM` contact trigger | Phase 5 |
| Headless aiming preview + particle recording backend | Phase 6 |
| Layered impact VFX + `PLAY_VFX` | Phase 7 |
| Derived impact intensity | Phase 8 |
| Angular hit regions (`arcDeg` / facing) | Phase 9 |
| Evolution Tree (stat + mechanic nodes, tier-aware budget, saturation chips) | Phase 10 |
| Timing phases (windup / active / recovery) | Phase 11 |
| Read-only node graph inspector | Phase 12 |
| Drawn trajectories (`DRAWN_PATH` + in-combat draw mode) | Phase 13 |

---

## Still worth building

These are the real leftovers. Ordered roughly by how much they would change play.

### 1. Motion modifiers (largest remaining engine piece)

**Where it came from:** [04 §2 Part B](04-upgrade-design.md). Phase 4 shipped only Part A
(homing mortars, bouncing boomerangs). Part B was explicitly deferred until preview fidelity
existed. Preview exists now. This was never started.

**What it is.** An optional `motion` block on `TrajectoryConfig`:

- **wobble** — oscillating heading (amplitude, frequency, optional decay)
- **jitter** — seeded noise on the path
- **drift** — constant lateral acceleration
- **spiral** — circling around the flight axis
- **speedCurve** — start slow, ramp up (“struggling missile”)

Applied *after* the existing trajectory switch, so they compose with linear, homing, drawn
paths, ballistic lobs, etc.

**Why it still matters.** “Drawn path + wobble” was called out as most of what people actually
want from custom motion. Evolution Tree mechanic nodes would also have something additive to
offer besides new triggers.

**Hard rule if you build it.** Noise must be **seeded per projectile**, never `Math.random()`.
Otherwise the aiming preview and the live cast diverge. The preview sandbox already
monkey-patches global random — that is not an acceptable strategy for live play.

**Also needed alongside it:** budget scoring so modifiers are not free power, and a prompt
grammar line. Some pairings (boomerang + bounces) will look weird; let the engine permit them
and keep the prompt from suggesting the bad ones.

---

### 2. A real spell designer (editable graph)

**Where it came from:** [04 §5](04-upgrade-design.md). Phase 12 shipped a **read-only**
inspector tab. Editable authoring was deferred on purpose.

**What it is.** Players (or designers) edit the trigger/action tree in the Graph tab instead
of pasting JSON. Drawn trajectories already exist as a cast gesture; the designer would also
let you author a reusable `pathPoints` polyline on the spell itself.

**Why it was deferred.** An editor can produce schemas the LLM path never would, including
ones that fail validation. Read-only-first avoided that risk.

**Natural next step after this:** workshop / harness integration (explicitly out of scope in
Phase 12).

---

### 3. Vocabulary as one source of truth

**Where it came from:** [04 §6](04-upgrade-design.md). Partial work landed along the way.

**Done today:**

- `ACTION_TYPES` module-load guard (schema branch coverage)
- `TRAJECTORY_TYPES` sync guard between schema constants and budget constants (Phase 13)

**Still remaining:**

- Same style of guard for **triggers, fields, and visual enums** (a missing sanitizer case
  still fails silently)
- Longer term: **derive** the JSON response schema, sanitizer whitelists, and prompt grammar
  from the same constants, instead of hand-updating six copies

Full derivation is a larger refactor (barrel/shell boundaries in `ARCHITECTURE.md`). The
cheap guards can land independently.

---

### 4. Layered trails

**Where it came from:** [04 §3](04-upgrade-design.md). Impact layers shipped in Phase 7.
Trails were “same pattern, once impacts are proven.”

**What it is.** Optional `trailLayers` (or equivalent) beside the existing `trailType` preset,
using the same primitive stack and particle-budget cap.

---

### 5. Directional parry (melee vs projectiles)

**Where it came from:** [05 Q11](05-open-questions.md). Angular fields only hit combatants.
A sword swing cannot bat shots away. `REFLECT_PROJECTILES` already exists, but only as a
radius.

**Recommended shape (never implemented):** give `REFLECT_PROJECTILES` the same `arcDeg` /
facing parameters as fields, so a directional parry is one action.

---

### 6. Timing phases on summons (and maybe every entity)

**Where it came from:** [05 Q9](05-open-questions.md). Phase 11 put the state machine on
`Player` and routed bots through the same `requestCast` seam.

**Still true:** summons / actors do not inherit windup–active–recovery. Option 2 in Q9 was
“put it on `Entity` so summons and bots inherit it.” That wider blast radius was not taken.

---

### 7. Raise ceilings, or refuse upgrades that cannot fit

**Where it came from:** [04 §4](04-upgrade-design.md) and [05 Q4](05-open-questions.md).
Phase 10 surfaces saturation as chips in the Evolution Tree UI. Ceilings themselves were
**not** raised (`MAX_DEPTH = 3`, `MAX_ENTITIES = 256`). Silent clamp still happens.

**Still open as product choices:**

- Refuse to offer an upgrade that cannot fit (best UX, more tree work)
- Raise `MAX_DEPTH` / `MAX_ENTITIES` after profiling (note: `MAX_DEPTH` is duplicated in
  interpreter constants and budget constants)

---

## Smaller leftovers

These are real, but they are polish or prompt work rather than features.

| Leftover | Notes |
|---|---|
| Cluster prompt still lists two recipes | [Q8](05-open-questions.md): `ON_AIR_APEX` + `SPAWN_PROJECTILE` is the canonical cluster. The older `ON_EXPIRY` + `CAST_CHILD_PAYLOAD` “Cluster/MIRV” line is still in `prompts.ts`. Prompt cleanup was deferred “until after Phase 3” and never circled back. |
| `ON_SLAM` as its own trigger | Optional in §8 Part A. Wall contact already has `ON_HIT_WALL`; ground impact has `ON_GROUND_SLAM`. A dedicated obstacle-slam trigger was never added. |
| Particle-count invariant for max legal VFX stacks | §3 asked for a LOW-tier budget assertion. Not in the physics invariant suite. |
| Fill the decision log in `05` | Execution decisions live in `06`. The table at the bottom of `05` is still empty. |
| Docs 01–03 line numbers | Those files are snapshots of the codebase *before* Phases 0–13. Treat them as history, not current maps. |

---

## Open questions that were never closed as product

`06` settled these **so implementation would not block**. They are not unfinished code. They
are still worth an explicit human decision if the game grows.

| Question | What we did for the runbook | What is still a product call |
|---|---|---|
| **Q2** Semantic drift in evolution | Accept it. No provenance tracking. | Warn in the inspector? Repair only the new subtree? |
| **Q5** Fun vs balance | Tier-aware budget in Phase 10. Evolved spells are stronger at similar cooldown. | Does the tree reset per match? |
| **Q6** Deltas vs resolved schemas | Hybrid: stat nodes = modifiers, mechanic nodes = resolved schemas. | Fine unless you want fully reversible mechanic branches. |
| **Q7** Networked game? | Assume **local-only**. Still required seeded noise for any future motion modifiers. | If you ever network, determinism becomes a correctness requirement, not polish. |
| **Q1 / Q3 / Q10 / Q12 / Q13** | Implemented as decided in `06`. | Closed for execution. Revisit only with a new argument. |

---

## Explicitly not remaining

These were considered and **rejected**. Do not treat them as backlog.

- New trajectory enum values (`SPIRAL_WAVE`, `BOUNCE_SURFACE`, …) — use modifiers instead
- LLM-generated shaders or arbitrary VFX code
- Replacing the inventory playback preview
- Removing semantic repair entirely
- A dedicated `MELEE_SWING` input mode
- A dedicated melee weapon subsystem
- Building the Evolution Tree before fixing repair (already sequenced correctly)

---

## Suggested order if you continue

1. **Motion modifiers** — the only large engine gap left from the original design.
2. **Vocabulary guards** (triggers / fields / visuals) — cheap insurance against another RC-1.
3. **Editable graph** — if players should author spells by hand.
4. **Directional parry** — small schema change, completes melee vs projectiles.
5. **Layered trails / prompt cleanup / ceiling policy** — whenever they become annoying.

Nothing below this line is required for the current prototype to match the execution plan.
That work is finished.
