# 03 — Semantic Repair Rules Matrix

> **Kind:** Facts. Change only when the code changes.
> **Source anchor:** commit `53e3893` (2026-09-08). All symbols in
> [`src/ai/budget/repair.ts`](../../src/ai/budget/repair.ts) unless stated otherwise.
> **Purpose:** classify every semantic repair pass as *gap-filler* or *overwrite*, so the
> Evolution Tree redesign can be scoped precisely.

---

## Why this matters

Semantic repair was built as a safety net for **one-shot generation**: if the LLM describes a
pull spell but forgets to make it pull, inject the pull. Under that assumption, overwriting
is reasonable — there is no prior authored state worth protecting.

An Evolution Tree breaks that assumption. Each tier re-runs the whole pipeline on an
already-repaired schema with *new* flavor text, so:

1. Rules re-evaluate against text that has accumulated adjectives, firing **more** rules each tier.
2. Overwrites destroy mutations added by earlier tiers.
3. The player watches upgrades they paid for silently disappear.

The fix is not to delete these rules — they are genuinely useful on first generation. It is
to separate "the author left this empty" from "the author chose something I'd have chosen
differently."

---

## How repair is invoked

`repairAbilitySemantics` (L1095) is called from **every** `sanitizeAbilitySchema` pass
([`sanitize/ability.ts`](../../src/ai/budget/sanitize/ability.ts) L124), which in turn runs on
every generation, compilation, evolution, preset load, and inspector paste. `[Verified]`

```ts
const text = (
  descriptionText ||
  [payload.tagline, payload.description].filter(Boolean).join(' ')
).toLowerCase();
```

`text` is the **current tier's** flavor text. There is no memory of previous passes and no
flag distinguishing first generation from re-entry. `[Verified]`

### Execution order (L1109)

```ts
applyRuleF_Obstacle(cloned, text);
applyRuleG_Deployable(cloned, text);
applyRuleE_Orbit(cloned, text);
applyRuleA_PullGravity(cloned, text, isHeadlessMode);
applyRuleB_LingeringHazard(cloned, text);
applyRuleC_ArcSweep(cloned, text);
applyRuleD_ChanneledStream(cloned, text);
applyRuleH_Meteor(cloned, text);
applyRuleI_PersonalField(cloned, text);
ensureProjectileTriggerDisplacement(cloned, text, isHeadlessMode);
// then, unconditionally:
const result = ensureDisplacementSemantics(cloned, text, isHeadlessMode);
clampContinuousFieldStrength(result);
result.triggers = collapseHitExpiryInTriggerTree(result.triggers);
```

Note the order is **F, G, E, A, B, C, D, H, I** — not alphabetical. Order matters: F and G
delete the trajectory before A and B get a chance to see it, which is how the compounding
failure in [`02-pipeline-audit.md`](02-pipeline-audit.md) RC-2 arises.

Additionally, `repairActionsSemantics` (L231) walks every action *before* the rules run and
applies `repairImpulseSemantics` to each `APPLY_IMPULSE`.

---

## Classification scheme

| Class | Definition | Safe to re-run on evolution? |
|---|---|---|
| **Gap-filler** | Only writes fields that are absent or empty. Idempotent. | Yes |
| **Overwrite** | Replaces an existing authored value with a computed one. | No |
| **Destructive** | Deletes or wholesale-replaces structure (trajectory, triggers, actions). | No |
| **Mixed** | Gap-filling body with an overwrite or destructive tail. | Partially |

**Evolution risk** combines severity with keyword likelihood — how probable it is that
ordinary evolved flavor text trips the rule.

---

## Summary matrix

