export type StoneColor = "black" | "white";
export type Cell = StoneColor | null;
export type Board = Cell[][];

export type MoveRecord = {
  x: number | null;
  y: number | null;
  color: StoneColor;
  is_pass: boolean;
};

export type GameState = {
  board: Board;
  ko: { x: number; y: number } | null;
  blackCaptures: number;
  whiteCaptures: number;
  consecutivePasses: number;
};

export function opponent(c: StoneColor): StoneColor {
  return c === "black" ? "white" : "black";
}

export function emptyBoard(size: number): Board {
  return Array.from({ length: size }, () => Array<Cell>(size).fill(null));
}

export function inBounds(board: Board, x: number, y: number): boolean {
  return y >= 0 && y < board.length && x >= 0 && x < board[0].length;
}

function cloneBoard(board: Board): Board {
  return board.map((row) => [...row]);
}

function neighbors(x: number, y: number): [number, number][] {
  return [
    [x - 1, y],
    [x + 1, y],
    [x, y - 1],
    [x, y + 1],
  ];
}

export function getGroup(board: Board, x: number, y: number): { stones: [number, number][]; liberties: Set<string> } {
  const color = board[y][x];
  if (!color) return { stones: [], liberties: new Set() };

  const stones: [number, number][] = [];
  const liberties = new Set<string>();
  const seen = new Set<string>();
  const stack: [number, number][] = [[x, y]];

  while (stack.length) {
    const [cx, cy] = stack.pop()!;
    const key = `${cx},${cy}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!inBounds(board, cx, cy) || board[cy][cx] !== color) continue;
    stones.push([cx, cy]);
    for (const [nx, ny] of neighbors(cx, cy)) {
      if (!inBounds(board, nx, ny)) continue;
      const cell = board[ny][nx];
      if (cell === null) liberties.add(`${nx},${ny}`);
      else if (cell === color) stack.push([nx, ny]);
    }
  }

  return { stones, liberties };
}

function removeGroup(board: Board, stones: [number, number][]): number {
  for (const [x, y] of stones) board[y][x] = null;
  return stones.length;
}

function collectCaptures(board: Board, x: number, y: number, color: StoneColor): { board: Board; count: number; capturedAt: [number, number][] } {
  const next = cloneBoard(board);
  next[y][x] = color;
  let count = 0;
  const capturedAt: [number, number][] = [];
  const opp = opponent(color);

  for (const [nx, ny] of neighbors(x, y)) {
    if (!inBounds(next, nx, ny) || next[ny][nx] !== opp) continue;
    const group = getGroup(next, nx, ny);
    if (group.liberties.size === 0) {
      count += removeGroup(next, group.stones);
      for (const s of group.stones) capturedAt.push(s);
    }
  }

  return { board: next, count, capturedAt };
}

function hasLiberty(board: Board, x: number, y: number, color: StoneColor): boolean {
  const group = getGroup(board, x, y);
  return group.liberties.size > 0;
}

export function isLegalMove(
  board: Board,
  x: number,
  y: number,
  color: StoneColor,
  ko: { x: number; y: number } | null,
): boolean {
  if (!inBounds(board, x, y) || board[y][x] !== null) return false;
  if (ko && ko.x === x && ko.y === y) return false;

  const { board: afterCapture, count } = collectCaptures(board, x, y, color);
  if (!hasLiberty(afterCapture, x, y, color) && count === 0) return false;

  return true;
}

export function applyMove(
  board: Board,
  x: number,
  y: number,
  color: StoneColor,
  ko: { x: number; y: number } | null,
  blackCaptures: number,
  whiteCaptures: number,
): { board: Board; ko: { x: number; y: number } | null; captured: number; blackCaptures: number; whiteCaptures: number } {
  if (!isLegalMove(board, x, y, color, ko)) {
    throw new Error("Illegal move");
  }

  const { board: next, count, capturedAt } = collectCaptures(board, x, y, color);
  if (!hasLiberty(next, x, y, color)) {
    throw new Error("Suicide move");
  }

  let newKo: { x: number; y: number } | null = null;
  if (count === 1) {
    newKo = { x: capturedAt[0][0], y: capturedAt[0][1] };
  }

  const cap = color === "black" ? { black: blackCaptures + count, white: whiteCaptures } : { black: blackCaptures, white: whiteCaptures + count };

  return {
    board: next,
    ko: newKo,
    captured: count,
    blackCaptures: cap.black,
    whiteCaptures: cap.white,
  };
}

export function applyPass(
  consecutivePasses: number,
): { consecutivePasses: number; gameEnded: boolean } {
  const next = consecutivePasses + 1;
  return { consecutivePasses: next, gameEnded: next >= 2 };
}

export function rebuildGameState(moves: MoveRecord[], size: number): GameState {
  let board = emptyBoard(size);
  let ko: { x: number; y: number } | null = null;
  let blackCaptures = 0;
  let whiteCaptures = 0;
  let consecutivePasses = 0;

  for (const m of moves) {
    if (m.is_pass) {
      consecutivePasses += 1;
      ko = null;
      continue;
    }
    if (m.x === null || m.y === null) continue;
    const result = applyMove(board, m.x, m.y, m.color, ko, blackCaptures, whiteCaptures);
    board = result.board;
    ko = result.ko;
    blackCaptures = result.blackCaptures;
    whiteCaptures = result.whiteCaptures;
    consecutivePasses = 0;
  }

  return { board, ko, blackCaptures, whiteCaptures, consecutivePasses };
}

export function currentTurnFromMoves(moves: MoveRecord[]): StoneColor {
  if (moves.length === 0) return "black";
  const last = moves[moves.length - 1];
  return opponent(last.color);
}
