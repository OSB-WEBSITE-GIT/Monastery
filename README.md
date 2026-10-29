# Vallombrosan Benedictines Kottayam: website and CMS

Every word, menu item, photo, timetable entry, event, news post and setting on this website comes from the database (Supabase). The database is the single source of truth. The website files contain only the design and the code that reads the database.

## What's in this folder

This folder is the complete, ready-to-publish website. Upload it as it is; nothing needs to be built.

| Path | What it is |
|---|---|
| `index.html` | The website |
| `assets/css/` | Design (`site.css`) and editing tools (`editor.css`) |
| `assets/js/config.js` | **The only file you edit to connect the database** |
| `assets/js/store.js` | Reads and writes the database |
| `assets/js/site.js` | Draws the public website |
| `assets/js/editor.js` | Sign-in, on-page editing, dashboard |
| `assets/js/photo.js` | Photo frames: shapes per screen size, minimum sizes, focus and zoom |
| `assets/js/photo-adjust.js` | The Adjust photo window |
| `assets/js/undo.js` | The Undo bar |
| `assets/js/history-ui.js` | History and Recently deleted screens |
| `assets/js/cache.js` | Visitor cache: shows saved content when nothing has changed, or when the database is unavailable |
| `assets/data/seed.json` | Starting content, used **only** by the offline demo |
| `supabase/schema.sql` | Creates the tables, roles and security rules |
| `supabase/seed.sql` | Loads the starting content into the database |
| `.github/workflows/daily-snapshot.yml` | Daily job: keeps the database awake, saves a public copy of the content and photos |
| `.github/workflows/weekly-backup.yml` | Weekly job: full encrypted backup |
| `RECOVERY.md` | What to do if the database is paused, lost, or the community moves to another provider |

Files the daily job creates by itself (do not edit them): `assets/data/snapshot.json`, `assets/data/mirror.json`, `assets/img/mirror/` and `assets/vendor/`.

## Going live (about 20 minutes, one time)

### 1. Create the database
1. Sign up at **supabase.com** and click **New project**.
2. Name it (for example `osb-kottayam`), set a strong database password and keep it safe, and choose the region **South Asia (Mumbai)**.
3. Wait for the project to finish starting.

### 2. Create the tables and load the content
1. In Supabase, open **SQL Editor → New query**.
2. Paste the whole of `supabase/schema.sql` and click **Run**.
3. Open a new query, paste the whole of `supabase/seed.sql` and click **Run**.

> Running `seed.sql` again **replaces all content** with the starting content. Do it only once.

### 3. Turn off public sign-ups
Go to **Authentication → Providers → Email** (or **Authentication → Sign In / Up**) and turn off **Allow new users to sign up**. From then on, only people you invite can get an account.

### 4. Create the first admin
1. Go to **Authentication → Users → Add user → Create new user**. Enter your e-mail and a password, and tick **Auto confirm user**.
2. In **SQL Editor**, run this once, using your own e-mail:
   ```sql
   update public.profiles set role = 'admin' where email = 'you@example.com';
   ```
From then on, you manage everyone else's roles inside the website under **Dashboard → Users & roles**.

### 5. Connect the website
1. In Supabase, open **Project Settings → API** and copy the **Project URL** and the **anon public** key.
2. Open `assets/js/config.js` and paste them in:
   ```js
   supabaseUrl: "https://xxxx.supabase.co",
   supabaseAnonKey: "eyJ...",
   ```
   The anon key is meant to be public. The security rules in the database decide what it can do.
3. In Supabase, open **Authentication → URL Configuration**:
   - Set **Site URL** to the website's address, for example `https://your-name.github.io/osb-kottayam/`.
   - Add the same address under **Redirect URLs**.

   Invitation and password-reset e-mails send people back to this address, where the website asks them to choose a password.

