import {
  DEFAULT_GRAPHICS_SETTINGS,
  STORAGE_KEY_GRAPHICS,
  applyTierPreset,
  getEffectiveDprCap,
  getEffectiveFeatureFlags,
  getGraphicsSettings,
  getPostEffectUserEnabled,
  parseGraphicsSettings,
  saveGraphicsSettings,
  seedEffectiveTierForTests,
  setPostEffectEnabled,
} from '../src/devtools/graphicsSettings';
import {
  GRAPHICS_PROFILE_KIND,
  exportGraphicsProfile,
  importGraphicsProfile,
  parseGraphicsProfile,
} from '../src/devtools/graphicsProfile';
import {
  DEFAULT_FCT_CLUSTER_CONFIG,
  fctClusterConfig,
} from '../src/render/fctClusterConfig';
import {
  DEFAULT_HIT_FEEDBACK_CONFIG,
  hitFeedbackConfig,
} from '../src/render/hitFeedbackConfig';
import { getIconRenderStyle, setIconRenderStyle } from '../src/render/gl/retroVfxConfig';

const memoryStorage = new Map<string, string>();

function installMockLocalStorage(): void {
  const store = memoryStorage;
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    },
    configurable: true,
  });
}

function installMockWindow(dpr = 1, width = 1920, height = 1080): void {
  Object.defineProperty(globalThis, 'window', {
    value: {
      innerWidth: width,
      innerHeight: height,
      devicePixelRatio: dpr,
      dispatchEvent: () => true,
    },
    configurable: true,
  });
}

function resetGraphicsState(): void {
  memoryStorage.clear();
  saveGraphicsSettings({ ...DEFAULT_GRAPHICS_SETTINGS });
  Object.assign(hitFeedbackConfig, DEFAULT_HIT_FEEDBACK_CONFIG);
  Object.assign(fctClusterConfig, DEFAULT_FCT_CLUSTER_CONFIG);
  setIconRenderStyle('SEMANTIC_GLYPH');
}

