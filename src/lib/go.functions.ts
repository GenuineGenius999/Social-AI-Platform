import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { BOARD_SIZES, defaultKomi, type BoardSize } from "@/lib/go/coords";
import {
  applyMove,
  applyPass,
  opponent,
  rebuildGameState,
  type MoveRecord,
  type StoneColor,
} from "@/lib/go/rules";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

type AuthSupabase = SupabaseClient<Database>;

type GoGameRow = {
  id: string;
  creator_id: string;
  black_player_id: string;
  white_player_id: string | null;
  board_size: number;
  status: string;
  current_turn: StoneColor | null;
  winner: StoneColor | null;
  komi: number;
  consecutive_passes: number;
  ko_x: number | null;
  ko_y: number | null;
  last_move_x: number | null;
  last_move_y: number | null;
  black_captures: number;
  white_captures: number;
  created_at: string;
  updated_at: string;
};

type GoMoveRow = {
  id: string;
  game_id: string;
  move_number: number;
  player_id: string;
  color: StoneColor;
  x: number | null;
  y: number | null;
  is_pass: boolean;
  captured_count: number;
  created_at: string;
};

function toMoveRecords(rows: GoMoveRow[]): MoveRecord[] {
  return rows.map((r) => ({
    x: r.x,
    y: r.y,
    color: r.color,
    is_pass: r.is_pass,
  }));
}

async function loadGame(supabase: AuthSupabase, gameId: string) {
  const { data, error } = await supabase.from("go_games").select("*").eq("id", gameId).single();
  if (error || !data) throw new Error("Game not found");
  return data as GoGameRow;
}

async function loadMoves(supabase: AuthSupabase, gameId: string) {
  const { data, error } = await supabase.from("go_moves").select("*").eq("game_id", gameId).order("move_number", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as GoMoveRow[];
}

function playerColor(game: GoGameRow, userId: string): StoneColor | null {
  if (game.black_player_id === userId) return "black";
  if (game.white_player_id === userId) return "white";
  return null;
}

function assertPlayer(game: GoGameRow, userId: string) {
  const color = playerColor(game, userId);
  if (!color) throw new Error("You are not a player in this game");
  return color;
}

const CreateInput = z.object({
  boardSize: z.union([z.literal(9), z.literal(13), z.literal(19), z.literal(25)]),
  komi: z.number().min(0).max(20).optional(),
});

export const createGoGame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateInput.parse(d))
  .handler(async ({ data, context }) => {
    const komi = data.komi ?? defaultKomi(data.boardSize);

    const { data: game, error } = await context.supabase
      .from("go_games")
      .insert({
        creator_id: context.userId,
        black_player_id: context.userId,
        white_player_id: null,
        board_size: data.boardSize,
        status: "waiting",
        current_turn: "black",
        komi,
      })
      .select()
      .single();
    if (error) {
      if (/could not find the table/i.test(error.message)) {
        throw new Error("Go tables not set up. Run the go_games migration in Supabase (see DATABASE.md).");
      }
      throw new Error(error.message);
    }
    return game as GoGameRow;
  });

const GameIdInput = z.object({ gameId: z.string().uuid() });

export const joinGoGame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GameIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const game = await loadGame(context.supabase, data.gameId);

    if (game.status !== "waiting") throw new Error("This game is no longer accepting players");
    if (game.white_player_id) throw new Error("This game is full");
    if (game.black_player_id === context.userId || game.creator_id === context.userId) {
      throw new Error("You cannot join your own game as the opponent");
    }

    const { data: updated, error } = await context.supabase
      .from("go_games")
      .update({
        white_player_id: context.userId,
        status: "active",
        current_turn: "black",
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.gameId)
      .eq("status", "waiting")
      .is("white_player_id", null)
      .select()
      .single();

    if (error || !updated) throw new Error(error?.message ?? "Could not join game");
    return updated as GoGameRow;
  });

const PlayInput = z.object({
  gameId: z.string().uuid(),
  x: z.number().int().min(0).max(24),
  y: z.number().int().min(0).max(24),
});

