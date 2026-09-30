-- Buckets de archivos en Supabase (logo público, fotos privadas). En otros Postgres no hace nada.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('publico', 'publico', true, 5242880, ARRAY['image/*']),
           ('fotos', 'fotos', false, 5242880, ARRAY['image/*'])
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;
