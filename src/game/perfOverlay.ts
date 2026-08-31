import { perfMonitor } from '../devtools/PerfMonitor';
import type { GameApp } from './GameApp';

export function drawPerfOverlay(app: GameApp): void {
  const s = perfMonitor.getSnapshot();
  app.ctx.save();
  app.ctx.setTransform(1, 0, 0, 1, 0, 0);
  app.ctx.fillStyle = 'rgba(0,0,0,0.55)';
  app.ctx.fillRect(8, 8, 320, 88);
  app.ctx.fillStyle = '#aef';
  app.ctx.font = '12px monospace';
  app.ctx.fillText(perfMonitor.formatOverlayText(), 16, 24);
  app.ctx.fillText(`FPS ${s.fps.toFixed(0)}`, 16, 84);
  app.ctx.restore();
}
