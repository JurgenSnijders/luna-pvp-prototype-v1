import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIXTURE_TICKS, runWorldFixture } from './lib/worldFixture';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GOLDEN_PATH = join(__dirname, 'fixtures', 'world-ctx-golden.json');
const UPDATE = process.argv.includes('--update-snapshot');

interface GoldenEntry {
  tick: number;
  opCount: number;
  hash: string;
  opsByKind: Record<string, number>;
}

const failures: string[] = [];
function check(cond: boolean, message: string): void {
  if (!cond) failures.push(message);
}

function near(a: number, b: number, tol: number): boolean {
  return Math.abs(a - b) <= tol;
}

function summarize(ops: { op: string; args: unknown[] }[]): Omit<GoldenEntry, 'tick'> {
  const text = ops.map((o) => `${o.op}(${JSON.stringify(o.args)})`).join('\n');
  const opsByKind: Record<string, number> = {};
  for (const o of ops) opsByKind[o.op] = (opsByKind[o.op] ?? 0) + 1;
  return {
    opCount: ops.length,
    hash: createHash('sha256').update(text).digest('hex'),
    opsByKind,
  };
}

type TriListLike = { data: Float32Array; length: number };

/** Integral of coverage over the triangles (exact for linearly interpolated coverage). */
function coverageArea(t: TriListLike): number {
  let sum = 0;
  const d = t.data;
  for (let o = 0; o + 9 <= t.length; o += 9) {
    const area = Math.abs((d[o + 3] - d[o]) * (d[o + 7] - d[o + 1]) - (d[o + 4] - d[o + 1]) * (d[o + 6] - d[o])) / 2;
    sum += area * ((d[o + 2] + d[o + 5] + d[o + 8]) / 3);
  }
  return sum;
}

function bounds(t: TriListLike): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let o = 0; o < t.length; o += 3) {
    minX = Math.min(minX, t.data[o]);
    maxX = Math.max(maxX, t.data[o]);
    minY = Math.min(minY, t.data[o + 1]);
    maxY = Math.max(maxY, t.data[o + 1]);
  }
  return { minX, maxX, minY, maxY };
}

async function goldenParity(): Promise<void> {
  const { RecordingPainter } = await import('../src/render/painter/RecordingPainter');
  const golden: GoldenEntry[] = [];

  await runWorldFixture((snap) => {
    const rec = new RecordingPainter('canvas');
    snap.render(rec, null);
    golden.push({ tick: snap.tick, ...summarize(rec.ops) });
  });

  check(golden.length === FIXTURE_TICKS.length, `expected ${FIXTURE_TICKS.length} snapshots`);

  if (UPDATE || !existsSync(GOLDEN_PATH)) {
    mkdirSync(dirname(GOLDEN_PATH), { recursive: true });
    writeFileSync(GOLDEN_PATH, JSON.stringify(golden, null, 2) + '\n');
    console.log(`test:world-painter golden written (${golden.map((g) => g.opCount).join(', ')} ops)`);
    return;
  }

  const expected = JSON.parse(readFileSync(GOLDEN_PATH, 'utf-8')) as GoldenEntry[];
  for (const entry of golden) {
    const exp = expected.find((e) => e.tick === entry.tick);
    check(!!exp, `golden: no entry for tick ${entry.tick}`);
    if (!exp) continue;
    check(
      exp.hash === entry.hash,
      `golden parity tick ${entry.tick}: ${entry.opCount} ops vs ${exp.opCount} (hash differs)`,
    );
  }
}

/**
 * For every slice, each world module is routed exactly once, to the side the
 * slice table says, and the GL + Canvas2D recorders together issue the same
 * per-module op counts as the pure Canvas2D render.
 */
