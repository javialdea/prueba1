-- Add audio_storage_path column to audio_jobs table
ALTER TABLE audio_jobs
  ADD COLUMN IF NOT EXISTS audio_storage_path TEXT;

-- Create audio-files storage bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('audio-files', 'audio-files', false)
ON CONFLICT (id) DO NOTHING;

-- RLS: Users can upload their own audio files
DROP POLICY IF EXISTS "Users can upload own audio files" ON storage.objects;
CREATE POLICY "Users can upload own audio files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'audio-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- RLS: Users can read their own audio files
DROP POLICY IF EXISTS "Users can read own audio files" ON storage.objects;
CREATE POLICY "Users can read own audio files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'audio-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- RLS: Users can delete their own audio files
DROP POLICY IF EXISTS "Users can delete own audio files" ON storage.objects;
CREATE POLICY "Users can delete own audio files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'audio-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