| Pass | Symbol (line) | Keyword trigger | Class | Evo risk |
|---|---|---|---|---|
| F — Obstacle | `applyRuleF_Obstacle` (358) | `wall, barrier, obstacle, bunker, pillar, pylon, barricade, cover, fortified, obelisk` | Destructive | High |
| G — Deployable | `applyRuleG_Deployable` (416) | `deploy, deployable, turret`; or `sentry/pylon/totem`/`trap/mine` + placement verb | Mixed | Medium |
| E — Orbit | `applyRuleE_Orbit` (492) | `orbiting, orbits, orbit, circling, circle, ring, halo, surround, revolving, rotating, satellite, whirling` | **Destructive** | **Critical** |
| A — PullGravity | `applyRuleA_PullGravity` (538) | `pull, inward, attract, gravity, singularity, drag, vacuum, harpoon, black hole, suck, reel, implosion` | Gap-filler | Low |
| B — LingeringHazard | `applyRuleB_LingeringHazard` (619) | `lingering, sticky, puddle, pool, scorch, fire trail, hazard, toxic, sludge, burn, mire, acid` | Gap-filler | Low |
| C — ArcSweep | `applyRuleC_ArcSweep` (659) | `arc, sweep, scatter, salvo, fan, spray, barrage, burst` | Mixed | **High** |
| D — ChanneledStream | `applyRuleD_ChanneledStream` (690) | `flamethrower, continuous, channel, stream, beam` | Mixed | Medium |
| H — Meteor | `applyRuleH_Meteor` (380) | `meteor, sky drop, orbital strike, starfall, rain down, shower` | Destructive | Medium |
| I — PersonalField | `applyRuleI_PersonalField` (401) | `only for me, personal, self, caster only, for me, my own` | **Destructive** | **High** |
| Impulse semantics | `repairImpulseSemantics` (199) | push / pull keyword classes | Overwrite | Medium |
| Projectile displacement | `ensureProjectileTriggerDisplacement` (856) | *always* | Gap-filler | Low |
| Ability displacement | `ensureDisplacementSemantics` (905) | *always* | Gap-filler | Low |
| Field strength floor | `clampContinuousFieldStrength` (967) | *always* | Overwrite | Medium |
| Hit/expiry dedup | `collapseHitExpiryInTriggerTree` (1076) | *always* | **Destructive** | **High** |

All keyword regexes are `\b`-anchored, so substrings do not match (`ring` inside `searing`
does not trip Rule E). Conversely hyphens *are* word boundaries, so `self-igniting` **does**
match `\bself\b`. `[Verified]`

---

## Rules requiring change

### E — Orbit `[Destructive · Critical]`

```ts
function applyRuleE_Orbit(schema: AbilitySchema, text: string): void {
  if (!isOrbitConcept(text)) return;

  schema.trajectory = {
    type: 'ORBIT_ANCHOR',
    orbitRadius: 70,
    orbitSpeed: 3.0,
    maxRange: 800,
  };
  ...
}
```

Unconditional total replacement. Speed, `maxRange`, `bounces`, `lobApex`, `piercing`,
homing — all discarded, with no check for what was there. It then appends a
`MASS_ATTRACTOR` + `VORTEX_TANGENT` pair to `ON_CAST` unless the schema already has one of
those field types.

The keyword list is what makes this critical rather than merely bad. `ring` and `circle` are
ordinary spell vocabulary: *"explodes in a ring of flame"*, *"a circle of frost"*,
*"embers surround the target"*.

Precision note: `orbital` does **not** match — `\borbit\b` requires a boundary after `orbit`
and `orbital` continues with a word character. `orbiting` does match, and that is the phrasing
an LLM naturally produces.

> **Disposition.** Apply only when `schema.trajectory` is undefined. If a trajectory exists,
> leave it and still consider adding the attractor pair.

---

### I — PersonalField `[Destructive · High]`

```ts
walkActions(schema, (v) => {
  if (v.action.type !== 'SPAWN_FIELD') return;
  v.action.field.affects = 'CASTER_ONLY';
  ...
});
```

Sets `affects` on **every** `SPAWN_FIELD` in the schema, including fields explicitly authored
as `ENEMIES`. Because `\bself\b` matches across hyphens, a description containing
*"self-igniting"* or *"buffs self"* converts every damage field into a caster-only field —
the spell stops affecting opponents entirely, with no error.

Highest severity-per-likelihood on this list: the failure is total (spell does nothing to
enemies) and the trigger word is common.

> **Disposition.** Only set `affects` where it is currently `undefined`.

---

### C — ArcSweep `[Mixed · High]`

Two distinct problems, both in `ensureFanEmitter` (L335) and the restructure path.

```ts
function ensureFanEmitter(emitter?: EmitterConfig): EmitterConfig {
  const count = emitter?.count ?? 1;
  const spreadDeg = emitter?.spreadDeg ?? 0;
  if (count >= 3 && emitter?.distribution === 'FAN') return emitter;
  return {
    count: Math.max(3, count),
    spreadDeg: Math.max(35, spreadDeg),
    distribution: 'FAN',
    aimOffsetDeg: emitter?.aimOffsetDeg,
  };
}
```

1. **`distribution` is overwritten.** An emitter authored as `RADIAL` with `count: 6` — a
   deliberate 360° burst — is silently converted to a 35° `FAN` cone, because the early-return
   requires `distribution === 'FAN'`.