function run(): void {
  installMockLocalStorage();
  installMockWindow();
  resetGraphicsState();

  const failures: string[] = [];

  const defaults = parseGraphicsSettings(null);
  if (defaults.tier !== DEFAULT_GRAPHICS_SETTINGS.tier) {
    failures.push(`parseGraphicsSettings(null): expected default tier ${DEFAULT_GRAPHICS_SETTINGS.tier}`);
  }
  if (defaults.activePreset !== DEFAULT_GRAPHICS_SETTINGS.activePreset) {
    failures.push('parseGraphicsSettings(null): expected default activePreset');
  }

  const clamped = parseGraphicsSettings({
    bgParallaxVoid: 2,
    bgParallaxLava: -1,
    bgLavaScrollSpeed: 5,
    activePreset: 'NOT_A_PRESET',
    crosshairStyle: 'NOT_A_CROSSHAIR',
  });
  if (clamped.bgParallaxVoid !== 1) {
    failures.push(`bgParallaxVoid clamp: expected 1, got ${clamped.bgParallaxVoid}`);
  }
  if (clamped.bgParallaxLava !== 0) {
    failures.push(`bgParallaxLava clamp: expected 0, got ${clamped.bgParallaxLava}`);
  }
  if (clamped.bgLavaScrollSpeed !== 1) {
    failures.push(`bgLavaScrollSpeed clamp: expected 1, got ${clamped.bgLavaScrollSpeed}`);
  }
  if (clamped.activePreset !== DEFAULT_GRAPHICS_SETTINGS.activePreset) {
    failures.push('parseGraphicsSettings: unknown activePreset should fall back to default');
  }
  if (clamped.crosshairStyle !== DEFAULT_GRAPHICS_SETTINGS.crosshairStyle) {
    failures.push('parseGraphicsSettings: unknown crosshairStyle should fall back to default');
  }

  try {
    parseGraphicsProfile({ kind: 'wrong-kind', version: 1 });
    failures.push('parseGraphicsProfile: expected throw for wrong kind');
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('kind')) {
      failures.push('parseGraphicsProfile: wrong kind error message missing kind');
    }
  }

  try {
    parseGraphicsProfile({ kind: GRAPHICS_PROFILE_KIND, version: 99 });
    failures.push('parseGraphicsProfile: expected throw for unsupported version');
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('version')) {
      failures.push('parseGraphicsProfile: unsupported version error message missing version');
    }
  }

  resetGraphicsState();
  saveGraphicsSettings({
    ...DEFAULT_GRAPHICS_SETTINGS,
    tier: 'ULTRA',
    bloomEnabled: false,
    crtEnabled: false,
    bgParallaxVoid: 0.42,
    activePreset: 'MIDNIGHT_ARCADE',
    crosshairStyle: 'DOT_RING',
  });
  hitFeedbackConfig.targetFlash = false;
  hitFeedbackConfig.microHitstop = false;
  fctClusterConfig.clusterWindowMs = 650;
  fctClusterConfig.clusterPerTickMax = 12;
  setIconRenderStyle('SIMULATION_TRACE');

  const exported = exportGraphicsProfile();
  if (exported.kind !== GRAPHICS_PROFILE_KIND || exported.version !== 1) {
    failures.push('exportGraphicsProfile: envelope kind/version mismatch');
  }
  if (exported.graphics.tier !== 'ULTRA') {
    failures.push(`exportGraphicsProfile: expected tier ULTRA, got ${exported.graphics.tier}`);
  }
  if (exported.hitFeedback.targetFlash !== false) {
    failures.push('exportGraphicsProfile: hitFeedback.targetFlash should be false');
  }
  if (exported.fctCluster.clusterWindowMs !== 650) {
    failures.push('exportGraphicsProfile: fctCluster.clusterWindowMs should be 650');
  }
  if (exported.iconStyle !== 'SIMULATION_TRACE') {
    failures.push(`exportGraphicsProfile: iconStyle should be SIMULATION_TRACE, got ${exported.iconStyle}`);
  }

  resetGraphicsState();
  importGraphicsProfile(exported);

  const imported = getGraphicsSettings();
  if (imported.tier !== 'ULTRA') {
    failures.push(`importGraphicsProfile: expected tier ULTRA, got ${imported.tier}`);
  }
  if (imported.bloomEnabled !== false) {
    failures.push('importGraphicsProfile: bloomEnabled should be false');
  }
  if (imported.activePreset !== 'MIDNIGHT_ARCADE') {
    failures.push(`importGraphicsProfile: activePreset should be MIDNIGHT_ARCADE, got ${imported.activePreset}`);
  }
  if (hitFeedbackConfig.targetFlash !== false || hitFeedbackConfig.microHitstop !== false) {
    failures.push('importGraphicsProfile: hit feedback flags not restored');
  }
  if (fctClusterConfig.clusterWindowMs !== 650 || fctClusterConfig.clusterPerTickMax !== 12) {
    failures.push('importGraphicsProfile: fct cluster config not restored');
  }
  if (getIconRenderStyle() !== 'SIMULATION_TRACE') {
    failures.push(`importGraphicsProfile: icon style should be SIMULATION_TRACE, got ${getIconRenderStyle()}`);
  }

  const storedGraphics = memoryStorage.get(STORAGE_KEY_GRAPHICS);
  if (!storedGraphics || !storedGraphics.includes('"tier":"ULTRA"')) {
    failures.push('importGraphicsProfile: graphics settings not persisted to localStorage');
  }

  resetGraphicsState();
  applyTierPreset('LOW');
  const low = getGraphicsSettings();
  if (low.crtEnabled || low.bloomEnabled) {
    failures.push('applyTierPreset(LOW): CRT and bloom should be disabled');
  }
  if (low.bloomIntensity !== 0) {
    failures.push(`applyTierPreset(LOW): bloomIntensity should be 0, got ${low.bloomIntensity}`);
  }
  if (getPostEffectUserEnabled('SCANLINES') || getPostEffectUserEnabled('PHOSPHOR')) {
    failures.push('applyTierPreset(LOW): quality post-effects should be disabled');
  }

  resetGraphicsState();
  applyTierPreset('HIGH');
  const high = getGraphicsSettings();
  if (!high.crtEnabled || !high.bloomEnabled) {
    failures.push('applyTierPreset(HIGH): CRT and bloom should be enabled');
  }
  if (high.bloomThreshold !== 0.6) {
    failures.push(`applyTierPreset(HIGH): bloomThreshold should be 0.6, got ${high.bloomThreshold}`);
  }
  if (high.screenShakeIntensity !== 1) {
    failures.push(`applyTierPreset(HIGH): screenShakeIntensity should be 1, got ${high.screenShakeIntensity}`);
  }
  if (
    !getPostEffectUserEnabled('SCANLINES') ||
    !getPostEffectUserEnabled('PHOSPHOR') ||
    !getPostEffectUserEnabled('CURVATURE')
  ) {
    failures.push('applyTierPreset(HIGH): core CRT post-effects should be enabled');
  }

  applyTierPreset('MEDIUM');
  if (getPostEffectUserEnabled('PHOSPHOR')) {
    failures.push('applyTierPreset(MEDIUM after HIGH): PHOSPHOR should be disabled in storage');
  }

  resetGraphicsState();
  applyTierPreset('HIGH');
  setPostEffectEnabled('PIXELATE', true);
  if (!getPostEffectUserEnabled('PIXELATE')) {
    failures.push('setPostEffectEnabled(PIXELATE): expected enabled before tier switch');
  }
  applyTierPreset('ULTRA');
  if (!getPostEffectUserEnabled('PIXELATE')) {
    failures.push('applyTierPreset(ULTRA): PIXELATE should stay enabled when tier allows');
  }
  applyTierPreset('LOW');
  if (getPostEffectUserEnabled('PIXELATE')) {
    failures.push('applyTierPreset(LOW): PIXELATE should be disabled below min tier');
  }

  resetGraphicsState();
  installMockWindow(2, 1920, 1080);
  saveGraphicsSettings({
    ...getGraphicsSettings(),
    tier: 'AUTO',
    manualTierOverride: false,
    webglBackground: true,
    crtEnabled: true,
  });
  seedEffectiveTierForTests('LOW');
  const lowFlags = getEffectiveFeatureFlags();
  if (lowFlags.webglBackground || lowFlags.crtEnabled || lowFlags.arcadeBezel) {
    failures.push('effective LOW flags should disable heavy features while stored toggles remain');
  }
  if (!getGraphicsSettings().webglBackground || !getGraphicsSettings().crtEnabled) {
    failures.push('effective LOW should not rewrite stored graphics toggles');
  }
  const lowDpr = getEffectiveDprCap(1920, 1080);
  const expectedLowDpr = 1280 / 1920;
  if (Math.abs(lowDpr - expectedLowDpr) > 0.02) {
    failures.push(`getEffectiveDprCap LOW: expected ~${expectedLowDpr}, got ${lowDpr}`);
  }

  if (failures.length > 0) {
    console.error('test:graphics-settings  FAIL');
    for (const msg of failures) console.error(`  ${msg}`);
    process.exit(1);
  }

  console.log('test:graphics-settings  OK  23 graphics profile checks passed');
}

run();
