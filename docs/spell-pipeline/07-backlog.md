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
- `[08-capability-audit.md](08-capability-audit.md)` — current capability snapshot (01–03 are history)

---



## Shipped since the runbook

- [x] **Aiming overlay + live** `ON_AIR_APEX` (`e2b619f`, 2026-09-16) — homing-only far beacon that cannot fake `ON_HIT`; overlay origin is `caster.pos`; death/ground samples; `world.step` no longer drops apex events. Inventory playback dummy stays hittable.
- [x] **Cluster prompt is a single recipe** — `ON_AIR_APEX` + `SPAWN_PROJECTILE` only. The old `Cluster/MIRV` / `ON_EXPIRY` + `CAST_CHILD_PAYLOAD` line is gone; `test:fidelity` asserts it stays gone.
- [x] **Motion modifiers** — optional `motion` on `TrajectoryConfig` (wobble, jitter, drift, spiral, `speedCurve`); seeded `motionSeed` post-pass in `updateTrajectory`; schema/sanitize/score/prompt coverage; determinism invariants.
- [x] **Vocabulary guards** — sanitizer trigger whitelist uses `TRIGGER_TYPES`; `SANITIZED_ACTION_TYPES` / `VALIDATED_ACTION_TYPES` module-load coverage; `filterValidActions` drops unknown action types.
- [x] **RC-3: do not collapse the whole tree** — `bestEffort` validation salvages valid leaves; LINEAR spawn floor only when no trajectory/ON_CAST spawn; balance uses salvage before `fallback_linear`.
- [x] **Editable spell graph** — Inspector Graph tab edits `AbilityGraphModel` (add/remove/reorder triggers and actions, common fields); Apply via sanitize + strict validate.
- [x] **Directional parry** — `REFLECT_PROJECTILES` accepts optional `arcDeg` / `arcFacing` / `arcOffsetDeg` (same wedge as fields); shared `arcWedge` helper; reflect syncs `aimAngle` so LINEAR shots reverse; arc shield hologram on cast; `DEFLECTED` FCT on catch; optional `durationMs` live catch window; looser Directional Parry preset.
- [x] **Layered trails** — optional `trailLayers` on `VisualDescriptor` overrides `trailType` on projectile motion ticks; reuses `VfxLayer` primitives and budget cap.
- [x] **Ceiling policy** — `MAX_DEPTH` unified at 4, `MAX_ENTITIES` raised to 512; saturation chips and runtime safety clamp kept; evolution upgrades not refused.
- [x] **Hold-to-guard shield** — `REFLECT_PROJECTILES.whileHeld` binds live wedge to slot `isHeld` (drops on release); optional `durationMs` is max-hold cap only; separate **Hold Guard** preset from tap **Directional Parry**; `slotIndex` threaded through player casts.
- [x] **Timing phases on summons** — `CastPhaseState` on `Entity`; optional `ActorConfig.inputProfile` telegraphs ON_TICK / turret fire; Player slot machine unchanged.
- [x] **Land-on-cursor ballistic solver** — fix `lobApex`, solve `speed` from clamped cursor range for forward `BALLISTIC_ARC` mortars; live cast + aiming overlay share solved speed; fan outer rays use center-aim speed.
- [x] **`ON_SLAM` catch-all surface trigger** — hex wall, obstacle, and ground high-speed hits dispatch `ON_SLAM` without arming; `ON_HIT_WALL` and `ON_GROUND_SLAM` unchanged.
- [x] **Max legal VFX-stack particle invariant** — `test:invariants` asserts a maximal `impactLayers` stack on LOW stays under `particleBudget` via sanitize + `playVfxLayers` spawn caps.

---



## Open checklist

Tick these as they land. Suggested order is the numbering.

### Next

#### Verification

- [ ] **12-point combat playtest** — confirmation pass only. The checks below already have invariant or fidelity coverage in the shipped list. File a new backlog item only for a check that fails. Do not open an implementation slice up front.
  1. Cluster mortar apex split at `v_z = 0`; bomblets match inspector reach.
  2. `HOMING_SLERP` with `lobApex` keeps apex triggers and bounce momentum.
  3. Cursor-solved mortar fans: outer pellets share center-aim landing range.
  4. `ON_RAM` fires only for the rammer at the 350 speed gate.
  5. `ON_SLAM` vs `ON_GROUND_SLAM`: wall and obstacle hits dispatch without pre-arming.
  6. 90° forward impulse excludes rear targets.
  7. Parry and hold-guard: fixed 120° wedge, overhead channel bar, 180° linear reflection.
  8. Phased summons: turret windup shows before the first `ON_TICK` burst.
  9. Semantic evolution repair keeps `BALLISTIC_ARC` and apex splits under flavor text such as "explosive self ring".
  10. A 6-layer particle stack on LOW clamps to 16 spawns with zero cooldown penalty.
  11. Drawn paths travel at a steady speed along the stroke.
  12. Seeded motion noise matches across repeated casts.

#### Product slices

- [ ] **Loadout kit balance** — bottom-dock meter over the five equipped combat profiles: Primers (instability builders), Finishers (`maxTravelPx >= 400`), Utility/Defense (parry, mobility, stasis, walls). Contextual warnings (no ring-out finisher, no mobility, redundant primary role). Cross-slot synergy tags from a small rule table (primer archetype to detonation action). Display only; no physics changes.
- [ ] **Vault tile scan layer** — corner micro-verb icons (push, vortex, shield, blink), a compact name and dominant-stat strip, and a clearer equipped-slot badge. Independent of the dock meter. Tiles already show a slot-key badge.

#### Docs

- [x] **Capability audit** — `[08-capability-audit.md](08-capability-audit.md)` is the current snapshot. Docs 01–03 stay historical.
- [x] **Close Q5 and Q6** — recorded in the `[05](05-open-questions.md)` decision log (2026-09-21). Trees persist across matches. Mechanic branches reverse by path, not by JSON patch.

### Authoring / melee / VFX

### Product / later

- [ ] **12. Finish the decision log in** `05`  
  Q4, Q5, Q6, and Q9 are recorded. Q1, Q2, Q3, Q7, Q8, Q10, Q12, and Q13 are settled in `06` but not copied into the `05` log. Q2's inspector-warning option stays open as a product call.

- [ ] **13. Refresh docs 01–03 line numbers**  
  Those files are snapshots from commit `53e3893`. `[08-capability-audit.md](08-capability-audit.md)` is the current capability set. Rewrite 01–03 only if a claim in them is still used as fact.

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
| **Q5** Fun vs balance              | Closed 2026-09-21 in `05`. Tier-aware budget stays. Trees persist across matches. | None. Match-scoped reset only if a ranked mode is added.            |
| **Q6** Deltas vs resolved schemas  | Closed 2026-09-21 in `05`. Hybrid stays. Path switch reverses a mechanic branch. | None. JSON-patch mechanic nodes are rejected.                       |
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

