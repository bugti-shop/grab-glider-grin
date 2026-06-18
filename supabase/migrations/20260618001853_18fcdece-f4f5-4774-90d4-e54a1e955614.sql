
-- =========================================================================
-- Phase 1: Invisible Sync Foundation
-- =========================================================================

-- Shared updated_at trigger function (reused across all tables)
CREATE OR REPLACE FUNCTION public.sync_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =========================================================================
-- folders
-- =========================================================================
CREATE TABLE public.folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  icon text,
  parent_folder_id uuid REFERENCES public.folders(id) ON DELETE SET NULL,
  order_index double precision NOT NULL DEFAULT 0,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.folders TO authenticated;
GRANT ALL ON public.folders TO service_role;
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "folders_owner_all" ON public.folders FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER folders_set_updated_at BEFORE UPDATE ON public.folders
  FOR EACH ROW EXECUTE FUNCTION public.sync_set_updated_at();
CREATE INDEX idx_folders_user_updated ON public.folders(user_id, updated_at);

-- =========================================================================
-- lists
-- =========================================================================
CREATE TABLE public.lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  icon text,
  folder_id uuid REFERENCES public.folders(id) ON DELETE SET NULL,
  order_index double precision NOT NULL DEFAULT 0,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lists TO authenticated;
GRANT ALL ON public.lists TO service_role;
ALTER TABLE public.lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lists_owner_all" ON public.lists FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER lists_set_updated_at BEFORE UPDATE ON public.lists
  FOR EACH ROW EXECUTE FUNCTION public.sync_set_updated_at();
CREATE INDEX idx_lists_user_updated ON public.lists(user_id, updated_at);

-- =========================================================================
-- sections
-- =========================================================================
CREATE TABLE public.sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  order_index double precision NOT NULL DEFAULT 0,
  list_id uuid REFERENCES public.lists(id) ON DELETE SET NULL,
  folder_id uuid REFERENCES public.folders(id) ON DELETE SET NULL,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sections TO authenticated;
GRANT ALL ON public.sections TO service_role;
ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sections_owner_all" ON public.sections FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER sections_set_updated_at BEFORE UPDATE ON public.sections
  FOR EACH ROW EXECUTE FUNCTION public.sync_set_updated_at();
CREATE INDEX idx_sections_user_updated ON public.sections(user_id, updated_at);

-- =========================================================================
-- notes
-- =========================================================================
CREATE TABLE public.notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text,
  body text,
  folder_id uuid REFERENCES public.folders(id) ON DELETE SET NULL,
  list_id uuid REFERENCES public.lists(id) ON DELETE SET NULL,
  is_pinned boolean NOT NULL DEFAULT false,
  tags text[] NOT NULL DEFAULT '{}',
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notes TO authenticated;
GRANT ALL ON public.notes TO service_role;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notes_owner_all" ON public.notes FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER notes_set_updated_at BEFORE UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.sync_set_updated_at();
CREATE INDEX idx_notes_user_updated ON public.notes(user_id, updated_at);

-- =========================================================================
-- note_versions
-- =========================================================================
CREATE TABLE public.note_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note_id uuid NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  body_snapshot text,
  saved_at timestamptz NOT NULL DEFAULT now(),
  device_id text,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.note_versions TO authenticated;
GRANT ALL ON public.note_versions TO service_role;
ALTER TABLE public.note_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "note_versions_owner_all" ON public.note_versions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER note_versions_set_updated_at BEFORE UPDATE ON public.note_versions
  FOR EACH ROW EXECUTE FUNCTION public.sync_set_updated_at();
CREATE INDEX idx_note_versions_user_updated ON public.note_versions(user_id, updated_at);
CREATE INDEX idx_note_versions_note ON public.note_versions(note_id);

-- =========================================================================
-- tasks
-- =========================================================================
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  due_date timestamptz,
  is_completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  priority smallint NOT NULL DEFAULT 0,
  list_id uuid REFERENCES public.lists(id) ON DELETE SET NULL,
  parent_task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
  order_index double precision NOT NULL DEFAULT 0,
  notes text,
  reminder_at timestamptz,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tasks_owner_all" ON public.tasks FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER tasks_set_updated_at BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.sync_set_updated_at();
CREATE INDEX idx_tasks_user_updated ON public.tasks(user_id, updated_at);
CREATE INDEX idx_tasks_list ON public.tasks(list_id);
CREATE INDEX idx_tasks_parent ON public.tasks(parent_task_id);

-- =========================================================================
-- habits
-- =========================================================================
CREATE TABLE public.habits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  frequency text NOT NULL DEFAULT 'daily',
  frequency_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  current_streak integer NOT NULL DEFAULT 0,
  longest_streak integer NOT NULL DEFAULT 0,
  color text,
  icon text,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.habits TO authenticated;
GRANT ALL ON public.habits TO service_role;
ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "habits_owner_all" ON public.habits FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER habits_set_updated_at BEFORE UPDATE ON public.habits
  FOR EACH ROW EXECUTE FUNCTION public.sync_set_updated_at();
CREATE INDEX idx_habits_user_updated ON public.habits(user_id, updated_at);

-- =========================================================================
-- habit_logs
-- =========================================================================
CREATE TABLE public.habit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  habit_id uuid NOT NULL REFERENCES public.habits(id) ON DELETE CASCADE,
  completed_on date NOT NULL,
  note text,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.habit_logs TO authenticated;
