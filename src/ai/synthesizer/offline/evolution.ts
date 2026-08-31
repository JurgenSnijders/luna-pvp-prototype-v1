import { balanceAbilitySchema, scoreAbilitySchema } from '../../BudgetEngine';
import type { CardRarity, DraftCard, EvolutionContext } from '../../../types/cards';
import type { AbilitySchema, TrajectoryConfig, TriggerNode } from '../../../types/schema';
import { makeActiveCard } from '../cards';

type EvolutionTheme = 'scatter' | 'explosive' | 'orbit' | 'bounce' | 'generic';

interface EvolutionVariant {
  schema: AbilitySchema;
  diff: string[];
  tagline: string;
  id: string;
}

function ensureTrigger(schema: AbilitySchema, trigger: TriggerNode['trigger']): TriggerNode {
  let node = schema.triggers.find((t) => t.trigger === trigger);
  if (!node) {
    node = { trigger, actions: [] };
    schema.triggers.push(node);
  }
  return node;
}

function parseEvolutionQuantity(prompt: string): number {
  const match = prompt.match(/(?:split into|explode into|spawn|create)?\s*(\d+)/i);
  if (match) {
    return Math.max(2, Math.min(6, parseInt(match[1], 10)));
  }
  if (/\b(split|cluster|scatter|multi|fork)\b/i.test(prompt)) {
    return 3;
  }
  return 3;
}

function detectEvolutionTheme(prompt: string): EvolutionTheme {
  const p = prompt.toLowerCase();
  if (/\b(split|beam|multi|scatter|fork)\b/.test(p)) return 'scatter';
  if (/\b(explode|cluster|bomb|detonate|shrapnel)\b/.test(p)) return 'explosive';
  if (/\b(orbit|shield|barrier|satellite)\b/.test(p)) return 'orbit';
  if (/\b(bounce|ricochet|return|boomerang)\b/.test(p)) return 'bounce';
  return 'generic';
}

function deriveVariantName(baseName: string, prompt: string, label: string): string {
  const qtyMatch = prompt.match(/(\d+)/);
  const qty = qtyMatch ? qtyMatch[1] : null;
  if (qty) return `${baseName} · ${qty}-${label}`;
  return `${baseName} · ${label}`;
}

function defaultLinearTraj(overrides: Partial<TrajectoryConfig> = {}): TrajectoryConfig {
  return {
    type: 'LINEAR',
    speed: 400,
    maxRange: 280,
    piercing: 0,
    ...overrides,
  };
}

function spawnFanChildren(
  node: TriggerNode,
  baseTraj: TrajectoryConfig,
  count: number,
  spreadDegPerCount = 15,
): void {
  const spreadDeg = spreadDegPerCount * count * 2;
  node.actions.push({
    type: 'SPAWN_PROJECTILE',
    projectileTrajectory: { ...baseTraj },
    emitter: {
      count,
      spreadDeg,
      distribution: 'FAN',
    },
    triggers: [
      {
        trigger: 'ON_HIT',
        actions: [{ type: 'APPLY_IMPULSE', baseForce: 300 }],
      },
    ],
  });
}

function spawnFragmentBurst(
  node: TriggerNode,
  count: number,
  speed = 380,
): void {
  node.actions.push({
    type: 'SPAWN_PROJECTILE',
    projectileTrajectory: defaultLinearTraj({ speed, maxRange: 260 }),
    emitter: {
      count,
      spreadDeg: 15 * count * 2,
      distribution: 'FAN',
    },
    triggers: [
      {
        trigger: 'ON_HIT',
        actions: [{ type: 'APPLY_IMPULSE', baseForce: 280 }],
      },
    ],
  });
}

function addRadialDetonation(node: TriggerNode, strength = 700): void {
  node.actions.push({
    type: 'SPAWN_FIELD',
    field: {
      fieldType: 'RADIAL_IMPULSE',
      radius: 95,
      strength,
      durationMs: 400,
    },
  });
}

function addSingularity(node: TriggerNode): void {
  node.actions.push({
    type: 'SPAWN_FIELD',
    field: {
      fieldType: 'MASS_ATTRACTOR',
      radius: 110,
      strength: 7500,
      durationMs: 2400,
    },
  });
}

