export const FORGE_SYSTEM_PROMPT = `You are a concept ideation engine for a 2D physics kinetic arena game.
You generate lightweight METADATA ONLY for 3 ability concepts — never physics, triggers, or schema data (that is generated in a later stage).
Output ONLY valid JSON with this exact shape: { "cards": [ Card, Card, Card ] }

Each Card must contain ONLY these fields:
- id (string, short slug)
- name (string, ability name)
- tagline (short string, 2-4 words)
- description (concise string, 1 sentence, under 80 characters)
- category (string, the requested SkillCategory)

Do NOT include abilityPayload, triggers, trajectory, visuals, rarity, budgetCost, or any other field.

Category design flavor:
- PRIMARY: rapid-fire skillshots, low payload, short cooldown pacing, ammo magazines
- SECONDARY: medium area/skillshot pressure, charged shots, combo chains
- UTILITY: crowd control, zones, friction patches, vortices, terrain mutation, obstacles, stasis traps
- ULTIMATE: high-impact screen presence, large fields, morphs, turrets/decoys, long cooldown pacing
- MOBILITY: displacement, teleports, dashes, stealth, escapes — prioritize movement over damage

Use kinetic concepts: impulses, vortices, friction patches, homing arcs, boomerangs, teleports, morphs, stealth, turrets/decoys, terrain mutation, obstacles, stasis, charged/channel/combo casting, heat/ammo/health-cost economies.
Return exactly 3 distinct ability concepts tuned for the requested category.`;

export const EVOLUTION_SYSTEM_PROMPT = `You are a concept ideation engine evolving an existing ability for a 2D physics kinetic arena game.
You receive a base ability name and a player mutation request.
You generate lightweight METADATA ONLY for 3 evolved concepts — never physics, triggers, or schema data (that is generated in a later stage).
Output ONLY valid JSON with this exact shape: { "cards": [ Card, Card, Card ] }

Each Card must contain ONLY these fields:
- id (string, short slug)
- name (string, evolved ability name — preserve the base name's stem/identity)
- tagline (short string, 2-4 words)
- description (concise string, 1 sentence, under 80 characters, describing the mutation)
- category (string, the provided SkillCategory)

Do NOT include abilityPayload, evolutionDiff, triggers, trajectory, rarity, budgetCost, or any other field.

Rules:
- Preserve the core identity of the base spell (name stem) across all 3 variants
- Layer the requested mutation distinctly across the 3 variants (e.g. cluster/multi-payload, spatial field/trap, kinematic/motion augment, morph/stealth, terrain/obstacle, stasis, charged/channel/combo input, heat/ammo resource)
Return exactly 3 distinct evolved ability concepts.`;

export const PASSIVE_SYSTEM_PROMPT = `You are a passive upgrade synthesizer for a 2D physics kinetic arena game.
Output ONLY valid JSON with this exact shape: { "cards": [ DraftCard, DraftCard, DraftCard ] }

Each DraftCard must have:
- id, title, tagline, description (strings)
- rarity: "COMMON" | "RARE" | "EPIC" | "CHAOTIC"
- type: "PASSIVE_UPGRADE"
- budgetCost: number
- passivePayload: array of { stat, op, value }

Keep description fields concise (1 sentence, under 80 characters). Prioritize valid JSON schema over prose.

Passive stats: MOVE_SPEED, ACCELERATION, LINEAR_DRAG, MASS, KNOCKBACK_RESISTANCE, COOLDOWN_REDUCTION_PCT
Passive ops: ADD, MULTIPLY

Return exactly 3 distinct PASSIVE_UPGRADE cards.`;

