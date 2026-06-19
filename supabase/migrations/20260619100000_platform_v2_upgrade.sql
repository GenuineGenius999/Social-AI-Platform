-- Platform v2: multi-image posts, admin delete, group visibility/cover, session geo

-- Multi-image posts (carousel stories)
CREATE TABLE IF NOT EXISTS public.post_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  storage_path TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS post_images_post_idx ON public.post_images(post_id, sort_order);
GRANT SELECT ON public.post_images TO anon, authenticated;
GRANT ALL ON public.post_images TO service_role;
ALTER TABLE public.post_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "post_images_select_all" ON public.post_images FOR SELECT USING (true);
CREATE POLICY "post_images_insert_own" ON public.post_images FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND p.user_id = auth.uid()));
CREATE POLICY "post_images_delete_own" ON public.post_images FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND p.user_id = auth.uid()));

-- Admins can delete any post
DROP POLICY IF EXISTS "posts_delete_admin" ON public.posts;
CREATE POLICY "posts_delete_admin" ON public.posts FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

-- Group visibility, cover, bio
ALTER TABLE public.chat_groups
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('public', 'private')),
  ADD COLUMN IF NOT EXISTS cover_url TEXT,
  ADD COLUMN IF NOT EXISTS bio TEXT;

-- Public groups discoverable by all authenticated users
DROP POLICY IF EXISTS "groups_select_public" ON public.chat_groups;
CREATE POLICY "groups_select_public" ON public.chat_groups FOR SELECT
  USING (visibility = 'public');

-- Allow users to join public groups themselves
DROP POLICY IF EXISTS "group_members_join_public" ON public.chat_group_members;
CREATE POLICY "group_members_join_public" ON public.chat_group_members FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.chat_groups g WHERE g.id = group_id AND g.visibility = 'public')
  );

-- Session geo tracking for admin
ALTER TABLE public.user_sessions
  ADD COLUMN IF NOT EXISTS ip_address TEXT,
  ADD COLUMN IF NOT EXISTS country_name TEXT;

-- Profile search index
CREATE INDEX IF NOT EXISTS profiles_username_idx ON public.profiles(username);
CREATE INDEX IF NOT EXISTS profiles_display_name_idx ON public.profiles(display_name);
