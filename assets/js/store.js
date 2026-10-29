/* Data layer. One API, two back-ends:
   - SupabaseStore: the real database (single source of truth) — used when config.js has a URL and key.
   - DemoStore: offline demo seeded from assets/data/seed.json; changes stay in this browser only. */
(function () {
  const OSB = (window.OSB = window.OSB || {});
  const TABLES = ["site_settings", "menu_items", "sections", "section_items", "horarium", "events", "posts", "albums", "media_items", "verses"];
  const PK = (t) => (t === "site_settings" ? "key" : "id");
  /* Restoring a group of deleted rows: parents before children. */
  const RESTORE_ORDER = ["site_settings", "sections", "albums", "menu_items", "section_items", "media_items", "horarium", "events", "posts", "verses", "profiles"];
  function restoreSequence(entries) {
    return [...entries].sort((a, b) => {
      const d = RESTORE_ORDER.indexOf(a.table_name) - RESTORE_ORDER.indexOf(b.table_name);
      if (d) return d;
      if (a.table_name === "menu_items") return (a.old_row.parent_id ? 1 : 0) - (b.old_row.parent_id ? 1 : 0);
      return 0;
    });
  }
  const ORDER = { menu_items: "sort", sections: "sort", section_items: "sort", horarium: "sort", albums: "sort", media_items: "sort", events: "starts_on", posts: "published_on", verses: "sort" };

  function friendly(err) {
    const m = (err && (err.message || err.error_description || String(err))) || "Something went wrong";
    if (/row-level security|permission denied|not allowed/i.test(m)) return "You don't have permission to make this change. Ask an admin to check your role.";
    if (/duplicate key.*slug/i.test(m)) return "Another section already uses this link name (slug). Choose a different one.";
    if (/horarium_times/i.test(m)) return "The end time must be after the start time.";
    if (/media_has_source/i.test(m)) return "A photo needs an image, and a video needs a YouTube link or ID.";
    if (/At least one admin/i.test(m)) return "At least one admin must remain. Make someone else an admin first.";
    if (/Invalid login credentials/i.test(m)) return "The e-mail or password is not correct.";
    if (/Failed to fetch|NetworkError/i.test(m)) return "Could not reach the database. Check the internet connection and try again.";
    return m;
  }

  /* ---------------- Supabase ---------------- */
  class SupabaseStore {
    constructor(cfg) { this.cfg = cfg; this.mode = "live"; }
    async init() {
      // The library is kept in the site's own files by the daily job; the public CDN is the fallback.
      if (!window.supabase) {
        try { await OSB.loadScript("assets/vendor/supabase-js-2.45.4.js"); }
        catch (e) { await OSB.loadScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js"); }
      }
      // Invitation and password-reset e-mails bring the person back with "type=invite" or "type=recovery" in the address.
      const m = (location.hash + "&" + location.search).match(/type=(invite|recovery|signup|magiclink)/);
      this.authLinkType = m ? m[1] : null;
      this.sb = window.supabase.createClient(this.cfg.supabaseUrl, this.cfg.supabaseAnonKey, { auth: { persistSession: true, detectSessionInUrl: true } });
      this.sb.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY") { this.authLinkType = "recovery"; if (OSB.onPasswordSetup) OSB.onPasswordSetup(); }
      });
      await this.sb.auth.getSession();
      if (this.authLinkType && /access_token|type=/.test(location.hash)) history.replaceState(null, "", location.pathname + location.search);
    }
    needsPassword() { return this.authLinkType === "invite" || this.authLinkType === "recovery"; }
    /* The content version (see site_meta in schema.sql). Fast: one tiny row. */
    async contentVersion() {
      const { data, error } = await this.sb.from("site_meta").select("content_version").eq("id", 1).single();
      if (error) throw new Error(friendly(error)); return Number(data.content_version);
    }
    async setPassword(password) {
      const { error } = await this.sb.auth.updateUser({ password });
      if (error) throw new Error(friendly(error));
      this.authLinkType = null;
    }
    async loadAll() {
      const out = {};
      await Promise.all(TABLES.map(async (t) => {
        let q = this.sb.from(t).select("*");
        if (ORDER[t]) q = q.order(ORDER[t], { ascending: true });
        const { data, error } = await q;
        if (error) throw new Error(friendly(error));
        out[t] = data;
      }));
      return out;
    }
    async insert(t, row) {
      const { data, error } = await this.sb.from(t).insert(row).select().single();
      if (error) throw new Error(friendly(error)); return data;
    }
    async update(t, id, patch) {
      const { data, error } = await this.sb.from(t).update(patch).eq(PK(t), id).select().single();
      if (error) throw new Error(friendly(error)); return data;
    }
    async upsert(t, row) {
      const { data, error } = await this.sb.from(t).upsert(row).select().single();
      if (error) throw new Error(friendly(error)); return data;
    }
    async remove(t, id) {
      const { error } = await this.sb.from(t).delete().eq(PK(t), id);
      if (error) throw new Error(friendly(error));
    }
    async user() {
      const { data } = await this.sb.auth.getUser();
      if (!data || !data.user) return null;
      const { data: p } = await this.sb.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
      return { id: data.user.id, email: data.user.email, role: p ? p.role : null, name: p ? p.full_name : "" };
    }
    async signIn(email, password) {
      const { error } = await this.sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(friendly(error));
      return this.user();
    }
    async signOut() { await this.sb.auth.signOut(); }
    async resetPassword(email) {
      const { error } = await this.sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      if (error) throw new Error(friendly(error));
    }
    async upload(file, onProgress) {
      // Make the published sizes in the browser, then upload them. Unique names, so they can be cached for a year.
      const made = await OSB.makeSizes(file, onProgress);
      const base = `uploads/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}`;
      const bucket = this.sb.storage.from("media");
      const put = async (path, blob) => {
        const { error } = await bucket.upload(path, blob, { contentType: blob.type, cacheControl: "31536000", upsert: false });
        if (error) throw new Error(friendly(error));
      };
      if (made.png) { await put(`${base}.png`, made.png); return bucket.getPublicUrl(`${base}.png`).data.publicUrl; }
      for (let i = 0; i < made.sizes.length; i++) {
        if (onProgress) onProgress(`Uploading photo ${i + 1} of ${made.sizes.length}…`);
        await put(`${base}.${made.sizes[i].w}.jpg`, made.sizes[i].blob);
      }
      const ws = made.sizes.map((x) => x.w);
      return `${bucket.getPublicUrl(`${base}.${ws[ws.length - 1]}.jpg`).data.publicUrl}#w=${ws.join(",")}`;
    }
    /* ---- change history (see content_history in schema.sql) ---- */
    async listHistory(t, pk) {
      const { data, error } = await this.sb.from("content_history").select("*").eq("table_name", t).eq("row_pk", String(pk)).order("changed_at", { ascending: false }).limit(50);
      if (error) throw new Error(friendly(error)); return data;
    }
    async listDeleted() {
      const { data, error } = await this.sb.from("content_history").select("*").eq("action", "delete").order("changed_at", { ascending: false }).limit(400);
      if (error) throw new Error(friendly(error)); return data;
    }
    async restoreRows(entries) {
      for (const e of restoreSequence(entries)) {
        const { error } = await this.sb.from(e.table_name).upsert(e.old_row);
        if (error) throw new Error(friendly(error));
      }
    }
    async listProfiles() {
      const { data, error } = await this.sb.from("profiles").select("*").order("email");
      if (error) throw new Error(friendly(error)); return data;
    }
    async setRole(id, role) { return this.update("profiles", id, { role: role || null }); }
    async setName(id, full_name) { return this.update("profiles", id, { full_name }); }
  }

  /* ---------------- Demo (offline) ---------------- */
  const KEY = "osb-cms-demo-v9", UKEY = "osb-cms-demo-user";
  const mem = {};
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return mem[k] ?? null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { mem[k] = v; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { delete mem[k]; } },
  };
  const DEMO_USERS = [
    { id: "demo-admin", email: "admin@demo", full_name: "Demo Admin", role: "admin" },
    { id: "demo-editor", email: "editor@demo", full_name: "Demo Editor", role: "editor" },
    { id: "demo-viewer", email: "new.member@demo", full_name: "New member", role: null },
  ];
  class DemoStore {
    constructor(cfg) { this.cfg = cfg; this.mode = "demo"; }
    async init() {
      const saved = ls.get(KEY);
      if (saved) { try { this.db = JSON.parse(saved); } catch (e) { this.db = null; } }
      if (!this.db) await this.reset(false);
    }
    async reset(save = true) {
      const r = await fetch(this.cfg.seedUrl || "assets/data/seed.json", { cache: "no-store" });
      if (!r.ok) throw new Error("Could not load the demo content.");
      this.db = await r.json();
      this.db.profiles = JSON.parse(JSON.stringify(DEMO_USERS));
      if (save) this.save(); else this.save();
    }
    save() {
      try { localStorage.setItem(KEY, JSON.stringify(this.db)); }
      catch (e) { mem[KEY] = JSON.stringify(this.db); if (e && e.name === "QuotaExceededError") throw new Error("The demo storage in this browser is full. Use smaller photos or reset the demo."); }
    }
    role() { const u = this.currentUser(); return u ? u.role : null; }
    currentUser() { const id = ls.get(UKEY); return id ? (this.db.profiles || []).find((p) => p.id === id) || null : null; }
    check(t) {
      const r = this.role();
      const adminOnly = ["site_settings", "menu_items", "profiles"].includes(t);
      if (!r || (adminOnly && r !== "admin")) throw new Error(friendly("permission denied"));
    }
    validate(t, row) {
      if (t === "horarium" && row.start_time && row.end_time && row.end_time <= row.start_time) throw new Error(friendly("horarium_times"));
      if (t === "media_items" && ((row.kind === "image" && !row.url) || (row.kind === "video" && !row.youtube_id))) throw new Error(friendly("media_has_source"));
      if (t === "sections" && this.db.sections.some((s) => s.slug === row.slug && s.id !== row.id)) throw new Error(friendly("duplicate key slug"));
    }
    async loadAll() {
      const out = {}; const editor = !!this.role();
      for (const t of TABLES) {
        let rows = JSON.parse(JSON.stringify(this.db[t] || []));
        if (!editor) {
          if (["menu_items", "sections", "section_items", "horarium"].includes(t)) rows = rows.filter((r) => r.visible !== false);
          if (["events", "posts", "albums", "verses"].includes(t)) rows = rows.filter((r) => r.published !== false);
        }
        const o = ORDER[t];
        if (o) rows.sort((a, b) => (a[o] > b[o] ? 1 : a[o] < b[o] ? -1 : 0));
        out[t] = rows;
      }
      return out;
    }
    stamp(row) { row.updated_at = new Date().toISOString(); row.updated_by = (this.currentUser() || {}).id; return row; }
    async insert(t, row) {
      this.check(t);
      const r = this.stamp(Object.assign({}, row));
      if (PK(t) === "id" && !r.id) r.id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
      this.validate(t, r);
      (this.db[t] = this.db[t] || []).push(r); this.save(); return JSON.parse(JSON.stringify(r));
    }
    async update(t, id, patch) {
      this.check(t);
      const rows = this.db[t] || []; const i = rows.findIndex((r) => r[PK(t)] === id);
      if (i < 0) throw new Error("This item no longer exists. Reload the page.");
      const next = this.stamp(Object.assign({}, rows[i], patch));
      this.validate(t, next);
      if (t === "profiles" && rows[i].role === "admin" && next.role !== "admin" && !rows.some((p, j) => j !== i && p.role === "admin")) throw new Error(friendly("At least one admin"));
      this.record(t, rows[i], "update", next);
      rows[i] = next; this.save(); return JSON.parse(JSON.stringify(next));
    }
    /* Demo version of the database's change history. */
    record(t, old, action, next, tx) {
      if (action === "update") { const strip = (r) => JSON.stringify(Object.assign({}, r, { updated_at: 0, updated_by: 0 })); if (strip(old) === strip(next)) return; }
      const u = this.currentUser() || {};
      (this.db.history = this.db.history || []).unshift({ id: Date.now() + Math.random(), table_name: t, row_pk: String(old[PK(t)]), action, old_row: JSON.parse(JSON.stringify(old)),
        tx_id: tx || Date.now() + Math.random(), changed_at: new Date().toISOString(), changed_by: u.id, changed_by_email: u.email });
      if (this.db.history.length > 500) this.db.history.length = 500;
    }
    async listHistory(t, pk) { this.check(t); return (this.db.history || []).filter((h) => h.table_name === t && h.row_pk === String(pk)).slice(0, 50); }
    async listDeleted() {
      this.check("sections"); const admin = this.role() === "admin";
      return (this.db.history || []).filter((h) => h.action === "delete" && (admin || !["site_settings", "menu_items", "profiles"].includes(h.table_name)));
    }
    async restoreRows(entries) { for (const e of restoreSequence(entries)) await this.upsert(e.table_name, e.old_row); }
    async upsert(t, row) {
      const exists = (this.db[t] || []).some((r) => r[PK(t)] === row[PK(t)]);
      return exists ? this.update(t, row[PK(t)], row) : this.insert(t, row);
    }
    async remove(t, id) {
      this.check(t);
      const tx = Date.now() + Math.random();
      const drop = (table, keep) => { (this.db[table] || []).filter((r) => !keep(r)).forEach((r) => this.record(table, r, "delete", null, tx)); this.db[table] = (this.db[table] || []).filter(keep); };
      drop(t, (r) => r[PK(t)] !== id);
      if (t === "sections") drop("section_items", (r) => r.section_id !== id);
      if (t === "albums") drop("media_items", (r) => r.album_id !== id);
      if (t === "menu_items") drop("menu_items", (r) => r.parent_id !== id);
      this.save();
    }
    async user() { const u = this.currentUser(); return u ? { id: u.id, email: u.email, role: u.role, name: u.full_name } : null; }
    async signIn(email) {
      const u = (this.db.profiles || []).find((p) => p.email === email);
      if (!u) throw new Error("Unknown demo account.");
      ls.set(UKEY, u.id); return this.user();
    }
    async signOut() { ls.del(UKEY); }
    async resetPassword() { throw new Error("Password reset is not available in the demo."); }
    needsPassword() { return false; }
    async setPassword() {}
    async upload(file) {
      this.check("sections");
      return OSB.shrinkImage(file, 1400, "dataurl");
    }
    async listProfiles() { this.check("profiles"); return JSON.parse(JSON.stringify(this.db.profiles || [])); }
    async setRole(id, role) { return this.update("profiles", id, { role: role || null }); }
    async setName(id, full_name) { return this.update("profiles", id, { full_name }); }
  }

  /* ---------------- helpers ---------------- */
  OSB.loadScript = (src) => new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = src; s.onload = res;
    s.onerror = () => rej(new Error("Could not load " + src)); document.head.appendChild(s);
  });
  /* Turn any uploaded photo (100 KB to many MB) into up to three JPEG sizes: longer side 800, 1200 and 1600 px,
     never enlarged. Photos with transparent areas (e.g. an emblem) are kept as one PNG instead. */
  const MAX_UPLOAD_MB = 40;
  async function decode(file) {
    if (/heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name || "")) throw new Error("iPhone HEIC photos can't be used directly. On the iPhone choose Settings → Camera → Formats → Most Compatible, or send the photo as JPEG.");
    if (!/^image\//.test(file.type)) throw new Error("Please choose a photo file (JPG or PNG).");
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) throw new Error(`This file is ${(file.size / 1048576).toFixed(0)} MB. Please use a photo under ${MAX_UPLOAD_MB} MB.`);
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); }
    catch (e) {
      return await new Promise((res, rej) => { const i = new Image(); const u = URL.createObjectURL(file); i.onload = () => { URL.revokeObjectURL(u); res(i); }; i.onerror = () => rej(new Error("This photo could not be read. Try saving it as JPEG.")); i.src = u; });
    }
  }
  const toBlob = (c, type, q) => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("The photo could not be prepared."))), type, q));
  OSB.makeSizes = async function (file, onProgress) {
    if (onProgress) onProgress("Preparing photo sizes…");
    const src = await decode(file);
    const W = src.width, H = src.height, long = Math.max(W, H);
    const draw = (k, bg) => {
      const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(W * k)); c.height = Math.max(1, Math.round(H * k));
      const ctx = c.getContext("2d"); if (bg) { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height); }
      ctx.imageSmoothingQuality = "high"; ctx.drawImage(src, 0, 0, c.width, c.height); return c;
    };
    if (file.type === "image/png") {
      const probe = draw(Math.min(1, 400 / long), false), d = probe.getContext("2d").getImageData(0, 0, probe.width, probe.height).data;
      for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return { png: await toBlob(draw(Math.min(1, 1600 / long), false), "image/png"), sizes: [] };
    }
    const sizes = [];
    for (const t of [800, 1200, 1600]) {
      const k = Math.min(1, t / long); const c = draw(k, true);
      if (!sizes.length || sizes[sizes.length - 1].w !== c.width) sizes.push({ w: c.width, blob: await toBlob(c, "image/jpeg", 0.82) });
      if (k === 1) break;
    }
    if (src.close) src.close();
    return { sizes, width: W, height: H };
  };

  OSB.shrinkImage = (file, max, as) => new Promise((res, rej) => {
    if (!/^image\//.test(file.type)) return rej(new Error("Please choose an image file (JPG or PNG)."));
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const ctx = c.getContext("2d"); URL.revokeObjectURL(url);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      // Keep PNG when the image has transparent areas (e.g. an emblem); otherwise use JPEG on a white background.
      let transparent = false;
      if (file.type === "image/png") { const d = ctx.getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i] < 250) { transparent = true; break; } }
      const type = transparent ? "image/png" : "image/jpeg";
      if (!transparent) { ctx.globalCompositeOperation = "destination-over"; ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height); }
      if (as === "blob") c.toBlob((b) => res(b), type, 0.85); else res(c.toDataURL(type, 0.82));
    };
    img.onerror = () => rej(new Error("This image could not be read."));
    img.src = url;
  });
  OSB.TABLES = TABLES; OSB.PK = PK; OSB.friendly = friendly;
  OSB.createStore = (cfg) => (cfg.supabaseUrl && cfg.supabaseAnonKey ? new SupabaseStore(cfg) : new DemoStore(cfg));
})();