function addChainBomblet(node: TriggerNode, count: number): void {
  node.actions.push({
    type: 'SPAWN_PROJECTILE',
    projectileTrajectory: defaultLinearTraj({ speed: 180, maxRange: 160 }),
    emitter: {
      count,
      spreadDeg: 40,
      distribution: 'FAN',
    },
    triggers: [
      {
        trigger: 'ON_EXPIRY',
        actions: [
          {
            type: 'SPAWN_FIELD',
            field: {
              fieldType: 'RADIAL_IMPULSE',
              radius: 70,
              strength: 550,
              durationMs: 350,
            },
          },
        ],
      },
    ],
  });
}

function baseChildTraj(base: AbilitySchema): TrajectoryConfig {
  if (base.trajectory) {
    return {
      ...structuredClone(base.trajectory),
      type: 'LINEAR',
      speed: Math.min(600, base.trajectory.speed ?? 400),
      maxRange: Math.min(400, base.trajectory.maxRange ?? 300),
      piercing: 0,
    };
  }
  return defaultLinearTraj();
}

function buildScatterVariants(
  base: AbilitySchema,
  prompt: string,
  n: number,
): EvolutionVariant[] {
  const childTraj = baseChildTraj(base);
  const halfFan = 15 * n;

  const fork = structuredClone(base);
  delete fork.trajectory;
  const castNode = ensureTrigger(fork, 'ON_CAST');
  spawnFanChildren(castNode, childTraj, n, 15);
  fork.id = `${base.id}_fork`;
  fork.name = deriveVariantName(base.name, prompt, 'Fork');

  const death = structuredClone(base);
  if (!death.trajectory) {
    death.trajectory = defaultLinearTraj({ speed: 450, maxRange: 500 });
  }
  const expiryNode = ensureTrigger(death, 'ON_EXPIRY');
  spawnFragmentBurst(expiryNode, n);
  death.id = `${base.id}_death_split`;
  death.name = deriveVariantName(base.name, prompt, 'Death Split');

  const beam = structuredClone(base);
  beam.trajectory = {
    type: 'LINEAR',
    speed: 1200,
    maxRange: beam.trajectory?.maxRange ?? 900,
    piercing: n,
  };
  const tickNode = ensureTrigger(beam, 'ON_TICK');
  tickNode.actions.push({
    type: 'SPAWN_FIELD',
    field: {
      fieldType: 'FRICTION_OVERRIDE',
      radius: 28,
      strength: 0,
      durationMs: 400,
      frictionValue: 0.04,
    },
  });
  beam.id = `${base.id}_beam`;
  beam.name = deriveVariantName(base.name, prompt, 'Beam');

  return [
    {
      schema: fork,
      diff: [`+ ${n}-way scatter (±${halfFan}°)`],
      tagline: 'Fork Scatter',
      id: 'evo_fork',
    },
    {
      schema: death,
      diff: [`+ Death split ×${n} on ON_EXPIRY`],
      tagline: 'Death Split',
      id: 'evo_death_split',
    },
    {
      schema: beam,
      diff: [`Trajectory → LINEAR beam`, `piercing ${n}`, '+ Beam trail ON_TICK'],
      tagline: 'Piercing Beam',
      id: 'evo_beam',
    },
  ];
}

