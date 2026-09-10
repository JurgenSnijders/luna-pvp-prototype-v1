import { Vector2D } from '../math/Vector2D';
import type { PathPoint, PathSpace, TrajectoryConfig } from '../types/schema';

const PATH_COORD_MIN = -2000;
const PATH_COORD_MAX = 2000;

function clampCoord(value: number): number {
  return Math.max(PATH_COORD_MIN, Math.min(PATH_COORD_MAX, value));
}

function perpendicularDistance(
  point: PathPoint,
  lineStart: PathPoint,
  lineEnd: PathPoint,
): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    return Math.hypot(point.x - lineStart.x, point.y - lineStart.y);
  }
  const t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lenSq;
  const projX = lineStart.x + t * dx;
  const projY = lineStart.y + t * dy;
  return Math.hypot(point.x - projX, point.y - projY);
}

function rdp(points: PathPoint[], tolerance: number): PathPoint[] {
  if (points.length <= 2) return points.slice();

  let maxDist = 0;
  let maxIndex = 0;
  const end = points.length - 1;

  for (let i = 1; i < end; i++) {
    const dist = perpendicularDistance(points[i], points[0], points[end]);
    if (dist > maxDist) {
      maxDist = dist;
      maxIndex = i;
    }
  }

  if (maxDist > tolerance) {
    const left = rdp(points.slice(0, maxIndex + 1), tolerance);
    const right = rdp(points.slice(maxIndex), tolerance);
    return [...left.slice(0, -1), ...right];
  }

  return [points[0], points[end]];
}

function decimateUniform(points: PathPoint[], maxPoints: number): PathPoint[] {
  if (points.length <= maxPoints) return points;
  const result: PathPoint[] = [points[0]];
  const step = (points.length - 1) / (maxPoints - 1);
  for (let i = 1; i < maxPoints - 1; i++) {
    result.push(points[Math.round(i * step)]);
  }
  result.push(points[points.length - 1]);
  return result;
}

export function simplifyPath(
  points: PathPoint[],
  tolerance: number,
  maxPoints: number,
): PathPoint[] {
  if (points.length <= 2) return points.slice();
  let simplified = rdp(points, tolerance);
  if (simplified.length > maxPoints) {
    simplified = decimateUniform(simplified, maxPoints);
  }
  return simplified;
}

export function toCasterLocalFrame(
  worldPoints: PathPoint[],
  origin: PathPoint,
  angle: number,
): PathPoint[] {
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  return worldPoints.map((p) => {
    const tx = p.x - origin.x;
    const ty = p.y - origin.y;
    return {
      x: clampCoord(tx * cos - ty * sin),
      y: clampCoord(tx * sin + ty * cos),
    };
  });
}

export function resolvePathWorldPoints(
  config: TrajectoryConfig,
  spawnPos: Vector2D,
  aimAngle: number,
): Vector2D[] {
  const pathPoints = config.pathPoints ?? [];
  if (pathPoints.length < 2) return [];

  const space: PathSpace = config.pathSpace ?? 'CASTER_RELATIVE';
  if (space === 'WORLD') {
    return pathPoints.map((p) => Vector2D.create(p.x, p.y));
  }

  const cos = Math.cos(aimAngle);
  const sin = Math.sin(aimAngle);
  return pathPoints.map((p) => {
    const rx = p.x * cos - p.y * sin;
    const ry = p.x * sin + p.y * cos;
    return Vector2D.create(spawnPos.x + rx, spawnPos.y + ry);
  });
}

export function buildArcLengthTable(points: Vector2D[]): {
  cumulative: number[];
  total: number;
} {
  const cumulative: number[] = [0];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += points[i].sub(points[i - 1]).mag();
    cumulative.push(total);
  }
  return { cumulative, total };
}

export function samplePathAtDistance(
  points: Vector2D[],
  cumulative: number[],
  dist: number,
): { pos: Vector2D; dir: Vector2D } {
  if (points.length === 0) {
    return { pos: Vector2D.zero(), dir: Vector2D.fromAngle(0) };
  }
  if (points.length === 1 || dist <= 0) {
    const dir =
      points.length > 1
        ? points[1].sub(points[0]).normalize()
        : Vector2D.fromAngle(0);
    return { pos: points[0].clone(), dir };
  }

  const total = cumulative[cumulative.length - 1] ?? 0;
  const clampedDist = Math.max(0, Math.min(dist, total));

  let segmentIndex = 0;
  for (let i = 1; i < cumulative.length; i++) {
    if (cumulative[i] >= clampedDist) {
      segmentIndex = i - 1;
      break;
    }
    segmentIndex = i - 1;
  }

  const segStart = cumulative[segmentIndex] ?? 0;
  const segEnd = cumulative[segmentIndex + 1] ?? segStart;
  const segLen = Math.max(segEnd - segStart, 0.0001);
  const t = (clampedDist - segStart) / segLen;
  const a = points[segmentIndex];
  const b = points[segmentIndex + 1] ?? a;
  const pos = a.lerp(b, t);
  const dir = b.sub(a).normalize();
  return { pos, dir };
}
