-- Run this migration if public.site_submissions was already created using the
-- earlier schema. It is safe to run more than once.

alter table public.site_submissions
  add column if not exists notification_status text not null default 'pending',
  add column if not exists notified_at timestamptz,
  add column if not exists notification_error text;

create index if not exists site_submissions_notification_status_idx
  on public.site_submissions (notification_status, created_at desc);
