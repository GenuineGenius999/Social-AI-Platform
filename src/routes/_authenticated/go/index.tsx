import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { BOARD_SIZES, createGoGame, type GoGameRow } from "@/lib/go.functions";
import { defaultKomi, type BoardSize } from "@/lib/go/coords";
import { supabase } from "@/integrations/supabase/client";
import { friendlyDbError } from "@/lib/db-errors";
import { toast } from "sonner";
import { Copy, ExternalLink, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/go/")({
  component: GoLobby,
});

function GoLobby() {
  const create = useServerFn(createGoGame);
  const [me, setMe] = useState<string | null>(null);
  const [boardSize, setBoardSize] = useState<BoardSize>(19);
  const [komi, setKomi] = useState(defaultKomi(19));
  const [creating, setCreating] = useState(false);
  const [games, setGames] = useState<GoGameRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    if (me) loadGames();
  }, [me]);

  async function loadGames() {
    if (!me) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("go_games")
      .select("*")
      .or(`black_player_id.eq.${me},white_player_id.eq.${me},creator_id.eq.${me}`)
      .neq("status", "abandoned")
      .order("updated_at", { ascending: false })
      .limit(20);
    if (error) toast.error(friendlyDbError(error.message));
    setGames((data ?? []) as GoGameRow[]);
    setLoading(false);
  }

  async function handleCreate() {
    setCreating(true);
    try {
      const game = await create({ data: { boardSize, komi } });
      toast.success("Game created — share the link with your opponent");
      window.location.href = `/go/${game.id}`;
    } catch (e) {
      toast.error(friendlyDbError(e instanceof Error ? e.message : "Failed to create game"));
    } finally {
      setCreating(false);
    }
  }

  function statusLabel(g: GoGameRow) {
    if (g.status === "waiting") return "Waiting for opponent";
    if (g.status === "active") return `${g.current_turn === "black" ? "Black" : "White"} to play`;
    if (g.status === "finished") return g.winner ? `${g.winner} wins` : "Finished";
    return g.status;
  }

  return (
    <AppShell>
      <div className="p-4 lg:p-8 max-w-4xl mx-auto animate-enter">
        <div className="mono-label">/GO_ONLINE</div>
        <h1 className="font-display text-4xl uppercase mb-2">Go</h1>
        <p className="text-sm text-muted-foreground mb-8 max-w-xl">
          Create a game, share the link, and play real-time Go online. Supports 9×9, 13×13, 19×19, and 25×25 boards with standard rules.
        </p>

        <div className="paper-card p-6 mb-8">
          <div className="mono-label mb-4">NEW GAME</div>
          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="mono-label text-[10px] block mb-2">BOARD SIZE</label>
              <div className="flex flex-wrap gap-2">
                {BOARD_SIZES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setBoardSize(s);
                      setKomi(defaultKomi(s));
                    }}
                    className={`px-4 py-2 border-2 text-sm font-mono transition-colors ${boardSize === s ? "border-primary bg-card" : "border-line hover:border-foreground/40"}`}
                  >
                    {s}×{s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mono-label text-[10px] block mb-2">KOMI</label>
              <input
                type="number"
                step="0.5"
                min="0"
                max="20"
                value={komi}
                onChange={(e) => setKomi(Number(e.target.value))}
                className="w-full border border-line bg-background px-3 py-2 text-sm font-mono focus:border-primary focus:outline-none"
              />
            </div>
          </div>
          <button onClick={handleCreate} disabled={creating} className="rust-button px-6 py-3 flex items-center gap-2">
            <Plus className="size-4" />
            {creating ? "Creating..." : "Create & get share link"}
          </button>
        </div>

        <div>
          <div className="mono-label mb-4">YOUR GAMES</div>
          {loading && <div className="mono-label">Loading...</div>}
          {!loading && games.length === 0 && (
            <div className="paper-card p-6 text-sm text-muted-foreground">No games yet. Create one above or open a shared link from a friend.</div>
          )}
          <div className="space-y-2">
            {games.map((g) => (
              <GameRow key={g.id} game={g} me={me} statusLabel={statusLabel(g)} />
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function GameRow({
  game,
  me,
  statusLabel,
}: {
  game: GoGameRow;
  me: string | null;
  statusLabel: string;
}) {
  const url = `${typeof window !== "undefined" ? window.location.origin : ""}/go/${game.id}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy link");
    }
  }

  return (
    <div className="paper-card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="font-display text-lg uppercase">
          {game.board_size}×{game.board_size} · {game.status}
        </div>
        <div className="text-xs font-mono text-muted-foreground mt-1">{statusLabel}</div>
        {game.creator_id === me && game.status === "waiting" && (
          <div className="text-xs font-mono mt-2 truncate text-primary">{url}</div>
        )}
      </div>
      <div className="flex gap-2 shrink-0">
        {game.status === "waiting" && game.creator_id === me && (
          <button onClick={copyLink} className="ink-button px-3 py-2 text-xs flex items-center gap-1">
            <Copy className="size-3" /> Copy link
          </button>
        )}
        <Link to="/go/$gameId" params={{ gameId: game.id }} className="rust-button px-3 py-2 text-xs flex items-center gap-1">
          <ExternalLink className="size-3" /> Open
        </Link>
      </div>
    </div>
  );
}
