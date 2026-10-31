-- =====================================================================
--  Vallombrosan Benedictines Kottayam — CMS database schema (Supabase)
--  The database is the single source of truth for every word, menu item,
--  image and setting shown on the website.
--
--  Run once in Supabase: Dashboard → SQL Editor → paste → Run.
--  Then run seed.sql to load the initial content.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Roles
--   admin  : everything, including menu, settings and user roles
--   editor : add / change / delete content (sections, items, timetable,
--            events, news, gallery). Cannot change menu, settings or users.
--   (no role) : signed-in user without access; sees only the public site
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  role        text check (role in ('admin','editor')),
  created_at  timestamptz not null default now()
);

create or replace function public.current_role_name()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_editor()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('admin','editor') from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

-- New sign-ups get a profile with NO role. An admin grants a role.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- An admin may not remove the last admin (prevents lock-out).
create or replace function public.protect_last_admin()
returns trigger language plpgsql as $$
begin
  -- Serialise admin changes so two admins demoting each other at the same moment cannot leave none.
  perform pg_advisory_xact_lock(hashtext('osb_last_admin'));
  if (tg_op = 'DELETE' and old.role = 'admin') or
     (tg_op = 'UPDATE' and old.role = 'admin' and coalesce(new.role,'') <> 'admin') then
    if (select count(*) from public.profiles where role = 'admin' and id <> old.id) = 0 then
      raise exception 'At least one admin must remain';
    end if;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists profiles_protect_last_admin on public.profiles;
create trigger profiles_protect_last_admin before update or delete on public.profiles
  for each row execute function public.protect_last_admin();

-- ---------------------------------------------------------------------
-- Shared columns: every content row records when and by whom it changed.
-- Bilingual text is stored as jsonb: {"en": "...", "ml": "..."}
-- ---------------------------------------------------------------------
create or replace function public.touch_row()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

-- Site-wide settings (name, tagline, contact e-mail, theme, emblem opacity…)
create table if not exists public.site_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

-- Main menu. parent_id allows sub-menus.
create table if not exists public.menu_items (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references public.menu_items(id) on delete cascade,
  label       jsonb not null default '{}'::jsonb,
  target      text not null default '#',       -- '#section-slug' or full URL
  sort        int  not null default 0,
  visible     boolean not null default true,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

-- Page sections. "kind" picks the layout; everything else is content.
create table if not exists public.sections (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,            -- used for #anchors
  kind          text not null check (kind in
                ('hero','intro','tiles','story','stats','steps','horarium','events','members','creative',
                 'news','gallery','cards','contact','text')),
  eyebrow       jsonb not null default '{}'::jsonb,
  title         jsonb not null default '{}'::jsonb,
  body          jsonb not null default '{}'::jsonb,   -- rich text (HTML) per language
  image_url     text,
  image_caption jsonb not null default '{}'::jsonb,
  cta_label     jsonb not null default '{}'::jsonb,
  cta_link      text,
  settings      jsonb not null default '{}'::jsonb,   -- layout options
  sort          int  not null default 0,
  visible       boolean not null default true,
  updated_at    timestamptz not null default now(),
  updated_by    uuid
);

-- Repeating items inside a section (tiles, timeline years, houses,
-- formation stages, statistics, institutions, contact cards …)
create table if not exists public.section_items (
  id          uuid primary key default gen_random_uuid(),
  section_id  uuid not null references public.sections(id) on delete cascade,
  label       jsonb not null default '{}'::jsonb,   -- short mark: year, number, numeral
  title       jsonb not null default '{}'::jsonb,
  body        jsonb not null default '{}'::jsonb,
  image_url   text,
  link        text,
  extra       jsonb not null default '{}'::jsonb,   -- phone, e-mail, etc.
  sort        int  not null default 0,
  visible     boolean not null default true,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);
create index if not exists section_items_section_idx on public.section_items(section_id, sort);

-- Daily timetable (Horarium). Times are monastery time (Asia/Kolkata).
create table if not exists public.horarium (
  id          uuid primary key default gen_random_uuid(),
  name        jsonb not null default '{}'::jsonb,
  note        jsonb not null default '{}'::jsonb,
  start_time  time not null,
  end_time    time not null,
  days        int[] not null default '{0,1,2,3,4,5,6}',   -- 0 = Sunday
  is_prayer   boolean not null default true,
  sort        int  not null default 0,
  visible     boolean not null default true,
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  constraint horarium_times check (end_time > start_time)
);

-- Feasts and events
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  title       jsonb not null default '{}'::jsonb,
  description jsonb not null default '{}'::jsonb,
  location    jsonb not null default '{}'::jsonb,
  category    text not null default 'event' check (category in ('feast','event','retreat','ordination','jubilee')),
  starts_on   date not null,
  ends_on     date,
  time_label  text,                                  -- e.g. "6:30 am"
  repeats_yearly boolean not null default false,     -- feasts that fall on the same date every year
  image_url   text,
  published   boolean not null default true,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);
