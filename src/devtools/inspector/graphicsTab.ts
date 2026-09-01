import {
  DEFAULT_GRAPHICS_SETTINGS,
  applyTierPreset,
  getEffectiveTier,
  getGraphicsSettings,
  saveGraphicsSettings,
  type GraphicsSettings,
  type QualityTier,
} from '../graphicsSettings';
import { perfMonitor } from '../PerfMonitor';
import { setForcedBackend } from '../../render/backends/createParticleBackend';
import {
  retroVfxConfig,
  saveRetroConfigToStorage,
  type RetroShaderConfig,
} from '../../render/gl/retroVfxConfig';
import { STYLE_PRESETS, type StylePresetId } from '../../render/presets/stylePresets';
import { styleManager } from '../../ui/styleManager';
import { FONTS, RETRO_COLORS, retroPanelStyle } from '../../ui/tokens';
import {
  buttonStyle,
  createSelectRow,
  createSliderRow,
  type SliderRowHandle,
} from './domHelpers';

export function buildGraphicsTab(parent: HTMLElement): void {
  const section = document.createElement('div');
  section.style.cssText =
    'margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,0.1);';
  const title = document.createElement('div');
  title.textContent = 'Graphics & Performance';
  title.style.cssText = 'font-weight:bold;margin-bottom:8px;font-size:12px;';
  section.appendChild(title);

  const settings = getGraphicsSettings();
  const checkboxes: Partial<Record<keyof GraphicsSettings, HTMLInputElement>> = {};

  const perfBox = document.createElement('pre');
  perfBox.style.cssText =
    'font-size:10px;line-height:1.35;background:rgba(0,0,0,0.35);padding:8px;border-radius:6px;margin-bottom:8px;white-space:pre-wrap;';
  const refreshPerf = (): void => {
    const caps = perfMonitor.getCapabilities();
    perfBox.textContent = [
      perfMonitor.formatOverlayText(),
      '',
      caps
        ? `WebGL2: ${caps.webgl2Available ? 'yes' : 'no'}  DPR: ${caps.dpr}  maxTex: ${caps.maxTextureSize}`
        : 'Capabilities not probed',
      caps ? `GPU: ${caps.renderer}` : '',
      `Tier: ${getEffectiveTier()}  (F3 toggles overlay)`,
    ]
      .filter(Boolean)
      .join('\n');
  };
  refreshPerf();
  setInterval(refreshPerf, 500);
  section.appendChild(perfBox);

  const caps = perfMonitor.getCapabilities();
  if (caps) {
    const capLine = document.createElement('div');
    capLine.style.cssText = 'font-size:10px;opacity:0.75;margin-bottom:8px;';
    capLine.textContent = `Extensions: ${caps.extensions.length}`;
    section.appendChild(capLine);
  }

  const addToggle = (key: keyof GraphicsSettings, label: string): void => {
    if (typeof settings[key] === 'boolean') {
      const row = document.createElement('label');
      row.style.cssText =
        'display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;margin-bottom:8px;';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = settings[key] as boolean;
      checkbox.onchange = () => {
        const current = getGraphicsSettings();
        saveGraphicsSettings({ ...current, [key]: checkbox.checked });
      };
      checkboxes[key] = checkbox;
      row.appendChild(checkbox);
      row.appendChild(document.createTextNode(label));
      section.appendChild(row);
    }
  };

  addToggle('lavaHeatWaves', 'Lava Heat Waves');
  addToggle('ambientEmbers', 'Ambient Lava Embers');
  addToggle('particleTrails', 'Projectile Particle Trails');
  addToggle('bloomEnabled', 'Bloom Post-Processing');
  addToggle('refractionEnabled', 'Refraction (ULTRA)');

  const tierRow = document.createElement('div');
  tierRow.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;margin:8px 0;';
  const tiers: QualityTier[] = ['LOW', 'MEDIUM', 'HIGH', 'ULTRA', 'AUTO'];
  for (const tier of tiers) {
    const btn = document.createElement('button');
    btn.textContent = tier;
    btn.style.cssText = buttonStyle(getEffectiveTier() === tier || settings.tier === tier);
    btn.onclick = () => {
      if (tier === 'AUTO') {
        saveGraphicsSettings({ ...getGraphicsSettings(), tier: 'AUTO', manualTierOverride: false });
      } else {
        applyTierPreset(tier);
      }
      refreshPerf();
    };
    tierRow.appendChild(btn);
  }
  section.appendChild(tierRow);

  const syncCheckboxes = (s: GraphicsSettings): void => {
    for (const key of Object.keys(checkboxes) as (keyof GraphicsSettings)[]) {
      const box = checkboxes[key];
      if (box) box.checked = s[key] as boolean;
    }
  };

  const presetRow = document.createElement('div');
  presetRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';

  const recordBaselineBtn = document.createElement('button');
  recordBaselineBtn.textContent = 'Record Baseline p95';
  recordBaselineBtn.style.cssText = buttonStyle(false);
  recordBaselineBtn.onclick = () => {
    perfMonitor.baselineP95Ms = perfMonitor.getSnapshot().frameMsP95;
    refreshPerf();
  };

  const loseCtxBtn = document.createElement('button');
  loseCtxBtn.textContent = 'Force GL Context Loss';
  loseCtxBtn.style.cssText = buttonStyle(false);
  loseCtxBtn.onclick = () => {
    const glCtx = (window as unknown as { __lunaGlCtx?: { forceContextLoss: () => void } }).__lunaGlCtx;
    glCtx?.forceContextLoss();
  };

  const canvas2dBtn = document.createElement('button');
  canvas2dBtn.textContent = 'Canvas2D Fallback';
  canvas2dBtn.style.cssText = buttonStyle(false);
  canvas2dBtn.onclick = () => {
    setForcedBackend('canvas2d');
    location.reload();
  };

  presetRow.appendChild(recordBaselineBtn);
  presetRow.appendChild(loseCtxBtn);
  presetRow.appendChild(canvas2dBtn);
  section.appendChild(presetRow);

  const highQualityBtn = document.createElement('button');
  highQualityBtn.textContent = 'Reset Toggles (High)';
  highQualityBtn.style.cssText = buttonStyle(false) + 'margin-top:6px;width:100%;';
  highQualityBtn.onclick = () => {
    const next: GraphicsSettings = { ...DEFAULT_GRAPHICS_SETTINGS };
    saveGraphicsSettings(next);
    syncCheckboxes(next);
  };
  section.appendChild(highQualityBtn);

  parent.appendChild(section);

  buildRetroCrtPanel(parent);
}