async function sliceCoverage(): Promise<void> {
  const { RecordingPainter } = await import('../src/render/painter/RecordingPainter');
  const { WORLD_MODULES, routeModule } = await import('../src/render/painter/slices');
  const { GL_WORLD_SLICES } = await import('../src/devtools/graphicsSettings');
  const { GLWorldPainter } = await import('../src/render/gl/world/GLWorldPainter');

  let sawCombatants = false;
  let sawProjectiles = false;
  let glVerts = 0;

  await runWorldFixture((snap) => {
    const baseline = new RecordingPainter('canvas');
    snap.render(baseline, null, (id) => {
      baseline.currentModule = id;
    });
    if ((baseline.moduleOps.get('combatants') ?? 0) > 0) sawCombatants = true;
    if ((baseline.moduleOps.get('projectiles') ?? 0) > 0) sawProjectiles = true;

    for (const slice of GL_WORLD_SLICES) {
      const canvasRec = new RecordingPainter('canvas');
      const glRec = new RecordingPainter('gl');
      const routed = new Map<string, number>();
      snap.render(canvasRec, slice === 'off' ? null : { painter: glRec, slice }, (id, route) => {
        routed.set(id, (routed.get(id) ?? 0) + 1);
        canvasRec.currentModule = route === 'canvas' ? id : null;
        glRec.currentModule = route === 'gl' ? id : null;
        const expectedRoute = slice === 'off' ? 'canvas' : routeModule(slice, id as never);
        check(route === expectedRoute, `slice ${slice} tick ${snap.tick}: ${id} routed ${route}, expected ${expectedRoute}`);
      });
      for (const id of WORLD_MODULES) {
        check(
          routed.get(id) === 1,
          `slice ${slice} tick ${snap.tick}: ${id} routed ${routed.get(id) ?? 0} times`,
        );
        if (id === 'background') continue;
        const total = (canvasRec.moduleOps.get(id) ?? 0) + (glRec.moduleOps.get(id) ?? 0);
        const base = baseline.moduleOps.get(id) ?? 0;
        check(total === base, `slice ${slice} tick ${snap.tick}: ${id} issued ${total} ops, canvas-only ${base}`);
        if (slice !== 'off' && routeModule(slice, id as never) === 'gl') {
          check((canvasRec.moduleOps.get(id) ?? 0) === 0, `slice ${slice}: GL module ${id} drew on the canvas`);
        }
      }
    }

    // The real GL painter must accept the whole world (CPU tessellation only).
    const painter = new GLWorldPainter();
    painter.beginFrame(1, null);
    try {
      snap.render(new RecordingPainter('canvas'), { painter, slice: 'all' });
    } catch (err) {
      failures.push(`GLWorldPainter threw on tick ${snap.tick}: ${(err as Error).stack ?? err}`);
    }
    glVerts += painter.vertCount;
    check(painter.batches.length > 0, `GLWorldPainter produced no batches on tick ${snap.tick}`);
  });

  check(sawCombatants, 'fixture never drew combatants');
  check(sawProjectiles, 'fixture never drew projectiles');
  check(glVerts > 1000, `GLWorldPainter emitted only ${glVerts} vertices across the fixture`);
}