### 6. Publish on GitHub Pages
1. Open this folder and select **everything inside it**: `index.html`, `README.md`, `RECOVERY.md`, `.nojekyll`, and the `assets`, `supabase` and `.github` folders. `.nojekyll` may be hidden; on Windows, turn on **View → Show → Hidden items**.
2. Drag them into the repository's **Add file → Upload files** page, replacing the old files, and click **Commit changes**.
3. Turn on **Settings → Pages → Deploy from a branch → main / (root)**.

Upload the folder's contents, not the folder itself: `index.html` must be at the top level of the repository. Include the `.github` folder (also hidden on some computers); it holds the daily and weekly jobs (steps 8 and 9).

### 7. Add the people who will edit
1. In Supabase, go to **Authentication → Users → Add user → Send invitation** and enter their e-mail.
2. They appear at once in the website's **Dashboard → Users & roles** with *No access*. Choose **Editor** or **Admin** for them.
3. They open the e-mail, click the link, and the website asks them to choose a password. After that they sign in with their e-mail and password.

Anyone who forgets their password can use **Forgot password?** on the sign-in screen.

### 8. Turn on the daily snapshot
Free Supabase projects are paused after a week without activity. The **Daily snapshot** job runs every morning and:
- asks the database for its content version, which keeps it awake;
- saves a copy of all public content to `assets/data/snapshot.json`, and copies of uploaded photos to `assets/img/mirror/`.

Visitors are served from these copies when nothing has changed, which is faster and saves the free plan's limits. If the database is ever paused or unreachable, the website keeps showing the last copy instead of going blank. Editors always work on live data, and a saved change reaches visitors at once.

1. After uploading, open the repository's **Actions** tab. If GitHub asks, click **I understand my workflows, go ahead and enable them**.
2. Open **Daily snapshot → Run workflow** once and check it shows a green tick. It adds a commit with the copies.

If the database stops answering, the job fails and GitHub e-mails the repository owner. Open the Supabase dashboard and click **Restore project** (see `RECOVERY.md`). If the job fails with a permission error, open **Settings → Actions → General → Workflow permissions**, choose **Read and write permissions** and save.

### 9. Turn on the weekly backup
The free plan has no backups, so the **Weekly backup** job makes one every Sunday at about 2 am (India time): all content, drafts, change history, the list of users and roles, and every photo, in one file locked with a password. Each backup is kept for 90 days.

1. In Supabase, click **Connect** (top of the project page) and copy the **Session pooler** connection string. Replace `[YOUR-PASSWORD]` with the database password from step 1.
2. In GitHub, open **Settings → Secrets and variables → Actions → New repository secret** and add two secrets:
   - `SUPABASE_DB_URL`: the connection string from step 1.
   - `BACKUP_PASSWORD`: a new long password that locks the backups. **Write it down and keep it with the church's records.** Without it, a backup can't be opened, and it can't be recovered.
3. Open **Actions → Weekly backup → Run workflow** once and check it shows a green tick.

To download a backup: **Actions → Weekly backup →** pick a run **→ Artifacts → website-backup**. Open it with 7-Zip (Windows) or Keka (Mac) and the backup password. `RECOVERY.md` explains how to restore it.

## Updating the database later
If you receive a newer `schema.sql`, you can run it again in the SQL Editor at any time: it keeps all content and users and only adds the new rules. **Do not** run `seed.sql` again, because it replaces all content.


