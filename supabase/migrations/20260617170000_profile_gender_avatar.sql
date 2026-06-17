-- Profile gender + default avatar support

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gender TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_gender_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_gender_check CHECK (gender IS NULL OR gender IN ('male','female','other'));
  END IF;
END $$;

-- Backfill gender from auth metadata if present
UPDATE public.profiles p
SET gender = COALESCE(p.gender, u.raw_user_meta_data->>'gender')
FROM auth.users u
WHERE u.id = p.id AND (u.raw_user_meta_data ? 'gender');

-- Default avatars by gender when none set
UPDATE public.profiles
SET avatar_url = CASE
  WHEN lower(COALESCE(gender, '')) = 'female' THEN 'https://i.postimg.cc/TwXFHVwW/d1776321-55e5-4c0f-aa56-754ce2798bfa.jpg'
  WHEN lower(COALESCE(gender, '')) = 'male' THEN 'https://i.postimg.cc/tJkK6s9n/1c7c50c4-7292-4577-beb0-8bc7270f6c05.jpg'
  ELSE avatar_url
END
WHERE avatar_url IS NULL;

-- Ensure new signups get gender + default avatar
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  base_username TEXT;
  final_username TEXT;
  counter INT := 0;
  g TEXT;
  av TEXT;
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

  g := NULLIF(lower(COALESCE(NEW.raw_user_meta_data->>'gender','')), '');
  av := NEW.raw_user_meta_data->>'avatar_url';
  IF av IS NULL THEN
    IF g = 'female' THEN
      av := 'https://i.postimg.cc/TwXFHVwW/d1776321-55e5-4c0f-aa56-754ce2798bfa.jpg';
    ELSIF g = 'male' THEN
      av := 'https://i.postimg.cc/tJkK6s9n/1c7c50c4-7292-4577-beb0-8bc7270f6c05.jpg';
    END IF;
  END IF;

  INSERT INTO public.profiles (id, username, display_name, avatar_url, gender)
  VALUES (
    NEW.id,
    final_username,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', final_username),
    av,
    g
  );
  RETURN NEW;
END;
$$;

