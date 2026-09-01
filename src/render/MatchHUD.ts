import type { GameMode, MatchSnapshot, MatchState } from '../game/MatchManager';

export interface MatchHUDCallbacks {
  onStartMatch: () => void;
  onPlayAgain: () => void;
}

export class MatchHUD {
  private root: HTMLElement;
  private header: HTMLElement;
  private roundLabel: HTMLElement;
  private playerPips: HTMLElement;
  private botPips: HTMLElement;
  private countdownBanner: HTMLElement;
  private roundToast: HTMLElement;
  private lobbyBtn: HTMLButtonElement;
  private matchOverModal: HTMLElement;
  private matchOverTitle: HTMLElement;
  private matchOverScore: HTMLElement;
  private playAgainBtn: HTMLButtonElement;

  constructor(private callbacks: MatchHUDCallbacks) {
    this.root = document.createElement('div');
    this.root.style.cssText = `
      position: fixed; inset: 0; z-index: 9000;
      pointer-events: none; font-family: system-ui, sans-serif;
    `;

    this.header = document.createElement('div');
    this.header.style.cssText = `
      position: absolute; top: 16px; left: 50%; transform: translateX(-50%);
      display: flex; flex-direction: column; align-items: center; gap: 8px;
      padding: 12px 24px; border-radius: 12px;
      background: rgba(10, 10, 20, 0.65); backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
    `;

    this.roundLabel = document.createElement('div');
    this.roundLabel.style.cssText =
      'font-size: 12px; letter-spacing: 0.15em; color: #888; font-weight: 600;';

    const pipRow = document.createElement('div');
    pipRow.style.cssText = 'display: flex; align-items: center; gap: 16px;';

    this.playerPips = this.createPipGroup('#00ccff');
    const vs = document.createElement('span');
    vs.textContent = 'VS';
    vs.style.cssText = 'font-size: 11px; color: #555; font-weight: bold;';
    this.botPips = this.createPipGroup('#ff8844');

    pipRow.appendChild(this.playerPips);
    pipRow.appendChild(vs);
    pipRow.appendChild(this.botPips);

    this.header.appendChild(this.roundLabel);
    this.header.appendChild(pipRow);
    this.root.appendChild(this.header);

    this.countdownBanner = document.createElement('div');
    this.countdownBanner.style.cssText = `
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
      font-size: 72px; font-weight: 800; color: #fff;
      text-shadow: 0 0 40px rgba(0, 200, 255, 0.6);
      opacity: 0; transition: opacity 0.15s ease, transform 0.15s ease;
      letter-spacing: 0.05em;
    `;
    this.root.appendChild(this.countdownBanner);

    this.roundToast = document.createElement('div');
    this.roundToast.style.cssText = `
      position: absolute; top: 100px; left: 50%; transform: translateX(-50%);
      padding: 12px 32px; border-radius: 8px; font-size: 18px; font-weight: 700;
      letter-spacing: 0.12em; opacity: 0; transition: opacity 0.2s ease;
      background: rgba(10, 10, 20, 0.8); border: 1px solid rgba(255,255,255,0.15);
    `;
    this.root.appendChild(this.roundToast);

    this.lobbyBtn = document.createElement('button');
    this.lobbyBtn.textContent = 'START MATCH';
    this.lobbyBtn.style.cssText = `
      position: absolute; bottom: 80px; left: 50%; transform: translateX(-50%);
      pointer-events: auto; padding: 14px 36px; font-size: 16px; font-weight: 700;
      letter-spacing: 0.1em; border-radius: 10px; cursor: pointer;
      border: 2px solid #00ccff; background: rgba(0, 200, 255, 0.15);
      color: #00ccff; box-shadow: 0 0 24px rgba(0, 200, 255, 0.3);
    `;
    this.lobbyBtn.onclick = () => this.callbacks.onStartMatch();
    this.root.appendChild(this.lobbyBtn);

    this.matchOverModal = document.createElement('div');
    this.matchOverModal.style.cssText = `
      position: absolute; inset: 0; display: none; align-items: center; justify-content: center;
      background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(6px); pointer-events: auto;
    `;

    const modalPanel = document.createElement('div');
    modalPanel.style.cssText = `
      padding: 40px 48px; border-radius: 16px; text-align: center;
      background: rgba(10, 10, 20, 0.92); border: 1px solid rgba(255,255,255,0.12);
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    `;

    this.matchOverTitle = document.createElement('div');
    this.matchOverTitle.style.cssText =
      'font-size: 36px; font-weight: 800; margin-bottom: 12px; letter-spacing: 0.08em;';

    this.matchOverScore = document.createElement('div');
    this.matchOverScore.style.cssText = 'font-size: 16px; color: #888; margin-bottom: 24px;';

    this.playAgainBtn = document.createElement('button');
    this.playAgainBtn.textContent = 'PLAY AGAIN';
    this.playAgainBtn.style.cssText = `
      padding: 12px 32px; font-size: 14px; font-weight: 700; cursor: pointer;
      border-radius: 8px; border: 2px solid #00ccff;
      background: rgba(0, 200, 255, 0.15); color: #00ccff;
    `;
    this.playAgainBtn.onclick = () => this.callbacks.onPlayAgain();

    modalPanel.appendChild(this.matchOverTitle);
    modalPanel.appendChild(this.matchOverScore);
    modalPanel.appendChild(this.playAgainBtn);
    this.matchOverModal.appendChild(modalPanel);
    this.root.appendChild(this.matchOverModal);

    document.body.appendChild(this.root);
  }

