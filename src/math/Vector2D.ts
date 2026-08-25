export class Vector2D {
  constructor(
    public x: number,
    public y: number,
  ) {}

  set(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  copyFrom(v: Vector2D): this {
    this.x = v.x;
    this.y = v.y;
    return this;
  }

  addMut(v: Vector2D): this {
    this.x += v.x;
    this.y += v.y;
    return this;
  }

  subMut(v: Vector2D): this {
    this.x -= v.x;
    this.y -= v.y;
    return this;
  }

  scaleMut(s: number): this {
    this.x *= s;
    this.y *= s;
    return this;
  }

  addScaledMut(v: Vector2D, s: number): this {
    this.x += v.x * s;
    this.y += v.y * s;
    return this;
  }

  add(v: Vector2D): Vector2D {
    return new Vector2D(this.x + v.x, this.y + v.y);
  }

  sub(v: Vector2D): Vector2D {
    return new Vector2D(this.x - v.x, this.y - v.y);
  }

  scale(s: number): Vector2D {
    return new Vector2D(this.x * s, this.y * s);
  }

  mag(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  magSq(): number {
    return this.x * this.x + this.y * this.y;
  }

  normalize(): Vector2D {
    const m = this.mag();
    if (m === 0) return Vector2D.zero();
    return this.scale(1 / m);
  }

  dot(v: Vector2D): number {
    return this.x * v.x + this.y * v.y;
  }

  cross(v: Vector2D): number {
    return this.x * v.y - this.y * v.x;
  }

  rotate(radians: number): Vector2D {
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return new Vector2D(
      this.x * cos - this.y * sin,
      this.x * sin + this.y * cos,
    );
  }

  dist(v: Vector2D): number {
    return Math.sqrt(this.distSq(v));
  }

  distSq(v: Vector2D): number {
    const dx = this.x - v.x;
    const dy = this.y - v.y;
    return dx * dx + dy * dy;
  }

  lerp(v: Vector2D, t: number): Vector2D {
    return new Vector2D(
      this.x + (v.x - this.x) * t,
      this.y + (v.y - this.y) * t,
    );
  }

  clone(): Vector2D {
    return new Vector2D(this.x, this.y);
  }

  static create(x: number, y: number): Vector2D {
    return new Vector2D(x, y);
  }

  static zero(): Vector2D {
    return new Vector2D(0, 0);
  }

  static fromAngle(angle: number, length = 1): Vector2D {
    return new Vector2D(Math.cos(angle) * length, Math.sin(angle) * length);
  }

  static distance(a: Vector2D, b: Vector2D): number {
    return a.dist(b);
  }
}