**Portal update (October 2026):** after running the new `schema.sql`, run `supabase/update-portal.sql` once. It adds the opening scene, puts *Shepherds of the community* first (the Archbishop large, in the centre), then the community in India and then the institutions, hides the former Mariamala opening photo (it can be shown again), changes the line under the site name and adds **Leadership** to the menu. It keeps all text, photos and users.
## Everyday use
- **Sign in:** use the **Sign in** link at the very bottom of the page, or add `#admin` to the end of the address.
- **Edit page:** shows a **✎ Edit this section** button on every section, which opens that section in the dashboard. Photos are changed on the page itself with **Photo…** and **Adjust**. Text is not typed on the page.
- **Screen size:** editing works on screens at least 1024 px wide (laptop, desktop or large tablet). On phones you can sign in and set a password, but not edit.
- **Language:** the **En / Ma** switch at the top right changes the language visitors see. In the dashboard, English and Malayalam are edited side by side.
- **Dashboard:** forms for everything, each with **Save** and **Cancel**; closing (the red **✕**, Esc, or another tab) asks first if something is not saved; with English and Malayalam side by side: page sections, menu, daily timetable, feasts and events, news, gallery albums, site settings and users.
- **Photos:** each place a photo appears has a fixed frame shape that adapts to phone, tablet and laptop, so the page layout never changes whatever photo is uploaded. After uploading, the **Adjust photo** window opens: drag the photo and use the zoom slider to choose what shows in the frame, checking the phone, tablet and laptop previews. The original photo is never cut, so you can re-adjust at any time with **Adjust**. Gallery photos always open in full. Photos are resized automatically for fast loading. If a photo is too small, or zoomed in too far, the editor warns you and says what size is needed.
- **Opening scene:** every time the website opens, the silver statue of St. John Gualbert before the crucifix appears with one verse (picked at random) and an open Bible below it; the statue slowly turns from silver to gold as soft rays of light appear, the verse turns gold on a grey panel, and then the header and menu fade in above it. The page moves on only when the visitor scrolls. **Home ›** (after 4 seconds) skips to the end. Signed-in editors see the end straight away.
  - The verses are in **Dashboard → Welcome verses** (also **✎ Edit verses** on the scene in edit mode): add, change, hide or remove them, and add Malayalam when it is available.
  - Settings at the top of `assets/css/intro.css`: `--intro-slow` (speed: 1 = quick, 1.6 = 60% slower, 2 = twice as slow), `--intro-rays` (strength of the light rays) and `--intro-panel` (colour of the panel behind the golden verse). The scene's files are only `intro.js`, `intro.css` and `assets/img/intro/`, so changing it never touches the rest of the site.
  - To hide the scene, open its section (**Opening scene**) in **Dashboard → Page sections** and untick **Visible to visitors**.
  - The two statue pictures are in `assets/img/intro/`; `tools/make_intro.py` makes them from the originals in `tools/source-intro/`.
- **People sections (cards):** in a section's **Layout**, tick **Show the first item large, in the centre** to feature one person, as for the Archbishop under *Shepherds of the community*.
- **Feasts:** tick **Repeats every year on this date** so a feast appears every year without being entered again.
- **Videos:** paste a YouTube link into a gallery album.

## Undo, history and recently deleted
- **Save means publish:** visitors see a change as soon as it is saved. To prepare something privately, keep a news post, event or album unpublished, or **Hide** a section or item until it is ready.
- **Undo:** after any change, a bar at the top of the screen offers **Undo** for 10 seconds.
- **History:** every item in the dashboard has a **History** button that lists its earlier versions, who changed them and when, with **Restore this version**. Site settings have their own History buttons.
- **Recently deleted:** anything deleted, such as a section with all its items, can be brought back from **Dashboard → Recently deleted**.
- History is kept for two years. Editors see the history of content; menu, settings and user changes are visible to admins only.

## Roles
| | Admin | Editor | No role |
|---|---|---|---|
| Change text, photos, sections, timetable, events, news, gallery | ✓ | ✓ | |
| Change menu and site settings | ✓ | | |
| Give or remove roles | ✓ | | |
| View the public site | ✓ | ✓ | ✓ |

The database enforces these rules, not just the website, so they can't be bypassed. The system always keeps at least one admin.

## Backups and recovery
- **Daily:** a public copy of the content and photos in the repository (step 8).
- **Weekly:** a full encrypted backup, kept 90 days (step 9). Download one now and then and keep it somewhere safe as well.
- **Undo and history** inside the website cover everyday mistakes.

`RECOVERY.md` is the one-page guide for a paused database, restoring a backup, or moving to another provider.