  private createPipGroup(color: string): HTMLElement {
    const group = document.createElement('div');
    group.style.cssText = 'display: flex; gap: 6px;';
    for (let i = 0; i < 5; i++) {
      const pip = document.createElement('div');
      pip.dataset.pip = 'true';
      pip.style.cssText = `
        width: 14px; height: 14px; border-radius: 50%;
        border: 2px solid ${color}; background: transparent;
        transition: background 0.2s ease, box-shadow 0.2s ease;
      `;
      pip.style.setProperty('--pip-color', color);
      group.appendChild(pip);
    }
    return group;
  }

  private fillPips(container: HTMLElement, filled: number, color: string): void {
    const pips = container.querySelectorAll('[data-pip]');
    pips.forEach((pip, i) => {
      const el = pip as HTMLElement;
      if (i < filled) {
        el.style.background = color;
        el.style.boxShadow = `0 0 8px ${color}88`;
      } else {
        el.style.background = 'transparent';
        el.style.boxShadow = 'none';
      }
    });
  }

  update(
    state: MatchState,
    snapshot: MatchSnapshot,
    stateTimer: number,
    mode: GameMode,
  ): void {
    if (mode === 'SANDBOX') {
      this.header.style.display = 'none';
      this.lobbyBtn.style.display = 'none';
      this.matchOverModal.style.display = 'none';
      this.countdownBanner.style.opacity = '0';
      this.roundToast.style.opacity = '0';
      return;
    }

    this.header.style.display = 'flex';

    this.roundLabel.textContent = `ROUND ${snapshot.roundNumber}`;
    this.fillPips(this.playerPips, snapshot.playerWins, '#00ccff');
    this.fillPips(this.botPips, snapshot.botWins, '#ff8844');

    this.lobbyBtn.style.display = state === 'LOBBY' ? 'block' : 'none';
    this.matchOverModal.style.display = state === 'MATCH_OVER' ? 'flex' : 'none';

    if (state === 'MATCH_OVER') {
      const playerWon = snapshot.playerWins >= snapshot.targetWins;
      this.matchOverTitle.textContent = playerWon ? 'VICTORY' : 'DEFEAT';
      this.matchOverTitle.style.color = playerWon ? '#00ccff' : '#ff6644';
      this.matchOverScore.textContent = `${snapshot.playerWins} — ${snapshot.botWins}`;
    }

    if (state === 'COUNTDOWN') {
      const sec = Math.ceil(stateTimer);
      let text = 'FIGHT!';
      if (sec > 0) text = String(sec);
      this.countdownBanner.textContent = text;
      this.countdownBanner.style.opacity = '1';
      this.countdownBanner.style.transform = 'translate(-50%, -50%) scale(1.05)';
    } else {
      this.countdownBanner.style.opacity = '0';
      this.countdownBanner.style.transform = 'translate(-50%, -50%) scale(0.9)';
    }

    if (state === 'ROUND_OVER') {
      let text = 'DRAW';
      let color = '#aaa';
      if (snapshot.lastRoundWinner === 'player') {
        text = 'ROUND WON';
        color = '#00ccff';
      } else if (snapshot.lastRoundWinner === 'bot') {
        text = 'ROUND LOST';
        color = '#ff8844';
      }
      this.roundToast.textContent = text;
      this.roundToast.style.color = color;
      this.roundToast.style.opacity = '1';
    } else {
      this.roundToast.style.opacity = '0';
    }
  }

  destroy(): void {
    this.root.remove();
  }
}
