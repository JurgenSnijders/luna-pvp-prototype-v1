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
  additive: boolean;
  params: [number, number, number, number];
}
