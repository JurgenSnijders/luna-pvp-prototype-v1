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
import { CROSSHAIR_PRESETS, CROSSHAIR_STYLE_IDS, isCrosshairStyleId } from '../../ui/crosshairPresets';
import { perfMonitor } from '../PerfMonitor';
import { setForcedBackend } from '../../render/backends/createParticleBackend';
import { FONTS, RETRO_COLORS, retroPanelStyle } from '../../ui/tokens';
import {
  getIconRenderStyle,
  setIconRenderStyle,
  type IconRenderStyle,
} from '../../render/gl/retroVfxConfig';
import {
  buttonStyle,
  sectionDivider,
  sectionHeader,
  selectRow,
  sliderRow,
} from './domHelpers';
import { buildPostEffectsSection } from './postEffectsSection';
import {
  DEFAULT_HIT_FEEDBACK_CONFIG,
  hitFeedbackConfig,
  saveHitFeedbackConfig,
  type HitFeedbackConfig,
} from '../../render/hitFeedbackConfig';
import {
  DEFAULT_FCT_CLUSTER_CONFIG,
  fctClusterConfig,
  saveFctClusterConfig,
  type FctClusterConfig,
} from '../../render/fctClusterConfig';
import type { InspectorContext } from '../InspectorUI';

export function buildGraphicsTab(parent: HTMLElement, ctx: InspectorContext): void {
  const settings = getGraphicsSettings();
  const perfCheckboxes: Partial<Record<keyof GraphicsSettings, HTMLInputElement>> = {};
  const retroCheckboxes: Partial<Record<keyof GraphicsSettings, HTMLInputElement>> = {};

  // --- CAMERA & VIEWPORT ---
  const cameraSection = document.createElement('div');
  cameraSection.style.cssText = sectionDivider();
  cameraSection.appendChild(sectionHeader('CAMERA & VIEWPORT'));

  const cameraHelper = document.createElement('div');
  cameraHelper.style.cssText = `font-size:${FONTS.size.sm};color:${RETRO_COLORS.textMuted};margin-bottom:8px;line-height:1.35;`;
  cameraHelper.textContent =
    'Y/C toggle lock/free · MMB drag pan · wheel zoom · Space = slot 4';
  cameraSection.appendChild(cameraHelper);

  const modeRow = document.createElement('div');
  modeRow.style.cssText = 'display:flex;gap:4px;margin-bottom:8px;';
  const modeButtons: Record<'LOCKED' | 'FREE', HTMLButtonElement> = {
    LOCKED: document.createElement('button'),
    FREE: document.createElement('button'),
  };
  modeButtons.LOCKED.textContent = 'LOCKED';
  modeButtons.FREE.textContent = 'FREE';
  const syncModeButtons = (): void => {
    for (const mode of ['LOCKED', 'FREE'] as const) {
      modeButtons[mode].style.cssText = buttonStyle(ctx.camera.mode === mode);
    }
  };
  for (const mode of ['LOCKED', 'FREE'] as const) {
    const btn = modeButtons[mode];
    btn.onclick = () => {
      ctx.camera.mode = mode;
      syncModeButtons();
    };
    modeRow.appendChild(btn);
  }
  syncModeButtons();
  cameraSection.appendChild(modeRow);

  const zoomSlider = sliderRow(
    cameraSection,
    'Zoom Level',
    0.4,
    2.0,
    0.05,
    () => ctx.camera.targetZoom,
    (v) => ctx.camera.setZoom(v),
    'x',
  );

  const resetCameraBtn = document.createElement('button');
  resetCameraBtn.textContent = 'Reset Camera (Center & 1.0x)';
  resetCameraBtn.style.cssText = buttonStyle(false) + 'margin-top:6px;width:100%;';
  resetCameraBtn.onclick = () => {
    ctx.camera.mode = 'LOCKED';
    ctx.camera.setZoom(1);
    ctx.camera.snapTo(ctx.player.pos.x, ctx.player.pos.y);
    syncModeButtons();
    zoomSlider.refresh();
  };
  cameraSection.appendChild(resetCameraBtn);

  parent.appendChild(cameraSection);

  setInterval(() => {
    syncModeButtons();
    zoomSlider.refresh();
  }, 250);

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

  addToggle(perfSection, perfCheckboxes, 'webglBackground', 'WebGL Arena Background');
  addToggle(perfSection, perfCheckboxes, 'floorSubGrid', 'Floor Phosphor Grid');
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

  // --- HIT IMPACT & SATISFACTION ---
  const hitSection = document.createElement('div');
  hitSection.style.cssText = sectionDivider();
  hitSection.appendChild(sectionHeader('HIT IMPACT & SATISFACTION'));

  const hitCheckboxes: Partial<Record<keyof HitFeedbackConfig, HTMLInputElement>> = {};

  const addHitToggle = (key: keyof HitFeedbackConfig, label: string): void => {
    const row = document.createElement('label');
    row.style.cssText =
      `display:flex;align-items:center;gap:8px;cursor:pointer;font-size:${FONTS.size.body};margin-bottom:8px;`;
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = hitFeedbackConfig[key];
    checkbox.onchange = () => {
      hitFeedbackConfig[key] = checkbox.checked;
      saveHitFeedbackConfig();
    };
    hitCheckboxes[key] = checkbox;
    row.appendChild(checkbox);
    row.appendChild(document.createTextNode(label));
    hitSection.appendChild(row);
  };

  addHitToggle('targetFlash', 'Target White Flash');
  addHitToggle('reticleMarkers', 'Crosshair Hit Flash');
  addHitToggle('bodyDeform', 'Body Squash & Shudder');
  addHitToggle('microHitstop', 'Micro-Hitstop Freeze');
  addHitToggle('ghostInstabilityBar', 'Ghost Bar Chunking');
  addHitToggle('directionalBlastRings', 'Directional Blast Rings');

  const resetHitBtn = document.createElement('button');
  resetHitBtn.textContent = 'Reset Hit Feedback (All On)';
  resetHitBtn.style.cssText = buttonStyle(false) + 'margin-top:6px;width:100%;';
  resetHitBtn.onclick = () => {
    Object.assign(hitFeedbackConfig, DEFAULT_HIT_FEEDBACK_CONFIG);
    saveHitFeedbackConfig();
    for (const key of Object.keys(hitCheckboxes) as (keyof HitFeedbackConfig)[]) {
      const box = hitCheckboxes[key];
      if (box) box.checked = hitFeedbackConfig[key];
    }
  };
  hitSection.appendChild(resetHitBtn);

  parent.appendChild(hitSection);

  // --- FLOATING COMBAT TEXT ---
  const fctSection = document.createElement('div');
  fctSection.style.cssText = sectionDivider();
  fctSection.appendChild(sectionHeader('FLOATING COMBAT TEXT'));

  const fctHelper = document.createElement('div');
  fctHelper.style.cssText = `font-size:${FONTS.size.sm};color:${RETRO_COLORS.textMuted};margin-bottom:8px;line-height:1.35;`;
  fctHelper.textContent =
    'Low damage/heal ticks merge into larger numbers. Stand in lava to preview.';
  fctSection.appendChild(fctHelper);

  const fctNumeric = (key: keyof FctClusterConfig) => ({
    get: () => fctClusterConfig[key],
    set: (v: number) => {
      fctClusterConfig[key] = v;
      saveFctClusterConfig();
    },
  });

  const clusterWindow = fctNumeric('clusterWindowMs');
  const clusterPerTick = fctNumeric('clusterPerTickMax');
  const clusterFlush = fctNumeric('clusterInstantFlush');

  const fctSliders = [
    sliderRow(fctSection, 'Cluster Window', 100, 1000, 25, clusterWindow.get, clusterWindow.set, 'ms'),
    sliderRow(fctSection, 'Per-Tick Max', 1, 20, 1, clusterPerTick.get, clusterPerTick.set),
    sliderRow(fctSection, 'Instant Flush', 3, 50, 1, clusterFlush.get, clusterFlush.set),
  ];

  const resetFctBtn = document.createElement('button');
  resetFctBtn.textContent = 'Reset FCT Clustering Defaults';
  resetFctBtn.style.cssText = buttonStyle(false) + 'margin-top:6px;width:100%;';
  resetFctBtn.onclick = () => {
    Object.assign(fctClusterConfig, DEFAULT_FCT_CLUSTER_CONFIG);
    saveFctClusterConfig();
    for (const slider of fctSliders) slider.refresh();
  };
  fctSection.appendChild(resetFctBtn);

  parent.appendChild(fctSection);

  // --- RETRO & CRT ENGINE ---
  const retroSection = document.createElement('div');
  retroSection.style.cssText = `${retroPanelStyle('cyan')}padding:12px;margin-bottom:16px;`;
  retroSection.appendChild(sectionHeader('RETRO & CRT ENGINE'));

  addToggle(retroSection, retroCheckboxes, 'crtEnabled', 'CRT Post-Processing');
  addToggle(retroSection, retroCheckboxes, 'arcadeBezel', 'Arcade Bezel');

  const iconStyleLabel = document.createElement('div');
  iconStyleLabel.textContent = 'Icon Style';
  iconStyleLabel.style.cssText = `font-size:${FONTS.size.sm};color:${RETRO_COLORS.textMuted};margin:8px 0 4px;`;
  retroSection.appendChild(iconStyleLabel);

  const iconStyleRow = document.createElement('div');
  iconStyleRow.style.cssText = 'display:flex;gap:4px;margin-bottom:8px;';

  const iconStyleButtons: Record<IconRenderStyle, HTMLButtonElement> = {
    SEMANTIC_GLYPH: document.createElement('button'),
    SIMULATION_TRACE: document.createElement('button'),
  };
  iconStyleButtons.SEMANTIC_GLYPH.textContent = 'Semantic Glyph';
  iconStyleButtons.SIMULATION_TRACE.textContent = 'Simulation Trace';

  const syncIconStyleButtons = (): void => {
    const active = getIconRenderStyle();
    for (const style of ['SEMANTIC_GLYPH', 'SIMULATION_TRACE'] as IconRenderStyle[]) {
      iconStyleButtons[style].style.cssText = buttonStyle(active === style);
    }
  };

  for (const style of ['SEMANTIC_GLYPH', 'SIMULATION_TRACE'] as IconRenderStyle[]) {
    const btn = iconStyleButtons[style];
    btn.onclick = () => {
      setIconRenderStyle(style);
      syncIconStyleButtons();
    };
    iconStyleRow.appendChild(btn);
  }
  syncIconStyleButtons();
  retroSection.appendChild(iconStyleRow);

  const crosshairOptions = CROSSHAIR_STYLE_IDS.map((id) => ({
    value: id,
    label: CROSSHAIR_PRESETS[id].label,
  }));
  const crosshairSelect = selectRow(
    retroSection,
    'Crosshair Style',
    crosshairOptions,
    () => getGraphicsSettings().crosshairStyle,
    (id) => {
      if (isCrosshairStyleId(id)) {
        saveGraphicsSettings({ ...getGraphicsSettings(), crosshairStyle: id });
        syncControls(getGraphicsSettings());
      }
    },
  );

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
  const brightnessSlider = numeric('crtBrightness');

  const bloomSliders = [
    sliderRow(retroSection, 'Bloom Intensity', 0, 2, 0.05, bloomSlider.get, bloomSlider.set),
    sliderRow(retroSection, 'Bloom Threshold', 0.2, 0.9, 0.05, thresholdSlider.get, thresholdSlider.set),
    sliderRow(retroSection, 'CRT Brightness', 0.5, 2, 0.05, brightnessSlider.get, brightnessSlider.set),
  ];

  const postEffectsControls = buildPostEffectsSection(retroSection);

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
    crosshairSelect.refresh();
    for (const slider of bloomSliders) slider.refresh();
    postEffectsControls.sync();
  };

  subscribeGraphicsSettings(() => syncControls(getGraphicsSettings()));
}
