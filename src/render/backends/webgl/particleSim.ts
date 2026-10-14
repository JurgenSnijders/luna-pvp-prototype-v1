import type { SimParticle } from './types';

export function makeParticle(
  partial: Omit<SimParticle, 'maxLife' | 'params' | 'intensity'> & {
    params?: [number, number, number, number];
    intensity?: number;
  },
): SimParticle {
  const intensity = partial.intensity ?? 1;
  const params = partial.params ?? [0, 0, 0, 0];
  return {
    ...partial,
    params,
    intensity,
    maxLife: partial.life,
  };
}

export function integrateParticles(particles: SimParticle[], dt: number): SimParticle[] {
  const alive: SimParticle[] = [];
  for (const p of particles) {
    p.life -= dt;
    if (p.life <= 0) continue;
    p.velX *= Math.pow(p.drag, dt * 60);
    p.velY *= Math.pow(p.drag, dt * 60);
    p.velY += p.gravity * dt;
    p.posX += p.velX * dt;
    p.posY += p.velY * dt;
    p.rot += p.angVel * dt;
    alive.push(p);
  }
  return alive;
}
