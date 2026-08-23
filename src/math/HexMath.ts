import { Vector2D } from './Vector2D';

const SQRT3 = Math.sqrt(3);
const HALF_SQRT3 = SQRT3 / 2;
const INNER_HALF_WIDTH = HALF_SQRT3;

/**
 * Flat-top regular hexagon with circumradius R (center to vertex).
 * Containment uses quadrant-1 symmetry after mirroring into the first quadrant.
 */
export function isInsideHex(
  point: Vector2D,
  center: Vector2D,
  radius: number,
): boolean {
  const xp = Math.abs(point.x - center.x);
  const yp = Math.abs(point.y - center.y);
  const maxX = radius * INNER_HALF_WIDTH;
  const maxY = radius * INNER_HALF_WIDTH;
  return xp <= maxX && HALF_SQRT3 * xp + 0.5 * yp <= maxY;
}

/** Six outer vertices of a flat-top hexagon, starting at the rightmost point. */
export function getHexVertices(
  center: Vector2D,
  radius: number,
): Vector2D[] {
  const vertices: Vector2D[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i);
    vertices.push(
      center.add(Vector2D.fromAngle(angle, radius)),
    );
  }
  return vertices;
}

/** Outward unit normal of the nearest hex edge to the given point. */
export function getClosestEdgeNormal(
  point: Vector2D,
  center: Vector2D,
  radius: number,
): Vector2D {
  const vertices = getHexVertices(center, radius);
  let bestNormal = Vector2D.zero();
  let bestDistSq = Infinity;

  for (let i = 0; i < 6; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % 6];
    const edge = b.sub(a);
    const edgeLenSq = edge.magSq();
    if (edgeLenSq === 0) continue;

    const ap = point.sub(a);
    const t = Math.max(0, Math.min(1, ap.dot(edge) / edgeLenSq));
    const closest = a.add(edge.scale(t));
    const distSq = point.distSq(closest);

    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      const edgeDir = edge.normalize();
      // Perpendicular pointing outward (away from center)
      const candidate = new Vector2D(edgeDir.y, -edgeDir.x);
      const toPoint = point.sub(closest);
      bestNormal =
        candidate.dot(toPoint) >= 0 ? candidate : candidate.scale(-1);
      // Ensure normal points away from hex center
      const mid = a.add(b).scale(0.5);
      const outward = mid.sub(center).normalize();
      if (bestNormal.dot(outward) < 0) {
        bestNormal = bestNormal.scale(-1);
      }
    }
  }

  return bestNormal.magSq() > 0 ? bestNormal.normalize() : Vector2D.fromAngle(0);
}

/** Project a point outside the hex back onto the perimeter. */
export function clampToHex(
  point: Vector2D,
  center: Vector2D,
  radius: number,
): Vector2D {
  if (isInsideHex(point, center, radius)) {
    return point.clone();
  }

  const normal = getClosestEdgeNormal(point, center, radius);
  const vertices = getHexVertices(center, radius);

  // Binary search along inward ray from point toward center to find boundary intersection
  let outer = point;
  let inner = center;
  for (let i = 0; i < 24; i++) {
    const mid = outer.lerp(inner, 0.5);
    if (isInsideHex(mid, center, radius)) {
      inner = mid;
    } else {
      outer = mid;
    }
  }

  // Snap to nearest edge segment for precision
  let bestPoint = inner;
  let bestDistSq = Infinity;
  for (let i = 0; i < 6; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % 6];
    const edge = b.sub(a);
    const edgeLenSq = edge.magSq();
    if (edgeLenSq === 0) continue;
    const ap = point.sub(a);
    const t = Math.max(0, Math.min(1, ap.dot(edge) / edgeLenSq));
    const closest = a.add(edge.scale(t));
    const distSq = point.distSq(closest);
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestPoint = closest;
    }
  }

  // Nudge slightly inward along normal to avoid re-triggering outside checks
  return bestPoint.sub(normal.scale(0.01));
}

/** Circumradius of the safe play hexagon. */
export function getVoidRadius(hexRadius: number): number {
  return hexRadius * 1.5;
}