type SliderKey = Exclude<keyof RetroShaderConfig, 'enabled' | 'tintColor'>;

interface SliderBinding {
  key: SliderKey;
  handle: SliderRowHandle;
}

function buildRetroCrtPanel(parent: HTMLElement): void {
  const panel = document.createElement('div');
  panel.style.cssText = retroPanelStyle('cyan') + 'padding: 12px; margin-top: 12px;';

  const header = document.createElement('div');
  header.textContent = 'RETRO & CRT ENGINE';
  header.style.cssText = `font-weight: bold; margin-bottom: 12px; font-size: 12px; color: ${RETRO_COLORS.textPrimary}; font-family: ${FONTS.mono}; letter-spacing: 0.08em;`;
  panel.appendChild(header);

  const crtEnabledRow = document.createElement('label');
  crtEnabledRow.style.cssText =
    'display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;margin-bottom:10px;font-family:' +
    FONTS.mono +
    ';';
  const crtEnabledCheckbox = document.createElement('input');
  crtEnabledCheckbox.type = 'checkbox';
  crtEnabledCheckbox.checked = retroVfxConfig.enabled;
  crtEnabledCheckbox.onchange = () => {
    retroVfxConfig.enabled = crtEnabledCheckbox.checked;
    saveRetroConfigToStorage();
  };
  crtEnabledRow.appendChild(crtEnabledCheckbox);
  crtEnabledRow.appendChild(document.createTextNode('CRT Master Pass'));
  panel.appendChild(crtEnabledRow);

  const presetSelect = createSelectRow(
    'Style Preset',
    Object.values(STYLE_PRESETS).map((p) => ({ value: p.id, label: p.name })),
    styleManager.getPresetId(),
    (id) => styleManager.applyPreset(id as StylePresetId),
  );
  panel.appendChild(presetSelect.element);

  const sliderBindings: SliderBinding[] = [];
  const sliderDefs: Array<{
    label: string;
    key: SliderKey;
    min: number;
    max: number;
    step: number;
  }> = [
    { label: 'Scanline Intensity', key: 'scanlineIntensity', min: 0, max: 1, step: 0.05 },
    { label: 'Scanline Density', key: 'scanlineDensity', min: 0.25, max: 3, step: 0.25 },
    { label: 'Curvature', key: 'curvature', min: 0, max: 0.08, step: 0.005 },
    { label: 'Vignette', key: 'vignetteIntensity', min: 0, max: 1, step: 0.05 },
    { label: 'Chromatic Aberration', key: 'chromaticAberration', min: 0, max: 0.01, step: 0.0005 },
    { label: 'Bloom Intensity', key: 'bloomIntensity', min: 0.5, max: 3.5, step: 0.1 },
    { label: 'Bloom Threshold', key: 'bloomThreshold', min: 0.2, max: 0.9, step: 0.05 },
    { label: 'Phosphor Grid', key: 'phosphorGridIntensity', min: 0, max: 0.5, step: 0.05 },
    { label: 'Flicker', key: 'flickerIntensity', min: 0, max: 0.05, step: 0.005 },
    { label: 'Contrast', key: 'contrast', min: 0.5, max: 2, step: 0.05 },
    { label: 'Brightness', key: 'brightness', min: 0.5, max: 2, step: 0.05 },
    { label: 'Tint Amount', key: 'tintAmount', min: 0, max: 1, step: 0.05 },
  ];

  for (const def of sliderDefs) {
    const handle = createSliderRow(
      def.label,
      def.min,
      def.max,
      def.step,
      retroVfxConfig[def.key] as number,
      (val) => {
        (retroVfxConfig as Record<SliderKey, number>)[def.key] = val;
        saveRetroConfigToStorage();
      },
    );
    sliderBindings.push({ key: def.key, handle });
    panel.appendChild(handle.element);
  }

  const resetBtn = document.createElement('button');
  resetBtn.textContent = 'Reset to Preset Defaults';
  resetBtn.style.cssText = buttonStyle(false) + 'margin-top:8px;width:100%;';
  resetBtn.onclick = () => styleManager.resetCurrentPresetDefaults();
  panel.appendChild(resetBtn);

  const syncSlidersFromConfig = (): void => {
    for (const { key, handle } of sliderBindings) {
      handle.setValue(retroVfxConfig[key] as number);
    }
    crtEnabledCheckbox.checked = retroVfxConfig.enabled;
    presetSelect.setValue(styleManager.getPresetId());
  };

  window.addEventListener('stylepresetapplied', syncSlidersFromConfig);
  syncSlidersFromConfig();

  parent.appendChild(panel);
}
