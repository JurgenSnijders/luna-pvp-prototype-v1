import type { GpuCapabilities } from '../devtools/PerfMonitor';
import type { QualityTier } from '../devtools/graphicsSettings';

const SOFTWARE_RENDERER_PATTERNS = [
  /swiftshader/i,
  /llvmpipe/i,
  /basic render/i,
  /software/i,
  /mesa offscreen/i,
];

const LEGACY_IGPU_PATTERNS = [
  /Intel.*HD Graphics (3000|4000|5000)/i,
  /Intel.*\(.*HD Graphics (3000|4000|5000)/i,
  /AMD Radeon HD [67]\d{3}/i,
];

export function isLegacyIntegratedGpu(renderer: string): boolean {
  return LEGACY_IGPU_PATTERNS.some((re) => re.test(renderer));
}

export function detectSeedTier(caps: GpuCapabilities | null): Exclude<QualityTier, 'AUTO'> {
  if (!caps?.webgl2Available) return 'LOW';

  if (caps.isLegacyGpu) return 'LOW';

  if (caps.fragmentHighpPrecision > 0 && caps.fragmentHighpPrecision < 23) {
    return 'LOW';
  }

  if (isLegacyIntegratedGpu(caps.unmaskedRenderer)) {
    return 'LOW';
  }

  const renderer = `${caps.renderer} ${caps.vendor}`;
  if (SOFTWARE_RENDERER_PATTERNS.some((re) => re.test(renderer))) {
    return 'LOW';
  }

  if (caps.maxTextureSize > 0 && caps.maxTextureSize < 4096) {
    return 'LOW';
  }

  const nav = typeof navigator !== 'undefined' ? navigator : null;
  const deviceMemory = (nav as Navigator & { deviceMemory?: number })?.deviceMemory;
  const cores = nav?.hardwareConcurrency ?? 0;

  if (cores >= 8 && deviceMemory !== undefined && deviceMemory >= 8) {
    return 'HIGH';
  }

  return 'MEDIUM';
}
