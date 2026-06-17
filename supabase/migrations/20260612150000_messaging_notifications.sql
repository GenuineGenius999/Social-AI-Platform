-- Notifications, read cursors, post reactions, chat attachments

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('new_post','new_message','new_comment','new_like','new_group_message','new_global_message','system')),
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  style_idx SMALLINT NOT NULL DEFAULT 0 CHECK (style_idx BETWEEN 0 AND 7),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx ON public.notifications(user_id, read_at, created_at DESC);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
CREATE POLICY "notifications_own" ON public.notifications FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

CREATE TABLE IF NOT EXISTS public.read_cursors (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel public.message_channel NOT NULL,
  thread_id TEXT NOT NULL,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, channel, thread_id)
);
ALTER TABLE public.read_cursors ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.read_cursors TO authenticated;
GRANT ALL ON public.read_cursors TO service_role;
CREATE POLICY "read_cursors_own" ON public.read_cursors FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.post_reactions (
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL CHECK (length(emoji) BETWEEN 1 AND 8),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id, emoji)
);
ALTER TABLE public.post_reactions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.post_reactions TO authenticated;
GRANT SELECT ON public.post_reactions TO anon;
GRANT ALL ON public.post_reactions TO service_role;
CREATE POLICY "post_reactions_select" ON public.post_reactions FOR SELECT USING (true);
CREATE POLICY "post_reactions_insert_own" ON public.post_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "post_reactions_delete_own" ON public.post_reactions FOR DELETE USING (auth.uid() = user_id);
ALTER PUBLICATION supabase_realtime ADD TABLE public.post_reactions;

ALTER TABLE public.global_messages ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.direct_messages ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.group_messages ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Fix group creation: allow group creator to add initial members
DROP POLICY IF EXISTS "group_members_insert" ON public.chat_group_members;
CREATE POLICY "group_members_insert" ON public.chat_group_members FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.chat_group_members m
      WHERE m.group_id = chat_group_members.group_id AND m.user_id = auth.uid() AND m.role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM public.chat_groups g
      WHERE g.id = chat_group_members.group_id AND g.created_by = auth.uid()
    )
  );
