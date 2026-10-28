# Recovery guide

Keep a printed copy of this page with the church's records, together with:
- the Supabase login (use a church e-mail address, not a personal one);
- the Supabase **database password** (step 1 of the README);
- the GitHub login for the website's repository;
- the **backup password** (`BACKUP_PASSWORD`, README step 9).

At least two trusted people should have access to these accounts.

---

## A. The database is paused or not answering
**Signs:** GitHub e-mails *"Daily snapshot failed"*, or editors can't sign in. Visitors still see the website, from the last daily copy, but changes can't be made.

1. Sign in at **supabase.com** and open the project.
2. If it says the project is paused, click **Restore project**. This takes a few minutes. Nothing is lost.
3. In GitHub, open **Actions → Daily snapshot → Run workflow** and check it shows a green tick.

A paused free project can be restored for up to a year. If it has been longer, or the project was deleted, go to **B**.

## B. Restore everything into a new Supabase project
You need: the latest backup file (`backup-YYYY-MM-DD.7z`, from **Actions → Weekly backup → Artifacts**, or your own saved copy) and the backup password.

1. **Open the backup** with 7-Zip (Windows) or Keka (Mac) and the backup password. Inside are `schema.sql`, `data.sql`, `users.csv`, `full.sql` and a `photos` folder.
2. **Create the new project:** follow README steps 1 and 3. Note its new **Project URL** (`https://xxxx.supabase.co`).
3. **Fix the photo addresses:** open `data.sql` in a text editor (Notepad, TextEdit), use **Find and Replace** to change every old project address (for example `https://oldoldold.supabase.co`) to the new one, and save. The old address is in `assets/js/config.js` on GitHub.
4. **Create the tables:** in the new project's **SQL Editor**, paste the whole of `schema.sql` from the backup and click **Run**. Do **not** run `seed.sql`.
5. **Load the content:** in a new query, paste the whole of `data.sql` and click **Run**. This brings back all content, hidden drafts and change history.
   If the file is too big for the SQL Editor, someone with `psql` installed can run:
   `psql "<session pooler connection string>" -v ON_ERROR_STOP=1 -f data.sql`
6. **Photos:** in **Storage → media**, drag in the folders that are inside the backup's `photos` folder, keeping the same folder names.
7. **People:** follow README step 4 for the first admin, then invite everyone in `users.csv` (README step 7) and give each the role shown in the file.
8. **Connect the website:** README step 5 (new URL and anon key in `assets/js/config.js`, and the URL configuration), then update the `SUPABASE_DB_URL` secret (README step 9).
9. Run **Daily snapshot** and **Weekly backup** once each from the **Actions** tab.

## C. Something was deleted or changed by mistake
Use the website first: **Undo**, the **History** button on each item, or **Dashboard → Recently deleted** (kept two years). A backup restore (B) is only for losing the whole database.

## D. Moving to another provider later
The website is built so the database can be replaced without redesigning the site:
- All content is standard PostgreSQL. `full.sql` in any backup loads into any PostgreSQL service.
- All database access is in one file, `assets/js/store.js`. A move means rewriting that file for the new service (sign-in, reading, saving, photo upload) and moving the photos. The pages, editor, photo frames and design stay as they are.
- The daily copies in the repository (`snapshot.json` and the photo copies) keep the public website readable during a move.

This is a job for a developer: give them this page and the latest backup.
