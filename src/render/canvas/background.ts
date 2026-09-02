import type { PhysicsWorld } from '../../engine/PhysicsWorld';
import type { Camera2D } from '../../camera/Camera2D';
import { Vector2D } from '../../math/Vector2D';

export function drawLavaSea(
  ctx: CanvasRenderingContext2D,
  world: PhysicsWorld,
  camera: Camera2D,
): void {
  const rect = camera.getVisibleWorldRect();
  const { hexCenter: center } = world;
  const gradRadius = Math.hypot(rect.width, rect.height) * 0.55;

  const gradient = ctx.createRadialGradient(
    center.x,
    center.y,
    0,
    center.x,
    center.y,
    gradRadius,
  );
  gradient.addColorStop(0, 'rgba(210, 50, 0, 1.0)');
  gradient.addColorStop(0.45, 'rgba(130, 20, 0, 1.0)');
  gradient.addColorStop(1, 'rgba(40, 5, 0, 1.0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(rect.minX, rect.minY, rect.width, rect.height);
}

export function drawLavaHeatWaves(
  ctx: CanvasRenderingContext2D,
  world: PhysicsWorld,
  camera: Camera2D,
): void {
  const { hexCenter: center, hexRadius } = world;
  const rect = camera.getVisibleWorldRect();
  const now = performance.now() * 0.0015;
  const maxR = Math.hypot(rect.width, rect.height) * 0.6;

  for (let i = 0; i < 8; i++) {
    const rippleR =
      hexRadius * (0.5 + i * 0.15) +
      Math.sin(now + i * 0.8) * 20 +
      (i / 8) * (maxR - hexRadius);
    const alpha = 0.04 + 0.08 * (0.5 + 0.5 * Math.sin(now + i * 0.8));
    ctx.strokeStyle = `rgba(255, 100, 30, ${alpha})`;
    ctx.lineWidth = 1.5 + (i % 3);
    ctx.beginPath();
    ctx.ellipse(
      center.x,
      center.y,
      rippleR * 1.05,
      rippleR * 0.92,
      now * 0.1 + i * 0.3,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
  }

  for (let i = 0; i < 4; i++) {
    const phase = now + i * 1.7;
    const startX = rect.minX + (rect.width * (0.1 + i * 0.2) + Math.sin(phase) * 40);
    const startY = rect.minY + (rect.height * (0.2 + i * 0.15) + Math.cos(phase * 0.7) * 30);
    ctx.strokeStyle = 'rgba(255, 90, 20, 0.08)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.bezierCurveTo(
      startX + 120 + Math.sin(phase) * 50,
      startY - 80 + Math.cos(phase) * 40,
      startX + 240 + Math.cos(phase * 1.2) * 60,
      startY + 60 + Math.sin(phase * 0.9) * 50,
      startX + 360,
      startY + 20,
    );
    ctx.stroke();
  }

  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI * 2 * i) / 6 + now * 0.4;
    const spotR = hexRadius * (1.02 + 0.04 * Math.sin(now * 2 + i));
    const spot = center.add(Vector2D.fromAngle(angle, spotR));
    const spotAlpha = 0.15 + 0.1 * Math.sin(now * 2 + i);
    ctx.fillStyle = `rgba(255, 140, 40, ${spotAlpha})`;
    ctx.beginPath();
    ctx.arc(spot.x, spot.y, 6 + Math.sin(now + i) * 2, 0, Math.PI * 2);
    ctx.fill();
  }
}
