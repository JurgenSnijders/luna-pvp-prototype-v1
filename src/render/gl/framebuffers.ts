export interface FramebufferTarget {
  fbo: WebGLFramebuffer;
  texture: WebGLTexture;
  width: number;
  height: number;
  /** True when the color attachment is RGBA16F and renderable. */
  hdr: boolean;
  stencilRb?: WebGLRenderbuffer;
  /** True when DEPTH24_STENCIL8 is attached and framebuffer-complete. */
  stencil: boolean;
}

/**
 * Half-float (and float) color attachments are filterable in WebGL2, but
 * rendering into them needs an extension enabled on this context.
 */
export function enableHdrRenderTargets(gl: WebGL2RenderingContext): boolean {
  return !!(
    gl.getExtension('EXT_color_buffer_half_float') ||
    gl.getExtension('EXT_color_buffer_float')
  );
}

function allocateColorTexture(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  hdr: boolean,
): WebGLTexture {
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  if (hdr) {
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA16F,
      width,
      height,
      0,
      gl.RGBA,
      gl.HALF_FLOAT,
      null,
    );
  } else {
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
  }
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

function attachFramebuffer(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  width: number,
  height: number,
  stencil = false,
): { fbo: WebGLFramebuffer; stencilRb: WebGLRenderbuffer | null; stencilOk: boolean } {
  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  let stencilRb: WebGLRenderbuffer | null = null;
  let stencilOk = false;
  if (stencil) {
    stencilRb = gl.createRenderbuffer()!;
    gl.bindRenderbuffer(gl.RENDERBUFFER, stencilRb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, width, height);
    gl.framebufferRenderbuffer(
      gl.FRAMEBUFFER,
      gl.DEPTH_STENCIL_ATTACHMENT,
      gl.RENDERBUFFER,
      stencilRb,
    );
    stencilOk = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    if (!stencilOk) {
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, null);
      gl.deleteRenderbuffer(stencilRb);
      stencilRb = null;
    }
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  }
  return { fbo, stencilRb, stencilOk };
}

export function createFramebuffer(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  hdr = false,
  stencil = false,
): FramebufferTarget {
  let useHdr = hdr;
  let texture = allocateColorTexture(gl, width, height, useHdr);
  let attached = attachFramebuffer(gl, texture, width, height, stencil);
  if (useHdr && gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(attached.fbo);
    if (attached.stencilRb) gl.deleteRenderbuffer(attached.stencilRb);
    gl.deleteTexture(texture);
    useHdr = false;
    texture = allocateColorTexture(gl, width, height, false);
    attached = attachFramebuffer(gl, texture, width, height, stencil);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return {
    fbo: attached.fbo,
    texture,
    width,
    height,
    hdr: useHdr,
    stencilRb: attached.stencilRb ?? undefined,
    stencil: attached.stencilOk,
  };
}

export function resizeFramebuffer(
  gl: WebGL2RenderingContext,
  target: FramebufferTarget,
  width: number,
  height: number,
): void {
  if (target.width === width && target.height === height) return;
  target.width = width;
  target.height = height;
  if (target.stencilRb) {
    gl.bindRenderbuffer(gl.RENDERBUFFER, target.stencilRb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, width, height);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  }
  gl.bindTexture(gl.TEXTURE_2D, target.texture);
  if (target.hdr) {
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA16F,
      width,
      height,
      0,
      gl.RGBA,
      gl.HALF_FLOAT,
      null,
    );
  } else {
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
  }
  gl.bindTexture(gl.TEXTURE_2D, null);
}

export function createFullscreenQuad(gl: WebGL2RenderingContext): {
  vao: WebGLVertexArrayObject;
  vbo: WebGLBuffer;
} {
  const vao = gl.createVertexArray()!;
  const vbo = gl.createBuffer()!;
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return { vao, vbo };
}

export function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'unknown';
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${log}`);
  }
  return shader;
}

export function linkProgram(
  gl: WebGL2RenderingContext,
  vs: WebGLShader,
  fs: WebGLShader,
): WebGLProgram {
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? 'unknown';
    gl.deleteProgram(program);
    throw new Error(`Program link error: ${log}`);
  }
  return program;
}

export function createLutTexture(
  gl: WebGL2RenderingContext,
  data: Uint8Array,
  size: number,
): WebGLTexture {
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_3D, texture);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
  gl.texImage3D(
    gl.TEXTURE_3D,
    0,
    gl.RGBA,
    size,
    size,
    size,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    data,
  );
  gl.bindTexture(gl.TEXTURE_3D, null);
  return texture;
}
