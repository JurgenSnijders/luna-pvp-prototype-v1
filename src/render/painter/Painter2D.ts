/**
 * The Canvas2D subset every world draw module uses. A real
 * `CanvasRenderingContext2D` satisfies it as-is, so the Canvas path stays
 * byte-identical; `GLWorldPainter` implements the same subset on WebGL.
 */
export type Painter2D = Pick<
  CanvasRenderingContext2D,
  | 'save'
  | 'restore'
  | 'translate'
  | 'rotate'
  | 'scale'
  | 'beginPath'
  | 'moveTo'
  | 'lineTo'
  | 'arc'
  | 'ellipse'
  | 'closePath'
  | 'rect'
  | 'roundRect'
  | 'fill'
  | 'stroke'
  | 'fillRect'
  | 'strokeRect'
  | 'clearRect'
  | 'clip'
  | 'setLineDash'
  | 'getLineDash'
  | 'createRadialGradient'
  | 'createLinearGradient'
  | 'drawImage'
  | 'fillText'
  | 'strokeText'
  | 'measureText'
  | 'fillStyle'
  | 'strokeStyle'
  | 'lineWidth'
  | 'lineCap'
  | 'lineJoin'
  | 'globalAlpha'
  | 'globalCompositeOperation'
  | 'shadowBlur'
  | 'shadowColor'
  | 'font'
  | 'textAlign'
  | 'textBaseline'
>;

/** Transform-only view used by `Camera2D.applyTransform`. */
export type PainterTransform = Pick<Painter2D, 'translate' | 'scale'>;

export interface GlPainterMarker {
  readonly isGlWorldPainter: true;
}

export function isGlPainter(p: Painter2D): p is Painter2D & GlPainterMarker {
  return (p as Partial<GlPainterMarker>).isGlWorldPainter === true;
}
