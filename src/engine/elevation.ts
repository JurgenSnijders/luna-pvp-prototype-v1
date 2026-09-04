/**
 * Tests whether two 1D elevation intervals overlap.
 * Inline-friendly and allocation-free.
 */
export function bandsOverlap(
  aBottom: number,
  aTop: number,
  bBottom: number,
  bTop: number,
): boolean {
  return aTop >= bBottom && bTop >= aBottom;
}
