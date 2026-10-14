import type { CameraView } from '../../camera/Camera2D';
import type { Light } from '../LightLayer';
import type { ShadowOccluder } from '../shadowGeometry';
import { shadowVolumeVerts, type ShadowLight } from '../shadowGeometry';
import { compileShader, linkProgram } from './framebuffers';
import { SHADOW_FRAGMENT_SHADER, SHADOW_VERTEX_SHADER } from './lightShaders';

const MAX_OCC = 64;
const MAX_FLOATS = MAX_OCC * 12 * 2;

export interface ShadowDrawStats {
  drawCalls: number;
  vertexCount: number;
  uploadBytes: number;
}

export class ShadowRenderer {
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private vbo: WebGLBuffer;
  private data: Float32Array;
  private locResolution: WebGLUniformLocation;
  private locCamPos: WebGLUniformLocation;
  private locZoom: WebGLUniformLocation;
  private locShake: WebGLUniformLocation;

  constructor(private gl: WebGL2RenderingContext) {
    const vs = compileShader(gl, gl.VERTEX_SHADER, SHADOW_VERTEX_SHADER);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, SHADOW_FRAGMENT_SHADER);
    this.program = linkProgram(gl, vs, fs);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    this.data = new Float32Array(MAX_FLOATS);
    this.vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);

    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.locResolution = gl.getUniformLocation(this.program, 'u_resolution')!;
    this.locCamPos = gl.getUniformLocation(this.program, 'u_camPos')!;
    this.locZoom = gl.getUniformLocation(this.program, 'u_zoom')!;
    this.locShake = gl.getUniformLocation(this.program, 'u_shake')!;
  }

  rebuild(): void {
    const gl = this.gl;
    gl.deleteProgram(this.program);
    gl.deleteBuffer(this.vbo);
    gl.deleteVertexArray(this.vao);
    const fresh = new ShadowRenderer(gl);
    Object.assign(this, fresh);
  }

  drawVolumes(
    light: Light,
    occluders: ShadowOccluder[],
    view: CameraView,
    bufferWidth: number,
    bufferHeight: number,
    cssWidth: number,
    cssHeight: number,
  ): ShadowDrawStats {
    const shadowLight: ShadowLight = { x: light.x, y: light.y, radius: light.radius };
    let floatCount = 0;
    const data = this.data;
    for (const occ of occluders) {
      floatCount = shadowVolumeVerts(shadowLight, occ, data, floatCount);
      if (floatCount >= MAX_FLOATS - 12) break;
    }
    const vertCount = floatCount / 2;
    if (vertCount < 3) {
      return { drawCalls: 0, vertexCount: 0, uploadBytes: 0 };
    }
    const gl = this.gl;
    const scaleX = bufferWidth / Math.max(1, cssWidth);
    const scaleY = bufferHeight / Math.max(1, cssHeight);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0, floatCount));
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(this.locResolution, bufferWidth, bufferHeight);
    gl.uniform2f(this.locCamPos, view.camX, view.camY);
    gl.uniform1f(this.locZoom, view.zoom * scaleX);
    gl.uniform2f(this.locShake, view.shakeX * scaleX, view.shakeY * scaleY);
    gl.drawArrays(gl.TRIANGLES, 0, vertCount);
    gl.bindVertexArray(null);
    return {
      drawCalls: 1,
      vertexCount: vertCount,
      uploadBytes: floatCount * 4,
    };
  }
}