export const playGoMove = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PlayInput.parse(d))
  .handler(async ({ data, context }) => {
    const game = await loadGame(context.supabase, data.gameId);
    if (game.status !== "active") throw new Error("Game is not active");

    const myColor = assertPlayer(game, context.userId);
    if (game.current_turn !== myColor) throw new Error("Not your turn");

    const size = game.board_size;
    if (data.x >= size || data.y >= size) throw new Error("Move out of bounds");

    const moveRows = await loadMoves(context.supabase, data.gameId);
    const moves = toMoveRecords(moveRows);
    const state = rebuildGameState(moves, size);

    const result = applyMove(state.board, data.x, data.y, myColor, state.ko, state.blackCaptures, state.whiteCaptures);

    const moveNumber = moveRows.length + 1;
    const { error: moveErr } = await context.supabase.from("go_moves").insert({
      game_id: data.gameId,
      move_number: moveNumber,
      player_id: context.userId,
      color: myColor,
      x: data.x,
      y: data.y,
      is_pass: false,
      captured_count: result.captured,
    });
    if (moveErr) throw new Error(moveErr.message);

    const { data: updated, error } = await context.supabase
      .from("go_games")
      .update({
        current_turn: opponent(myColor),
        consecutive_passes: 0,
        ko_x: result.ko?.x ?? null,
        ko_y: result.ko?.y ?? null,
        last_move_x: data.x,
        last_move_y: data.y,
        black_captures: result.blackCaptures,
        white_captures: result.whiteCaptures,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.gameId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return updated as GoGameRow;
  });

export const passGoTurn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GameIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const game = await loadGame(context.supabase, data.gameId);
    if (game.status !== "active") throw new Error("Game is not active");

    const myColor = assertPlayer(game, context.userId);
    if (game.current_turn !== myColor) throw new Error("Not your turn");

    const moveRows = await loadMoves(context.supabase, data.gameId);
    const moveNumber = moveRows.length + 1;

    const { error: moveErr } = await context.supabase.from("go_moves").insert({
      game_id: data.gameId,
      move_number: moveNumber,
      player_id: context.userId,
      color: myColor,
      x: null,
      y: null,
      is_pass: true,
      captured_count: 0,
    });
    if (moveErr) throw new Error(moveErr.message);

    const passResult = applyPass(game.consecutive_passes);
    const updates: Record<string, unknown> = {
      current_turn: opponent(myColor),
      consecutive_passes: passResult.consecutivePasses,
      ko_x: null,
      ko_y: null,
      updated_at: new Date().toISOString(),
    };
    if (passResult.gameEnded) {
      updates.status = "finished";
      updates.winner = null;
    }

    const { data: updated, error } = await context.supabase.from("go_games").update(updates).eq("id", data.gameId).select().single();
    if (error) throw new Error(error.message);
    return updated as GoGameRow;
  });

export const resignGoGame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GameIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const game = await loadGame(context.supabase, data.gameId);
    if (game.status !== "active") throw new Error("Game is not active");

    const myColor = assertPlayer(game, context.userId);
    const winner = opponent(myColor);

    const { data: updated, error } = await context.supabase
      .from("go_games")
      .update({
        status: "finished",
        winner,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.gameId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return updated as GoGameRow;
  });

export const resetGoGame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GameIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const game = await loadGame(context.supabase, data.gameId);
    if (game.creator_id !== context.userId) throw new Error("Only the game creator can reset");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("go_moves").delete().eq("game_id", data.gameId);

    const status = game.white_player_id ? "active" : "waiting";
    const { data: updated, error } = await context.supabase
      .from("go_games")
      .update({
        status,
        current_turn: "black",
        winner: null,
        consecutive_passes: 0,
        ko_x: null,
        ko_y: null,
        last_move_x: null,
        last_move_y: null,
        black_captures: 0,
        white_captures: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.gameId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return updated as GoGameRow;
  });

const UpdateGameInput = z.object({
  gameId: z.string().uuid(),
  boardSize: z.union([z.literal(9), z.literal(13), z.literal(19), z.literal(25)]).optional(),
  komi: z.number().min(0).max(20).optional(),
});

export const updateGoGameSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateGameInput.parse(d))
  .handler(async ({ data, context }) => {
    const game = await loadGame(context.supabase, data.gameId);
    if (game.creator_id !== context.userId) throw new Error("Only the game creator can change settings");
    if (game.status !== "waiting") throw new Error("Settings can only be changed before the game starts");

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.boardSize) patch.board_size = data.boardSize;
    if (data.komi !== undefined) patch.komi = data.komi;

    const { data: updated, error } = await context.supabase.from("go_games").update(patch).eq("id", data.gameId).select().single();
    if (error) throw new Error(error.message);
    return updated as GoGameRow;
  });

export const abandonGoGame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GameIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const game = await loadGame(context.supabase, data.gameId);
    if (game.creator_id !== context.userId) throw new Error("Only the game creator can abandon the game");

    const { data: updated, error } = await context.supabase
      .from("go_games")
      .update({ status: "abandoned", updated_at: new Date().toISOString() })
      .eq("id", data.gameId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return updated as GoGameRow;
  });

export const deleteGoGame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GameIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const game = await loadGame(context.supabase, data.gameId);
    if (game.creator_id !== context.userId) throw new Error("Only the game creator can delete the game");

    const { error } = await context.supabase.from("go_games").delete().eq("id", data.gameId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type { GoGameRow, GoMoveRow, BoardSize };
export { BOARD_SIZES };
