
-- Ensure storage buckets exist for generated images and avatars
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('generated-images', 'generated-images', false, 10485760, ARRAY['image/png','image/jpeg','image/webp','image/gif']),
  ('avatars', 'avatars', false, 2097152, ARRAY['image/png','image/jpeg','image/webp'])
ON CONFLICT (id) DO NOTHING;
