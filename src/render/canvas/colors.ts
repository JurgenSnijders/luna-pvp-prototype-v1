export const FIELD_COLORS: Record<string, string> = {
  RADIAL_IMPULSE: 'rgba(255, 68, 68, 0.25)',
  VORTEX_TANGENT: 'rgba(170, 68, 255, 0.25)',
  FRICTION_OVERRIDE: 'rgba(68, 170, 255, 0.25)',
  MASS_ATTRACTOR: 'rgba(128, 128, 255, 0.3)',
};

export function instabilityColor(pct: number): string {
  if (pct >= 250) return '#ff3333';
  if (pct >= 100) {
    const t = Math.min(1, (pct - 100) / 150);
    const r = Math.round(255);
    const g = Math.round(255 * (1 - t));
    return `rgb(${r},${g},0)`;
  }
  const t = pct / 100;
  const g = Math.round(255);
  const b = Math.round(255 * (1 - t));
  return `rgb(255,${g},${b})`;
}

export function healthBarColor(ratio: number): string {
  if (ratio > 0.5) return '#22c55e';
  if (ratio > 0.25) return '#eab308';
  return '#ef4444';
}
