-- Portal update (October 2026). Run ONCE in Supabase → SQL Editor, AFTER running the latest schema.sql.
-- Safe to run again: it only sets the layout below. It keeps all text, photos and users.
--  • adds the opening scene (statue and verse) at the top of the page
--  • puts "Shepherds of the community" first, with the Archbishop large in the centre
--  • then the community in India, then the institutions
--  • hides the former opening photo of Mariamala (kept: it can be shown again in the dashboard)
--  • new line under the site name, and "Leadership" first in the menu
begin;

-- opening scene
insert into public.sections (slug, kind, title, sort, visible)
select 'opening', 'intro', '{"en":"Welcome","ml":"സ്വാഗതം"}'::jsonb, 0, true
where not exists (select 1 from public.sections where kind = 'intro');

-- order of the page
update public.sections s set sort = o.sort
from (values ('opening',10),('leadership',20),('india',30),('highlights',40),('today',50),('heritage',60),('mariamala',70),
             ('home',80),('houses',90),('community',100),('italy',110),('spirituality',120),('horarium',130),('formation',140),
             ('ministries',150),('pastoral',160),('calendar',170),('news',180),('gallery',190),('contact',200)) o(slug, sort)
where s.slug = o.slug;

-- the former opening photo (Mariamala) is hidden, not deleted
update public.sections set visible = false where slug = 'home' and kind = 'hero';

-- leadership: the Archbishop first, shown large in the centre
update public.sections set settings = coalesce(settings, '{}'::jsonb) || '{"feature_first": true, "photo": "portrait"}'::jsonb where slug = 'leadership';
update public.section_items i set sort = (select coalesce(min(x.sort), 10) - 10 from public.section_items x where x.section_id = i.section_id)
where i.section_id = (select id from public.sections where slug = 'leadership')
  and (i.image_url ilike '%archbishop%' or i.title->>'en' ilike 'Mar Mathew%')
  and i.sort > (select min(x.sort) from public.section_items x where x.section_id = i.section_id);

-- line under the site name (Malayalam left empty until it is written; the English is shown meanwhile)
update public.site_settings
set value = jsonb_set(value, '{subtitle}', '{"en":"O.S.B. · Vallombrosan Benedictine Congregation · India","ml":""}'::jsonb)
where key = 'site';

-- menu: "Leadership" first
insert into public.menu_items (label, target, sort, visible)
select '{"en":"Leadership","ml":"നേതൃത്വം"}'::jsonb, '#leadership', coalesce((select min(sort) from public.menu_items where parent_id is null), 10) - 10, true
where not exists (select 1 from public.menu_items where target = '#leadership');

commit;

-- Check: the first five sections should be opening, leadership, india, highlights, today.
select slug, kind, visible from public.sections order by sort limit 5;
