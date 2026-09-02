import {
  DEFAULT_GRAPHICS_SETTINGS,
  applyStylePreset,
  applyTierPreset,
  getEffectiveTier,
  getGraphicsSettings,
  saveGraphicsSettings,
  subscribeGraphicsSettings,
  type GraphicsSettings,
  type QualityTier,
} from '../graphicsSettings';
import { STYLE_PRESET_IDS, STYLE_PRESETS, isStylePresetId } from '../../render/presets/stylePresets';
import { perfMonitor } from '../PerfMonitor';
import { setForcedBackend } from '../../render/backends/createParticleBackend';
import { buttonStyle, selectRow, sliderRow } from './domHelpers';

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
  addToggle('crtEnabled', 'CRT Post-Processing');
  addToggle('arcadeBezel', 'Arcade Bezel');

  const presetOptions = STYLE_PRESET_IDS.map((id) => ({
    value: id,
    label: STYLE_PRESETS[id].label,
  }));
  const presetSelect = selectRow(
    section,
    'Style Preset',
    presetOptions,
    () => getGraphicsSettings().activePreset,
    (id) => {
      if (isStylePresetId(id)) {
        applyStylePreset(id);
        syncControls(getGraphicsSettings());
      }
    },
  );

  const numeric = (key: keyof GraphicsSettings) => ({
    get: () => getGraphicsSettings()[key] as number,
    set: (v: number) => saveGraphicsSettings({ ...getGraphicsSettings(), [key]: v }),
  });

  const bloomSlider = numeric('bloomIntensity');
  const scanSlider = numeric('crtScanlineIntensity');
  const curveSlider = numeric('crtCurvature');
  const vigSlider = numeric('crtVignette');
  const phosSlider = numeric('crtPhosphor');

  const sliders = [
    sliderRow(section, 'Bloom Intensity', 0, 2, 0.05, bloomSlider.get, bloomSlider.set),
    sliderRow(section, 'CRT Scanlines', 0, 1, 0.05, scanSlider.get, scanSlider.set),
    sliderRow(section, 'CRT Curvature', 0, 0.5, 0.01, curveSlider.get, curveSlider.set),
    sliderRow(section, 'CRT Vignette', 0, 1, 0.05, vigSlider.get, vigSlider.set),
    sliderRow(section, 'CRT Phosphor', 0, 1, 0.05, phosSlider.get, phosSlider.set),
  ];

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
      syncControls(getGraphicsSettings());
      refreshPerf();
    };
    tierRow.appendChild(btn);
  }
  section.appendChild(tierRow);

  const syncControls = (s: GraphicsSettings): void => {
    for (const key of Object.keys(checkboxes) as (keyof GraphicsSettings)[]) {
      const box = checkboxes[key];
      if (box) box.checked = s[key] as boolean;
    }
    presetSelect.refresh();
    for (const slider of sliders) slider.refresh();
  };

  subscribeGraphicsSettings(() => syncControls(getGraphicsSettings()));

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
    syncControls(next);
  };
  section.appendChild(highQualityBtn);

  parent.appendChild(section);
}