create index if not exists events_starts_idx on public.events(starts_on);
alter table public.events add column if not exists repeats_yearly boolean not null default false;

-- Links may only be web, e-mail, phone or on-site addresses (blocks javascript: and similar).
create or replace function public.is_safe_link(u text)
returns boolean language sql immutable as $$
  select u is null or u ~* '^(https?://|mailto:|tel:)' or u ~ '^#[A-Za-z0-9_-]*$' or u ~ '^/[^/]'
$$;
do $$ begin
  alter table public.sections      drop constraint if exists sections_cta_link_safe;
  alter table public.sections      add  constraint sections_cta_link_safe check (public.is_safe_link(cta_link));
  alter table public.section_items drop constraint if exists section_items_link_safe;
  alter table public.section_items add  constraint section_items_link_safe check (public.is_safe_link(link));
  alter table public.menu_items    drop constraint if exists menu_items_target_safe;
  alter table public.menu_items    add  constraint menu_items_target_safe check (public.is_safe_link(target));
end $$;

-- News & announcements
create table if not exists public.posts (
  id            uuid primary key default gen_random_uuid(),
  title         jsonb not null default '{}'::jsonb,
  excerpt       jsonb not null default '{}'::jsonb,
  body          jsonb not null default '{}'::jsonb,
  cover_url     text,
  published_on  date not null default current_date,
  published     boolean not null default true,
  pinned        boolean not null default false,
  updated_at    timestamptz not null default now(),
  updated_by    uuid
);

