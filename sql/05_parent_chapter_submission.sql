-- Parent Chapter form support. Safe to run after the existing site_submissions migrations.

alter table public.site_submissions
  add column if not exists city_state text,
  add column if not exists school_district text,
  add column if not exists mailing_address text;

alter table public.site_submissions
  drop constraint if exists site_submissions_submission_type_check;

alter table public.site_submissions
  add constraint site_submissions_submission_type_check
  check (submission_type in ('newsletter', 'contact', 'parent_chapter'));
