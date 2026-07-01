import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { GoBoard } from "@/components/go/GoBoard";
import {
  abandonGoGame,
  deleteGoGame,
  joinGoGame,
  passGoTurn,
  playGoMove,
  resignGoGame,
  resetGoGame,
  updateGoGameSettings,
  type GoGameRow,
  type GoMoveRow,
  BOARD_SIZES,
} from "@/lib/go.functions";
import { defaultKomi, toCoord, type BoardSize } from "@/lib/go/coords";
import { rebuildGameState, type StoneColor } from "@/lib/go/rules";
import { supabase } from "@/integrations/supabase/client";
import { friendlyDbError } from "@/lib/db-errors";
import { toast } from "sonner";
import { ArrowLeft, Copy, Flag, RefreshCw, Settings, Trash2, UserPlus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/go/$gameId")({
  component: GoGamePage,
});

function GoGamePage() {
  const { gameId } = Route.useParams();
  const join = useServerFn(joinGoGame);
  const play = useServerFn(playGoMove);
  const pass = useServerFn(passGoTurn);
  const resign = useServerFn(resignGoGame);
  const reset = useServerFn(resetGoGame);
  const abandon = useServerFn(abandonGoGame);
  const remove = useServerFn(deleteGoGame);
  const updateSettings = useServerFn(updateGoGameSettings);

  const [me, setMe] = useState<string | null>(null);
  const [game, setGame] = useState<GoGameRow | null>(null);
  const [moves, setMoves] = useState<GoMoveRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { username: string; display_name: string | null }>>({});
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editSize, setEditSize] = useState<BoardSize>(19);
  const [editKomi, setEditKomi] = useState(6.5);

  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/go/${gameId}` : "";

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    loadAll();
    const chGame = supabase
      .channel(`go-game-${gameId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "go_games", filter: `id=eq.${gameId}` }, () => loadGame())
      .subscribe();

    const chMoves = supabase
      .channel(`go-moves-${gameId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "go_moves", filter: `game_id=eq.${gameId}` }, (payload) => {
        setMoves((prev) => {
          const row = payload.new as GoMoveRow;
          if (prev.some((m) => m.id === row.id)) return prev;
          return [...prev, row].sort((a, b) => a.move_number - b.move_number);
        });
        loadGame();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(chGame);
      supabase.removeChannel(chMoves);
    };
  }, [gameId]);

  async function loadGame() {
    const { data, error } = await supabase.from("go_games").select("*").eq("id", gameId).single();
    if (error) {
      if (!game) toast.error(friendlyDbError(error.message));
      return;
    }
    const g = data as GoGameRow;
    setGame(g);
    setEditSize(g.board_size as BoardSize);
    setEditKomi(Number(g.komi));
    await loadProfiles(g);
  }

  async function loadMoves() {
    const { data } = await supabase.from("go_moves").select("*").eq("game_id", gameId).order("move_number", { ascending: true });
    setMoves((data ?? []) as GoMoveRow[]);
  }

  async function loadProfiles(g: GoGameRow) {
    const ids = [g.black_player_id, g.white_player_id].filter(Boolean) as string[];
    if (ids.length === 0) return;
    const { data } = await supabase.from("profiles").select("id,username,display_name").in("id", ids);
    const map: Record<string, { username: string; display_name: string | null }> = {};
    for (const p of data ?? []) {
      map[p.id] = { username: p.username, display_name: p.display_name };
    }
    setProfiles(map);
  }

  async function loadAll() {
    setLoading(true);
    await Promise.all([loadGame(), loadMoves()]);
    setLoading(false);
  }

  const myColor: StoneColor | null = useMemo(() => {
    if (!me || !game) return null;
    if (game.black_player_id === me) return "black";
    if (game.white_player_id === me) return "white";
    return null;
  }, [me, game]);

  const isCreator = me === game?.creator_id;
  const canJoin = game?.status === "waiting" && !game.white_player_id && me && !myColor;

  const boardState = useMemo(() => {
    if (!game) return null;
    const records = moves.map((m) => ({
      x: m.x,
      y: m.y,
      color: m.color,
      is_pass: m.is_pass,
    }));
    return rebuildGameState(records, game.board_size);
  }, [game, moves]);

  const lastMove = game?.last_move_x != null && game.last_move_y != null ? { x: game.last_move_x, y: game.last_move_y } : null;
  const ko = game?.ko_x != null && game.ko_y != null ? { x: game.ko_x, y: game.ko_y } : null;

  async function handleJoin() {
    setActing(true);
    try {
      const g = await join({ data: { gameId } });
      setGame(g);
      toast.success("Joined as White");
      loadAll();
    } catch (e) {
      toast.error(friendlyDbError(e instanceof Error ? e.message : "Could not join"));
    } finally {
      setActing(false);
    }
  }

  async function handlePlay(x: number, y: number) {
    setActing(true);
    try {
      await play({ data: { gameId, x, y } });
    } catch (e) {
      toast.error(friendlyDbError(e instanceof Error ? e.message : "Illegal move"));
    } finally {
      setActing(false);
    }
  }

  async function handlePass() {
    setActing(true);
    try {
      await pass({ data: { gameId } });
      toast.info("Passed");
    } catch (e) {
      toast.error(friendlyDbError(e instanceof Error ? e.message : "Failed"));
    } finally {
      setActing(false);
    }
  }

  async function handleResign() {
    if (!confirm("Resign this game?")) return;
    setActing(true);
    try {
      await resign({ data: { gameId } });
      toast.info("You resigned");
    } catch (e) {
      toast.error(friendlyDbError(e instanceof Error ? e.message : "Failed"));
    } finally {
      setActing(false);
    }
  }

  async function handleReset() {
    if (!confirm("Reset the board? All moves will be cleared.")) return;
    setActing(true);
    try {
      await reset({ data: { gameId } });
      setMoves([]);
      toast.success("Game reset");
      loadAll();
    } catch (e) {
      toast.error(friendlyDbError(e instanceof Error ? e.message : "Failed"));
    } finally {
      setActing(false);
    }
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied — send it to your opponent");
    } catch {
      toast.error("Could not copy");
    }
  }

  async function handleSaveSettings() {
    setActing(true);
    try {
      const g = await updateSettings({ data: { gameId, boardSize: editSize, komi: editKomi } });
      setGame(g);
      setShowSettings(false);
      toast.success("Settings updated");
    } catch (e) {
      toast.error(friendlyDbError(e instanceof Error ? e.message : "Failed"));
    } finally {
      setActing(false);
    }
  }

  async function handleAbandon() {
    if (!confirm("Abandon this game?")) return;
    setActing(true);
    try {
      await abandon({ data: { gameId } });
      toast.info("Game abandoned");
      loadGame();
    } catch (e) {
      toast.error(friendlyDbError(e instanceof Error ? e.message : "Failed"));
    } finally {
      setActing(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this game permanently?")) return;
    setActing(true);
    try {
      await remove({ data: { gameId } });
      toast.success("Game deleted");
      window.location.href = "/go";
    } catch (e) {
      toast.error(friendlyDbError(e instanceof Error ? e.message : "Failed"));
    } finally {
      setActing(false);
    }
  }

  function playerName(id: string | null) {
    if (!id) return "—";
    const p = profiles[id];
    return p?.display_name || p?.username || id.slice(0, 8);
  }

  if (loading) {
    return (
      <AppShell>
        <div className="p-8 mono-label">Loading game...</div>
      </AppShell>
    );
  }

  if (!game) {
    return (
      <AppShell>
        <div className="p-8">
          <div className="mono-label mb-4">Game not found</div>
          <Link to="/go" className="ink-button px-4 py-2 inline-flex items-center gap-2">
            <ArrowLeft className="size-4" /> Back to Go
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="p-4 lg:p-6 animate-enter">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <Link to="/go" className="mono-label hover:text-primary flex items-center gap-1 mb-2">
              <ArrowLeft className="size-3" /> GO LOBBY
            </Link>
            <h1 className="font-display text-3xl uppercase">
              {game.board_size}×{game.board_size} Go
            </h1>
            <div className="text-xs font-mono text-muted-foreground mt-1 capitalize">{game.status.replace("_", " ")}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={handleCopyLink} className="ink-button px-3 py-2 text-xs flex items-center gap-1">
              <Copy className="size-3" /> Share link
            </button>
            {canJoin && (
              <button onClick={handleJoin} disabled={acting} className="rust-button px-3 py-2 text-xs flex items-center gap-1">
                <UserPlus className="size-3" /> Join as White
              </button>
            )}
          </div>
        </div>

        <div className="grid lg:grid-cols-[1fr_280px] gap-6">
          <div className="paper-card p-4 lg:p-6 flex justify-center">
            {boardState && (
              <GoBoard
                board={boardState.board}
                size={game.board_size as BoardSize}
                lastMove={lastMove}
                ko={ko}
                currentTurn={game.current_turn}
                myColor={myColor}
                interactive={game.status === "active" && !acting}
                onPlay={handlePlay}
              />
            )}
          </div>

          <aside className="space-y-4">
            <div className="paper-card p-4">
              <div className="mono-label mb-3">PLAYERS</div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>⚫ Black</span>
                  <span className="font-mono">{playerName(game.black_player_id)}</span>
                </div>
                <div className="flex justify-between">
                  <span>⚪ White</span>
                  <span className="font-mono">{game.white_player_id ? playerName(game.white_player_id) : "Waiting..."}</span>
                </div>
              </div>
            </div>

            <div className="paper-card p-4">
              <div className="mono-label mb-3">GAME INFO</div>
              <div className="space-y-1 text-xs font-mono">
                <div className="flex justify-between">
                  <span>Komi</span>
                  <span>{game.komi}</span>
                </div>
                <div className="flex justify-between">
                  <span>Captures (B/W)</span>
                  <span>
                    {game.black_captures} / {game.white_captures}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Turn</span>
                  <span className="capitalize">{game.current_turn ?? "—"}</span>
                </div>
                {game.winner && (
                  <div className="flex justify-between text-primary">
                    <span>Winner</span>
                    <span className="capitalize">{game.winner}</span>
                  </div>
                )}
              </div>
            </div>

            {game.status === "active" && myColor && (
              <div className="paper-card p-4 flex flex-col gap-2">
                <div className="mono-label mb-1">YOUR MOVE</div>
                {game.current_turn === myColor ? (
                  <div className="text-xs text-primary font-mono mb-2">Your turn ({myColor})</div>
                ) : (
                  <div className="text-xs text-muted-foreground font-mono mb-2">Waiting for opponent...</div>
                )}
                <button onClick={handlePass} disabled={acting || game.current_turn !== myColor} className="ink-button py-2 text-xs">
                  Pass
                </button>
                <button onClick={handleResign} disabled={acting} className="border border-destructive text-destructive py-2 text-xs flex items-center justify-center gap-1">
                  <Flag className="size-3" /> Resign
                </button>
              </div>
            )}

            {game.status === "waiting" && isCreator && (
              <div className="paper-card p-4">
                <div className="mono-label mb-2">WAITING FOR OPPONENT</div>
                <p className="text-xs text-muted-foreground mb-3">Share the link above. You play as Black.</p>
                <button onClick={() => setShowSettings(!showSettings)} className="ink-button w-full py-2 text-xs flex items-center justify-center gap-1 mb-2">
                  <Settings className="size-3" /> Settings
                </button>
                {showSettings && (
                  <div className="border border-line p-3 space-y-3 mb-2">
                    <div className="flex flex-wrap gap-1">
                      {BOARD_SIZES.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => {
                            setEditSize(s);
                            setEditKomi(defaultKomi(s));
                          }}
                          className={`px-2 py-1 text-[10px] font-mono border ${editSize === s ? "border-primary" : "border-line"}`}
                        >
                          {s}×{s}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      step="0.5"
                      value={editKomi}
                      onChange={(e) => setEditKomi(Number(e.target.value))}
                      className="w-full border border-line px-2 py-1 text-xs font-mono"
                    />
                    <button onClick={handleSaveSettings} disabled={acting} className="rust-button w-full py-1 text-xs">
                      Save
                    </button>
                  </div>
                )}
              </div>
            )}

            {isCreator && (
              <div className="paper-card p-4">
                <div className="mono-label mb-3">CREATOR CONTROLS</div>
                <div className="flex flex-col gap-2">
                  <button onClick={handleReset} disabled={acting} className="ink-button py-2 text-xs flex items-center justify-center gap-1">
                    <RefreshCw className="size-3" /> Reset board
                  </button>
                  <button onClick={handleAbandon} disabled={acting} className="border border-line py-2 text-xs">
                    Abandon game
                  </button>
                  <button onClick={handleDelete} disabled={acting} className="border border-destructive text-destructive py-2 text-xs flex items-center justify-center gap-1">
                    <Trash2 className="size-3" /> Delete game
                  </button>
                </div>
              </div>
            )}

            {moves.length > 0 && (
              <div className="paper-card p-4 max-h-48 overflow-y-auto">
                <div className="mono-label mb-2">MOVES ({moves.length})</div>
                <div className="text-[10px] font-mono space-y-0.5">
                  {moves.slice(-12).map((m) => (
                    <div key={m.id}>
                      {m.move_number}. {m.color === "black" ? "B" : "W"}{" "}
                      {m.is_pass ? "pass" : m.x != null && m.y != null ? toCoord(m.x, m.y, game.board_size) : "—"}
                      {m.captured_count > 0 ? ` (+${m.captured_count})` : ""}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
