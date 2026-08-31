import { generateOfflineDraft } from '../ai/Synthesizer';
import type { GameMode } from './MatchManager';
import type { GameApp } from './GameApp';
import { getHexCenter } from './arena';
import { applyDraftSelection } from './loadout';
import type { DraftSelection } from '../types/cards';

export function canDraftOpen(app: GameApp): boolean {
  return (
    app.matchManager.mode === 'SANDBOX' || app.matchManager.state === 'LOBBY'
  );
}

export function canCombatInput(app: GameApp): boolean {
  if (app.draftModal.isOpen()) return false;
  if (app.matchManager.mode === 'SANDBOX') return true;
  return app.matchManager.state === 'ROUND_ACTIVE';
}

export function handleEquip(app: GameApp, selection: DraftSelection): void {
  applyDraftSelection(app, app.player, selection);
  if (app.isIntermissionDraft && app.matchManager.mode === 'MATCH') {
    app.matchManager.completeIntermission(
      app.player,
      app.bot,
      app.world,
      app.arenaShrink,
      getHexCenter(),
    );
    app.isIntermissionDraft = false;
  }
}

function handleIntermissionDraft(app: GameApp): void {
  if (app.intermissionHandled) return;
  app.intermissionHandled = true;
  app.isIntermissionDraft = true;

  const cards = generateOfflineDraft('intermission combat upgrade');
  const botSelection = app.botController.selectDraftCard(cards);
  applyDraftSelection(app, app.bot, botSelection);
  app.draftModal.openIntermission(cards);
}

export function handleMatchStateChange(app: GameApp): void {
  if (app.matchManager.mode !== 'MATCH') return;

  const s = app.matchManager.state;
  if (s === 'INTERMISSION_DRAFT') {
    handleIntermissionDraft(app);
  } else {
    app.intermissionHandled = false;
  }

  if (s === 'ROUND_ACTIVE') {
    app.matchManager.resetRoundEntities(
      app.player,
      app.bot,
      app.world,
      app.arenaShrink,
      getHexCenter(),
    );
  }
}

export function handleModeChange(app: GameApp, mode: GameMode): void {
  app.intermissionHandled = false;
  app.isIntermissionDraft = false;

  if (app.draftModal.isOpen()) {
    app.draftModal.close();
  }

  if (mode === 'SANDBOX') {
    app.arenaShrink.enabled = false;
    app.arenaShrink.reset();
    app.loop.setPaused(false);
    app.botController.enabled = false;
  } else {
    app.arenaShrink.enabled = true;
    app.arenaShrink.reset();
    app.botController.enabled = true;
  }
}
