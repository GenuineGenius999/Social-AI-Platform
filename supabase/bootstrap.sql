-- =============================================================================
-- KINETIK — ONE-CLICK DATABASE SETUP (fresh Supabase project)
-- Run this entire file in: Supabase Dashboard → SQL Editor → New query → Run
-- =============================================================================


-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  gender TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_gender_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_gender_check CHECK (gender IS NULL OR gender IN ('male','female','other'));
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_all" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  base_username TEXT;
  final_username TEXT;
  counter INT := 0;
BEGIN
  base_username := COALESCE(
    NEW.raw_user_meta_data->>'username',
    split_part(NEW.email, '@', 1),
    'user'
  );
  base_username := regexp_replace(lower(base_username), '[^a-z0-9_]', '', 'g');
  IF length(base_username) < 3 THEN base_username := 'user' || substr(NEW.id::text, 1, 6); END IF;
  final_username := base_username;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) LOOP
    counter := counter + 1;
    final_username := base_username || counter::text;
  END LOOP;
  INSERT INTO public.profiles (id, username, display_name, avatar_url, gender)
  VALUES (
    NEW.id,
    final_username,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', final_username),
    COALESCE(
      NEW.raw_user_meta_data->>'avatar_url',
      CASE
        WHEN lower(COALESCE(NEW.raw_user_meta_data->>'gender','')) = 'female'
          THEN 'https://i.postimg.cc/TwXFHVwW/d1776321-55e5-4c0f-aa56-754ce2798bfa.jpg'
        WHEN lower(COALESCE(NEW.raw_user_meta_data->>'gender','')) = 'male'
          THEN 'https://i.postimg.cc/tJkK6s9n/1c7c50c4-7292-4577-beb0-8bc7270f6c05.jpg'
        ELSE NULL
      END
    ),
    NULLIF(lower(COALESCE(NEW.raw_user_meta_data->>'gender','')), '')
  );
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- GENERATIONS (private gallery)
CREATE TABLE public.generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  image_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.generations TO authenticated;
GRANT ALL ON public.generations TO service_role;
ALTER TABLE public.generations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "generations_own" ON public.generations FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX generations_user_created ON public.generations(user_id, created_at DESC);

-- POSTS (public feed)
CREATE TABLE public.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  prompt TEXT,
  caption TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.posts TO authenticated;
GRANT SELECT ON public.posts TO anon;
GRANT ALL ON public.posts TO service_role;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "posts_select_all" ON public.posts FOR SELECT USING (true);
CREATE POLICY "posts_insert_own" ON public.posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "posts_update_own" ON public.posts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "posts_delete_own" ON public.posts FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX posts_created_idx ON public.posts(created_at DESC);

-- POST LIKES
CREATE TABLE public.post_likes (
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.post_likes TO authenticated;
GRANT SELECT ON public.post_likes TO anon;
GRANT ALL ON public.post_likes TO service_role;
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "likes_select_all" ON public.post_likes FOR SELECT USING (true);
CREATE POLICY "likes_insert_own" ON public.post_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "likes_delete_own" ON public.post_likes FOR DELETE USING (auth.uid() = user_id);

-- POST COMMENTS
CREATE TABLE public.post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_comments TO authenticated;
GRANT SELECT ON public.post_comments TO anon;
GRANT ALL ON public.post_comments TO service_role;
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comments_select_all" ON public.post_comments FOR SELECT USING (true);
CREATE POLICY "comments_insert_own" ON public.post_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "comments_delete_own" ON public.post_comments FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX comments_post_idx ON public.post_comments(post_id, created_at);

-- AI CONVERSATIONS
CREATE TABLE public.ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New conversation',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_conversations TO authenticated;
GRANT ALL ON public.ai_conversations TO service_role;
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_convs_own" ON public.ai_conversations FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER ai_convs_touch BEFORE UPDATE ON public.ai_conversations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- AI MESSAGES
CREATE TABLE public.ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_messages TO authenticated;
GRANT ALL ON public.ai_messages TO service_role;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_msgs_own" ON public.ai_messages FOR ALL
  USING (EXISTS (SELECT 1 FROM public.ai_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.ai_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()));
CREATE INDEX ai_msgs_conv_idx ON public.ai_messages(conversation_id, created_at);

-- GLOBAL MESSAGES (one shared chatroom)
CREATE TABLE public.global_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.global_messages TO authenticated;
GRANT ALL ON public.global_messages TO service_role;
ALTER TABLE public.global_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "global_msgs_select_auth" ON public.global_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "global_msgs_insert_own" ON public.global_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "global_msgs_delete_own" ON public.global_messages FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX global_msgs_created_idx ON public.global_messages(created_at DESC);

-- DIRECT MESSAGES (1:1)
CREATE TABLE public.direct_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 4000),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.direct_messages TO authenticated;
GRANT ALL ON public.direct_messages TO service_role;
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dm_select_party" ON public.direct_messages FOR SELECT
  USING (auth.uid() IN (sender_id, recipient_id));
