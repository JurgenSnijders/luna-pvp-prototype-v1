import { ACTION_SLOT_KEYS } from '../../types/cards';
import type { InspectorContext } from '../InspectorUI';

export const TELEMETRY_UPDATE_INTERVAL_MS = 200;

export interface TelemetryRefs {
  mode: HTMLElement;
  match: HTMLElement;
  score: HTMLElement;
  round: HTMLElement;
  fps: HTMLElement;
  entities: HTMLElement;
  zones: HTMLElement;
  velocity: HTMLElement;
  combatant: HTMLElement;
  slots: HTMLElement[];
  passives: HTMLElement;
}

export function buildTelemetryDom(
  telemetryEl: HTMLElement,
  ctx: InspectorContext,
): TelemetryRefs {
  telemetryEl.textContent = '';
  const makeRow = (): HTMLElement => {
    const row = document.createElement('div');
    telemetryEl.appendChild(row);
    return row;
  };

  const refs: TelemetryRefs = {
    mode: makeRow(),
    match: makeRow(),
    score: makeRow(),
    round: makeRow(),
    fps: makeRow(),
    entities: makeRow(),
    zones: makeRow(),
    velocity: makeRow(),
    combatant: makeRow(),
    slots: ACTION_SLOT_KEYS.map(() => makeRow()),
    passives: makeRow(),
  };

  if (!ctx.matchManager) {
    refs.mode.style.display = 'none';
    refs.match.style.display = 'none';
    refs.score.style.display = 'none';
    refs.round.style.display = 'none';
  }

  return refs;
}
