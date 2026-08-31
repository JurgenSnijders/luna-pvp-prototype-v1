import {
  BYTES_PER_INSTANCE,
  FLOATS_PER_INSTANCE,
  FRAGMENT_SHADER,
  VERTEX_SHADER,
} from './shaders';
import { createNoiseTexture } from './NoiseTexture';
import { compileShader, linkProgram } from './framebuffers';

const MAX_INSTANCES = 65536;
const STRIDE = FLOATS_PER_INSTANCE;

export interface RenderStats {
  drawCalls: number;
  instanceCount: number;
  uploadBytes: number;
}

export class InstancedQuadRenderer {
  private program: WebGLProgram;
  private quadVbo: WebGLBuffer;
  private instanceVbo: WebGLBuffer;
  private vao: WebGLVertexArrayObject;
  private noiseTex: WebGLTexture;
  private instanceData: Float32Array;
  private normalCount = 0;
  private additiveCount = 0;
  private locResolution: WebGLUniformLocation;
  private locTime: WebGLUniformLocation;
  private locNoise: WebGLUniformLocation;
  private time = 0;
  private instLocs: { loc: number; size: number; offset: number }[] = [];

  constructor(private gl: WebGL2RenderingContext) {
    const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    this.program = linkProgram(gl, vs, fs);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    this.instanceData = new Float32Array(MAX_INSTANCES * STRIDE);

    this.quadVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]),
      gl.STATIC_DRAW,
    );

    this.instanceVbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVbo);
    gl.bufferData(gl.ARRAY_BUFFER, MAX_INSTANCES * BYTES_PER_INSTANCE, gl.DYNAMIC_DRAW);

    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVbo);
    let byteOffset = 0;
    const addInst = (loc: number, size: number) => {
      this.instLocs.push({ loc, size, offset: byteOffset });
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, STRIDE * 4, byteOffset);
      gl.vertexAttribDivisor(loc, 1);
      byteOffset += size * 4;
    };
    addInst(1, 2);
    addInst(2, 2);
    addInst(3, 1);
    addInst(4, 4);
    addInst(5, 1);
    addInst(6, 4);

    gl.bindVertexArray(null);
    this.noiseTex = createNoiseTexture(gl);

    this.locResolution = gl.getUniformLocation(this.program, 'u_resolution')!;
    this.locTime = gl.getUniformLocation(this.program, 'u_time')!;
    this.locNoise = gl.getUniformLocation(this.program, 'u_noise')!;
  }

  rebuild(): void {
    const gl = this.gl;
    gl.deleteProgram(this.program);
    gl.deleteBuffer(this.quadVbo);
    gl.deleteBuffer(this.instanceVbo);
    gl.deleteVertexArray(this.vao);
    gl.deleteTexture(this.noiseTex);
    const fresh = new InstancedQuadRenderer(gl);
    Object.assign(this, fresh);
  }

  beginFrame(dt: number): void {
    this.time += dt;
    this.normalCount = 0;
    this.additiveCount = 0;
  }

  getInstanceData(): Float32Array {
    return this.instanceData;
  }

  allocInstance(additive: boolean): number {
    if (this.normalCount + this.additiveCount >= MAX_INSTANCES) return -1;
    if (additive) return this.normalCount + this.additiveCount++;
    return this.normalCount++;
  }

  getLiveCount(): number {
    return this.normalCount + this.additiveCount;
  }

  private bindInstanceAttribs(baseInstance: number): void {
    const gl = this.gl;
    const baseByte = baseInstance * STRIDE * 4;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVbo);
    for (const { loc, size, offset } of this.instLocs) {
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, STRIDE * 4, offset + baseByte);
    }
  }

  upload(): number {
    const count = this.normalCount + this.additiveCount;
    if (count === 0) return 0;
    const gl = this.gl;
    const byteLen = count * BYTES_PER_INSTANCE;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVbo);
    gl.bufferData(gl.ARRAY_BUFFER, MAX_INSTANCES * BYTES_PER_INSTANCE, gl.DYNAMIC_DRAW);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.instanceData.subarray(0, count * STRIDE));
    return byteLen;
  }

  drawSorted(width: number, height: number): RenderStats {
    const gl = this.gl;
    const total = this.normalCount + this.additiveCount;
    if (total === 0) {
      return { drawCalls: 0, instanceCount: 0, uploadBytes: 0 };
    }

    const uploadBytes = this.upload();

    gl.useProgram(this.program);
    gl.uniform2f(this.locResolution, width, height);
    gl.uniform1f(this.locTime, this.time);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.noiseTex);
    gl.uniform1i(this.locNoise, 0);
    gl.enable(gl.BLEND);
    gl.bindVertexArray(this.vao);

    let drawCalls = 0;

    if (this.normalCount > 0) {
      this.bindInstanceAttribs(0);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.normalCount);
      drawCalls++;
    }

    if (this.additiveCount > 0) {
      this.bindInstanceAttribs(this.normalCount);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.additiveCount);
      drawCalls++;
    }

    gl.bindVertexArray(null);
    return { drawCalls, instanceCount: total, uploadBytes };
  }
}
