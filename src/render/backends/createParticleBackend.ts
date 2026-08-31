import {
  getBackendPreference,
  tryCreateWebGLContext,
  type GLContext,
} from '../gl/GLContext';
import { Canvas2DBackend } from './Canvas2DBackend';
import type { ParticleBackend } from './ParticleBackend';
import { WebGLBackend } from './WebGLBackend';

export interface BackendBundle {
  backend: ParticleBackend;
  glContext: GLContext | null;
}

let forcedBackend: 'webgl' | 'canvas2d' | null = null;

export function setForcedBackend(mode: 'webgl' | 'canvas2d' | null): void {
  forcedBackend = mode;
}

export function createParticleBackend(parent: HTMLElement): BackendBundle {
  const pref = forcedBackend ?? getBackendPreference();

  if (pref !== 'canvas2d') {
    const glCtx = tryCreateWebGLContext(parent);
    if (glCtx?.gl) {
      const backend = new WebGLBackend(glCtx, glCtx.gl);
      glCtx.setCallbacks({
        onLost: () => {},
        onRestored: () => backend.rebuild(),
        onPermanentFallback: () => {
          setForcedBackend('canvas2d');
        },
      });
      return { backend, glContext: glCtx };
    }
  }

  return { backend: new Canvas2DBackend(), glContext: null };
}
