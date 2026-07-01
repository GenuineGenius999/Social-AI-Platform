-- Fix Go join: allow authenticated users to join waiting games as white

DROP POLICY IF EXISTS "go_games_update_players" ON public.go_games;

CREATE POLICY "go_games_update_players" ON public.go_games FOR UPDATE TO authenticated
  USING (auth.uid() IN (creator_id, black_player_id, white_player_id))
  WITH CHECK (auth.uid() IN (creator_id, black_player_id, white_player_id));

CREATE POLICY "go_games_join" ON public.go_games FOR UPDATE TO authenticated
  USING (
    status = 'waiting'
    AND white_player_id IS NULL
    AND auth.uid() NOT IN (creator_id, black_player_id)
  )
  WITH CHECK (
    auth.uid() = white_player_id
    AND status = 'active'
  );
