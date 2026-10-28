/* Visitor cache. Self-contained; uses only the store (contentVersion, loadAll) and OSB.Photo.setMirror.
   Visitors who are not signed in:
     1. ask the database for the content version (one tiny request);
     2. same version as the copy saved in this browser  → show that copy at once (no download);
        same version as the daily snapshot file        → use the snapshot (served from GitHub);
        otherwise                                       → load live content and save it for next time.
     3. database unreachable (paused, offline, blocked) → show the saved copy or the snapshot, so the site stays readable.
   Signed-in editors and the offline demo always use live data. */
(function () {
  const OSB = (window.OSB = window.OSB || {});
  const KEY = "osb-content-cache-v2";
  const SNAPSHOT = "assets/data/snapshot.json", MIRROR = "assets/data/mirror.json";
  const VERSION_TIMEOUT_MS = 6000;

  const readLocal = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); return v && v.db ? v : null; } catch (e) { return null; } };
  const saveLocal = (version, db) => { try { localStorage.setItem(KEY, JSON.stringify({ version, saved_at: new Date().toISOString(), db })); } catch (e) { /* storage full or blocked: fine */ } };
  async function getJSON(url, noCache) {
    try { const r = await fetch(url, noCache ? { cache: "no-cache" } : {}); return r.ok ? await r.json() : null; } catch (e) { return null; }
  }
  const timeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("The database did not answer in time.")), ms))]);

  const state = { source: null, version: null };

  /* Content for a visitor when the database can't be used at all. */
  async function offline(reason) {
    loadMirror();
    const local = readLocal();
    const snap = await getJSON(SNAPSHOT, true);
    const pick = local && (!snap || (local.saved_at || "") >= (snap.generated_at || "")) ? { db: local.db, src: "browser copy" } : snap && snap.db ? { db: snap.db, src: "daily snapshot" } : null;
    if (!pick) throw reason || new Error("The website's content is temporarily unavailable.");
    state.source = "offline: " + pick.src;
    console.warn("Showing saved content (" + pick.src + "):", reason && reason.message);
    return pick.db;
  }
  function loadMirror() { getJSON(MIRROR).then((m) => { if (m && OSB.Photo) { OSB.Photo.setMirror(m); if (OSB.render && OSB.state && OSB.state.db) OSB.render(); } }); }

  async function load(store, user) {
    if (!store || store.mode !== "live" || (user && user.role)) { state.source = "live"; return store.loadAll(); }
    loadMirror();
    let version;
    try { version = await timeout(store.contentVersion(), VERSION_TIMEOUT_MS); }
    catch (e) { return offline(e); }
    state.version = version;
    const local = readLocal();
    if (local && local.version === version) { state.source = "browser copy"; return local.db; }
    const snap = await getJSON(SNAPSHOT, true);
    if (snap && snap.version === version && snap.db) { saveLocal(version, snap.db); state.source = "daily snapshot"; return snap.db; }
    try { const db = await store.loadAll(); saveLocal(version, db); state.source = "live"; return db; }
    catch (e) { return offline(e); }
  }

  OSB.Cache = { load, offline, state, clear: () => { try { localStorage.removeItem(KEY); } catch (e) {} } };
})();
