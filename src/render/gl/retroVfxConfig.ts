export interface RetroShaderConfig {
  enabled: boolean;
  scanlineIntensity: number;
  scanlineDensity: number;
  vignetteIntensity: number;
  curvature: number;
  chromaticAberration: number;
  bloomThreshold: number;
  bloomIntensity: number;
  phosphorGridIntensity: number;
  flickerIntensity: number;
  tintColor: [number, number, number];
  tintAmount: number;
  contrast: number;
  brightness: number;
}

export const DEFAULT_RETRO_CONFIG: RetroShaderConfig = {
  enabled: true,
  scanlineIntensity: 0.30,
  scanlineDensity: 1.0,
  vignetteIntensity: 0.40,
  curvature: 0.03,
  chromaticAberration: 0.0025,
  bloomThreshold: 0.55,
  bloomIntensity: 1.65,
  phosphorGridIntensity: 0.15,
  flickerIntensity: 0.015,
  tintColor: [1, 1, 1],
  tintAmount: 0,
  contrast: 1,
  brightness: 1,
};

export const retroVfxConfig: RetroShaderConfig = { ...DEFAULT_RETRO_CONFIG };

(window as unknown as { __retroVfxConfig?: RetroShaderConfig }).__retroVfxConfig =
  retroVfxConfig;
