
-- 1) Tighten realtime.messages SELECT to user-owned topics only
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "authenticated only realtime messages" ON realtime.messages';
EXCEPTION WHEN insufficient_privilege OR undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  EXECUTE $p$
    CREATE POLICY "user-scoped realtime topics"
      ON realtime.messages FOR SELECT TO authenticated
      USING (
        auth.uid() IS NOT NULL
        AND (
          realtime.topic() = 'sync:' || (auth.uid())::text
          OR realtime.topic() = 'entitlement-' || (auth.uid())::text
        )
      )
  $p$;
EXCEPTION WHEN duplicate_object OR insufficient_privilege OR undefined_table THEN NULL;
END $$;

-- 2) feedback-screenshots: owner-scoped UPDATE + DELETE
DROP POLICY IF EXISTS "feedback uploads update (owner-scoped)" ON storage.objects;
CREATE POLICY "feedback uploads update (owner-scoped)" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'feedback-screenshots' AND (storage.foldername(name))[1] = (auth.uid())::text)
  WITH CHECK (bucket_id = 'feedback-screenshots' AND (storage.foldername(name))[1] = (auth.uid())::text);

DROP POLICY IF EXISTS "feedback uploads delete (owner-scoped)" ON storage.objects;
CREATE POLICY "feedback uploads delete (owner-scoped)" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'feedback-screenshots' AND (storage.foldername(name))[1] = (auth.uid())::text);