async function tessellation(): Promise<void> {
  const t = await import('../src/render/gl/world/tessellate');
  const tris = new t.TriList();

  const square = [0, 0, 10, 0, 10, 10, 0, 10];
  t.fillPolygon(square, t.AA_FILL, tris);
  check(near(coverageArea(tris), 100, 1.5), `AA square coverage ${coverageArea(tris).toFixed(2)} != 100`);
  const b = bounds(tris);
  check(
    near(b.minX, -0.5, 0.05) && near(b.maxX, 10.5, 0.05) && near(b.minY, -0.5, 0.05) && near(b.maxY, 10.5, 0.05),
    `AA square fringe should reach 0.5px outside every edge, got ${JSON.stringify(b)}`,
  );

  const ccwSquare = [0, 0, 0, 10, 10, 10, 10, 0];
  tris.clear();
  t.fillPolygon(ccwSquare, t.AA_FILL, tris);
  check(near(coverageArea(tris), 100, 1.5), `reversed-winding square coverage ${coverageArea(tris).toFixed(2)}`);

  const ell = [0, 0, 20, 0, 20, 10, 10, 10, 10, 20, 0, 20];
  check(!t.isConvex(ell), 'L shape should be non-convex');
  const idx = t.triangulate(ell);
  let triArea = 0;
  for (let i = 0; i < idx.length; i += 3) {
    const [a, c, d] = [idx[i], idx[i + 1], idx[i + 2]];
    triArea += Math.abs(
      (ell[c * 2] - ell[a * 2]) * (ell[d * 2 + 1] - ell[a * 2 + 1]) -
        (ell[c * 2 + 1] - ell[a * 2 + 1]) * (ell[d * 2] - ell[a * 2]),
    ) / 2;
  }
  check(near(triArea, Math.abs(t.polygonArea(ell)), 1e-6), `L triangulation area ${triArea} != ${t.polygonArea(ell)}`);
  check(near(triArea, 300, 1e-6), `L area should be 300, got ${triArea}`);

  const strokeOpts = { halfWidth: 2, cap: 'butt' as const, join: 'miter' as const, miterLimit: 10, dash: [], fringe: 1, peak: 1, inset: 0 };
  tris.clear();
  t.strokePolyline({ pts: [0, 0, 100, 0], closed: false }, strokeOpts, tris);
  check(near(coverageArea(tris), 400, 3), `4px x 100px stroke coverage ${coverageArea(tris).toFixed(2)} != 400`);

  tris.clear();
  t.strokePolyline({ pts: [0, 0, 100, 0], closed: false }, { ...strokeOpts, cap: 'square' }, tris);
  check(near(coverageArea(tris), 416, 3), `square-capped stroke coverage ${coverageArea(tris).toFixed(2)} != 416`);

  tris.clear();
  t.strokePolyline({ pts: [0, 0, 100, 0], closed: false }, { ...strokeOpts, halfWidth: 0.25 }, tris);
  check(near(coverageArea(tris), 50, 1.5), `0.5px hairline should keep its mass (50), got ${coverageArea(tris).toFixed(2)}`);

  tris.clear();
  t.strokePolyline({ pts: [0, 0, 100, 0, 0, 4], closed: false }, strokeOpts, tris);
  const sharp = bounds(tris);
  check(sharp.maxX < 100 + 2 * 10 + 1, `miter limit should clamp the spike, maxX ${sharp.maxX.toFixed(2)}`);

  const dashes = t.applyDash({ pts: [0, 0, 100, 0], closed: false }, [10, 10]);
  check(dashes.length === 5, `[10,10] dash over 100px should give 5 pieces, got ${dashes.length}`);
  check(t.applyDash({ pts: [0, 0, 100, 0], closed: false }, []).length === 1, 'empty dash should not split');

  check(near(t.shadowPeak(1000, 10), 1, 1e-6), 'large shape shadow peak should be 1');
  check(t.shadowPeak(1, 20) < 0.2, 'tiny shape under heavy blur should have a low shadow peak');

  const clipped = t.clipPolygonByConvex([0, 0, 1, 20, 0, 1, 0, 20, 1], 3, [5, -5, 15, -5, 15, 25, 5, 25], true);
  const clippedNeg = t.clipPolygonByConvex([0, 0, 1, 20, 0, 1, 0, 20, 1], 3, [5, -5, 15, -5, 15, 25, 5, 25], false);
  check(clipped.length > 0 || clippedNeg.length > 0, 'clip against a crossing rect should keep part of the triangle');
}

async function atlasAndRamps(): Promise<void> {
  const { SpriteAtlas } = await import('../src/render/gl/world/SpriteAtlas');
  const atlas = new SpriteAtlas(64, 1);
  const a = {}, b = {};
  const ea = atlas.lookup(a, 16, 16)!;
  const eb = atlas.lookup(b, 16, 16)!;
  check(!!ea && !!eb, 'atlas should pack two 16px sprites');
  check(ea !== eb && (ea.x !== eb.x || ea.y !== eb.y), 'same-size sprites must get distinct slots');
  check(atlas.lookup(a, 16, 16) === ea, 'atlas lookup should be stable per source');
  check(ea.y === eb.y, 'equal-height sprites should share a shelf');
  check(atlas.drainUploads().length === 2, 'atlas should queue one upload per new sprite');
  const gen = atlas.resetGeneration;
  let full = false;
  for (let i = 0; i < 64 && !full; i++) full = atlas.lookup({}, 16, 16) === null;
  check(full, 'a 64px single-page atlas should fill up');
  atlas.beginFrame();
  check(atlas.resetGeneration === gen + 1 && atlas.spriteCount === 0, 'a full atlas should reset at the next frame');
  check(atlas.lookup({}, 100, 100) === null, 'oversized sprites should be rejected');

  const { GradientRamps, bakeRamp, RAMP_WIDTH } = await import('../src/render/gl/world/GradientRamps');
  const row = new Uint8Array(RAMP_WIDTH * 4);
  bakeRamp(
    [
      { offset: 0, color: [1, 0, 0, 1] },
      { offset: 1, color: [0, 0, 1, 0] },
    ],
    row,
    0,
  );
  check(row[0] === 255 && row[3] === 255, 'ramp start should be opaque red');
  check(row[(RAMP_WIDTH - 1) * 4 + 3] === 0, 'ramp end should be transparent');
  const mid = Math.round((RAMP_WIDTH - 1) / 2) * 4;
  check(near(row[mid + 3], 128, 2) && near(row[mid], 64, 2) && near(row[mid + 2], 64, 2),
    `straight-alpha midpoint should premultiply to (64,0,64,128), got ${Array.from(row.slice(mid, mid + 4))}`);

  const ramps = new GradientRamps();
  const stops = [{ offset: 0, color: [1, 1, 1, 1] as const }, { offset: 1, color: [0, 0, 0, 1] as const }];
  const r0 = ramps.rowFor(stops);
  const r1 = ramps.rowFor(stops.map((s) => ({ ...s })));
  check(r0 === r1 && ramps.rowCount === 1, 'identical stops should share a ramp row');
  ramps.beginFrame();
  check(ramps.rowCount === 0, 'ramps should reset per frame');
}