CREATE POLICY "dm_insert_sender" ON public.direct_messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "dm_update_recipient" ON public.direct_messages FOR UPDATE
  USING (auth.uid() = recipient_id);
CREATE INDEX dm_pair_idx ON public.direct_messages(sender_id, recipient_id, created_at);
CREATE INDEX dm_recipient_idx ON public.direct_messages(recipient_id, created_at);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.global_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.post_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.post_likes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;

ALTER FUNCTION public.touch_updated_at() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;

-- STORAGE BUCKETS (must run before storage policies)


-- Ensure storage buckets exist for generated images and avatars
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('generated-images', 'generated-images', false, 10485760, ARRAY['image/png','image/jpeg','image/webp','image/gif']),
  ('avatars', 'avatars', false, 2097152, ARRAY['image/png','image/jpeg','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- generated-images bucket policies
CREATE POLICY "gi_select_auth" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'generated-images');
CREATE POLICY "gi_insert_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'generated-images' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "gi_update_own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'generated-images' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "gi_delete_own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'generated-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- avatars bucket policies
CREATE POLICY "av_select_auth" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars');
CREATE POLICY "av_insert_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "av_update_own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "av_delete_own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

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
-- Platform upgrade: admin, presence, API keys, settings

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE public.generations
  ADD COLUMN IF NOT EXISTS storage_path TEXT;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'generated',
  ADD COLUMN IF NOT EXISTS storage_path TEXT;

CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.app_settings TO service_role;

CREATE TABLE IF NOT EXISTS public.user_api_keys (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  openai_api_key TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.user_api_keys TO service_role;

CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  machine_id TEXT NOT NULL,
  machine_number INTEGER NOT NULL DEFAULT 1,
  os_name TEXT,
  os_version TEXT,
  user_agent TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, machine_id)
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_last_seen ON public.user_sessions(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON public.user_sessions(user_id);

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_sessions TO authenticated;
GRANT ALL ON public.user_sessions TO service_role;

CREATE POLICY "sessions_own" ON public.user_sessions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "sessions_admin_read" ON public.user_sessions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

CREATE POLICY "profiles_admin_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

-- Message soft-delete fixes
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'global_messages' AND policyname = 'global_msgs_update_own'
  ) THEN
    CREATE POLICY "global_msgs_update_own" ON public.global_messages
      FOR UPDATE TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'direct_messages' AND policyname = 'direct_msgs_update_sender'
  ) THEN
    CREATE POLICY "direct_msgs_update_sender" ON public.direct_messages
      FOR UPDATE TO authenticated
      USING (auth.uid() = sender_id)
      WITH CHECK (auth.uid() = sender_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  base_username TEXT;
  final_username TEXT;
  counter INT := 0;
  admin_flag BOOLEAN := false;
BEGIN
  IF NEW.email = 'admin@genai.com'
     OR lower(COALESCE(NEW.raw_user_meta_data->>'username', '')) = 'genaisocial' THEN
    admin_flag := true;
  END IF;

  base_username := COALESCE(
    NEW.raw_user_meta_data->>'username',
    split_part(NEW.email, '@', 1),
    'user'
  );
  base_username := regexp_replace(lower(base_username), '[^a-z0-9_]', '', 'g');
  IF length(base_username) < 3 THEN base_username := 'user' || substr(NEW.id::text, 1, 6); END IF;
  final_username := base_username;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) LOOP
    counter := counter + 1;
    final_username := base_username || counter::text;
  END LOOP;

  INSERT INTO public.profiles (id, username, display_name, avatar_url, is_admin)
  VALUES (
    NEW.id,
    final_username,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', final_username),
    NEW.raw_user_meta_data->>'avatar_url',
    admin_flag
  );
  RETURN NEW;
END;
$$;

UPDATE public.profiles p
SET is_admin = true
FROM auth.users u
WHERE p.id = u.id AND u.email = 'admin@genai.com';

-- =============================================================================
-- Messaging, notifications, reactions (20260612150000)
-- =============================================================================

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
