## Goal

Web Clipper ka full-page HTML fetch synchronous edge call se hata ke background job (pgmq + pg_cron worker) pe le jaana. User ko instant "Fetching…" card milega, jab snapshot ready ho tab realtime se card khud complete ho jayega — koi browser/edge timeout nahi.

## User-facing flow

1. User `Save` press karta hai.
2. Instantly ek "pending" note create hoti hai — title = URL ka host, body mein `⏳ Fetching full page in background…` card.
3. Toast: *"Clip queued — we'll notify you when it's ready."*
4. User navigate away kar sakta hai, doosri clip bhi start kar sakta hai.
5. Worker background mein fetch complete karta hai (raw HTML + inlined assets, existing `fetch-article` logic reuse).
6. Realtime `UPDATE` fire hone pe: note body swap ho jaati hai finalized snapshot iframe + offline banner ke saath. `.html` download bhi trigger hota hai agar tab open hai.
7. Failure case: card red banner dikhata hai "Couldn't capture — retry" button ke saath.

## Architecture

```text
Client                 DB (pgmq + tables)              Worker (edge fn on cron)
──────                 ──────────────────              ────────────────────────
Save click ─► enqueue_clip_job() ──► pgmq.q_web_clips ─► process-web-clips
             insert pending note                          (reads batch, calls
                    │                                      existing fetch-article
                    ▼                                      logic inline, updates
             web_clip_jobs row (status=pending)            note + job row)
                    │                                              │
                    │◄──── realtime UPDATE on notes ───────────────┘
```

## Database changes (one migration)

- New table `public.web_clip_jobs`:
  - `id`, `user_id`, `note_id` (FK notes), `url`, `status` (`pending`/`processing`/`done`/`failed`), `attempts`, `error_code`, `error_message`, `bytes`, `finished_at`, timestamps.
  - RLS: user apni jobs read/insert kar sake; worker service_role se update.
- `public.enqueue_web_clip_job(p_note_id uuid, p_url text)` SECURITY DEFINER function — inserts job row + `pgmq.send('web_clips', payload)`. Client sirf yehi RPC call karega.
- `public.web_clips_dispatch()` — same pattern as existing `email_queue_dispatch`: reads queue, POSTs to `process-web-clips` edge fn, arm/disarm cron via `web_clips_wake` trigger.
- pg_cron job `process-web-clips` every 10s (self-unschedules jab queue empty).

## Edge function: `process-web-clips`

- Reads pgmq batch (size 3, visibility 300s).
- For each msg: mark job `processing` → run existing `fetch-article` fetch/inline pipeline (extract shared helpers from `supabase/functions/fetch-article/index.ts` into `_shared/fetchArticle.ts`) → on success `UPDATE notes SET body = <final markup>, payload = jsonb_set(..., 'clipStatus', 'done')` + job `done` + `pgmq.delete`.
- On failure after 3 attempts: move to DLQ, job `failed`, note body updated with error card.
- Hard wall-clock per job: **5 minutes** (matches user's ceiling). Beyond that → job failed with `timeout` code.

## Client changes (`src/pages/WebClipper.tsx` + new hook)

- New helper `enqueueClipJob(url, meta)` — creates pending note (via existing `saveNoteToDBSingle`) with placeholder body, then calls `supabase.rpc('enqueue_web_clip_job', {...})`.
- Save handler for `fullpage` mode: replace the whole `shouldFetchFull` block with `enqueueClipJob(...)`, close the clipper, toast success.
- New `useWebClipJobs()` hook: subscribes to `postgres_changes` on `web_clip_jobs` (filter `user_id=eq.<uid>`) — on `done` shows toast "Snapshot ready", on `failed` shows error toast with retry.
- Notes list / editor: pending notes render a `<ClipPendingCard/>` (spinner + "Capturing…") based on `payload.clipStatus`. Once realtime UPDATE fires, note re-renders with real snapshot.
- Retry path: failed card ka button re-calls `enqueue_web_clip_job` for same note.

## Files to touch

- `supabase/functions/_shared/fetchArticle.ts` — extract reusable fetch/inline core from existing `fetch-article/index.ts`.
- `supabase/functions/fetch-article/index.ts` — thin wrapper around shared core (backwards compat).
- `supabase/functions/process-web-clips/index.ts` — new worker.
- migration: `web_clip_jobs`, RPCs, dispatch/wake fn, cron job.
- `src/pages/WebClipper.tsx` — swap fullpage path to enqueue.
- `src/hooks/useWebClipJobs.ts` — new realtime hook, mounted in app root or Notes layout.
- `src/components/notes/ClipPendingCard.tsx` — pending/failed UI in note body renderer.
- i18n keys added to `src/i18n/locales/en.json`.

## What stays the same

- Existing `fetch-article` edge function still deployed (native/legacy callers). Sync path just becomes unused by clipper.
- Snapshot rendering, offline banner, `.html` download, blob iframe embedding — all reused as-is once worker writes final body.
- Web clip cache (`getCachedClip`) stays as belt-and-suspenders for offline read.

## Out of scope

- Live progress %  (only status transitions pending → done/failed).
- Non-fullpage modes (already fast, no queue needed).
- Retry backoff tuning beyond 3 attempts.

Confirm karo toh implement kar deta hoon.