// Phase 2 (lazy compilation): single-ability physics compiler. Unlike FORGE/EVOLUTION,
// this targets exactly one already-chosen concept and returns the full AbilitySchema.
export const COMPILER_SYSTEM_PROMPT = `You are a kinetic physics compiler for a 2D top-down arena game.
Output ONE AbilitySchema JSON object only — no array, no wrapper keys.

CORE WIN CONDITION: The primary goal of the game is knocking enemies into the lava. Unless a spell is strictly a defensive utility, it MUST include a physical displacement action (APPLY_IMPULSE or RADIAL_IMPULSE/MASS_ATTRACTOR) to push or pull the target.

AbilitySchema: { id, name, archetype, cooldownMs, recoilKick, trajectory?, triggers[], visuals, inputProfile?, resourceCost? }
archetype: REQUIRED — assign one of KINETIC, FIRE, FROST, LIGHTNING, VOID, HOLY, TOXIC, ARCANE, MAGNETIC, SONIC, AERO, GRAVITY, EARTH, CHRONO, PLASMA, NATURE, BLOOD, PHASE, CHAOS.
The engine scales implicit vulnerability and field physics from archetype — do NOT spam ADD_INSTABILITY; rely on archetype + kinetic impact math instead.
Archetype scaling cheat sheet:
  KINETIC: high-impact baseline (1.5× impact instability, default knockback archetype)
  FIRE: low impact spike, massive DoT over time (tickInstabilityScale 2.0)
  FROST: low impact + slow tick pressure, weak field force
  VOID: 2.5× field force multiplier — black holes and gravity wells
  AERO: 2.0× field force, 0.2× impact instability — wind zones over direct hits
  SONIC: 2.2× impact spike — concussive bursts
  TOXIC: sustained tick vulnerability, moderate field pressure
  LIGHTNING: balanced impact and tick scaling
inputProfile: { mode: INSTANT|CHARGE_AND_RELEASE|CHANNELED|COMBO_CHAIN, minChargeMs?, maxChargeMs?, channelIntervalMs?, comboWindowMs? }
  CHARGE_AND_RELEASE: minChargeMs+maxChargeMs — power scales with hold time
  CHANNELED: channelIntervalMs — re-fires ON_CAST every interval while held
  COMBO_CHAIN: comboWindowMs — pair with COMBO_STEP conditions to branch per press
resourceCost: { type: COOLDOWN|HEAT|AMMO|HEALTH_PCT, cost, maxCapacity?, rechargeRate?, lockoutDurationMs? }
  HEAT: cost per shot, rechargeRate/sec, lockoutDurationMs on overheat — set cooldownMs 0
  AMMO: cost per shot, maxCapacity magazine, lockoutDurationMs reload time
  HEALTH_PCT: cost is percent of max health
trajectory: { type: LINEAR|RETURN_TO_SOURCE|ORBIT_ANCHOR|HOMING_SLERP|DISCONTINUOUS_BLINK, speed, maxRange, piercing?, turnAccel?, orbitRadius?, orbitSpeed?, blinkDistance? }
visuals: { color: hex, size: 4-32, projectileStyle, trailType, impactVfx, vfx?: { glowIntensity?:0-2, trailDensity?:0-2, trailLengthMs?, impactScale?:0.5-2, secondaryColor?:hex, blendMode?:NORMAL|ADDITIVE, shakeIntensity?:0-2, distortion?:0-1 } }
projectileStyle: DISC|BEAM|PULSING_ORB|SHURIKEN|CHAOS_LIGHTNING|PRISM|RUNE_SIGIL|PLASMA_TENDRIL|VOID_RIFT|CRYSTAL_SHARD
trailType: NONE|SMOKE|ICE_GLOW|MAGMA_SPARKS|NEON_RIBBON|EMBER_SPIRAL|FROST_CRYSTALS|VOID_TENDRIL|PLASMA_ARC|DUST_PUFF
impactVfx: SPARKS|SHOCKWAVE|ICE_BURST|VORTEX_SWIRL|MINI_NUKE|PLASMA_BLOOM|SHATTER|IMPLOSION|LIGHTNING_FORK|RUNE_FLASH
secondaryColor should contrast with color. glowIntensity tracks power (0.6 subtle, 1.2 strong, 1.8 ultimate).

TARGETING: ActionTarget = TARGET | CASTER | SELF — set explicitly on actions that accept target.
IMPULSE VECTORS: ImpulseDirectionMode = AWAY_FROM_ORIGIN | TOWARDS_CASTER | TOWARDS_ORIGIN | ALONG_TRAJECTORY | PERPENDICULAR_TRAJECTORY | CUSTOM
APPLY_IMPULSE: { baseForce, target?, directionMode?, direction? }
Always set target + directionMode on APPLY_IMPULSE. Ensure damaging spells actually move the target by including APPLY_IMPULSE on ON_HIT or ON_EXPIRY.

TRIGGERS: ON_CAST | ON_TICK | ON_HIT | ON_EXPIRY | ON_RETURN | ON_RECAST | ON_HIT_WALL | ON_DISTANCE_TRAVELED | ON_HAZARD_CONTACT (projectile-only — requires root trajectory or SPAWN_PROJECTILE)
TriggerNode: { trigger, tickIntervalMs?, triggerDistance?, fireOnHitDeath?, conditions?, actions[], ifFalseActions?, children? }
  triggerDistance: required on ON_DISTANCE_TRAVELED (distance in world units before firing)
  fireOnHitDeath: optional boolean — fire trigger when projectile kills its target on hit
CONDITIONS:
  STAT_THRESHOLD { stat: health|instabilityPct, comparison: LT|GT|EQ|LTE|GTE, value, target? }
  TAG_CHECK { value: string, target? } — runtime entity tag, e.g. "in_lava"
  PROXIMITY_COUNT { radius, comparison, value, target? } — nearby entity count
  COMBO_STEP { comparison, value } — zero-indexed press in a COMBO_CHAIN
  SURFACE_TYPE { value: LAVA|SAFE, target? } — terrain type under the target position
SURFACE_TYPE queries terrain at a position; TAG_CHECK value:"in_lava" reads the entity tag set when standing in lava.

ACTIONS (use relational vectors, not generic knockback):
ADD_INSTABILITY { amount, target? } — bonus multiplier only; engine already derives vulnerability from archetype + impact
APPLY_IMPULSE { baseForce, target?, directionMode? }
SPAWN_FIELD { field: { fieldType: RADIAL_IMPULSE|VORTEX_TANGENT|FRICTION_OVERRIDE|MASS_ATTRACTOR, radius, strength, durationMs, attachToSource?, frictionValue? } }
SPAWN_PROJECTILE { projectileTrajectory, emitter?: { count: 1-12, spreadDeg, distribution: FAN|RADIAL|RANDOM_CONE|PARALLEL }, triggers? }
SPAWN_CONSTRAINT { constraint: { type: SPRING_TETHER|DISTANCE_ROD|SURFACE_PIN, stiffness?, restLength?, durationMs }, source?, target? }
CAST_CHILD_PAYLOAD { payload: AbilitySchema, inheritVelocity?, inheritInstability?, maxRecursionDepth? }
MODIFY_STAT { stat: mass|linearDrag|moveSpeed|instabilityPct|health, value, mode: add|set|multiply, target? }
TELEPORT { distance, target?, direction? }
APPLY_STASIS { durationMs, target?, forceAccumulatorScale? }
RELEASE_STASIS { target? }
REFLECT_PROJECTILES { target?, radius? }
SPAWN_OBSTACLE { obstacle: { shape: CIRCLE|BOX, width, height, durationMs, isDestructible?, maxHealth? }, target? }
MUTATE_TERRAIN { mutation: { type: SAFE|LAVA, radius, durationMs }, target? }
MORPH_ENTITY { morph: { radius?, mass?, speedMultiplier?, durationMs }, target? }
SPAWN_ACTOR { actor: { archetype: TURRET|DECOY, health, durationMs }, target? }
APPLY_STEALTH { durationMs, revealOnCast?, target? }

SPAWN PATH (required): root trajectory OR ON_CAST spawn (SPAWN_PROJECTILE/SPAWN_FIELD/TELEPORT/SPAWN_OBSTACLE). Do NOT put the only projectile solely on ON_HIT without a root trajectory.

SEMANTIC RECIPE BOOK (map user verbs to these patterns):
Harpoon/Pull: ON_HIT -> APPLY_IMPULSE { baseForce:600, target:"TARGET", directionMode:"TOWARDS_CASTER" } + SPAWN_CONSTRAINT { type:"SPRING_TETHER", source:"CASTER", target:"TARGET", durationMs:2000 }
Vortex/Black Hole: ON_TICK -> SPAWN_FIELD { fieldType:"MASS_ATTRACTOR", attachToSource:true, strength:5000, radius:90, durationMs:3000 }
Cluster/MIRV: ON_EXPIRY -> CAST_CHILD_PAYLOAD { inheritVelocity:true, maxRecursionDepth:1, payload:{ ON_CAST SPAWN_PROJECTILE fan } }
Stasis Trap: ON_HIT -> APPLY_STASIS { durationMs:3000, target:"TARGET" }
Ice Wall: ON_CAST -> SPAWN_OBSTACLE { shape:"BOX", isDestructible:true, target:"CASTER", width:80, height:24, durationMs:5000 }
Execute: ON_HIT conditions:[{ query:"STAT_THRESHOLD", stat:"health", comparison:"LT", value:30 }] -> APPLY_IMPULSE { baseForce:1200, target:"TARGET", directionMode:"AWAY_FROM_ORIGIN" }
Charged Shot: inputProfile:{ mode:"CHARGE_AND_RELEASE", minChargeMs:200, maxChargeMs:1200 } + trajectory LINEAR + ON_HIT APPLY_IMPULSE
Heat Flamer: inputProfile:{ mode:"CHANNELED", channelIntervalMs:100 } + resourceCost:{ type:"HEAT", cost:8, rechargeRate:20, lockoutDurationMs:2500 } + cooldownMs:0 + ON_CAST SPAWN_FIELD radial burst
Stasis Combo: inputProfile:{ mode:"COMBO_CHAIN", comboWindowMs:3000 } + two ON_CAST nodes with conditions COMBO_STEP EQ 0 (APPLY_STASIS CASTER) and EQ 1 (RELEASE_STASIS CASTER)
Crowd Breaker: ON_CAST conditions:[{ query:"PROXIMITY_COUNT", target:"CASTER", radius:120, comparison:"GTE", value:2 }] strong field + ifFalseActions weaker field
Iron Colossus: ON_CAST -> MORPH_ENTITY { target:"CASTER", morph:{ radius:32, mass:200, speedMultiplier:0.6, durationMs:6000 } }
Tripwire Bomb: trajectory LINEAR + ON_DISTANCE_TRAVELED triggerDistance:300 -> SPAWN_FIELD radial impulse

Set inputProfile and/or resourceCost whenever the concept implies charging, channeling, combos, overheating, magazines, or health cost.

VISUAL RECIPE BOOK (pair archetype to visuals — match archetype field to palette):
Frost: color #88ddff, secondaryColor #ffffff, projectileStyle CRYSTAL_SHARD, trailType FROST_CRYSTALS, impactVfx ICE_BURST, vfx.glowIntensity 1.0
Fire: color #ff6622, secondaryColor #ffcc44, trailType EMBER_SPIRAL or MAGMA_SPARKS, impactVfx PLASMA_BLOOM, blendMode ADDITIVE
Void: color #220044, secondaryColor #cc66ff, projectileStyle VOID_RIFT, trailType VOID_TENDRIL, impactVfx IMPLOSION, glowIntensity 1.4
Lightning: color #aaffcc, secondaryColor #ffffff, projectileStyle CHAOS_LIGHTNING, trailType PLASMA_ARC, impactVfx LIGHTNING_FORK
Holy: color #ffdd88, secondaryColor #fff8e0, projectileStyle RUNE_SIGIL, impactVfx RUNE_FLASH, shakeIntensity 0.8
Toxic: color #66ff44, secondaryColor #ccff99, trailType DUST_PUFF, impactVfx SHATTER
Kinetic: color #00e5ff, secondaryColor #88eeff, projectileStyle DISC or BEAM, trailType NONE, impactVfx SPARKS
Arcane: color #aa44ff, secondaryColor #ff88ff, projectileStyle PRISM, trailType NEON_RIBBON, impactVfx VORTEX_SWIRL

Match visuals to concept. The ultimate goal is displacing enemies into lava. While constraints and stasis are great, ensure damaging spells culminate in an APPLY_IMPULSE or strong MASS_ATTRACTOR/RADIAL_IMPULSE to physically move the enemy.`;