function buildExplosiveVariants(
  base: AbilitySchema,
  prompt: string,
  n: number,
): EvolutionVariant[] {
  const bomb = structuredClone(base);
  if (!bomb.trajectory) {
    bomb.trajectory = defaultLinearTraj({ speed: 480, maxRange: 520 });
  }
  const hitNode = ensureTrigger(bomb, 'ON_HIT');
  addRadialDetonation(hitNode, 750);
  spawnFragmentBurst(hitNode, n, 420);
  bomb.id = `${base.id}_bomb`;
  bomb.name = deriveVariantName(base.name, prompt, 'Bomb Burst');

  const vortex = structuredClone(base);
  if (!vortex.trajectory) {
    vortex.trajectory = defaultLinearTraj({ speed: 360, maxRange: 480 });
  }
  const expiryNode = ensureTrigger(vortex, 'ON_EXPIRY');
  addSingularity(expiryNode);
  vortex.id = `${base.id}_singularity`;
  vortex.name = deriveVariantName(base.name, prompt, 'Singularity');

  const chain = structuredClone(base);
  if (!chain.trajectory) {
    chain.trajectory = defaultLinearTraj({ speed: 400, maxRange: 450 });
  }
  const chainHit = ensureTrigger(chain, 'ON_HIT');
  addChainBomblet(chainHit, n);
  chain.id = `${base.id}_chain`;
  chain.name = deriveVariantName(base.name, prompt, 'Chain');

  return [
    {
      schema: bomb,
      diff: [`+ RADIAL_IMPULSE on ON_HIT`, `+ ${n} shrapnel fragments`],
      tagline: 'Radial Bomb Burst',
      id: 'evo_bomb',
    },
    {
      schema: vortex,
      diff: ['+ MASS_ATTRACTOR singularity on ON_EXPIRY'],
      tagline: 'Vortex Detonation',
      id: 'evo_vortex',
    },
    {
      schema: chain,
      diff: [`+ ${n} delayed chain bomblets on ON_HIT`],
      tagline: 'Chain Reaction',
      id: 'evo_chain',
    },
  ];
}

function buildOrbitVariants(
  base: AbilitySchema,
  prompt: string,
  n: number,
): EvolutionVariant[] {
  const orbitSpeeds = [4, -3, 2.5, 5, -2, 3.5];

  const ring = structuredClone(base);
  delete ring.trajectory;
  const castNode = ensureTrigger(ring, 'ON_CAST');
  for (let i = 0; i < n; i++) {
    castNode.actions.push({
      type: 'SPAWN_PROJECTILE',
      projectileTrajectory: {
        type: 'ORBIT_ANCHOR',
        orbitRadius: 55 + i * 25,
        orbitSpeed: orbitSpeeds[i % orbitSpeeds.length],
        maxRange: 800,
      },
      emitter: {
        count: 1,
        spreadDeg: 0,
        distribution: 'FAN',
        aimOffsetDeg: (360 / Math.max(1, n)) * i,
      },
      triggers: [
        {
          trigger: 'ON_HIT',
          actions: [{ type: 'ADD_INSTABILITY', amount: 18 }],
        },
      ],
    });
  }
  ring.id = `${base.id}_satellites`;
  ring.name = deriveVariantName(base.name, prompt, 'Satellites');

  const shield = structuredClone(base);
  shield.trajectory = {
    type: 'ORBIT_ANCHOR',
    orbitRadius: 60,
    orbitSpeed: 5,
    maxRange: 800,
  };
  const tickNode = ensureTrigger(shield, 'ON_TICK');
  tickNode.actions.push({
    type: 'SPAWN_FIELD',
    field: {
      fieldType: 'RADIAL_IMPULSE',
      radius: 50,
      strength: 200,
      durationMs: 200,
    },
  });
  shield.id = `${base.id}_barrier`;
  shield.name = deriveVariantName(base.name, prompt, 'Barrier');

  const nova = structuredClone(base);
  delete nova.trajectory;
  const novaCast = ensureTrigger(nova, 'ON_CAST');
  for (let i = 0; i < n; i++) {
    novaCast.actions.push({
      type: 'SPAWN_PROJECTILE',
      projectileTrajectory: {
        type: 'ORBIT_ANCHOR',
        orbitRadius: 50 + i * 20,
        orbitSpeed: orbitSpeeds[i % orbitSpeeds.length],
        maxRange: 800,
      },
      emitter: {
        count: 1,
        spreadDeg: 0,
        distribution: 'FAN',
        aimOffsetDeg: (360 / Math.max(1, n)) * i,
      },
      triggers: [
        {
          trigger: 'ON_EXPIRY',
          actions: [
            {
              type: 'SPAWN_FIELD',
              field: {
                fieldType: 'MASS_ATTRACTOR',
                radius: 90,
                strength: 6000,
                durationMs: 1800,
              },
            },
          ],
        },
      ],
    });
  }
  nova.id = `${base.id}_nova`;
  nova.name = deriveVariantName(base.name, prompt, 'Nova');

  return [
    {
      schema: ring,
      diff: [`+ ${n} ORBIT_ANCHOR satellites on ON_CAST`],
      tagline: 'Satellite Ring',
      id: 'evo_satellites',
    },
    {
      schema: shield,
      diff: ['Trajectory → ORBIT_ANCHOR', '+ Pulse barrier ON_TICK'],
      tagline: 'Shield Barrier',
      id: 'evo_barrier',
    },
    {
      schema: nova,
      diff: [`+ ${n} orbiting attractor bombs`],
      tagline: 'Expiring Nova',
      id: 'evo_nova',
    },
  ];
}

