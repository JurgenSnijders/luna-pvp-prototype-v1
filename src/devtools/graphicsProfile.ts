import {
  DEFAULT_FCT_CLUSTER_CONFIG,
  fctClusterConfig,
  saveFctClusterConfig,
  type FctClusterConfig,
} from '../render/fctClusterConfig';
import {
  DEFAULT_HIT_FEEDBACK_CONFIG,
  hitFeedbackConfig,
  saveHitFeedbackConfig,
  type HitFeedbackConfig,
} from '../render/hitFeedbackConfig';
import {
  DEFAULT_RETRO_CONFIG,
  getIconRenderStyle,
  setIconRenderStyle,
  type IconRenderStyle,
} from '../render/gl/retroVfxConfig';
import {
  getGraphicsSettings,
  parseGraphicsSettings,
  saveGraphicsSettings,
  type GraphicsSettings,
} from './graphicsSettings';

export const GRAPHICS_PROFILE_KIND = 'luna-graphics-profile' as const;
export const GRAPHICS_PROFILE_VERSION = 1 as const;

export interface GraphicsProfile {
  kind: typeof GRAPHICS_PROFILE_KIND;
  version: typeof GRAPHICS_PROFILE_VERSION;
  exportedAt: string;
  graphics: GraphicsSettings;
  hitFeedback: HitFeedbackConfig;
  fctCluster: FctClusterConfig;
  iconStyle: IconRenderStyle;
}

const VALID_ICON_STYLES = new Set<IconRenderStyle>(['SEMANTIC_GLYPH', 'SIMULATION_TRACE']);

function parseHitFeedback(raw: unknown): HitFeedbackConfig {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_HIT_FEEDBACK_CONFIG };
  }
  return { ...DEFAULT_HIT_FEEDBACK_CONFIG, ...(raw as Partial<HitFeedbackConfig>) };
}

function parseFctCluster(raw: unknown): FctClusterConfig {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_FCT_CLUSTER_CONFIG };
  }
  return { ...DEFAULT_FCT_CLUSTER_CONFIG, ...(raw as Partial<FctClusterConfig>) };
}

function parseIconStyle(raw: unknown): IconRenderStyle {
  if (typeof raw === 'string' && VALID_ICON_STYLES.has(raw as IconRenderStyle)) {
    return raw as IconRenderStyle;
  }
  return DEFAULT_RETRO_CONFIG.iconStyle;
}

export function exportGraphicsProfile(): GraphicsProfile {
  return {
    kind: GRAPHICS_PROFILE_KIND,
    version: GRAPHICS_PROFILE_VERSION,
    exportedAt: new Date().toISOString(),
    graphics: { ...getGraphicsSettings() },
    hitFeedback: { ...hitFeedbackConfig },
    fctCluster: { ...fctClusterConfig },
    iconStyle: getIconRenderStyle(),
  };
}

export function parseGraphicsProfile(raw: unknown): GraphicsProfile {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid graphics profile: expected a JSON object.');
  }
  const envelope = raw as Partial<GraphicsProfile>;
  if (envelope.kind !== GRAPHICS_PROFILE_KIND) {
    throw new Error(`Invalid graphics profile kind: ${String(envelope.kind)}`);
  }
  if (envelope.version !== GRAPHICS_PROFILE_VERSION) {
    throw new Error(`Unsupported graphics profile version: ${String(envelope.version)}`);
  }
  return {
    kind: GRAPHICS_PROFILE_KIND,
    version: GRAPHICS_PROFILE_VERSION,
    exportedAt: typeof envelope.exportedAt === 'string' ? envelope.exportedAt : '',
    graphics: parseGraphicsSettings(envelope.graphics),
    hitFeedback: parseHitFeedback(envelope.hitFeedback),
    fctCluster: parseFctCluster(envelope.fctCluster),
    iconStyle: parseIconStyle(envelope.iconStyle),
  };
}

export function importGraphicsProfile(raw: unknown): GraphicsProfile {
  const profile = parseGraphicsProfile(raw);
  saveGraphicsSettings(profile.graphics);
  Object.assign(hitFeedbackConfig, profile.hitFeedback);
  saveHitFeedbackConfig();
  Object.assign(fctClusterConfig, profile.fctCluster);
  saveFctClusterConfig();
  setIconRenderStyle(profile.iconStyle);
  return profile;
}
