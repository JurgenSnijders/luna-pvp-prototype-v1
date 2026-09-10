import { MAX_ENTITIES } from '../../engine/PhysicsWorld';
import type { AbilitySchema, TriggerNode } from '../../types/schema';
import { MAX_DEPTH } from './constants';

export interface SaturationReport {
  clampedFields: string[];
  estimatedEntities: number;
  entityCapRisk: boolean;
  depthExceeded: boolean;
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.001;
}

function pushClampedField(report: SaturationReport, label: string): void {
  if (!report.clampedFields.includes(label)) {
    report.clampedFields.push(label);
  }
}

function compareTrajectoryField(
  report: SaturationReport,
  field: string,
  before: number | undefined,
  after: number | undefined,
  label: string,
): void {
  if (before === undefined && after === undefined) return;
  if (before === after) return;
  if (before !== undefined && after !== undefined && nearlyEqual(before, after)) return;
  pushClampedField(report, label);
}

function diffSchemaSaturation(pre: AbilitySchema, post: AbilitySchema): SaturationReport {
  const report: SaturationReport = {
    clampedFields: [],
    estimatedEntities: 0,
    entityCapRisk: false,
    depthExceeded: false,
  };

  if (pre.cooldownMs !== post.cooldownMs) {
    pushClampedField(report, `cooldownMs capped ${pre.cooldownMs} to ${post.cooldownMs}`);
  }
  if (pre.recoilKick !== post.recoilKick) {
    pushClampedField(report, `recoilKick capped ${pre.recoilKick} to ${post.recoilKick}`);
  }

  compareTrajectoryField(
    report,
    'speed',
    pre.trajectory?.speed,
    post.trajectory?.speed,
    `trajectory.speed capped ${pre.trajectory?.speed} to ${post.trajectory?.speed}`,
  );
  compareTrajectoryField(
    report,
    'maxRange',
    pre.trajectory?.maxRange,
    post.trajectory?.maxRange,
    `trajectory.maxRange capped ${pre.trajectory?.maxRange} to ${post.trajectory?.maxRange}`,
  );
  compareTrajectoryField(
    report,
    'piercing',
    pre.trajectory?.piercing,
    post.trajectory?.piercing,
    `trajectory.piercing capped ${pre.trajectory?.piercing} to ${post.trajectory?.piercing}`,
  );

  if ((pre.visuals?.size ?? 0) !== (post.visuals?.size ?? 0)) {
    pushClampedField(
      report,
      `visuals.size capped ${pre.visuals?.size} to ${post.visuals?.size}`,
    );
  }

  diffTriggerSaturation(pre.triggers ?? [], post.triggers ?? [], report, 0);

  report.estimatedEntities = estimateEntities(post);
  report.entityCapRisk = report.estimatedEntities >= MAX_ENTITIES;
  report.depthExceeded = detectDepthExceeded(post.triggers ?? [], 0);

  return report;
}

function diffTriggerSaturation(
  preNodes: TriggerNode[],
  postNodes: TriggerNode[],
  report: SaturationReport,
  depth: number,
): void {
  const count = Math.max(preNodes.length, postNodes.length);
  for (let i = 0; i < count; i++) {
    const preNode = preNodes[i];
    const postNode = postNodes[i];
    if (!preNode || !postNode) continue;

    const preActions = preNode.actions ?? [];
    const postActions = postNode.actions ?? [];
    const actionCount = Math.max(preActions.length, postActions.length);
    for (let j = 0; j < actionCount; j++) {
      const preAction = preActions[j];
      const postAction = postActions[j];
      if (!preAction || !postAction) continue;

      if (preAction.type === 'SPAWN_FIELD' && postAction.type === 'SPAWN_FIELD') {
        if (preAction.field.radius !== postAction.field.radius) {
          pushClampedField(
            report,
            `field.radius capped ${preAction.field.radius} to ${postAction.field.radius}`,
          );
        }
        if (preAction.field.durationMs !== postAction.field.durationMs) {
          pushClampedField(
            report,
            `field.durationMs capped ${preAction.field.durationMs} to ${postAction.field.durationMs}`,
          );
        }
      }

      if (preAction.type === 'SPAWN_PROJECTILE' && postAction.type === 'SPAWN_PROJECTILE') {
        const preCount = preAction.emitter?.count ?? 1;
        const postCount = postAction.emitter?.count ?? 1;
        if (preCount !== postCount) {
          pushClampedField(report, `emitter.count capped ${preCount} to ${postCount}`);
        }

        compareTrajectoryField(
          report,
          'projectile.speed',
          preAction.projectileTrajectory.speed,
          postAction.projectileTrajectory.speed,
          `projectile.speed capped ${preAction.projectileTrajectory.speed} to ${postAction.projectileTrajectory.speed}`,
        );

        if (preAction.triggers || postAction.triggers) {
          diffTriggerSaturation(
            preAction.triggers ?? [],
            postAction.triggers ?? [],
            report,
            depth + 1,
          );
        }
      }
    }

    if (preNode.children || postNode.children) {
      diffTriggerSaturation(preNode.children ?? [], postNode.children ?? [], report, depth);
    }
  }
}

function estimateEntities(schema: AbilitySchema): number {
  return estimateTriggerEntities(schema.triggers ?? [], 0, 1);
}

function estimateTriggerEntities(nodes: TriggerNode[], depth: number, multiplier: number): number {
  if (depth >= MAX_DEPTH) return 0;

  let peak = 0;
  for (const node of nodes) {
    for (const action of node.actions) {
      if (action.type !== 'SPAWN_PROJECTILE') continue;
      const count = action.emitter?.count ?? 1;
      const spawned = multiplier * count;
      peak = Math.max(peak, spawned);
      if (action.triggers?.length) {
        peak = Math.max(peak, estimateTriggerEntities(action.triggers, depth + 1, spawned));
      }
    }
    if (node.children?.length) {
      peak = Math.max(peak, estimateTriggerEntities(node.children, depth, multiplier));
    }
  }
  return peak;
}

function detectDepthExceeded(nodes: TriggerNode[], depth: number): boolean {
  if (depth > MAX_DEPTH) return true;
  for (const node of nodes) {
    for (const action of node.actions) {
      if (action.type === 'SPAWN_PROJECTILE' && action.triggers?.length) {
        if (detectDepthExceeded(action.triggers, depth + 1)) return true;
      }
      if (action.type === 'CAST_CHILD_PAYLOAD') {
        if (detectDepthExceeded(action.payload.triggers ?? [], depth + 1)) return true;
      }
    }
    if (node.children?.length && detectDepthExceeded(node.children, depth)) return true;
  }
  return false;
}

export function analyzeSaturation(pre: AbilitySchema, post: AbilitySchema): SaturationReport {
  return diffSchemaSaturation(pre, post);
}

export function formatSaturationChips(report: SaturationReport): string[] {
  const chips: string[] = [...report.clampedFields];
  if (report.entityCapRisk) {
    chips.push(`entity cap risk (~${report.estimatedEntities} spawns)`);
  }
  if (report.depthExceeded) {
    chips.push(`trigger depth exceeds ${MAX_DEPTH}`);
  }
  return chips;
}
