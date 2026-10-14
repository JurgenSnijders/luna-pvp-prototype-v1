/**
 * Authored `glowIntensity` is a 0–2 power knob (0.6 subtle, 1.2 strong, 1.8 ultimate).
 * Absent means "use the recipe default" (multiplier 1). Present values scale that
 * default, capped so a bad schema cannot blow the bloom buffer out.
 */
export function emissiveMultiplier(glow: number | undefined): number {
  if (glow === undefined || !Number.isFinite(glow) || glow < 0) return 1;
  return Math.min(4, glow);
}

export const FLASH_INTENSITY = 3.5;
export const RING_INTENSITY = 2.2;
export const STREAK_INTENSITY = 1.8;
export const SPARK_INTENSITY = 1.6;
export const RIBBON_INTENSITY = 2.5;
