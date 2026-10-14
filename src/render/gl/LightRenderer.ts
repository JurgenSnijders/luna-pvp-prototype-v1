import type { CameraView } from '../../camera/Camera2D';
import { getEffectiveLightingSettings } from '../../devtools/graphicsSettings';
import type { Light } from '../LightLayer';
import { compileShader, createFullscreenQuad, linkProgram } from './framebuffers';
import {
  LAVA_LIGHT_FRAGMENT,
  LAVA_LIGHT_VERTEX,
  LIGHT_FRAGMENT_SHADER,
  LIGHT_VERTEX_SHADER,
} from './lightShaders';

const MAX_LIGHTS = 128;
const CORNERS = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
  [-1, 1],
];
const FLOATS_PER_VERT = 10;
const MAX_VERTS = MAX_LIGHTS * 6;

export interface LightDrawStats {
  drawCalls: number;
  vertexCount: number;
  uploadBytes: number;
}

export interface LightScissorRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function computeLightScissor(
  light: Light,
  view: CameraView,
  resW: number,
  resH: number,
  cssW: number,
  cssH: number,
): LightScissorRect {
  const shakeScaleX = resW / Math.max(1, cssW);
  const shakeScaleY = resH / Math.max(1, cssH);
  const sx = (light.x - view.camX) * view.zoom + 0.5 * cssW + view.shakeX;
  const sy = (light.y - view.camY) * view.zoom + 0.5 * cssH + view.shakeY;
  const half = light.radius * view.zoom;
  const cx = sx * shakeScaleX;
  const cy = sy * shakeScaleY;
  const r = half * shakeScaleX;
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(resW, Math.ceil(cx + r));
  const top = Math.max(0, Math.floor(cy - r));
  const bot = Math.min(resH, Math.ceil(cy + r));
  const glY = Math.max(0, Math.floor(resH - bot));
  return { x: x0, y: glY, w: Math.max(0, x1 - x0), h: Math.max(0, bot - top) };
}

export class LightRenderer {
  private lightProgram: WebGLProgram;
  private lavaProgram: WebGLProgram;
  private lightVao: WebGLVertexArrayObject;
  private lightVbo: WebGLBuffer;
  private lavaVao: WebGLVertexArrayObject;
  private data: Float32Array;
  private packedVerts = 0;
  private locResolution: WebGLUniformLocation;
  private locCamPos: WebGLUniformLocation;
  private locZoom: WebGLUniformLocation;
  private locShake: WebGLUniformLocation;
  private locLightScale: WebGLUniformLocation;

  constructor(private gl: WebGL2RenderingContext) {
    const vsL = compileShader(gl, gl.VERTEX_SHADER, LIGHT_VERTEX_SHADER);
    const fsL = compileShader(gl, gl.FRAGMENT_SHADER, LIGHT_FRAGMENT_SHADER);
    this.lightProgram = linkProgram(gl, vsL, fsL);
    gl.deleteShader(vsL);
    gl.deleteShader(fsL);

    const vsV = compileShader(gl, gl.VERTEX_SHADER, LAVA_LIGHT_VERTEX);
    const fsV = compileShader(gl, gl.FRAGMENT_SHADER, LAVA_LIGHT_FRAGMENT);
    this.lavaProgram = linkProgram(gl, vsV, fsV);
    gl.deleteShader(vsV);
    gl.deleteShader(fsV);

    this.data = new Float32Array(MAX_VERTS * FLOATS_PER_VERT);
    this.lightVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lightVbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);