function buildBounceVariants(
  base: AbilitySchema,
  prompt: string,
  n: number,
): EvolutionVariant[] {
  const boom = structuredClone(base);
  boom.trajectory = {
    ...(boom.trajectory ?? defaultLinearTraj({ speed: 350, maxRange: 500 })),
    type: 'RETURN_TO_SOURCE',
    turnAccel: boom.trajectory?.turnAccel ?? 1100,
  };
  boom.id = `${base.id}_boomerang`;
  boom.name = deriveVariantName(base.name, prompt, 'Boomerang');

  const rico = structuredClone(base);
  rico.trajectory = {
    ...(rico.trajectory ?? defaultLinearTraj({ speed: 380, maxRange: 550 })),
    type: 'RETURN_TO_SOURCE',
    piercing: n,
    turnAccel: rico.trajectory?.turnAccel ?? 1000,
  };
  rico.id = `${base.id}_ricochet`;
  rico.name = deriveVariantName(base.name, prompt, 'Ricochet');

  const trap = structuredClone(base);
  trap.trajectory = {
    ...(trap.trajectory ?? defaultLinearTraj({ speed: 340, maxRange: 480 })),
    type: 'RETURN_TO_SOURCE',
    turnAccel: trap.trajectory?.turnAccel ?? 1200,
  };
  const returnNode = ensureTrigger(trap, 'ON_RETURN');
  returnNode.actions.push({
    type: 'SPAWN_FIELD',
    field: {
      fieldType: 'VORTEX_TANGENT',
      radius: 90,
      strength: -550,
      durationMs: 2200,
    },
  });
  trap.id = `${base.id}_return_trap`;
  trap.name = deriveVariantName(base.name, prompt, 'Return Trap');

  return [
    {
      schema: boom,
      diff: ['Trajectory → RETURN_TO_SOURCE'],
      tagline: 'Boomerang',
      id: 'evo_boomerang',
    },
    {
      schema: rico,
      diff: ['Trajectory → RETURN_TO_SOURCE', `+ Piercing ${n}`],
      tagline: 'Ricochet Pierce',
      id: 'evo_ricochet',
    },
    {
      schema: trap,
      diff: ['Trajectory → RETURN_TO_SOURCE', '+ VORTEX on ON_RETURN'],
      tagline: 'Return Trap',
      id: 'evo_return_trap',
    },
  ];
}

