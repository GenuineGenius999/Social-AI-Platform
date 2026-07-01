import { colLabel, rowLabel, starPoints, type BoardSize } from "@/lib/go/coords";
import { isLegalMove, type Board, type StoneColor } from "@/lib/go/rules";
import { useMemo } from "react";

type Props = {
  board: Board;
  size: BoardSize;
  lastMove?: { x: number; y: number } | null;
  ko?: { x: number; y: number } | null;
  currentTurn?: StoneColor | null;
  myColor?: StoneColor | null;
  interactive?: boolean;
  onPlay?: (x: number, y: number) => void;
};

export function GoBoard({
  board,
  size,
  lastMove,
  ko,
  currentTurn,
  myColor,
  interactive = false,
  onPlay,
}: Props) {
  const padding = 28;
  const cell = 24;
  const gridSize = (size - 1) * cell;
  const total = gridSize + padding * 2;
  const stars = useMemo(() => starPoints(size), [size]);

  const canPlay = interactive && myColor && currentTurn === myColor && onPlay;

  function handleClick(x: number, y: number) {
    if (!canPlay || board[y][x]) return;
    if (!isLegalMove(board, x, y, myColor!, ko ?? null)) return;
    onPlay!(x, y);
  }

  return (
    <div className="inline-block">
      <svg
        viewBox={`0 0 ${total} ${total}`}
        className="w-full max-w-[min(90vw,640px)] h-auto select-none"
        style={{ background: "linear-gradient(145deg, #e8c98a 0%, #dcb66e 50%, #c9a055 100%)" }}
      >
        {/* Grid lines */}
        {Array.from({ length: size }, (_, i) => {
          const pos = padding + i * cell;
          return (
            <g key={`grid-${i}`}>
              <line x1={padding} y1={pos} x2={padding + gridSize} y2={pos} stroke="#3d2914" strokeWidth={i === 0 || i === size - 1 ? 1.5 : 1} />
              <line x1={pos} y1={padding} x2={pos} y2={padding + gridSize} stroke="#3d2914" strokeWidth={i === 0 || i === size - 1 ? 1.5 : 1} />
            </g>
          );
        })}

        {/* Star points */}
        {stars.map(([x, y]) => {
          const cx = padding + x * cell;
          const cy = padding + y * cell;
          return <circle key={`star-${x}-${y}`} cx={cx} cy={cy} r={size <= 9 ? 2.5 : 3} fill="#3d2914" />;
        })}

        {/* Column labels (top & bottom) */}
        {Array.from({ length: size }, (_, x) => {
          const cx = padding + x * cell;
          const label = colLabel(x);
          return (
            <g key={`col-${x}`} className="fill-[#3d2914] font-mono text-[9px]">
              <text x={cx} y={padding - 10} textAnchor="middle">{label}</text>
              <text x={cx} y={total - padding + 18} textAnchor="middle">{label}</text>
            </g>
          );
        })}

        {/* Row labels (left & right) */}
        {Array.from({ length: size }, (_, y) => {
          const cy = padding + y * cell;
          const label = String(rowLabel(y, size));
          return (
            <g key={`row-${y}`} className="fill-[#3d2914] font-mono text-[9px]">
              <text x={padding - 12} y={cy + 3} textAnchor="middle">{label}</text>
              <text x={total - padding + 12} y={cy + 3} textAnchor="middle">{label}</text>
            </g>
          );
        })}

        {/* Intersections (click targets + stones) */}
        {Array.from({ length: size }, (_, y) =>
          Array.from({ length: size }, (_, x) => {
            const cx = padding + x * cell;
            const cy = padding + y * cell;
            const stone = board[y][x];
            const isLast = lastMove?.x === x && lastMove?.y === y;
            const isKo = ko?.x === x && ko?.y === y;
            const legal =
              canPlay &&
              !stone &&
              isLegalMove(board, x, y, myColor!, ko ?? null);

            return (
              <g key={`${x}-${y}`}>
                {canPlay && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={cell * 0.45}
                    fill="transparent"
                    className={legal ? "cursor-pointer hover:fill-black/10" : "cursor-not-allowed"}
                    onClick={() => handleClick(x, y)}
                  />
                )}
                {legal && !stone && (
                  <circle cx={cx} cy={cy} r={cell * 0.12} fill="rgba(0,0,0,0.15)" className="pointer-events-none" />
                )}
                {isKo && !stone && (
                  <circle cx={cx} cy={cy} r={cell * 0.08} fill="rgba(180,50,50,0.4)" className="pointer-events-none" />
                )}
                {stone && (
                  <>
                    <circle cx={cx + 0.5} cy={cy + 1} r={cell * 0.42} fill="rgba(0,0,0,0.25)" className="pointer-events-none" />
                    <circle
                      cx={cx}
                      cy={cy}
                      r={cell * 0.42}
                      fill={stone === "black" ? "#1a1a1a" : "#f5f0e8"}
                      stroke={stone === "white" ? "#999" : "none"}
                      strokeWidth={0.5}
                      className="pointer-events-none"
                    />
                    {stone === "black" && (
                      <circle cx={cx - 3} cy={cy - 3} r={cell * 0.1} fill="rgba(255,255,255,0.12)" className="pointer-events-none" />
                    )}
                  </>
                )}
                {isLast && stone && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={cell * 0.18}
                    fill="none"
                    stroke={stone === "black" ? "#fff" : "#333"}
                    strokeWidth={1.5}
                    className="pointer-events-none"
                  />
                )}
              </g>
            );
          }),
        )}
      </svg>
    </div>
  );
}