2. **`inheritVelocityRatio` is dropped.** The returned object copies `aimOffsetDeg` but not
   `inheritVelocityRatio`, so that field is lost on any emitter that passes through.

The restructure path (L669) additionally moves the root trajectory and all non-`ON_CAST`
lifecycle triggers into a nested `SPAWN_PROJECTILE` and deletes `schema.trajectory`. That part
is semantically preserving — the interpreter runs it identically — but it changes the shape
tracers and tooling see.

`burst` is in the trigger list, which makes this fire very often.

> **Disposition.** Treat an emitter with `count >= 2` as authored and return it unchanged.
> Copy all emitter fields when constructing a replacement.

---

### F — Obstacle `[Destructive · High]`

```ts
const onCast = ensureOnCastNode(schema);
if (!hasSpawnObstacle(schema)) {
  onCast.actions.push({ type: 'SPAWN_OBSTACLE', ... });
}

delete schema.trajectory;   // L377 — unconditional
```

The obstacle injection is properly guarded. The `delete` is not: it runs even when a
`SPAWN_OBSTACLE` already existed and even when the spell is an ordinary projectile whose
description merely mentions `wall` or `cover` — *"a wall of flame"*, *"blasts through cover"*.

> **Disposition.** Only delete the trajectory when this rule created the obstacle, and never
> when a trajectory was authored before this pass.

---

### G — Deployable `[Mixed · Medium]`

Gap-filling body: finds or creates a `SPAWN_ACTOR`, and injects `ON_TICK` behaviour only when
`actor.triggers` is missing or empty.

Three concerns:

- `spawnActor.actor.anchored = true` unless explicitly `false` — a mild overwrite (L443).
- The injected turret fires `{ type: 'LINEAR', speed: 400, maxRange: 500 }` (L478) — another
  hardcoded source of flatness.
- `delete schema.trajectory` when the deployable is not thrown (L488).

Keyword matching is conjunctive for `sentry`/`pylon`/`totem`/`trap`/`mine`, so it fires less
often than E or F.

> **Disposition.** Same as F for the delete. Leave `anchored` alone when defined.

---

### H — Meteor `[Destructive · Medium]`

```ts
schema.targetingMode = 'GROUND_POINT';   // L383, unconditional
...
walkActions(schema, (v) => {
  if (v.action.type === 'SPAWN_PROJECTILE') {
    v.action.projectileTrajectory = coerceSkyDropTrajectory(v.action.projectileTrajectory);
  }
});
```

`coerceSkyDropTrajectory` (L40) forces `type: 'BALLISTIC_ARC'`, `spawnAltitude >= 600`,
`fallSpeed >= 1400`, and **`speed: 0`**. It contains one escape: a trajectory with
`lobApex > 0` and no `spawnAltitude` is returned unchanged, so mortar-style children survive.
A `LINEAR` or `HOMING_SLERP` child, however, becomes a motionless plumb drop.

Also deletes the root trajectory when an `ON_CAST` projectile has `count > 1` (L386).

> **Disposition.** Only set `targetingMode` when undefined. Restrict sky-drop coercion to the
> root trajectory and to children that already look like drops.

---

### D — ChanneledStream `[Mixed · Medium]`

Additions are guarded, but two fields are overwritten:

- `inputProfile` is replaced when the mode is `INSTANT` (L693) — `INSTANT` is a legitimate
  authored choice, not an absence.
- `schema.cooldownMs = 0` (L705) when `resourceCost` was absent.

`beam` is in the keyword list, so an evolved description mentioning a beam can convert a burst
spell into a channeled heat weapon with zero cooldown.

> **Disposition.** Only set `inputProfile` when undefined. Only zero `cooldownMs` when this
> rule created the `HEAT` cost.

---

### `repairImpulseSemantics` `[Overwrite · Medium]`

```ts
if (isPushConcept(text) && !isPullConcept(text)) {
  patched.directionMode = 'AWAY_FROM_ORIGIN';
  ...
}
```

Sets `directionMode` from keyword class regardless of what was authored. Note the guard
interaction: `isPullConcept` (L69) requires a pull keyword **and no push keyword**, and
`PUSH_KEYWORDS` includes `blast` and `launch`. So *"a blast that pulls enemies inward"*
classifies as push, and every impulse is forced to `AWAY_FROM_ORIGIN` — the opposite of the
description. `[Verified]`

The force floors (`PULL_FORCE_FLOOR` 450, `PUSH_FORCE_FLOOR` 500) are harmless.

> **Disposition.** Only set `directionMode` when undefined. Keep the floors.

