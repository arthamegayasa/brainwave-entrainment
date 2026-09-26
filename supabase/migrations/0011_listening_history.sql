-- Listening History (#10; ADR-017): every Play and every MP3 Download of a
-- signed-in User. The app records them on the device (the Listening core in
-- src/state/listening.ts) and inserts them here directly; offline ones wait
-- in a queue on the device and are sent later.
--
-- Ids are generated on the device, so a re-send after a lost response is an
-- insert that conflicts on the id and is ignored (on conflict do nothing):
-- never a second row. Each row keeps a snapshot of the audio (kind, id, name,
-- emoji, band), so renamed or deleted audio still reads correctly, and the
-- device's IANA time zone. Rows are deleted with the account.
--
-- Access: a User inserts and reads their own rows; a Clinician reads the rows
-- of their linked Patients while they hold the Clinician role (the same
-- is_clinician() gate as the profile rule of 0005, so an Inactive Clinician
-- loses access); the Admin reads everything. No client updates or deletes
-- rows.

-- ── Plays ───────────────────────────────────────────────────────────────────
-- One playback of a Preset, Custom Audio, or a session saved on the device
-- ('saved'), played for at least 30 seconds outside the Studio. listened_sec
-- excludes pauses; planned_min is null for an open-ended (∞) session, which is
-- the only kind whose outcome is 'open'.
create table public.plays (
  id           uuid primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  audio_kind   text not null check (audio_kind in ('preset', 'custom', 'saved')),
  audio_id     text not null,
  audio_name   text not null,
  audio_emoji  text,
  audio_band   text check (audio_band in ('delta', 'theta', 'alpha', 'beta', 'gamma')),
  started_at   timestamptz not null,
  ended_at     timestamptz not null,
  listened_sec integer not null check (listened_sec >= 30),
  planned_min  integer check (planned_min > 0),
  outcome      text not null check (outcome in ('completed', 'stopped', 'open')),
  time_zone    text not null,
  created_at   timestamptz not null default now(),
  constraint plays_ends_after_start check (ended_at >= started_at),
  constraint plays_open_iff_open_ended check ((outcome = 'open') = (planned_min is null))
);

create index plays_user_started_at_idx on public.plays (user_id, started_at desc);

-- ── Downloads ───────────────────────────────────────────────────────────────
-- One Download: the MP3 of a Preset from the session setup, or of Custom
-- Audio from the Audio Bank. Heard outside the app, so there is no listening
-- time.
create table public.downloads (
  id            uuid primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  audio_kind    text not null check (audio_kind in ('preset', 'custom')),
  audio_id      text not null,
  audio_name    text not null,
  audio_emoji   text,
  audio_band    text check (audio_band in ('delta', 'theta', 'alpha', 'beta', 'gamma')),
  length_min    integer not null check (length_min > 0),
  downloaded_at timestamptz not null,
  time_zone     text not null,
  created_at    timestamptz not null default now()
);

create index downloads_user_downloaded_at_idx on public.downloads (user_id, downloaded_at desc);

-- ── Row level security ──────────────────────────────────────────────────────
alter table public.plays enable row level security;
alter table public.downloads enable row level security;

-- Clients only insert and read: no update or delete privilege at all, so a
-- recorded Play can never be changed or removed from the browser. created_at
-- is when the server received the row, so clients cannot set it.
revoke all on public.plays, public.downloads from anon, authenticated;
grant select on public.plays, public.downloads to authenticated;
grant insert (id, user_id, audio_kind, audio_id, audio_name, audio_emoji, audio_band,
              started_at, ended_at, listened_sec, planned_min, outcome, time_zone)
  on public.plays to authenticated;
grant insert (id, user_id, audio_kind, audio_id, audio_name, audio_emoji, audio_band,
              length_min, downloaded_at, time_zone)
  on public.downloads to authenticated;

create policy "user records own plays"
  on public.plays for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "user reads own plays"
  on public.plays for select
  to authenticated
  using (user_id = auth.uid());

create policy "clinician reads own patients' plays"
  on public.plays for select
  to authenticated
  using (
    public.is_clinician()
    and exists (
      select 1 from public.patient_links pl
      where pl.clinician_id = auth.uid() and pl.patient_id = plays.user_id
    )
  );

create policy "admin reads all plays"
  on public.plays for select
  to authenticated
  using (public.is_admin());

create policy "user records own downloads"
  on public.downloads for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "user reads own downloads"
  on public.downloads for select
  to authenticated
  using (user_id = auth.uid());

create policy "clinician reads own patients' downloads"
  on public.downloads for select
  to authenticated
  using (
    public.is_clinician()
    and exists (
      select 1 from public.patient_links pl
      where pl.clinician_id = auth.uid() and pl.patient_id = downloads.user_id
    )
  );

create policy "admin reads all downloads"
  on public.downloads for select
  to authenticated
  using (public.is_admin());
