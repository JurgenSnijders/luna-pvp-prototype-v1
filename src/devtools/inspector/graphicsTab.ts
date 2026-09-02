import {
  DEFAULT_GRAPHICS_SETTINGS,
  applyStylePreset,
  applyTierPreset,
  getEffectiveTier,
  getGraphicsSettings,
  resetStylePresetDefaults,
  saveGraphicsSettings,
  subscribeGraphicsSettings,
  type GraphicsSettings,
  type QualityTier,
} from '../graphicsSettings';
import { STYLE_PRESET_IDS, STYLE_PRESETS, isStylePresetId } from '../../render/presets/stylePresets';
import { perfMonitor } from '../PerfMonitor';
import { setForcedBackend } from '../../render/backends/createParticleBackend';
import { FONTS, RETRO_COLORS, retroPanelStyle } from '../../ui/tokens';
import {
  buttonStyle,
  sectionDivider,
  sectionHeader,
  selectRow,
  sliderRow,
} from './domHelpers';

export function buildGraphicsTab(parent: HTMLElement): void {
  const settings = getGraphicsSettings();
  const perfCheckboxes: Partial<Record<keyof GraphicsSettings, HTMLInputElement>> = {};
  const retroCheckboxes: Partial<Record<keyof GraphicsSettings, HTMLInputElement>> = {};

  // --- Graphics & Performance ---
  const perfSection = document.createElement('div');
  perfSection.style.cssText = sectionDivider();
  perfSection.appendChild(sectionHeader('Graphics & Performance'));

  const perfBox = document.createElement('pre');
  perfBox.style.cssText = `font-size:${FONTS.size.sm};line-height:1.35;background:${RETRO_COLORS.panelBgOpaque};padding:8px;border-radius:4px;margin-bottom:8px;white-space:pre-wrap;border:1px solid ${RETRO_COLORS.borderSubtle};`;
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
  perfSection.appendChild(perfBox);

  const caps = perfMonitor.getCapabilities();
  if (caps) {
    const capLine = document.createElement('div');
    capLine.style.cssText = `font-size:${FONTS.size.sm};color:${RETRO_COLORS.textMuted};margin-bottom:8px;`;
    capLine.textContent = `Extensions: ${caps.extensions.length}`;
    perfSection.appendChild(capLine);
  }

  const addToggle = (
    container: HTMLElement,
    store: Partial<Record<keyof GraphicsSettings, HTMLInputElement>>,
    key: keyof GraphicsSettings,
    label: string,
  ): void => {
    if (typeof settings[key] === 'boolean') {
      const row = document.createElement('label');
      row.style.cssText =
        `display:flex;align-items:center;gap:8px;cursor:pointer;font-size:${FONTS.size.body};margin-bottom:8px;`;
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = settings[key] as boolean;
      checkbox.onchange = () => {
        const current = getGraphicsSettings();
        saveGraphicsSettings({ ...current, [key]: checkbox.checked });
      };
      store[key] = checkbox;
      row.appendChild(checkbox);
      row.appendChild(document.createTextNode(label));
      container.appendChild(row);
    }
  };

  addToggle(perfSection, perfCheckboxes, 'lavaHeatWaves', 'Lava Heat Waves');
  addToggle(perfSection, perfCheckboxes, 'ambientEmbers', 'Ambient Lava Embers');
  addToggle(perfSection, perfCheckboxes, 'particleTrails', 'Projectile Particle Trails');
  addToggle(perfSection, perfCheckboxes, 'bloomEnabled', 'Bloom Post-Processing');
  addToggle(perfSection, perfCheckboxes, 'refractionEnabled', 'Refraction (ULTRA)');

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
  perfSection.appendChild(tierRow);

  const devRow = document.createElement('div');
  devRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';

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

  devRow.appendChild(recordBaselineBtn);
  devRow.appendChild(loseCtxBtn);
  devRow.appendChild(canvas2dBtn);
  perfSection.appendChild(devRow);

  const highQualityBtn = document.createElement('button');
  highQualityBtn.textContent = 'Reset Toggles (High)';
  highQualityBtn.style.cssText = buttonStyle(false) + 'margin-top:6px;width:100%;';
  highQualityBtn.onclick = () => {
    const next: GraphicsSettings = { ...DEFAULT_GRAPHICS_SETTINGS };
    saveGraphicsSettings(next);
    syncControls(next);
  };
  perfSection.appendChild(highQualityBtn);

  parent.appendChild(perfSection);

  // --- RETRO & CRT ENGINE ---
  const retroSection = document.createElement('div');
  retroSection.style.cssText = `${retroPanelStyle('cyan')}padding:12px;margin-bottom:16px;`;
  retroSection.appendChild(sectionHeader('RETRO & CRT ENGINE'));

  addToggle(retroSection, retroCheckboxes, 'crtEnabled', 'CRT Post-Processing');
  addToggle(retroSection, retroCheckboxes, 'arcadeBezel', 'Arcade Bezel');

  const presetOptions = STYLE_PRESET_IDS.map((id) => ({
    value: id,
    label: STYLE_PRESETS[id].label,
  }));
  const presetSelect = selectRow(
    retroSection,
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
  const thresholdSlider = numeric('bloomThreshold');
  const scanSlider = numeric('crtScanlineIntensity');
  const curveSlider = numeric('crtCurvature');
  const vigSlider = numeric('crtVignette');
  const phosSlider = numeric('crtPhosphor');

  const sliders = [
    sliderRow(retroSection, 'Bloom Intensity', 0, 2, 0.05, bloomSlider.get, bloomSlider.set),
    sliderRow(retroSection, 'Bloom Threshold', 0.2, 0.9, 0.05, thresholdSlider.get, thresholdSlider.set),
    sliderRow(retroSection, 'CRT Scanlines', 0, 1, 0.05, scanSlider.get, scanSlider.set),
    sliderRow(retroSection, 'CRT Curvature', 0, 0.5, 0.01, curveSlider.get, curveSlider.set),
    sliderRow(retroSection, 'CRT Vignette', 0, 1, 0.05, vigSlider.get, vigSlider.set),
    sliderRow(retroSection, 'CRT Phosphor', 0, 1, 0.05, phosSlider.get, phosSlider.set),
  ];

  const resetPresetBtn = document.createElement('button');
  resetPresetBtn.textContent = 'Reset Preset Defaults';
  resetPresetBtn.style.cssText = buttonStyle(false) + 'margin-top:6px;width:100%;';
  resetPresetBtn.onclick = () => {
    resetStylePresetDefaults();
    syncControls(getGraphicsSettings());
  };
  retroSection.appendChild(resetPresetBtn);

  parent.appendChild(retroSection);

  const syncControls = (s: GraphicsSettings): void => {
    for (const store of [perfCheckboxes, retroCheckboxes]) {
      for (const key of Object.keys(store) as (keyof GraphicsSettings)[]) {
        const box = store[key];
        if (box) box.checked = s[key] as boolean;
      }
    }
    presetSelect.refresh();
    for (const slider of sliders) slider.refresh();
  };

  subscribeGraphicsSettings(() => syncControls(getGraphicsSettings()));
}
