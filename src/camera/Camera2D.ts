export type CameraMode = 'LOCKED' | 'FREE';

export interface CameraConfig {
  minZoom: number;
  maxZoom: number;
  zoomSpeed: number;
  followLerp: number;
  panSpeed: number;
}

export interface VisibleWorldRect {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

export const DEFAULT_CAMERA_CONFIG: CameraConfig = {
  minZoom: 0.4,
  maxZoom: 2.0,
  zoomSpeed: 0.1,
  followLerp: 0.12,
  panSpeed: 480,
};

const EDGE_PAN_MARGIN_PX = 24;

export interface StreakBody {
  x: number;
  y: number;
  r: number;
}

export interface CameraView {
  camX: number;
  camY: number;
  zoom: number;
  shakeX: number;
  shakeY: number;
  hexCenterX?: number;
  hexCenterY?: number;
  hexRadius?: number;
  streakBodies?: StreakBody[];
}

export class Camera2D {
  public pos = { x: 0, y: 0 };
  public targetPos = { x: 0, y: 0 };
  public zoom = 1.0;
  public targetZoom = 1.0;
  public mode: CameraMode = 'LOCKED';
  public viewportWidth = window.innerWidth;
  public viewportHeight = window.innerHeight;

  /** Last pointer position in CSS pixels (for edge pan). */
  pointerScreenX = 0;
  pointerScreenY = 0;
  /** When false, edge pan is suppressed (pointer over UI). */
  pointerOverGame = true;

  constructor(private config: CameraConfig = DEFAULT_CAMERA_CONFIG) {}

  setViewport(width: number, height: number): void {
    this.viewportWidth = width;
    this.viewportHeight = height;
  }

  setZoom(newZoom: number): void {
    this.targetZoom = Math.max(
      this.config.minZoom,
      Math.min(this.config.maxZoom, newZoom),
    );
  }

  /** Zoom toward a screen-space anchor, keeping that world point fixed. */
  setZoomAtScreen(newZoom: number, screenX: number, screenY: number): void {
    const before = this.screenToWorld(screenX, screenY);
    this.setZoom(newZoom);
    const after = this.screenToWorld(screenX, screenY);
    this.pos.x += before.x - after.x;
    this.pos.y += before.y - after.y;
    this.targetPos.x = this.pos.x;
    this.targetPos.y = this.pos.y;
  }

  panBy(dx: number, dy: number): void {
    this.pos.x += dx;
    this.pos.y += dy;
    this.targetPos.x = this.pos.x;
    this.targetPos.y = this.pos.y;
  }

  snapTo(worldX: number, worldY: number): void {
    this.pos.x = worldX;
    this.pos.y = worldY;
    this.targetPos.x = worldX;
    this.targetPos.y = worldY;
  }

  toggleMode(): void {
    this.mode = this.mode === 'LOCKED' ? 'FREE' : 'LOCKED';
    if (this.mode === 'LOCKED') {
      this.targetPos.x = this.pos.x;
      this.targetPos.y = this.pos.y;
    }
  }

  getVisibleWorldRect(): VisibleWorldRect {
    const halfW = this.viewportWidth / (2 * this.zoom);
    const halfH = this.viewportHeight / (2 * this.zoom);
    return {
      minX: this.pos.x - halfW,
      minY: this.pos.y - halfH,
      width: halfW * 2,
      height: halfH * 2,
    };
  }

  applyTransform(
    ctx: CanvasRenderingContext2D,
    shakeX = 0,
    shakeY = 0,
  ): void {
    ctx.translate(
      this.viewportWidth / 2 + shakeX,
      this.viewportHeight / 2 + shakeY,
    );
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.pos.x, -this.pos.y);
  }

  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    const cx = screenX - this.viewportWidth / 2;
    const cy = screenY - this.viewportHeight / 2;
    return {
      x: this.pos.x + cx / this.zoom,
      y: this.pos.y + cy / this.zoom,
    };
  }

  worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    const cx = (worldX - this.pos.x) * this.zoom;
    const cy = (worldY - this.pos.y) * this.zoom;
    return {
      x: this.viewportWidth / 2 + cx,
      y: this.viewportHeight / 2 + cy,
    };
  }

  update(dt: number, followEntityPos?: { x: number; y: number }): void {
    const zoomT = 1 - Math.pow(1 - this.config.followLerp, dt * 60);
    this.zoom += (this.targetZoom - this.zoom) * zoomT;

    if (this.mode === 'LOCKED' && followEntityPos) {
      const followT = 1 - Math.pow(1 - this.config.followLerp, dt * 60);
      this.pos.x += (followEntityPos.x - this.pos.x) * followT;
      this.pos.y += (followEntityPos.y - this.pos.y) * followT;
      this.targetPos.x = this.pos.x;
      this.targetPos.y = this.pos.y;
    } else if (this.mode === 'FREE') {
      this.pos.x += (this.targetPos.x - this.pos.x) * zoomT;
      this.pos.y += (this.targetPos.y - this.pos.y) * zoomT;
      this.applyEdgePan(dt);
    }
  }

  private applyEdgePan(dt: number): void {
    if (!this.pointerOverGame) return;

    const { pointerScreenX: px, pointerScreenY: py } = this;
    const { viewportWidth: vw, viewportHeight: vh } = this;
    let dx = 0;
    let dy = 0;

    if (px < EDGE_PAN_MARGIN_PX) dx -= 1;
    else if (px > vw - EDGE_PAN_MARGIN_PX) dx += 1;
    if (py < EDGE_PAN_MARGIN_PX) dy -= 1;
    else if (py > vh - EDGE_PAN_MARGIN_PX) dy += 1;

    if (dx === 0 && dy === 0) return;

    const speed = (this.config.panSpeed * dt) / this.zoom;
    this.panBy(dx * speed, dy * speed);
  }

  getView(shakeX = 0, shakeY = 0): CameraView {
    return {
      camX: this.pos.x,
      camY: this.pos.y,
      zoom: this.zoom,
      shakeX,
      shakeY,
    };
  }

  getZoomSpeed(): number {
    return this.config.zoomSpeed;
  }
}
