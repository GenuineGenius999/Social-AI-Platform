
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
