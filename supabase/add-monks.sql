-- Monks section (November 2026). Run ONCE in Supabase → SQL Editor.
-- Safe to run again: it never duplicates the section, the 39 monks or the menu link,
-- and it never overwrites anything you have edited since.
--  • allows the new section type "monks"
--  • adds the section "Monks" after "The Vallombrosan community in India" (position 35)
--  • adds the monks of St. Mary's Sui Juris Priory, Mariamala, in the order of the catalogue
--  • adds "Monks" to the main menu, after "Leadership"
-- Dates of birth are deliberately NOT stored: the database is readable by the public.
begin;

alter table public.sections drop constraint if exists sections_kind_check;
alter table public.sections add constraint sections_kind_check check (kind in
  ('hero','intro','tiles','story','stats','steps','horarium','events','news','gallery','cards','contact','text','members','creative','monks'));

do $$
declare sec uuid;
begin
  select id into sec from public.sections where slug = 'monks';
  if sec is null then
    insert into public.sections (slug, kind, eyebrow, title, body, settings, sort, visible)
    values ('monks', 'monks', '{"en": "St. Mary''s Sui Juris Priory, Mariamala", "ml": "സെന്റ് മേരീസ് സുയി യൂറിസ് പ്രയറി, മരിയമല"}'::jsonb, '{"en": "Monks", "ml": "സന്യാസിമാർ"}'::jsonb, '{"en": "<p>Thiruvampady P.O, SKPS Road, Kaduthuruthy, Kottayam – 686612</p><p>Phone: 04829-263759, 265010 · Mobile: 9447464111</p>", "ml": ""}'::jsonb, '{"limit": 48}'::jsonb, 35, true)
    returning id into sec;
  end if;

  if not exists (select 1 from public.section_items where section_id = sec) then
    insert into public.section_items (section_id, label, title, extra, sort, visible) values
      (sec, '{"en": "", "ml": ""}'::jsonb, '{"en": "Fr. Michael Kannala", "ml": ""}'::jsonb, '{"profession": "1994-12-14", "ordination": "1998-12-28"}'::jsonb, 10, true),
      (sec, '{"en": "", "ml": ""}'::jsonb, '{"en": "Fr. Shaji Padinjarakunnel", "ml": ""}'::jsonb, '{"profession": "1995-12-06", "ordination": "1999-12-27", "late": true}'::jsonb, 20, true),
      (sec, '{"en": "", "ml": ""}'::jsonb, '{"en": "Fr. Tomy Thervalakattayil", "ml": ""}'::jsonb, '{"profession": "1995-12-05", "ordination": "1994-12-27"}'::jsonb, 30, true),
      (sec, '{"en": "", "ml": ""}'::jsonb, '{"en": "Fr. Jinsho Thottathikuzhy", "ml": ""}'::jsonb, '{"profession": "1995-12-06", "ordination": "1999-12-27"}'::jsonb, 40, true),
      (sec, '{"en": "", "ml": ""}'::jsonb, '{"en": "Fr. Boby Pannoorayil", "ml": ""}'::jsonb, '{"profession": "1995-12-06", "ordination": "1999-12-27"}'::jsonb, 50, true),
      (sec, '{"en": "", "ml": ""}'::jsonb, '{"en": "Fr. Philip Kochuparambil", "ml": ""}'::jsonb, '{"profession": "2000-04-21", "ordination": "2005-04-18"}'::jsonb, 60, true),
      (sec, '{"en": "", "ml": ""}'::jsonb, '{"en": "Fr. Saji Mekkattel", "ml": ""}'::jsonb, '{"profession": "2000-04-25", "ordination": "2005-01-27"}'::jsonb, 70, true),
      (sec, '{"en": "", "ml": ""}'::jsonb, '{"en": "Fr. Joby Pannoorayil", "ml": ""}'::jsonb, '{"profession": "2000-07-12", "ordination": "2005-01-27"}'::jsonb, 80, true),
      (sec, '{"en": "", "ml": ""}'::jsonb, '{"en": "Fr. Joby Mupprappallil", "ml": ""}'::jsonb, '{"profession": "2001-06-10", "ordination": "2006-01-30"}'::jsonb, 90, true),
      (sec, '{"en": "", "ml": ""}'::jsonb, '{"en": "Fr. Bino Cheriyil", "ml": ""}'::jsonb, '{"profession": "2001-06-10", "ordination": "2006-01-30"}'::jsonb, 100, true),
      (sec, '{"en": "", "ml": ""}'::jsonb, '{"en": "Fr. Sinto Njarolickal", "ml": ""}'::jsonb, '{"profession": "2001-06-10", "ordination": "2006-01-30"}'::jsonb, 110, true),
      (sec, '{"en": "", "ml": ""}'::jsonb, '{"en": "Fr. Ajeesh Kunjarakkattu", "ml": ""}'::jsonb, '{"profession": "2001-06-10", "ordination": "2006-01-30"}'::jsonb, 120, true),
      (sec, '{"en": "", "ml": ""}'::jsonb, '{"en": "Fr. Smijo Theradiyel", "ml": ""}'::jsonb, '{"profession": "2003-07-12", "ordination": "2008-01-12"}'::jsonb, 130, true),
      (sec, '{"en": "", "ml": ""}'::jsonb, '{"en": "Fr. Biju Vallarkattil", "ml": ""}'::jsonb, '{"profession": "2003-07-12", "ordination": "2008-01-14"}'::jsonb, 140, true),
      (sec, '{"en": "", "ml": ""}'::jsonb, '{"en": "Fr. Jince Puthupallimyalil", "ml": ""}'::jsonb, '{"profession": "2003-07-12", "ordination": "2008-01-15"}'::jsonb, 150, true),
      (sec, '{"en": "", "ml": ""}'::jsonb, '{"en": "Fr. Sabu Vellarimattathil", "ml": ""}'::jsonb, '{"profession": "2004-07-11", "ordination": "2010-12-27"}'::jsonb, 160, true),
      (sec, '{"en": "Vice-prior", "ml": "വൈസ് പ്രയർ"}'::jsonb, '{"en": "Fr. Stephen Kozhimparampath", "ml": ""}'::jsonb, '{"profession": "2006-05-22", "ordination": "2012-12-29"}'::jsonb, 170, true),
      (sec, '{"en": "Superior", "ml": "സുപ്പീരിയർ"}'::jsonb, '{"en": "Fr. Thomas Chanaparayil", "ml": ""}'::jsonb, '{"profession": "2006-05-22", "ordination": "2012-12-28"}'::jsonb, 180, true),
      (sec, '{"en": "", "ml": ""}'::jsonb, '{"en": "Fr. Jibin Keecheril", "ml": ""}'::jsonb, '{"profession": "2006-05-22", "ordination": "2012-12-28"}'::jsonb, 190, true),
      (sec, '{"en": "", "ml": ""}'::jsonb, '{"en": "Fr. Shinto Valiyaparambil", "ml": ""}'::jsonb, '{"profession": "2006-05-22", "ordination": "2012-12-28"}'::jsonb, 200, true),
      (sec, '{"en": "", "ml": ""}'::jsonb, '{"en": "Fr. Aneesh Kalapurackal", "ml": ""}'::jsonb, '{"profession": "2008-07-12", "ordination": "2012-12-28"}'::jsonb, 210, true),
      (sec, '{"en": "", "ml": ""}'::jsonb, '{"en": "Fr. Jerry Peedikaveliyil", "ml": ""}'::jsonb, '{"profession": "2008-07-12", "ordination": "2012-12-28"}'::jsonb, 220, true),
      (sec, '{"en": "", "ml": ""}'::jsonb, '{"en": "Fr. Joseph Puthuparambil", "ml": ""}'::jsonb, '{"profession": "2009-05-22", "ordination": "2014-05-24"}'::jsonb, 230, true),
      (sec, '{"en": "", "ml": ""}'::jsonb, '{"en": "Fr. Sanoop Kaithakkanirappel", "ml": ""}'::jsonb, '{"profession": "2009-05-22", "ordination": "2014-05-12"}'::jsonb, 240, true),
      (sec, '{"en": "", "ml": ""}'::jsonb, '{"en": "Fr. Vineesh Tharayil", "ml": ""}'::jsonb, '{"profession": "2011-05-23", "ordination": "2016-01-14"}'::jsonb, 250, true),
      (sec, '{"en": "", "ml": ""}'::jsonb, '{"en": "Fr. Ullas Valamparambil", "ml": ""}'::jsonb, '{"profession": "2011-05-23", "ordination": "2016-01-13"}'::jsonb, 260, true),
      (sec, '{"en": "", "ml": ""}'::jsonb, '{"en": "Fr. Dhaneesh Kosakuzhiyil", "ml": ""}'::jsonb, '{"profession": "2013-05-15", "ordination": "2019-01-21"}'::jsonb, 270, true),
      (sec, '{"en": "", "ml": ""}'::jsonb, '{"en": "Fr. Nibin Peedathattel", "ml": ""}'::jsonb, '{"profession": "2013-05-15", "ordination": "2017-08-12"}'::jsonb, 280, true),
      (sec, '{"en": "", "ml": ""}'::jsonb, '{"en": "Fr. Sargan Kalayil", "ml": ""}'::jsonb, '{"profession": "2014-05-22", "ordination": "2019-01-21"}'::jsonb, 290, true),
      (sec, '{"en": "", "ml": ""}'::jsonb, '{"en": "Fr. Nidhin Ozhankal", "ml": ""}'::jsonb, '{"profession": "2014-05-22", "ordination": "2021-06-29"}'::jsonb, 300, true),
      (sec, '{"en": "", "ml": ""}'::jsonb, '{"en": "Fr. Anto Moolakkattu", "ml": ""}'::jsonb, '{"profession": "2014-05-22", "ordination": "2021-06-29"}'::jsonb, 310, true),
      (sec, '{"en": "", "ml": ""}'::jsonb, '{"en": "Fr. Jelit Onasseril", "ml": ""}'::jsonb, '{"profession": "2015-05-20", "ordination": "2020-01-02"}'::jsonb, 320, true),
      (sec, '{"en": "", "ml": ""}'::jsonb, '{"en": "Fr. John Thazhappillil", "ml": ""}'::jsonb, '{"profession": "2016-05-18", "ordination": "2020-11-28"}'::jsonb, 330, true),
      (sec, '{"en": "", "ml": ""}'::jsonb, '{"en": "Fr. Siby Kaniyampara", "ml": ""}'::jsonb, '{"profession": "2016-05-18", "ordination": "2021-06-30"}'::jsonb, 340, true),
      (sec, '{"en": "", "ml": ""}'::jsonb, '{"en": "Fr. Jithin Thekkekarottu", "ml": ""}'::jsonb, '{"profession": "2018-05-31", "ordination": "2023-04-11"}'::jsonb, 350, true),
      (sec, '{"en": "", "ml": ""}'::jsonb, '{"en": "Fr. Jithin Valloor", "ml": ""}'::jsonb, '{"profession": "2018-05-31", "ordination": "2024-01-02"}'::jsonb, 360, true),
      (sec, '{"en": "", "ml": ""}'::jsonb, '{"en": "Fr. Aswin Manalel", "ml": ""}'::jsonb, '{"profession": "2018-05-31", "ordination": "2023-04-13"}'::jsonb, 370, true),
      (sec, '{"en": "", "ml": ""}'::jsonb, '{"en": "Fr. Albin Puthenparambil", "ml": ""}'::jsonb, '{"profession": "2018-05-31", "ordination": "2024-01-04"}'::jsonb, 380, true),
      (sec, '{"en": "", "ml": ""}'::jsonb, '{"en": "Fr. Arun Thadathil", "ml": ""}'::jsonb, '{"profession": "2018-05-31", "ordination": "2024-01-03"}'::jsonb, 390, true);
  end if;

  if not exists (select 1 from public.menu_items where target = '#monks') then
    insert into public.menu_items (label, target, sort, visible)
    values ('{"en": "Monks", "ml": "സന്യാസിമാർ"}'::jsonb, '#monks', 15, true);
  end if;
end $$;

commit;

-- Check (should show 1 section, 39 monks, 1 menu link):
select (select count(*) from public.sections where kind = 'monks') as sections,
       (select count(*) from public.section_items i join public.sections s on s.id = i.section_id where s.kind = 'monks') as monks,
       (select count(*) from public.menu_items where target = '#monks') as menu_links;
