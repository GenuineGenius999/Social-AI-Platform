export const BOARD_SIZES = [9, 13, 19, 25] as const;
export type BoardSize = (typeof BOARD_SIZES)[number];

/** Column letters skip I (standard Go notation). */
const COL_LETTERS = "ABCDEFGHJKLMNOPQRSTUVWXYZ";

export function colLabel(x: number): string {
  return COL_LETTERS[x] ?? "?";
}

export function rowLabel(y: number, size: number): number {
  return size - y;
}

export function toCoord(x: number, y: number, size: number): string {
  return `${colLabel(x)}${rowLabel(y, size)}`;
}

export function defaultKomi(size: BoardSize): number {
  if (size === 9) return 5.5;
  if (size === 25) return 7.5;
  return 6.5;
}

/** Star point intersections for common board sizes. */
export function starPoints(size: BoardSize): [number, number][] {
  if (size === 9) return [[2, 2], [6, 2], [4, 4], [2, 6], [6, 6]];
  if (size === 13) return [[3, 3], [9, 3], [6, 6], [3, 9], [9, 9]];
  if (size === 19) return [[3, 3], [9, 3], [15, 3], [3, 9], [9, 9], [15, 9], [3, 15], [9, 15], [15, 15]];
  // 25x25 — 5x5 star grid
  return [
    [6, 6], [12, 6], [18, 6],
    [6, 12], [12, 12], [18, 12],
    [6, 18], [12, 18], [18, 18],
  ];
}