GRANT ALL ON public.habit_logs TO service_role;
ALTER TABLE public.habit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "habit_logs_owner_all" ON public.habit_logs FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER habit_logs_set_updated_at BEFORE UPDATE ON public.habit_logs
  FOR EACH ROW EXECUTE FUNCTION public.sync_set_updated_at();
CREATE INDEX idx_habit_logs_user_updated ON public.habit_logs(user_id, updated_at);
CREATE INDEX idx_habit_logs_habit ON public.habit_logs(habit_id, completed_on);

-- =========================================================================
-- habit_certificates
-- =========================================================================
CREATE TABLE public.habit_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  habit_id uuid NOT NULL REFERENCES public.habits(id) ON DELETE CASCADE,
  milestone integer NOT NULL,
  earned_at timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.habit_certificates TO authenticated;
GRANT ALL ON public.habit_certificates TO service_role;
ALTER TABLE public.habit_certificates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "habit_certificates_owner_all" ON public.habit_certificates FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER habit_certificates_set_updated_at BEFORE UPDATE ON public.habit_certificates
  FOR EACH ROW EXECUTE FUNCTION public.sync_set_updated_at();
CREATE INDEX idx_habit_certificates_user_updated ON public.habit_certificates(user_id, updated_at);

-- =========================================================================
-- user_settings
-- =========================================================================
CREATE TABLE public.user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  theme text NOT NULL DEFAULT 'system',
  language text NOT NULL DEFAULT 'en',
  notification_preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  display_options jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_day_of_week smallint NOT NULL DEFAULT 0,
  date_format text NOT NULL DEFAULT 'YYYY-MM-DD',
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_settings TO authenticated;
GRANT ALL ON public.user_settings TO service_role;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_settings_owner_all" ON public.user_settings FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER user_settings_set_updated_at BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.sync_set_updated_at();

-- =========================================================================
-- subscription_status
-- =========================================================================
CREATE TABLE public.subscription_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_name text NOT NULL DEFAULT 'free',
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT false,
  store text,
  store_transaction_id text,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_status TO authenticated;
GRANT ALL ON public.subscription_status TO service_role;
ALTER TABLE public.subscription_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscription_status_owner_all" ON public.subscription_status FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER subscription_status_set_updated_at BEFORE UPDATE ON public.subscription_status
  FOR EACH ROW EXECUTE FUNCTION public.sync_set_updated_at();
CREATE INDEX idx_subscription_status_user_updated ON public.subscription_status(user_id, updated_at);

-- =========================================================================
-- file_attachments
-- =========================================================================
CREATE TABLE public.file_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_type text NOT NULL,
  parent_id uuid NOT NULL,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  thumbnail_path text,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.file_attachments TO authenticated;
GRANT ALL ON public.file_attachments TO service_role;
ALTER TABLE public.file_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "file_attachments_owner_all" ON public.file_attachments FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER file_attachments_set_updated_at BEFORE UPDATE ON public.file_attachments
  FOR EACH ROW EXECUTE FUNCTION public.sync_set_updated_at();
CREATE INDEX idx_file_attachments_user_updated ON public.file_attachments(user_id, updated_at);
CREATE INDEX idx_file_attachments_parent ON public.file_attachments(parent_type, parent_id);

-- =========================================================================
-- device_registry
-- =========================================================================
CREATE TABLE public.device_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  platform text NOT NULL,
  push_token text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_sync_timestamp timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_registry TO authenticated;
GRANT ALL ON public.device_registry TO service_role;
ALTER TABLE public.device_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "device_registry_owner_all" ON public.device_registry FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER device_registry_set_updated_at BEFORE UPDATE ON public.device_registry
  FOR EACH ROW EXECUTE FUNCTION public.sync_set_updated_at();

-- =========================================================================
-- Realtime publication
-- =========================================================================
ALTER TABLE public.folders             REPLICA IDENTITY FULL;
ALTER TABLE public.lists               REPLICA IDENTITY FULL;
ALTER TABLE public.sections            REPLICA IDENTITY FULL;
ALTER TABLE public.notes               REPLICA IDENTITY FULL;
ALTER TABLE public.note_versions       REPLICA IDENTITY FULL;
ALTER TABLE public.tasks               REPLICA IDENTITY FULL;
ALTER TABLE public.habits              REPLICA IDENTITY FULL;
ALTER TABLE public.habit_logs          REPLICA IDENTITY FULL;
ALTER TABLE public.habit_certificates  REPLICA IDENTITY FULL;
ALTER TABLE public.user_settings       REPLICA IDENTITY FULL;
ALTER TABLE public.subscription_status REPLICA IDENTITY FULL;
ALTER TABLE public.file_attachments    REPLICA IDENTITY FULL;
ALTER TABLE public.device_registry     REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.folders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lists;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sections;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.note_versions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.habits;
ALTER PUBLICATION supabase_realtime ADD TABLE public.habit_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.habit_certificates;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_settings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.subscription_status;
ALTER PUBLICATION supabase_realtime ADD TABLE public.file_attachments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.device_registry;

-- =========================================================================
-- Storage: user-attachments bucket policies (bucket itself created via tool)
-- Per-user folder: {user_id}/...
-- =========================================================================
CREATE POLICY "user_attachments_select_own"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'user-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "user_attachments_insert_own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'user-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "user_attachments_update_own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'user-attachments' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'user-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "user_attachments_delete_own"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'user-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