---

### `collapseHitExpiryInTriggerTree` `[Destructive · High]`

Not keyword-gated — runs on **every** pass. Deduplicates world-placement actions between
`ON_HIT` and `ON_EXPIRY` using `placementKey` (L980):

```ts
case 'SPAWN_FIELD':      return `SPAWN_FIELD:${action.field.fieldType}`;
case 'SPAWN_PROJECTILE': return 'SPAWN_PROJECTILE';        // ← no discriminator
case 'SPAWN_ACTOR':      return `SPAWN_ACTOR:${action.actor.actorArchetype}`;
case 'CAST_CHILD_PAYLOAD': return 'CAST_CHILD_PAYLOAD';    // ← no discriminator
case 'SPAWN_OBSTACLE':   return `SPAWN_OBSTACLE:${action.obstacle.shape}`;
case 'MUTATE_TERRAIN':   return `MUTATE_TERRAIN:${action.mutation.type}`;
```

`SPAWN_FIELD` keys by field type and `SPAWN_OBSTACLE` by shape, but **two structurally
different projectile spawns collapse to the same key**. So a spell with *"on hit, split into
needles; on expiry, drop a bomb"* loses the on-hit split entirely (`ON_HIT` actions are
filtered at L1059, and nodes left empty are dropped at L1073).

This is the pass most likely to eat Evolution Tree upgrades, because stacked tiers naturally
attach different payloads to different lifecycle triggers.

> **Disposition.** Include trajectory type and emitter count in the projectile key, or skip
> dedup when the two actions differ structurally.

---

### `clampContinuousFieldStrength` `[Overwrite · Medium]`

Forces any `MASS_ATTRACTOR` or `VORTEX_TANGENT` with `|strength| < 3500` up to `±4500`.
Correct for one-shot generation — weak wells feel broken — but it makes "a weak pull that
strengthens with tier" inexpressible, which is a shape the Evolution Tree probably wants.

> **Disposition.** Make the floor tier-aware, or apply only on first generation.

---

## Rules safe to keep as-is

| Pass | Why it is safe |
|---|---|
| A — PullGravity | Every mutation guarded by an absence check. Injects `LINEAR` only when no trajectory exists — a fallback, not an overwrite. |
| B — LingeringHazard | Field/instability injection guarded by `hasSpawnFieldOrTerrain` / `hasInstabilityAction`. Idempotent. |
| `ensureProjectileTriggerDisplacement` | Adds an `ON_HIT` impulse only when the node lacks displacement. |
| `ensureDisplacementSemantics` | Many early-return guards; only acts when nothing in the schema displaces anything. |

These four can run on every evolution pass unchanged. `[Verified]`

Caveat on A and B: both inject `{ type: 'LINEAR', speed: 700, maxRange: 500 }` when no
trajectory is present. Individually correct, but they are the second half of the compounding
failure described in [`02-pipeline-audit.md`](02-pipeline-audit.md) RC-2 — F or G deletes,
then A or B refills with `LINEAR`. Fixing F and G removes the interaction.

---

## Proposed shape of the fix

Nine separate patches share one pattern, so implement the pattern rather than the patches.

**Principle:** a repair rule may write a field only if that field is currently absent. Any
rule that would replace an existing value must either skip, or be explicitly marked as
first-generation-only.

**Mechanism:** a `SemanticRepairMode` parameter threaded exactly as `isHeadlessMode` already
is through `sanitizeAbilitySchema` → `repairAbilitySemantics`:

| Mode | Behaviour | Used by |
|---|---|---|
| `FIRST_GENERATION` | All rules, current behaviour | Initial forge/compile from a prompt |
| `EVOLUTION` | Gap-fillers only; overwrites and destructive passes skipped | Every re-entry: evolution tiers, modifier application, preset reload, inspector paste |

This is contained (one parameter, one branch per destructive rule), independently testable,
and leaves one-shot generation quality untouched.

**Verification.** The regression test that proves it: take
[`verticalRecipes.ts`](../../src/devtools/presetPacks/verticalRecipes.ts) → `clusterMortar`,
give it evolved flavor text containing `ring`, `burst`, and `self`, run it through
`sanitizeAbilitySchema` in `EVOLUTION` mode, and assert the parent is still `BALLISTIC_ARC`,
the `ON_AIR_APEX` node still exists, the child still has `bounces >= 1`, and no field has
`affects: 'CASTER_ONLY'`. That test fails today in any mode.

Open design questions arising from this: [`05-open-questions.md`](05-open-questions.md) Q1–Q3.
