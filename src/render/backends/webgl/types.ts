export interface SimParticle {
  posX: number;
  posY: number;
  velX: number;
  velY: number;
  life: number;
  maxLife: number;
  size: number;
  rot: number;
  angVel: number;
  drag: number;
  gravity: number;
  shapeId: number;
  r: number;
  g: number;
  b: number;
  peakAlpha: number;
  /** HDR multiplier. 1 is LDR-bright; cores use 2–4 so bloom can separate them. */
  intensity: number;
  additive: boolean;
  params: [number, number, number, number];
}
