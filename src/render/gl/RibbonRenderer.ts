import type { CameraView } from '../../camera/Camera2D';
import { getEffectiveEmissiveScale } from '../../devtools/graphicsSettings';
import type { Ribbon } from '../RibbonLayer';
import { compileShader, linkProgram } from './framebuffers';
import { RIBBON_FRAGMENT_SHADER, RIBBON_VERTEX_SHADER } from './ribbonShaders';

const MAX_RIBBONS = 64;
const MAX_POINTS = 48;
const FLOATS_PER_VERT = 8;
const MAX_VERTS = MAX_RIBBONS * MAX_POINTS * 2;

export interface RibbonDrawStats {
  drawCalls: number;
  vertexCount: number;
  uploadBytes: number;
}

export class RibbonRenderer {
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private vbo: WebGLBuffer;
  private data: Float32Array;
  private locResolution: WebGLUniformLocation;
  private locCamPos: WebGLUniformLocation;
  private locZoom: WebGLUniformLocation;
  private locShake: WebGLUniformLocation;

  constructor(private gl: WebGL2RenderingContext) {
    const vs = compileShader(gl, gl.VERTEX_SHADER, RIBBON_VERTEX_SHADER);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, RIBBON_FRAGMENT_SHADER);
    this.program = linkProgram(gl, vs, fs);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    this.data = new Float32Array(MAX_VERTS * FLOATS_PER_VERT);
    this.vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);

    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    const stride = FLOATS_PER_VERT * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 4, gl.FLOAT, false, stride, 16);
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
    const fresh = new RibbonRenderer(gl);
    Object.assign(this, fresh);
  }

  draw(
    ribbons: Ribbon[],
    width: number,
    height: number,
    view: CameraView,
    now: number,
  ): RibbonDrawStats {
    const gl = this.gl;
    const scale = getEffectiveEmissiveScale();
    const ranges: { start: number; count: number }[] = [];
    let vert = 0;

    for (const ribbon of ribbons) {
      const points = ribbon.points;
      if (points.length < 2) continue;
      const start = vert;
      const lastIndex = points.length - 1;
      const life = Math.max(0.0001, ribbon.lifetimeSec);
      for (let i = 0; i < points.length; i++) {
        if (vert + 2 > MAX_VERTS) break;
        const point = points[i];
        const prev = points[Math.max(0, i - 1)];
        const next = points[Math.min(lastIndex, i + 1)];
        let tx = next.x - prev.x;
        let ty = next.y - prev.y;
        const len = Math.hypot(tx, ty);
        if (len < 1e-4) {
          tx = 1;
          ty = 0;
        } else {
          tx /= len;
          ty /= len;
        }
        const nx = -ty;
        const ny = tx;
        const ageT = Math.min(1, Math.max(0, (now - point.born) / life));
        const along = i / lastIndex;
        const halfWidth = Math.max(0.4, ribbon.width * (1 - ageT) * 0.5);
        const fade = 1 - ageT;
        const hot = ribbon.intensity * scale;
        this.writeVert(vert++, point.x - nx * halfWidth, point.y - ny * halfWidth, -1, along, ribbon, hot, fade);
        this.writeVert(vert++, point.x + nx * halfWidth, point.y + ny * halfWidth, 1, along, ribbon, hot, fade);
      }
      const count = vert - start;
      if (count >= 4) ranges.push({ start, count });
    }

    if (vert === 0) return { drawCalls: 0, vertexCount: 0, uploadBytes: 0 };

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data.subarray(0, vert * FLOATS_PER_VERT));

    gl.useProgram(this.program);
    gl.uniform2f(this.locResolution, width, height);
    gl.uniform2f(this.locCamPos, view.camX, view.camY);
    gl.uniform1f(this.locZoom, view.zoom);
    gl.uniform2f(this.locShake, view.shakeX, view.shakeY);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.bindVertexArray(this.vao);

    let drawCalls = 0;
    for (const range of ranges) {
      gl.drawArrays(gl.TRIANGLE_STRIP, range.start, range.count);
      drawCalls++;
    }
    gl.bindVertexArray(null);
    return {
      drawCalls,
      vertexCount: vert,
      uploadBytes: vert * FLOATS_PER_VERT * 4,
    };
  }

  private writeVert(
    index: number,
    x: number,
    y: number,
    across: number,
    along: number,
    ribbon: Ribbon,
    hot: number,
    fade: number,
  ): void {
    const off = index * FLOATS_PER_VERT;
    this.data[off] = x;
    this.data[off + 1] = y;
    this.data[off + 2] = across;
    this.data[off + 3] = along;
    this.data[off + 4] = ribbon.r * hot;
    this.data[off + 5] = ribbon.g * hot;
    this.data[off + 6] = ribbon.b * hot;
    this.data[off + 7] = fade;
  }
}
