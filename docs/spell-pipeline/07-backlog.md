# 07 — Backlog

> Living checklist for work **after** the spell-pipeline runbook.
> Phases **0–13** in `[06-execution-plan.md](06-execution-plan.md)` are done.
>
> **How to keep this current:** when a slice ships, tick its box in this file in the
> same change. Move the item into “Shipped since the runbook” with a one-line note.
> Do not reopen rejected options at the bottom.

Source docs:

- `[04-upgrade-design.md](04-upgrade-design.md)` — original proposals
- `[05-open-questions.md](05-open-questions.md)` — product questions
- `[06-execution-plan.md](06-execution-plan.md)` — what the numbered phases shipped

---



## Shipped since the runbook

- [x] **Aiming overlay + live** `ON_AIR_APEX` (`e2b619f`, 2026-09-16) — homing-only far beacon that cannot fake `ON_HIT`; overlay origin is `caster.pos`; death/ground samples; `world.step` no longer drops apex events. Inventory playback dummy stays hittable.
- [x] **Cluster prompt is a single recipe** — `ON_AIR_APEX` + `SPAWN_PROJECTILE` only. The old `Cluster/MIRV` / `ON_EXPIRY` + `CAST_CHILD_PAYLOAD` line is gone; `test:fidelity` asserts it stays gone.
- [x] **Motion modifiers** — optional `motion` on `TrajectoryConfig` (wobble, jitter, drift, spiral, `speedCurve`); seeded `motionSeed` post-pass in `updateTrajectory`; schema/sanitize/score/prompt coverage; determinism invariants.
- [x] **Vocabulary guards** — sanitizer trigger whitelist uses `TRIGGER_TYPES`; `SANITIZED_ACTION_TYPES` / `VALIDATED_ACTION_TYPES` module-load coverage; `filterValidActions` drops unknown action types.
- [x] **RC-3: do not collapse the whole tree** — `bestEffort` validation salvages valid leaves; LINEAR spawn floor only when no trajectory/ON_CAST spawn; balance uses salvage before `fallback_linear`.
- [x] **Editable spell graph** — Inspector Graph tab edits `AbilityGraphModel` (add/remove/reorder triggers and actions, common fields); Apply via sanitize + strict validate.
- [x] **Directional parry** — `REFLECT_PROJECTILES` accepts optional `arcDeg` / `arcFacing` / `arcOffsetDeg` (same wedge as fields); shared `arcWedge` helper.
- [x] **Layered trails** — optional `trailLayers` on `VisualDescriptor` overrides `trailType` on projectile motion ticks; reuses `VfxLayer` primitives and budget cap.

---



## Open checklist

Tick these as they land. Suggested order is the numbering.

### Next

### Authoring / melee / VFX

### Product / later

- [ ] **7. Ceiling policy**  
  Saturation chips exist. Ceilings unchanged: `MAX_DEPTH = 3` (duplicated in interpreter + budget constants), `MAX_ENTITIES = 256`. Silent clamp still happens. Choose: refuse upgrades that cannot fit, or raise caps after profiling.

- [ ] **8. Timing phases on summons**  
  From [05 Q9](05-open-questions.md). Windup / active / recovery live on `Player`; bots go through `requestCast`. Actors / summons do not.

- [ ] **9. Land-on-cursor ballistic solver** (optional)  
  Current aiming is **heading-only**. Overlay length is `min(maxRange, speed * t_impact)`, not cursor distance. A solver would set `speed` or `lobApex` from clamped mouse range for both live flight and the overlay. Outer fan shots share that solved speed.

- [ ] **10.** `ON_SLAM` **as its own trigger** (optional)  
  Wall = `ON_HIT_WALL`; ground = `ON_GROUND_SLAM`. Dedicated obstacle-slam was never added.

- [ ] **11. Max legal VFX-stack particle invariant**  
  [04 §3](04-upgrade-design.md) asked for a LOW-tier `particleBudget` assertion on a maximal layer stack. Not in the physics suite (only intensity / budget monotonicity).

- [ ] **12. Fill the decision log in** `05`  
  Execution decisions live in `06`. The table at the bottom of `05` is still empty.

- [ ] **13. Refresh docs 01–03 line numbers**  
  Those files are snapshots from before Phases 0–13. Treat them as history until rewritten.

---



## Already shipped in the runbook (do not rebuild)


| Item                                                                        | When           |
| --------------------------------------------------------------------------- | -------------- |
| Semantic repair modes (`FIRST_GENERATION` vs `EVOLUTION`)                   | Phase 3        |
| Combined motion: ballistic fields on any trajectory type                    | Phase 4 Part A |
| `ON_RAM` contact trigger                                                    | Phase 5        |
| Headless aiming preview + particle recording backend                        | Phase 6        |
| Layered impact VFX + `PLAY_VFX`                                             | Phase 7        |
| Derived impact intensity                                                    | Phase 8        |
| Angular hit regions (`arcDeg` / facing)                                     | Phase 9        |
| Evolution Tree (stat + mechanic nodes, tier-aware budget, saturation chips) | Phase 10       |
| Timing phases on Player (windup / active / recovery)                        | Phase 11       |
| Read-only node graph inspector                                              | Phase 12       |
| Drawn trajectories (`DRAWN_PATH` + in-combat draw mode)                     | Phase 13       |


---



## Open questions that were never closed as product

`06` settled these so implementation would not block. They are not unfinished code.


| Question                           | What we did for the runbook                                                     | What is still a product call                                        |
| ---------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Q2** Semantic drift in evolution | Accept it. No provenance tracking.                                              | Warn in the inspector? Repair only the new subtree?                 |
| **Q5** Fun vs balance              | Tier-aware budget in Phase 10. Evolved spells are stronger at similar cooldown. | Does the tree reset per match?                                      |
| **Q6** Deltas vs resolved schemas  | Hybrid: stat nodes = modifiers, mechanic nodes = resolved schemas.              | Fine unless you want fully reversible mechanic branches.            |
| **Q7** Networked game?             | Assume **local-only**. Seeded noise is still required for motion modifiers.     | If you ever network, determinism becomes a correctness requirement. |
| **Q1 / Q3 / Q10 / Q12 / Q13**      | Implemented as decided in `06`.                                                 | Closed for execution. Revisit only with a new argument.             |


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

