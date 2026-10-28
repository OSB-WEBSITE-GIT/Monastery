// Daily snapshot (run by .github/workflows/daily-snapshot.yml). Node 18+, no packages needed.
//  1. Reads the content version: this request is also what keeps the free database awake.
//     If the database does not answer, the script fails and GitHub e-mails the repository owner.
//  2. Saves all public content to assets/data/snapshot.json (only when the version has changed).
//  3. Copies photos uploaded through the editor into assets/img/mirror/ and lists them in assets/data/mirror.json,
//     so visitors get them from GitHub and they stay visible if the database is ever unavailable.
//  4. Keeps a copy of the database library in assets/vendor/ (if missing).
// Usage: node .github/scripts/snapshot.mjs [siteRoot]
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.argv[2] || ".");
const TABLES = ["site_settings", "menu_items", "sections", "section_items", "horarium", "events", "posts", "albums", "media_items"];
const LIB = { file: "assets/vendor/supabase-js-2.45.4.js", url: "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js" };

const cfgText = fs.readFileSync(path.join(ROOT, "assets/js/config.js"), "utf8");
const val = (k) => (cfgText.match(new RegExp(k + '\\s*:\\s*"([^"]*)"')) || [])[1] || "";
const URL_ = val("supabaseUrl").replace(/\/+$/, ""), KEY = val("supabaseAnonKey");
if (!URL_ || !KEY) { console.log("Not connected to a database yet (config.js is empty). Nothing to do."); process.exit(0); }

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };
async function getJSON(p, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(`${URL_}${p}`, { headers, signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${p}`);
      return await r.json();
    } catch (e) {
      if (i >= tries) throw e;
      console.log(`Attempt ${i} failed (${e.message}); retrying in 30 s`); await new Promise((r) => setTimeout(r, 30000));
    }
  }
}
const write = (rel, data) => { const f = path.join(ROOT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); };
const readJSON = (rel) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8")); } catch { return null; } };

// 1. version (wake-up call). Read first, so the snapshot is never newer-labelled than its content.
let version;
try { version = Number((await getJSON("/rest/v1/site_meta?select=content_version&id=eq.1"))[0].content_version); }
catch (e) {
  console.error(`::error::The database did not answer (${e.message}). It may be paused: open the Supabase dashboard and click Restore project. The website keeps showing the last snapshot meanwhile.`);
  process.exit(1);
}
console.log("Database answered. Content version", version);

// 2. snapshot of public content
const old = readJSON("assets/data/snapshot.json");
const db = {};
for (const t of TABLES) db[t] = await getJSON(`/rest/v1/${t}?select=*`);
if (!old || old.version !== version) {
  write("assets/data/snapshot.json", JSON.stringify({ version, generated_at: new Date().toISOString(), db }));
  console.log("Snapshot updated.");
} else console.log("Content unchanged since the last snapshot.");

// 3. photo mirror
const PREFIX = `${URL_}/storage/v1/object/public/media/`, LOCAL = "assets/img/mirror/";
const found = new Set();
JSON.stringify(db).replace(/"(https?:[^"]+)"/g, (_, u) => { if (u.startsWith(PREFIX)) found.add(u); return ""; });
let copied = 0, failed = 0;
for (const u of found) {
  const [rel, frag = ""] = u.slice(PREFIX.length).split("#");
  const m = /^(.*)\.(\d+)\.jpg$/.exec(rel), widths = (new URLSearchParams(frag).get("w") || "").split(",").filter(Boolean);
  const files = m && widths.length ? widths.map((w) => `${m[1]}.${w}.jpg`) : [rel];
  for (const f of files) {
    const dest = path.join(ROOT, LOCAL, f);
    if (fs.existsSync(dest)) continue;
    try {
      const r = await fetch(PREFIX + f, { signal: AbortSignal.timeout(60000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer())); copied++;
    } catch (e) { failed++; console.log(`Could not copy ${f}: ${e.message}`); }
  }
}
// list every photo whose copies are all present
const keys = new Set();
const walk = (d) => { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else keys.add(path.relative(path.join(ROOT, LOCAL), p).split(path.sep).join("/").replace(/\.\d+\.jpg$|\.png$|\.jpe?g$/i, "")); } };
walk(path.join(ROOT, LOCAL));
for (const u of found) { // drop photos with any copy missing
  const [rel, frag = ""] = u.slice(PREFIX.length).split("#"); const m = /^(.*)\.(\d+)\.jpg$/.exec(rel);
  const ws = (new URLSearchParams(frag).get("w") || "").split(",").filter(Boolean);
  if (m && ws.some((w) => !fs.existsSync(path.join(ROOT, LOCAL, `${m[1]}.${w}.jpg`)))) keys.delete(m[1]);
}
const mirror = { prefix: PREFIX, local: LOCAL, files: [...keys].sort() };
if (JSON.stringify(readJSON("assets/data/mirror.json")) !== JSON.stringify(mirror)) write("assets/data/mirror.json", JSON.stringify(mirror, null, 1));
console.log(`Photos: ${found.size} in use, ${copied} newly copied, ${failed} could not be copied, ${keys.size} available from the website.`);

// 4. local copy of the database library
if (!fs.existsSync(path.join(ROOT, LIB.file))) {
  try { const r = await fetch(LIB.url, { signal: AbortSignal.timeout(60000) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); write(LIB.file, Buffer.from(await r.arrayBuffer())); console.log("Database library saved locally."); }
  catch (e) { console.log(`Could not save the database library locally (${e.message}); the website uses the public copy meanwhile.`); }
}