-- Gallery
create table if not exists public.albums (
  id          uuid primary key default gen_random_uuid(),
  title       jsonb not null default '{}'::jsonb,
  description jsonb not null default '{}'::jsonb,
  cover_url   text,
  sort        int  not null default 0,
  published   boolean not null default true,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

create table if not exists public.media_items (
  id          uuid primary key default gen_random_uuid(),
  album_id    uuid not null references public.albums(id) on delete cascade,
  kind        text not null default 'image' check (kind in ('image','video')),
  url         text,                -- image URL (Supabase Storage)
  youtube_id  text,                -- for videos
  caption     jsonb not null default '{}'::jsonb,
  sort        int  not null default 0,
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  constraint media_has_source check ((kind = 'image' and url is not null) or (kind = 'video' and youtube_id is not null))
);
create index if not exists media_album_idx on public.media_items(album_id, sort);

-- Section types added after the first release (existing databases keep their content)
do $$
begin
  alter table public.sections drop constraint if exists sections_kind_check;
  alter table public.sections add constraint sections_kind_check check (kind in
    ('hero','intro','tiles','story','stats','steps','horarium','events','members','creative','news','gallery','cards','contact','text','members','creative'));
end $$;

-- Welcome verses: one is shown at random on the welcome screen (a visitor's first visit each day)
create table if not exists public.verses (
  id          uuid primary key default gen_random_uuid(),
  text        jsonb not null default '{}'::jsonb,   -- {"en": "...", "ml": "..."}
  reference   jsonb not null default '{}'::jsonb,   -- e.g. {"en": "Psalm 119:164 · Rule of St. Benedict, ch. 16"}
  sort        int  not null default 0,
  published   boolean not null default true,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);
-- starting verses (added only while the list is empty)
insert into public.verses (text, reference, sort)
select v.t, v.r, v.s from (values
  ('{"en":"It is high time for us to arise from sleep."}'::jsonb, '{"en":"Romans 13:11 · Prologue of the Rule of St. Benedict"}'::jsonb, 10),
  ('{"en":"If you hear his voice today, do not harden your hearts."}'::jsonb, '{"en":"Psalm 95:8 · Prologue of the Rule of St. Benedict"}'::jsonb, 20),
  ('{"en":"Sustain me, O Lord, according to your promise, that I may live; and do not disappoint me in my hope."}'::jsonb, '{"en":"Psalm 119:116 · the Suscipe, Rule of St. Benedict, ch. 58"}'::jsonb, 30),
  ('{"en":"Seven times a day have I praised you."}'::jsonb, '{"en":"Psalm 119:164 · Rule of St. Benedict, ch. 16"}'::jsonb, 40)
) v(t, r, s)
where not exists (select 1 from public.verses);

-- updated_at / updated_by triggers
do $$
declare t text;
begin
  foreach t in array array['site_settings','menu_items','sections','section_items','horarium','events','posts','albums','media_items','verses'] loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before insert or update on public.%I for each row execute function public.touch_row()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.site_settings enable row level security;
alter table public.menu_items    enable row level security;
alter table public.sections      enable row level security;
alter table public.section_items enable row level security;
alter table public.horarium      enable row level security;
alter table public.events        enable row level security;
alter table public.posts         enable row level security;
alter table public.albums        enable row level security;
alter table public.media_items   enable row level security;
alter table public.verses        enable row level security;

-- profiles: each user reads their own; admins read and manage all
drop policy if exists profiles_self_read  on public.profiles;
drop policy if exists profiles_admin_all  on public.profiles;
create policy profiles_self_read on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy profiles_admin_all on public.profiles for all   using (public.is_admin()) with check (public.is_admin());

-- site_settings & menu: public read, admin write
drop policy if exists settings_read  on public.site_settings;
drop policy if exists settings_admin on public.site_settings;
create policy settings_read  on public.site_settings for select using (true);
create policy settings_admin on public.site_settings for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists menu_read  on public.menu_items;
drop policy if exists menu_admin on public.menu_items;
create policy menu_read  on public.menu_items for select using (visible or public.is_editor());
create policy menu_admin on public.menu_items for all using (public.is_admin()) with check (public.is_admin());

-- content tables: public reads visible/published rows; editors read and write everything
do $$
declare
  t text; flag text;
begin
  for t, flag in select * from (values
      ('sections','visible'), ('horarium','visible'),
      ('events','published'), ('posts','published'), ('albums','published'), ('verses','published')) v(t, flag)
  loop
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format('drop policy if exists %I_edit on public.%I', t, t);
    execute format('create policy %I_read on public.%I for select using (%I or public.is_editor())', t, t, flag);
    execute format('create policy %I_edit on public.%I for all using (public.is_editor()) with check (public.is_editor())', t, t);
  end loop;
end $$;

-- Page structure lock: sections can be edited but not added, deleted or retyped from the website
drop policy if exists sections_edit   on public.sections;
drop policy if exists sections_update on public.sections;
create policy sections_update on public.sections for update using (public.is_editor()) with check (public.is_editor());
-- no insert or delete policy: adding and deleting sections is refused from the website

create or replace function public.protect_sections()
returns trigger language plpgsql as $$
begin
  if auth.uid() is null then return new; end if;   -- SQL Editor / maintenance scripts
  if new.kind is distinct from old.kind or new.slug is distinct from old.slug then
    raise exception 'The type and link name of a section are fixed.';
  end if;
  if new.sort is distinct from old.sort then
    if not public.is_admin() then raise exception 'Only an admin can change the order of the sections.'; end if;
    if old.kind = 'intro' or new.sort <= coalesce((select min(sort) from public.sections where kind = 'intro' and id <> new.id), new.sort - 1) then
      raise exception 'The opening scene stays at the top of the page.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists sections_protect on public.sections;
create trigger sections_protect before update on public.sections for each row execute function public.protect_sections();

-- section items are public only when both the item and its section are visible
drop policy if exists section_items_read on public.section_items;
drop policy if exists section_items_edit on public.section_items;
create policy section_items_read on public.section_items for select using (
  public.is_editor() or (visible and exists (select 1 from public.sections s where s.id = section_id and s.visible)));
create policy section_items_edit on public.section_items for all using (public.is_editor()) with check (public.is_editor());

-- media items follow their album's visibility
drop policy if exists media_items_read on public.media_items;
drop policy if exists media_items_edit on public.media_items;
create policy media_items_read on public.media_items for select using (
  public.is_editor() or exists (select 1 from public.albums a where a.id = album_id and a.published));
create policy media_items_edit on public.media_items for all using (public.is_editor()) with check (public.is_editor());

-- ---------------------------------------------------------------------
-- Grants for Supabase API roles
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function public.is_editor(), public.is_admin(), public.current_role_name(), public.is_safe_link(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- File storage: one public bucket "media" for photos.
-- Anyone can view; only editors can upload, replace or delete.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do update set public = true;

drop policy if exists media_public_read  on storage.objects;
drop policy if exists media_editor_write on storage.objects;
drop policy if exists media_editor_update on storage.objects;
drop policy if exists media_editor_delete on storage.objects;
-- The bucket is public, so photos open by their address without this rule; listing files is limited to editors.
create policy media_public_read   on storage.objects for select to authenticated using (bucket_id = 'media' and public.is_editor());
create policy media_editor_write  on storage.objects for insert to authenticated with check (bucket_id = 'media' and public.is_editor());
create policy media_editor_update on storage.objects for update to authenticated using (bucket_id = 'media' and public.is_editor());
create policy media_editor_delete on storage.objects for delete to authenticated using (bucket_id = 'media' and public.is_editor());

-- ---------------------------------------------------------------------
-- Change history: the previous version of every row is kept whenever it is
-- changed or deleted, so editors can restore earlier versions and deleted
-- items. Rows deleted together (e.g. a section and its items) share tx_id.
-- Written only by the trigger; nobody can edit or delete history.
-- ---------------------------------------------------------------------
create table if not exists public.content_history (
  id           bigint generated always as identity primary key,
  table_name   text not null,
  row_pk       text not null,
  action       text not null check (action in ('update','delete')),
  old_row      jsonb not null,
  tx_id        bigint not null,
  changed_at   timestamptz not null default now(),
  changed_by   uuid,
  changed_by_email text
);
create index if not exists content_history_row_idx on public.content_history(table_name, row_pk, changed_at desc);
create index if not exists content_history_deleted_idx on public.content_history(action, changed_at desc);

create or replace function public.record_history()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  pk text := coalesce(to_jsonb(old)->>'id', to_jsonb(old)->>'key');
begin
  -- skip updates that change nothing but the timestamps
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'updated_at' - 'updated_by') = (to_jsonb(old) - 'updated_at' - 'updated_by') then
    return new;
  end if;
  insert into public.content_history(table_name, row_pk, action, old_row, tx_id, changed_by, changed_by_email)
  values (tg_table_name, pk, lower(tg_op), to_jsonb(old), txid_current(), auth.uid(),
          (select email from public.profiles where id = auth.uid()));
  -- keep two years of history (cleaned up now and then)
  if random() < 0.01 then
    delete from public.content_history where changed_at < now() - interval '2 years';
  end if;
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['site_settings','menu_items','sections','section_items','horarium','events','posts','albums','media_items','verses','profiles'] loop
    execute format('drop trigger if exists %I_history on public.%I', t, t);
    execute format('create trigger %I_history after update or delete on public.%I for each row execute function public.record_history()', t, t);
  end loop;
end $$;

alter table public.content_history enable row level security;
drop policy if exists history_read on public.content_history;
-- editors see the history of content; menu, settings and user changes only admins
create policy history_read on public.content_history for select using (
  public.is_admin() or (public.is_editor() and table_name not in ('site_settings','menu_items','profiles')));
revoke all on public.content_history from anon;
grant select on public.content_history to authenticated;

-- ---------------------------------------------------------------------
-- Content version: one number that goes up whenever any public content
-- changes (save, delete, restore, undo). Visitors' browsers compare it with
-- their saved copy, so a saved edit is never hidden behind an old copy.
-- ---------------------------------------------------------------------
create table if not exists public.site_meta (
  id               int primary key default 1 check (id = 1),
  content_version  bigint not null default 1,
  changed_at       timestamptz not null default now()
);
insert into public.site_meta (id) values (1) on conflict (id) do nothing;

create or replace function public.bump_content_version()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.site_meta set content_version = content_version + 1, changed_at = now() where id = 1;
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['site_settings','menu_items','sections','section_items','horarium','events','posts','albums','media_items','verses'] loop
    execute format('drop trigger if exists %I_version on public.%I', t, t);
    execute format('create trigger %I_version after insert or update or delete on public.%I for each statement execute function public.bump_content_version()', t, t);
    execute format('drop trigger if exists %I_version_truncate on public.%I', t, t);
    execute format('create trigger %I_version_truncate after truncate on public.%I for each statement execute function public.bump_content_version()', t, t);
  end loop;
end $$;

alter table public.site_meta enable row level security;
drop policy if exists site_meta_read on public.site_meta;
create policy site_meta_read on public.site_meta for select using (true);
grant select on public.site_meta to anon, authenticated;

-- Running this file changes the database layout, so tell visitors' browsers to fetch fresh content.
update public.site_meta set content_version = content_version + 1, changed_at = now() where id = 1;
