
-- Message channel enum for reactions & hidden messages
CREATE TYPE public.message_channel AS ENUM ('global', 'direct', 'group');

-- Soft-delete support on existing message tables
ALTER TABLE public.global_messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.direct_messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- GROUP CHATS
CREATE TABLE public.chat_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  description TEXT,
  avatar_url TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_groups TO authenticated;
GRANT ALL ON public.chat_groups TO service_role;
ALTER TABLE public.chat_groups ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.chat_group_members (
  group_id UUID NOT NULL REFERENCES public.chat_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.chat_group_members TO authenticated;
GRANT ALL ON public.chat_group_members TO service_role;
ALTER TABLE public.chat_group_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.group_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.chat_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 4000),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_messages TO authenticated;
GRANT ALL ON public.group_messages TO service_role;
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX group_messages_group_idx ON public.group_messages(group_id, created_at);

-- RLS: groups visible to members
CREATE POLICY "groups_select_member" ON public.chat_groups FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.chat_group_members m WHERE m.group_id = id AND m.user_id = auth.uid()));
CREATE POLICY "groups_insert_auth" ON public.chat_groups FOR INSERT
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY "groups_update_admin" ON public.chat_groups FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.chat_group_members m WHERE m.group_id = id AND m.user_id = auth.uid() AND m.role = 'admin'));

CREATE POLICY "group_members_select" ON public.chat_group_members FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.chat_group_members m WHERE m.group_id = group_id AND m.user_id = auth.uid()));
CREATE POLICY "group_members_insert" ON public.chat_group_members FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.chat_group_members m WHERE m.group_id = group_id AND m.user_id = auth.uid() AND m.role = 'admin')
    OR EXISTS (SELECT 1 FROM public.chat_groups g WHERE g.id = group_id AND g.created_by = auth.uid())
  );
CREATE POLICY "group_members_delete" ON public.chat_group_members FOR DELETE
  USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.chat_group_members m WHERE m.group_id = group_id AND m.user_id = auth.uid() AND m.role = 'admin'));

CREATE POLICY "group_msgs_select" ON public.group_messages FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.chat_group_members m WHERE m.group_id = group_id AND m.user_id = auth.uid()));
CREATE POLICY "group_msgs_insert" ON public.group_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.chat_group_members m WHERE m.group_id = group_id AND m.user_id = auth.uid()));
CREATE POLICY "group_msgs_update_own" ON public.group_messages FOR UPDATE
  USING (auth.uid() = user_id);
CREATE POLICY "group_msgs_delete_own" ON public.group_messages FOR DELETE
  USING (auth.uid() = user_id);

-- MESSAGE REACTIONS (global, direct, group)
CREATE TABLE public.message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL,
  channel public.message_channel NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL CHECK (length(emoji) BETWEEN 1 AND 8),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, channel, user_id, emoji)
);
GRANT SELECT, INSERT, DELETE ON public.message_reactions TO authenticated;
GRANT ALL ON public.message_reactions TO service_role;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reactions_select_auth" ON public.message_reactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "reactions_insert_own" ON public.message_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "reactions_delete_own" ON public.message_reactions FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX reactions_msg_idx ON public.message_reactions(message_id, channel);

-- BLOCKED USERS
CREATE TABLE public.blocked_users (
  blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
GRANT SELECT, INSERT, DELETE ON public.blocked_users TO authenticated;
GRANT ALL ON public.blocked_users TO service_role;
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blocks_select_own" ON public.blocked_users FOR SELECT USING (auth.uid() = blocker_id);
CREATE POLICY "blocks_insert_own" ON public.blocked_users FOR INSERT WITH CHECK (auth.uid() = blocker_id);
CREATE POLICY "blocks_delete_own" ON public.blocked_users FOR DELETE USING (auth.uid() = blocker_id);

-- HIDDEN MESSAGES (per-user hide / clear history)
CREATE TABLE public.hidden_messages (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id UUID NOT NULL,
  channel public.message_channel NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, message_id, channel)
);
GRANT SELECT, INSERT, DELETE ON public.hidden_messages TO authenticated;
GRANT ALL ON public.hidden_messages TO service_role;
ALTER TABLE public.hidden_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hidden_select_own" ON public.hidden_messages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "hidden_insert_own" ON public.hidden_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "hidden_delete_own" ON public.hidden_messages FOR DELETE USING (auth.uid() = user_id);

-- POST REVIEWS
CREATE TABLE public.post_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review TEXT CHECK (review IS NULL OR length(review) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_reviews TO authenticated;
GRANT SELECT ON public.post_reviews TO anon;
GRANT ALL ON public.post_reviews TO service_role;
ALTER TABLE public.post_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reviews_select_all" ON public.post_reviews FOR SELECT USING (true);
CREATE POLICY "reviews_insert_own" ON public.post_reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "reviews_update_own" ON public.post_reviews FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "reviews_delete_own" ON public.post_reviews FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX reviews_post_idx ON public.post_reviews(post_id, created_at);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_groups;
ALTER PUBLICATION supabase_realtime ADD TABLE public.post_reviews;