    this.lightVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.lightVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lightVbo);
    const stride = FLOATS_PER_VERT * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 16);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 3, gl.FLOAT, false, stride, 20);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 1, gl.FLOAT, false, stride, 32);
    gl.enableVertexAttribArray(5);
    gl.vertexAttribPointer(5, 1, gl.FLOAT, false, stride, 36);
    gl.bindVertexArray(null);

    this.locResolution = gl.getUniformLocation(this.lightProgram, 'u_resolution')!;
    this.locCamPos = gl.getUniformLocation(this.lightProgram, 'u_camPos')!;
    this.locZoom = gl.getUniformLocation(this.lightProgram, 'u_zoom')!;
    this.locShake = gl.getUniformLocation(this.lightProgram, 'u_shake')!;
    this.locLightScale = gl.getUniformLocation(this.lightProgram, 'u_lightScale')!;

    const quad = createFullscreenQuad(gl);
    this.lavaVao = quad.vao;
  }

  rebuild(): void {
    const gl = this.gl;
    gl.deleteProgram(this.lightProgram);
    gl.deleteProgram(this.lavaProgram);
    gl.deleteBuffer(this.lightVbo);
    gl.deleteVertexArray(this.lightVao);
    const fresh = new LightRenderer(gl);
    Object.assign(this, fresh);
  }

  drawLava(
    width: number,
    height: number,
    view: CameraView,
    bufferWidth: number,
    bufferHeight: number,
  ): void {
    const settings = getEffectiveLightingSettings();
    if (settings.lavaGlow <= 0) return;
    const gl = this.gl;
    gl.useProgram(this.lavaProgram);
    gl.bindVertexArray(this.lavaVao);
    const scaleX = bufferWidth / Math.max(1, width);
    const scaleY = bufferHeight / Math.max(1, height);
    gl.uniform2f(gl.getUniformLocation(this.lavaProgram, 'u_resolution')!, bufferWidth, bufferHeight);
    gl.uniform2f(gl.getUniformLocation(this.lavaProgram, 'u_camPos')!, view.camX, view.camY);
    gl.uniform1f(gl.getUniformLocation(this.lavaProgram, 'u_zoom')!, view.zoom * scaleX);
    gl.uniform2f(
      gl.getUniformLocation(this.lavaProgram, 'u_shake')!,
      view.shakeX * scaleX,
      view.shakeY * scaleY,
    );
    gl.uniform2f(
      gl.getUniformLocation(this.lavaProgram, 'u_hexCenter')!,
      view.hexCenterX ?? 0,
      view.hexCenterY ?? 0,
    );
    gl.uniform1f(gl.getUniformLocation(this.lavaProgram, 'u_hexRadius')!, view.hexRadius ?? 1);
    gl.uniform1f(gl.getUniformLocation(this.lavaProgram, 'u_lavaGlow')!, settings.lavaGlow);
    gl.uniform1f(gl.getUniformLocation(this.lavaProgram, 'u_lavaRange')!, 120);
    gl.uniform1f(
      gl.getUniformLocation(this.lavaProgram, 'u_lightScale')!,
      settings.lightIntensity,
    );
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  pack(lights: Light[], order: number[]): number {
    const settings = getEffectiveLightingSettings();
    let vert = 0;
    const data = this.data;
    for (const index of order) {
      const light = lights[index];
      if (!light || vert + 6 > MAX_VERTS) break;
      const intensity = light.intensity * light.fade * settings.lightIntensity;
      if (intensity <= 0.001) continue;
      for (const [cx, cy] of CORNERS) {
        const o = vert * FLOATS_PER_VERT;
        data[o] = cx;
        data[o + 1] = cy;
        data[o + 2] = light.x;
        data[o + 3] = light.y;
        data[o + 4] = light.radius;
        data[o + 5] = light.r;
        data[o + 6] = light.g;
        data[o + 7] = light.b;
        data[o + 8] = intensity;
        data[o + 9] = light.falloff;
        vert++;
      }
    }
    this.packedVerts = vert;
    if (vert > 0) {
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.lightVbo);
      this.gl.bufferSubData(this.gl.ARRAY_BUFFER, 0, data.subarray(0, vert * FLOATS_PER_VERT));
    }
    return vert / 6;
  }

  drawRange(
    lightSlotStart: number,
    count: number,
    intensityScale: number,
    view: CameraView,
    bufferWidth: number,
    bufferHeight: number,
    cssWidth: number,
    cssHeight: number,
  ): LightDrawStats {
    const startVert = lightSlotStart * 6;
    const vertCount = count * 6;
    if (vertCount <= 0 || startVert + vertCount > this.packedVerts) {
      return { drawCalls: 0, vertexCount: 0, uploadBytes: 0 };
    }
    const gl = this.gl;
    const scaleX = bufferWidth / Math.max(1, cssWidth);
    const scaleY = bufferHeight / Math.max(1, cssHeight);
    gl.useProgram(this.lightProgram);
    gl.bindVertexArray(this.lightVao);
    gl.uniform2f(this.locResolution, bufferWidth, bufferHeight);
    gl.uniform2f(this.locCamPos, view.camX, view.camY);
    gl.uniform1f(this.locZoom, view.zoom * scaleX);
    gl.uniform2f(this.locShake, view.shakeX * scaleX, view.shakeY * scaleY);
    gl.uniform1f(this.locLightScale, intensityScale);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.drawArrays(gl.TRIANGLES, startVert, vertCount);
    gl.bindVertexArray(null);
    return {
      drawCalls: 1,
      vertexCount: vertCount,
      uploadBytes: 0,
    };
  }

  drawLights(
    lights: Light[],
    width: number,
    height: number,
    view: CameraView,
    bufferWidth: number,
    bufferHeight: number,
  ): LightDrawStats {
    const order = lights.map((_, i) => i);
    this.pack(lights, order);
    return this.drawRange(0, order.length, 1, view, bufferWidth, bufferHeight, width, height);
  }
}
