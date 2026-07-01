-- Online Go (Weiqi) games

CREATE TABLE IF NOT EXISTS public.go_games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  black_player_id UUID NOT NULL REFERENCES auth.users(id),
  white_player_id UUID REFERENCES auth.users(id),
  board_size SMALLINT NOT NULL DEFAULT 19 CHECK (board_size IN (9, 13, 19, 25)),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'finished', 'abandoned')),
  current_turn TEXT CHECK (current_turn IN ('black', 'white')),
  winner TEXT CHECK (winner IN ('black', 'white')),
  komi NUMERIC(4, 1) NOT NULL DEFAULT 6.5,
  consecutive_passes SMALLINT NOT NULL DEFAULT 0,
  ko_x SMALLINT,
  ko_y SMALLINT,
  last_move_x SMALLINT,
  last_move_y SMALLINT,
  black_captures INT NOT NULL DEFAULT 0,
  white_captures INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS go_games_black_idx ON public.go_games(black_player_id, status);
CREATE INDEX IF NOT EXISTS go_games_white_idx ON public.go_games(white_player_id, status);
CREATE INDEX IF NOT EXISTS go_games_creator_idx ON public.go_games(creator_id);
CREATE INDEX IF NOT EXISTS go_games_waiting_idx ON public.go_games(status) WHERE status = 'waiting';

CREATE TABLE IF NOT EXISTS public.go_moves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES public.go_games(id) ON DELETE CASCADE,
  move_number INT NOT NULL,
  player_id UUID NOT NULL REFERENCES auth.users(id),
  color TEXT NOT NULL CHECK (color IN ('black', 'white')),
  x SMALLINT,
  y SMALLINT,
  is_pass BOOLEAN NOT NULL DEFAULT false,
  captured_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (game_id, move_number)
);

CREATE INDEX IF NOT EXISTS go_moves_game_idx ON public.go_moves(game_id, move_number);

ALTER TABLE public.go_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.go_moves ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.go_games TO authenticated;
GRANT ALL ON public.go_games TO service_role;
GRANT SELECT, INSERT ON public.go_moves TO authenticated;
GRANT ALL ON public.go_moves TO service_role;

-- Players and creator can read; any authenticated user can read waiting games (for join links)
CREATE POLICY "go_games_select" ON public.go_games FOR SELECT TO authenticated
  USING (
    auth.uid() IN (creator_id, black_player_id, white_player_id)
    OR status = 'waiting'
  );

CREATE POLICY "go_games_insert" ON public.go_games FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = creator_id AND auth.uid() = black_player_id);

CREATE POLICY "go_games_update_players" ON public.go_games FOR UPDATE TO authenticated
  USING (auth.uid() IN (creator_id, black_player_id, white_player_id))
  WITH CHECK (auth.uid() IN (creator_id, black_player_id, white_player_id));

CREATE POLICY "go_games_delete_creator" ON public.go_games FOR DELETE TO authenticated
  USING (auth.uid() = creator_id);

CREATE POLICY "go_moves_select" ON public.go_moves FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.go_games g
      WHERE g.id = go_moves.game_id
      AND (
        auth.uid() IN (g.creator_id, g.black_player_id, g.white_player_id)
        OR g.status = 'waiting'
      )
    )
  );

CREATE POLICY "go_moves_insert" ON public.go_moves FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.go_games g
      WHERE g.id = go_moves.game_id
      AND auth.uid() IN (g.black_player_id, g.white_player_id)
      AND g.status = 'active'
    )
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.go_games;
ALTER PUBLICATION supabase_realtime ADD TABLE public.go_moves;