async function painterBatches(): Promise<void> {
  const { GLWorldPainter, MODE_RADIAL } = await import('../src/render/gl/world/GLWorldPainter');
  const p = new GLWorldPainter();
  p.beginFrame(2, null);
  p.fillStyle = '#ff0000';
  p.fillRect(0, 0, 10, 10);
  p.fillRect(20, 0, 10, 10);
  check(p.batches.length === 1, `solid fills should share one batch, got ${p.batches.length}`);
  const sprite = { width: 8, height: 8 } as unknown as CanvasImageSource;
  p.drawImage(sprite, 0, 0);
  p.drawImage({ width: 8, height: 8 } as unknown as CanvasImageSource, 10, 0);
  check(p.batches.length === 1, `sprites on the same page should not break the batch, got ${p.batches.length}`);
  p.globalCompositeOperation = 'lighter';
  p.fillRect(0, 0, 4, 4);
  check(p.batches.length === 2, 'switching to lighter should start an additive batch');
  check(p.batches[1].blend === 'add', 'lighter should map to the add blend');
  p.globalCompositeOperation = 'source-over';
  p.fillRect(0, 0, 4, 4);
  check(p.batches.length === 3, 'returning to source-over should start an over batch');

  p.beginFrame(1, null);
  p.beginPath();
  p.arc(50, 50, 20, 0, Math.PI * 2);
  const grad = p.createRadialGradient(50, 50, 0, 50, 50, 20);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(0,128,255,0)');
  grad.addColorStop(0.5, 'not-a-colour');
  p.fillStyle = grad;
  p.shadowBlur = 12;
  p.shadowColor = 'rgba(0,229,255,0.8)';
  p.fill();
  p.shadowBlur = 0;
  p.lineWidth = 3;
  p.strokeStyle = '#00e5ff';
  p.stroke();
  check(p.vertCount > 100, `combatant-like draw should emit geometry, got ${p.vertCount} verts`);
  let radial = 0;
  for (let i = 0; i < p.vertCount; i++) if (p.verts[i * 14 + 8] === MODE_RADIAL) radial++;
  check(radial > 0, 'radial gradient fill should emit radial-mode vertices');
  check(p.ramps.rowCount >= 1, 'gradient fill should bake a ramp row');

  const before = p.vertCount;
  p.save();
  p.beginPath();
  p.rect(0, 0, 10, 10);
  p.clip();
  p.fillStyle = '#ffffff';
  p.fillRect(100, 100, 10, 10);
  p.restore();
  check(p.vertCount === before, 'a fill fully outside the clip should emit nothing');
  p.fillRect(100, 100, 10, 10);
  check(p.vertCount > before, 'restore should drop the clip');

  p.lineWidth = -1;
  check(p.lineWidth === 3, 'invalid lineWidth should be ignored like Canvas2D');
  p.globalAlpha = 2;
  check(p.globalAlpha === 1, 'out-of-range globalAlpha should be ignored');
}

async function main(): Promise<void> {
  await goldenParity();
  if (UPDATE) return;
  await sliceCoverage();
  await tessellation();
  await atlasAndRamps();
  await painterBatches();

  if (failures.length > 0) {
    console.error('test:world-painter FAILED');
    for (const f of failures.slice(0, 40)) console.error(`  - ${f}`);
    if (failures.length > 40) console.error(`  ... ${failures.length - 40} more`);
    process.exit(1);
  }
  console.log('test:world-painter OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
