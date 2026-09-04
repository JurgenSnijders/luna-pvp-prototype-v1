import type { GpuCapabilities } from '../devtools/PerfMonitor';
import type { QualityTier } from '../devtools/graphicsSettings';

const SOFTWARE_RENDERER_PATTERNS = [
  /swiftshader/i,
  /llvmpipe/i,
  /basic render/i,
  /software/i,
  /mesa offscreen/i,
];

export function detectSeedTier(caps: GpuCapabilities | null): Exclude<QualityTier, 'AUTO'> {
  if (!caps?.webgl2Available) return 'LOW';

  const renderer = `${caps.renderer} ${caps.vendor}`;
  if (SOFTWARE_RENDERER_PATTERNS.some((re) => re.test(renderer))) {
    return 'LOW';
  }

  if (caps.maxTextureSize > 0 && caps.maxTextureSize < 4096) {
    return 'LOW';
  }

  const nav = typeof navigator !== 'undefined' ? navigator : null;
  const deviceMemory = (nav as Navigator & { deviceMemory?: number })?.deviceMemory;
  if (deviceMemory !== undefined && deviceMemory <= 4) {
    return 'LOW';
  }

  const cores = nav?.hardwareConcurrency;
  if (cores !== undefined && cores <= 4) {
    return 'LOW';
  }

  return 'MEDIUM';
}