function buildGenericVariants(
  base: AbilitySchema,
  prompt: string,
  n: number,
): EvolutionVariant[] {
  const p = prompt.toLowerCase();

  const cluster = structuredClone(base);
  if (cluster.trajectory) {
    cluster.trajectory.piercing = Math.min(4, (cluster.trajectory.piercing ?? 0) + 1);
  }
  const clusterTarget = /\b(expiry|expire)\b/.test(p) ? 'ON_EXPIRY' : 'ON_HIT';
  const clusterNode = ensureTrigger(cluster, clusterTarget);
  spawnFragmentBurst(clusterNode, n);
  cluster.id = `${base.id}_cluster`;
  cluster.name = deriveVariantName(base.name, prompt, 'Cluster');

  const field = structuredClone(base);
  let fieldType: 'VORTEX_TANGENT' | 'RADIAL_IMPULSE' | 'FRICTION_OVERRIDE' = 'VORTEX_TANGENT';
  let strength = -500;
  let frictionValue: number | undefined;
  if (/\b(ice|cold|frost|slipstream|friction)\b/.test(p)) {
    fieldType = 'FRICTION_OVERRIDE';
    strength = 0;
    frictionValue = 0.02;
  } else if (/\b(blast|impulse|push|knock)\b/.test(p)) {
    fieldType = 'RADIAL_IMPULSE';
    strength = 700;
  } else if (/\b(black hole|singularity|pull|attract)\b/.test(p)) {
    fieldType = 'VORTEX_TANGENT';
    strength = -650;
  }
  const fieldTarget = /\b(expiry|expire)\b/.test(p) ? 'ON_EXPIRY' : 'ON_HIT';
  const fieldNode = ensureTrigger(field, fieldTarget);
  fieldNode.actions.push({
    type: 'SPAWN_FIELD',
    field: {
      fieldType,
      radius: 90,
      strength,
      durationMs: 2200,
      ...(frictionValue !== undefined ? { frictionValue } : {}),
    },
  });
  field.id = `${base.id}_field`;
  field.name = deriveVariantName(base.name, prompt, 'Trap');

  const motion = structuredClone(base);
  const motionDiff: string[] = [];
  if (/\b(dash|blink|teleport|phase)\b/.test(p) || !motion.trajectory) {
    const node = ensureTrigger(motion, 'ON_CAST');
    if (/\b(blink|teleport|phase)\b/.test(p) || !motion.trajectory) {
      node.actions.push({ type: 'TELEPORT', distance: 110 });
      motionDiff.push('+ TELEPORT on ON_CAST');
    } else {
      node.actions.push({ type: 'APPLY_IMPULSE', baseForce: 600 });
      motionDiff.push('+ Recoil dash impulse on ON_CAST');
    }
  }
  if (motion.trajectory) {
    if (/\b(homing|seek|track)\b/.test(p) || motionDiff.length === 0) {
      motion.trajectory = {
        ...motion.trajectory,
        type: 'HOMING_SLERP',
        turnAccel: motion.trajectory.turnAccel ?? 700,
      };
      motionDiff.push('Trajectory → HOMING_SLERP');
    }
  } else if (motionDiff.length === 0) {
    motion.trajectory = {
      type: 'HOMING_SLERP',
      speed: 380,
      maxRange: 520,
      turnAccel: 650,
    };
    motionDiff.push('+ Trajectory HOMING_SLERP');
  }
  motion.id = `${base.id}_motion`;
  motion.name = deriveVariantName(base.name, prompt, 'Arc');

  return [
    {
      schema: cluster,
      diff: [
        ...(cluster.trajectory ? [`+ Piercing ${cluster.trajectory.piercing}`] : []),
        `+ ${n} fragments on ${clusterTarget}`,
      ],
      tagline: 'Cluster Payload',
      id: 'evo_cluster',
    },
    {
      schema: field,
      diff: [`+ SPAWN_FIELD ${fieldType} on ${fieldTarget}`],
      tagline: 'Spatial Trap',
      id: 'evo_field',
    },
    {
      schema: motion,
      diff: motionDiff,
      tagline: 'Motion Augment',
      id: 'evo_motion',
    },
  ];
}

function buildThemeVariants(
  theme: EvolutionTheme,
  base: AbilitySchema,
  prompt: string,
  n: number,
): EvolutionVariant[] {
  switch (theme) {
    case 'scatter':
      return buildScatterVariants(base, prompt, n);
    case 'explosive':
      return buildExplosiveVariants(base, prompt, n);
    case 'orbit':
      return buildOrbitVariants(base, prompt, n);
    case 'bounce':
      return buildBounceVariants(base, prompt, n);
    default:
      return buildGenericVariants(base, prompt, n);
  }
}

export function generateOfflineEvolution(
  prompt: string,
  context: EvolutionContext,
): DraftCard[] {
  const n = parseEvolutionQuantity(prompt);
  const theme = detectEvolutionTheme(prompt);
  const basePower = scoreAbilitySchema(context.baseAbility);
  const variants = buildThemeVariants(theme, context.baseAbility, prompt, n);
  const rarities: CardRarity[] = ['COMMON', 'RARE', 'EPIC'];

  return variants.map((v, i) => {
    let schema = v.schema;
    let balanced = balanceAbilitySchema(schema, context.category);

    if (scoreAbilitySchema(balanced) < basePower * 0.95) {
      schema = structuredClone(v.schema);
      balanced = balanceAbilitySchema(schema, context.category);
    }

    return makeActiveCard(
      v.id,
      balanced.name,
      v.tagline,
      `Evolved from ${context.baseAbility.name}: ${prompt.slice(0, 48) || 'mutation'}`,
      rarities[i],
      balanced,
      context.category,
      v.diff,
    );
  });
}
