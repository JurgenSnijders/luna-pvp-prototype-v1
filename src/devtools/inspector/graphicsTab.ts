import {
  applyBalancedPreset,
  applyStylePreset,
  applyTierPreset,
  getEffectiveFeatureFlags,
  getEffectiveTier,
  getEffectiveDprCap,
  getGraphicsSettings,
  getTierLimits,
  resetAllGraphicsDefaults,
  resetStylePresetDefaults,
  saveGraphicsSettings,
  subscribeGraphicsSettings,
  type GraphicsSettings,
  type QualityTier,
} from '../graphicsSettings';
import { exportGraphicsProfile, importGraphicsProfile } from '../graphicsProfile';
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
  collapsibleSection,
  helperText,
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
import {
  clearUserZoomOverride,
  fitArenaToSafeView,
  markUserZoomOverride,
} from '../../camera/cameraArenaFit';
import { getSafeViewInsets, isCompactViewport } from '../../ui/viewportLayout';
import type { InspectorContext } from '../InspectorUI';

export function buildGraphicsTab(parent: HTMLElement, ctx: InspectorContext): void {
  const settings = getGraphicsSettings();
  const qualityCheckboxes: Partial<Record<keyof GraphicsSettings, HTMLInputElement>> = {};
  const arenaCheckboxes: Partial<Record<keyof GraphicsSettings, HTMLInputElement>> = {};
  const lookCheckboxes: Partial<Record<keyof GraphicsSettings, HTMLInputElement>> = {};
  const tierButtons: Partial<Record<QualityTier, HTMLButtonElement>> = {};

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

  const numeric = (key: keyof GraphicsSettings) => ({
    get: () => getGraphicsSettings()[key] as number,
    set: (v: number) => saveGraphicsSettings({ ...getGraphicsSettings(), [key]: v }),
  });

  // --- QUALITY ---
  const qualitySection = collapsibleSection(parent, 'Quality', true);
  const qualityBody = qualitySection.body;

  const tierRow = document.createElement('div');
  tierRow.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px;';
  const tiers: QualityTier[] = ['LOW', 'MEDIUM', 'HIGH', 'ULTRA', 'AUTO'];
  for (const tier of tiers) {
    const btn = document.createElement('button');
    btn.textContent = tier;
    tierButtons[tier] = btn;
    btn.onclick = () => {
      if (tier === 'AUTO') {
        saveGraphicsSettings({ ...getGraphicsSettings(), tier: 'AUTO', manualTierOverride: false });
      } else {
        applyTierPreset(tier);
      }
      syncControls(getGraphicsSettings());
      refreshPerf();
      refreshTierHelper();
    };
    tierRow.appendChild(btn);
  }
  qualityBody.appendChild(tierRow);

  const shortcutRow = document.createElement('div');
  shortcutRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;';
  const shortcuts: { label: string; run: () => void }[] = [
    { label: 'Fast', run: () => applyTierPreset('LOW') },
    { label: 'Balanced', run: () => applyBalancedPreset() },
    { label: 'Quality', run: () => applyTierPreset('HIGH') },
  ];
  for (const { label, run } of shortcuts) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = buttonStyle(false);
    btn.onclick = () => {
      run();
      syncControls(getGraphicsSettings());
      refreshPerf();
      refreshTierHelper();
    };
    shortcutRow.appendChild(btn);
  }
  qualityBody.appendChild(shortcutRow);

  const tierHelper = document.createElement('div');
  tierHelper.style.cssText = `font-size:${FONTS.size.sm};color:${RETRO_COLORS.textMuted};margin-bottom:8px;line-height:1.35;`;
  qualityBody.appendChild(tierHelper);

  const budgetHint = document.createElement('div');
  budgetHint.style.cssText = `font-size:${FONTS.size.sm};color:${RETRO_COLORS.textMuted};margin-bottom:8px;line-height:1.35;`;
  qualityBody.appendChild(budgetHint);

  const refreshTierHelper = (): void => {
    const s = getGraphicsSettings();
    const limits = getTierLimits();
    const flags = getEffectiveFeatureFlags();
    if (s.tier === 'AUTO') {
      tierHelper.textContent =
        `AUTO · effective ${getEffectiveTier()}. Features are gated by effective tier; stored toggles are not rewritten.`;
    } else {
      tierHelper.textContent = `Manual ${s.tier} preset applied to feature toggles, post-effects, and sliders.`;
    }
    budgetHint.textContent =
      `Budget: particles ${limits.particleBudget.toLocaleString()} · DPR ${getEffectiveDprCap().toFixed(2)} · primitives ${limits.maxPrimitives} · ` +
      `bg ${flags.webglBackground ? 'on' : 'off'} · crt ${flags.crtEnabled ? 'on' : 'off'}`;
  };
  refreshTierHelper();

  addToggle(qualityBody, qualityCheckboxes, 'bloomEnabled', 'Bloom Post-Processing');
  addToggle(qualityBody, qualityCheckboxes, 'refractionEnabled', 'Refraction (ULTRA)');
  addToggle(qualityBody, qualityCheckboxes, 'particleTrails', 'Projectile Particle Trails');
  addToggle(qualityBody, qualityCheckboxes, 'showVerticalVectors', 'Show Vertical Telemetry');
  addToggle(qualityBody, qualityCheckboxes, 'crtEnabled', 'CRT Post-Processing');

  // --- ARENA ---
  const arenaSection = collapsibleSection(parent, 'Arena', true);
  const arenaBody = arenaSection.body;

  addToggle(arenaBody, arenaCheckboxes, 'webglBackground', 'WebGL Arena Background');
  helperText(
    arenaBody,
    'Parallax: 0 = locked to screen, 1 = locked to world. Lower = slower camera drift.',
  );

  const bgNumeric = (key: 'bgParallaxVoid' | 'bgParallaxLava' | 'bgLavaScrollSpeed') => ({
    get: () => getGraphicsSettings()[key],
    set: (v: number) => saveGraphicsSettings({ ...getGraphicsSettings(), [key]: v }),
  });
  const bgParallaxSliders = [
    sliderRow(
      arenaBody,
      'Void Parallax',
      0,
      1,
      0.01,
      bgNumeric('bgParallaxVoid').get,
      bgNumeric('bgParallaxVoid').set,
    ),
    sliderRow(
      arenaBody,
      'Lava Parallax',
      0,
      1,
      0.01,
      bgNumeric('bgParallaxLava').get,
      bgNumeric('bgParallaxLava').set,
    ),
    sliderRow(
      arenaBody,
      'Lava Drift Speed',
      0,
      1,
      0.01,
      bgNumeric('bgLavaScrollSpeed').get,
      bgNumeric('bgLavaScrollSpeed').set,
    ),
  ];

  addToggle(arenaBody, arenaCheckboxes, 'floorSubGrid', 'Floor Phosphor Grid');
  addToggle(arenaBody, arenaCheckboxes, 'ambientEmbers', 'Ambient Lava Embers');
  addToggle(arenaBody, arenaCheckboxes, 'dynamicDebris', 'Dynamic Shatter Debris');

  // --- LOOK ---
  const lookSection = collapsibleSection(parent, 'Look', true);
  const lookBody = lookSection.body;
  lookBody.style.cssText = `${retroPanelStyle('cyan')}padding:12px;border-radius:4px;`;

  const presetOptions = STYLE_PRESET_IDS.map((id) => ({
    value: id,
    label: STYLE_PRESETS[id].label,
  }));
  const presetSelect = selectRow(
    lookBody,
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

  addToggle(lookBody, lookCheckboxes, 'arcadeBezel', 'Arcade Bezel');

  const bloomSlider = numeric('bloomIntensity');
  const thresholdSlider = numeric('bloomThreshold');
  const brightnessSlider = numeric('crtBrightness');

  const bloomSliders = [
    sliderRow(lookBody, 'Bloom Intensity', 0, 2, 0.05, bloomSlider.get, bloomSlider.set),
    sliderRow(lookBody, 'Bloom Threshold', 0.2, 0.9, 0.05, thresholdSlider.get, thresholdSlider.set),
    sliderRow(lookBody, 'CRT Brightness', 0.5, 2, 0.05, brightnessSlider.get, brightnessSlider.set),
  ];

  const crosshairOptions = CROSSHAIR_STYLE_IDS.map((id) => ({
    value: id,
    label: CROSSHAIR_PRESETS[id].label,
  }));
  const crosshairSelect = selectRow(
    lookBody,
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

  const iconStyleLabel = document.createElement('div');
  iconStyleLabel.textContent = 'Icon Style';
  iconStyleLabel.style.cssText = `font-size:${FONTS.size.sm};color:${RETRO_COLORS.textMuted};margin:8px 0 4px;`;
  lookBody.appendChild(iconStyleLabel);

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
  lookBody.appendChild(iconStyleRow);

  const resetPresetBtn = document.createElement('button');
  resetPresetBtn.textContent = 'Reset Preset Defaults';
  resetPresetBtn.style.cssText = buttonStyle(false) + 'margin-top:6px;width:100%;';
  resetPresetBtn.onclick = () => {
    resetStylePresetDefaults();
    syncControls(getGraphicsSettings());
  };
  lookBody.appendChild(resetPresetBtn);

  // --- POST EFFECTS ---
  const postFxSection = collapsibleSection(parent, 'Post Effects', true);
  const postEffectsControls = buildPostEffectsSection(postFxSection.body);

  // --- CAMERA ---
  const cameraSection = collapsibleSection(parent, 'Camera', false);
  const cameraBody = cameraSection.body;

  helperText(cameraBody, 'Y/C toggle lock/free · MMB drag pan · wheel zoom · Space = slot 4');

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
  cameraBody.appendChild(modeRow);

  const zoomSlider = sliderRow(
    cameraBody,
    'Zoom Level',
    0.3,
    2.0,
    0.05,
    () => ctx.camera.targetZoom,
    (v) => {
      markUserZoomOverride();
      ctx.camera.setZoom(v);
    },
    'x',
  );

  const resetCameraBtn = document.createElement('button');
  resetCameraBtn.textContent = 'Reset Camera (Center & Fit)';
  resetCameraBtn.style.cssText = buttonStyle(false) + 'margin-top:6px;width:100%;';
  resetCameraBtn.onclick = () => {
    clearUserZoomOverride();
    ctx.camera.mode = 'LOCKED';
    ctx.camera.snapTo(ctx.player.pos.x, ctx.player.pos.y);
    if (isCompactViewport()) {
      fitArenaToSafeView(ctx.camera, ctx.world.hexRadius, getSafeViewInsets(), { force: true });
    } else {
      ctx.camera.setZoom(1);
    }
    syncModeButtons();
    zoomSlider.refresh();
  };
  cameraBody.appendChild(resetCameraBtn);

  // --- HIT IMPACT ---
  const hitSection = collapsibleSection(parent, 'Hit Impact', false);
  const hitBody = hitSection.body;
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
    hitBody.appendChild(row);
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
  hitBody.appendChild(resetHitBtn);

  // --- FLOATING COMBAT TEXT ---
  const fctSection = collapsibleSection(parent, 'Floating Combat Text', false);
  const fctBody = fctSection.body;
  helperText(
    fctBody,
    'Low damage/heal ticks merge into larger numbers. Stand in lava to preview.',
  );

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
    sliderRow(fctBody, 'Cluster Window', 100, 1000, 25, clusterWindow.get, clusterWindow.set, 'ms'),
    sliderRow(fctBody, 'Per-Tick Max', 1, 20, 1, clusterPerTick.get, clusterPerTick.set),
    sliderRow(fctBody, 'Instant Flush', 3, 50, 1, clusterFlush.get, clusterFlush.set),
  ];

  const resetFctBtn = document.createElement('button');
  resetFctBtn.textContent = 'Reset FCT Clustering Defaults';
  resetFctBtn.style.cssText = buttonStyle(false) + 'margin-top:6px;width:100%;';
  resetFctBtn.onclick = () => {
    Object.assign(fctClusterConfig, DEFAULT_FCT_CLUSTER_CONFIG);
    saveFctClusterConfig();
    for (const slider of fctSliders) slider.refresh();
  };
  fctBody.appendChild(resetFctBtn);

  // --- PROFILE ---
  const profileSection = collapsibleSection(parent, 'Profile', false);
  const profileBody = profileSection.body;
  helperText(profileBody, 'Save a file on this machine, then load it on another computer.');

  const profileStatus = document.createElement('div');
  profileStatus.style.cssText = `display:none;font-size:${FONTS.size.sm};margin-top:6px;line-height:1.35;`;

  const showProfileStatus = (message: string, ok: boolean): void => {
    profileStatus.textContent = message;
    profileStatus.style.display = 'block';
    profileStatus.style.color = ok ? RETRO_COLORS.neonCyan : '#ff6666';
    window.setTimeout(() => {
      profileStatus.style.display = 'none';
    }, 4000);
  };

  const profileRow = document.createElement('div');
  profileRow.style.cssText = 'display:flex;gap:6px;margin-top:6px;';

  const exportProfileBtn = document.createElement('button');
  exportProfileBtn.textContent = 'Export JSON';
  exportProfileBtn.style.cssText = buttonStyle(false) + 'flex:1;';
  exportProfileBtn.onclick = () => {
    const profile = exportGraphicsProfile();
    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'luna-graphics-profile.json';
    anchor.click();
    URL.revokeObjectURL(url);
    showProfileStatus('Graphics profile exported.', true);
  };

  const importFileInput = document.createElement('input');
  importFileInput.type = 'file';
  importFileInput.accept = 'application/json,.json';
  importFileInput.style.display = 'none';

  const importProfileBtn = document.createElement('button');
  importProfileBtn.textContent = 'Import JSON';
  importProfileBtn.style.cssText = buttonStyle(false) + 'flex:1;';
  importProfileBtn.onclick = () => {
    importFileInput.value = '';
    importFileInput.click();
  };

  importFileInput.onchange = () => {
    const file = importFileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = JSON.parse(String(reader.result ?? ''));
        importGraphicsProfile(raw);
        syncControls(getGraphicsSettings());
        showProfileStatus('Graphics profile imported.', true);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid graphics profile file.';
        showProfileStatus(message, false);
      }
    };
    reader.onerror = () => {
      showProfileStatus('Could not read graphics profile file.', false);
    };
    reader.readAsText(file);
  };

  profileRow.appendChild(exportProfileBtn);
  profileRow.appendChild(importProfileBtn);
  profileBody.appendChild(profileRow);
  profileBody.appendChild(importFileInput);
  profileBody.appendChild(profileStatus);

  const resetAllBtn = document.createElement('button');
  resetAllBtn.textContent = 'Reset All Graphics Defaults';
  resetAllBtn.style.cssText = buttonStyle(false) + 'margin-top:6px;width:100%;';
  resetAllBtn.onclick = () => {
    resetAllGraphicsDefaults();
    syncControls(getGraphicsSettings());
    refreshTierHelper();
    refreshPerf();
  };
  profileBody.appendChild(resetAllBtn);

  // --- DIAGNOSTICS ---
  const diagnosticsSection = collapsibleSection(parent, 'Diagnostics', false);
  const diagnosticsBody = diagnosticsSection.body;

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
  diagnosticsBody.appendChild(perfBox);

  const caps = perfMonitor.getCapabilities();
  if (caps) {
    const capLine = document.createElement('div');
    capLine.style.cssText = `font-size:${FONTS.size.sm};color:${RETRO_COLORS.textMuted};margin-bottom:8px;`;
    capLine.textContent = `Extensions: ${caps.extensions.length}`;
    diagnosticsBody.appendChild(capLine);
  }

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
  diagnosticsBody.appendChild(devRow);

  setInterval(() => {
    syncModeButtons();
    zoomSlider.refresh();
  }, 250);

  const syncTierButtons = (): void => {
    const storedTier = getGraphicsSettings().tier;
    for (const tier of tiers) {
      const btn = tierButtons[tier];
      if (btn) btn.style.cssText = buttonStyle(storedTier === tier);
    }
  };

  const syncControls = (s: GraphicsSettings): void => {
    for (const store of [qualityCheckboxes, arenaCheckboxes, lookCheckboxes]) {
      for (const key of Object.keys(store) as (keyof GraphicsSettings)[]) {
        const box = store[key];
        if (box) box.checked = s[key] as boolean;
      }
    }
    for (const key of Object.keys(hitCheckboxes) as (keyof HitFeedbackConfig)[]) {
      const box = hitCheckboxes[key];
      if (box) box.checked = hitFeedbackConfig[key];
    }
    syncTierButtons();
    refreshTierHelper();
    presetSelect.refresh();
    crosshairSelect.refresh();
    for (const slider of bloomSliders) slider.refresh();
    for (const slider of bgParallaxSliders) slider.refresh();
    for (const slider of fctSliders) slider.refresh();
    syncIconStyleButtons();
    postEffectsControls.sync();
  };

  syncTierButtons();
  subscribeGraphicsSettings(() => syncControls(getGraphicsSettings()));
}
