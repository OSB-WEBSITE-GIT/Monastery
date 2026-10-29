/* Content editing: sign-in, on-page editing, and the admin dashboard. */
(function () {
  const OSB = (window.OSB = window.OSB || {});
  const S = OSB.state;
  const esc = (s) => OSB.esc(s);
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const LANGS = [["en", "English"], ["ml", "Malayalam"]];
  const role = () => (S.user && S.user.role) || null;
  const isAdmin = () => role() === "admin";
  const canEdit = (t) => (["site_settings", "menu_items", "profiles"].includes(t) ? isAdmin() : !!role());
  const trv = (o) => (o ? o[S.lang] || o.en || "" : "");
  const plain = (h) => String(h || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  /* ---------------- feedback ---------------- */
  function toast(msg, kind = "ok") {
    let box = $("#cms-toasts"); if (!box) { box = document.createElement("div"); box.id = "cms-toasts"; box.setAttribute("role", "status"); document.body.appendChild(box); }
    const t = document.createElement("div"); t.className = "cms-toast " + kind; t.textContent = msg; box.appendChild(t);
    setTimeout(() => t.remove(), kind === "err" ? 6000 : 2200);
  }
  OSB.toast = toast;
  function modal(html, cls = "") {
    const o = document.createElement("div"); o.className = "cms-modal-wrap"; o.innerHTML = `<div class="cms-modal ${cls}" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(o); const last = document.activeElement;
    const close = () => { o.remove(); document.removeEventListener("keydown", k); last && last.focus && last.focus(); };
    const k = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", k);
    setTimeout(() => { const f = o.querySelector("input,select,button"); f && f.focus(); }, 0);
    return { el: o, close };
  }
  function confirmBox(text, okLabel = "Delete") {
    return new Promise((res) => {
      const m = modal(`<p class="cms-confirm-text">${esc(text)}</p><div class="cms-actions"><button type="button" class="cms-btn danger" data-ok>${esc(okLabel)}</button><button type="button" class="cms-btn" data-no>Cancel</button></div>`, "small");
      m.el.querySelector("[data-ok]").onclick = () => { m.close(); res(true); };
      m.el.querySelector("[data-no]").onclick = () => { m.close(); res(false); };
    });
  }
  async function run(fn, okMsg) {
    try { const r = await fn(); if (okMsg) toast(okMsg); return r; }
    catch (e) { toast(OSB.friendly(e), "err"); console.error(e); return undefined; }
  }

  /* ---------------- sign in ---------------- */
  function signInDialog() {
    if (S.user) return accountDialog();
    const demo = OSB.store.mode === "demo";
    const m = modal(`<h2 class="cms-h">Sign in to edit</h2>
      ${demo ? `<p class="cms-p">This is the demo. Pick an account to try it. Changes are saved only in this browser.</p>
        <div class="cms-stack"><button type="button" class="cms-btn primary" data-demo="admin@demo">Demo admin <small>can change everything, including menu, settings and users</small></button>
        <button type="button" class="cms-btn" data-demo="editor@demo">Demo editor <small>can change content, but not the menu, settings or users</small></button></div>`
      : `<form class="cms-form" id="cms-login"><label class="cms-field"><span>E-mail</span><input id="cms-email" type="email" autocomplete="username" required></label>
        <label class="cms-field"><span>Password</span><input id="cms-pass" type="password" autocomplete="current-password" required></label>
        <p class="cms-err" id="cms-login-err" hidden></p>
        <div class="cms-actions"><button class="cms-btn primary" type="submit">Sign in</button><button class="cms-btn link" type="button" id="cms-forgot">Forgot password?</button></div></form>`}
      <div class="cms-actions end"><button type="button" class="cms-btn link" data-cancel>Cancel</button></div>`);
    m.el.querySelector("[data-cancel]").onclick = m.close;
    $$("[data-demo]", m.el).forEach((b) => (b.onclick = async () => { m.close(); await signedIn(await OSB.store.signIn(b.dataset.demo)); }));
    const f = m.el.querySelector("#cms-login");
    if (f) {
      const err = m.el.querySelector("#cms-login-err");
      f.onsubmit = async (e) => { e.preventDefault(); err.hidden = true;
        try { const u = await OSB.store.signIn(f.querySelector("#cms-email").value.trim(), f.querySelector("#cms-pass").value); m.close(); await signedIn(u); }
        catch (x) { err.textContent = OSB.friendly(x); err.hidden = false; } };
      m.el.querySelector("#cms-forgot").onclick = async () => { const em = f.querySelector("#cms-email").value.trim();
        if (!em) { err.textContent = "Enter your e-mail address first."; err.hidden = false; return; }
        try { await OSB.store.resetPassword(em); err.textContent = "A password reset link has been sent to " + em + "."; err.hidden = false; }
        catch (x) { err.textContent = OSB.friendly(x); err.hidden = false; } };
    }
  }
  async function signedIn(u) {
    S.user = u;
    if (!u.role) toast("You're signed in, but your account has no editing role yet. Ask an admin to give you access.", "err");
    else toast(`Signed in as ${u.role}`);
    await OSB.reload(); bar();
  }
  function accountDialog() {
    const m = modal(`<h2 class="cms-h">${esc(S.user.email)}</h2><p class="cms-p">Role: <strong>${esc(S.user.role || "no access")}</strong></p>
      <div class="cms-actions"><button type="button" class="cms-btn" data-out>Sign out</button><button type="button" class="cms-btn link" data-cancel>Close</button></div>`, "small");
    m.el.querySelector("[data-cancel]").onclick = m.close;
    m.el.querySelector("[data-out]").onclick = async () => { m.close(); await signOut(); };
  }
  async function signOut() {
    await OSB.store.signOut(); S.user = null; S.editing = false; document.body.classList.remove("cms-editing");
    $("#cms-bar") && $("#cms-bar").remove(); if (OSB.Undo) OSB.Undo.hide(); await OSB.reload(); toast("Signed out");
  }

  /* ---------------- editor bar ---------------- */
  function bar() {
    $("#cms-bar") && $("#cms-bar").remove();
    if (!role()) return;
    const b = document.createElement("div"); b.id = "cms-bar"; b.setAttribute("role", "toolbar"); b.setAttribute("aria-label", "Editing tools");
    b.innerHTML = `<span class="cms-badge">${esc(role())}${OSB.store.mode === "demo" ? " · demo" : ""}</span>
      <button type="button" class="cms-btn ${S.editing ? "on" : ""}" id="cms-toggle" aria-pressed="${S.editing}">${S.editing ? "✓ Done editing" : "✎ Edit page"}</button>
      <button type="button" class="cms-btn" id="cms-dash">☰ Dashboard</button>
      <span class="cms-narrow-note">Editing is available on a laptop, desktop or large tablet (screen at least 1024 px wide).</span>
      ${OSB.store.mode === "demo" ? `<button type="button" class="cms-btn link" id="cms-reset">Reset demo</button>` : ""}
      <button type="button" class="cms-btn link" id="cms-out">Sign out</button>`;
    document.body.appendChild(b);
    $("#cms-toggle").onclick = () => { S.editing = !S.editing; document.body.classList.toggle("cms-editing", S.editing); OSB.render(); bar(); if (S.editing) toast("Use ✎ Edit this section to change text. Use Photo… to change a photo."); };
    $("#cms-dash").onclick = () => dashboard();
    $("#cms-out").onclick = signOut;
    const r = $("#cms-reset"); if (r) r.onclick = async () => { if (await confirmBox("Reset the demo? All changes made in this browser will be lost.", "Reset")) { await OSB.store.reset(); S.user = await OSB.store.user(); await OSB.reload(); bar(); toast("Demo reset"); } };
  }

  /* ---------------- photo resolution ---------------- */
  // Frame slots, minimum sizes and messages come from the photo module (assets/js/photo.js).
  const slotOf = (table, r, field) => OSB.Photo.slotFor(table, r, field, S.db);
  function minRes(table, r, field) { const sl = slotOf(table, r, field); return sl ? OSB.Photo.SLOTS[sl].min : 150; }
  OSB.minRes = minRes;
  const lowMsg = (w, h, min) => OSB.Photo.qualityMessage({ ok: false, w, h, min, zoom: 1 });
  const framed = (slot) => !!(slot && OSB.Photo.SLOTS[slot] && OSB.Photo.SLOTS[slot].ratio);
  /* After an upload (or on request): let the editor choose the visible area. Returns the final address. */
  async function adjust(slot, url, title) {
    if (!framed(slot) || !url || !OSB.PhotoAdjust) return url;
    const out = await OSB.PhotoAdjust.open({ slot, url, title });
    return out || url;
  }
  function measure(src) { return new Promise((res) => { if (!src) return res(null); const i = new Image(); i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => res(null); i.src = src; }); }
  async function measureFile(file) { try { const b = await createImageBitmap(file); const d = { w: b.width, h: b.height }; b.close && b.close(); return d; } catch (e) { return null; } }
  async function warnIfSmallFile(file, min) {
    const d = await measureFile(file);
    if (d && Math.max(d.w, d.h) < min) toast(lowMsg(d.w, d.h, min) + " It will be used, but please replace it when a larger photo is available.", "warn");
  }

  /* ---------------- page editing: photos + "Edit this section" ---------------- */
  function rowOf(table, id) { return (S.db[table] || []).find((r) => r[OSB.PK(table)] === id); }
  function linkPrompt() {
    const sel = window.getSelection(); const range = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    const m = modal(`<form class="cms-form" id="lk"><label class="cms-field"><span>Link address</span><input id="lk-url" type="url" placeholder="https://… or #contact" required></label>
      <div class="cms-actions"><button class="cms-btn primary">Add link</button><button type="button" class="cms-btn link" data-c>Cancel</button></div></form>`, "small");
    m.el.querySelector("[data-c]").onclick = m.close;
    m.el.querySelector("#lk-url").type = "text";
    m.el.querySelector("#lk").onsubmit = (e) => { e.preventDefault(); const u = m.el.querySelector("#lk-url").value.trim(); m.close();
      if (range) { sel.removeAllRanges(); sel.addRange(range); } if (u) document.execCommand("createLink", false, u); };
  }
  /* On the page, only photos are changed (Photo… / Adjust). All text is edited in the dashboard. */
  function pageImageTools() {
    $$("[data-img]").forEach((im) => {
      const [table, id, field] = im.dataset.img.split("|"); if (!canEdit(table)) return;
      const url = im.dataset.src || "";
      const slot = im.dataset.slot || slotOf(table, rowOf(table, id), field);
      const wrap = document.createElement("button"); wrap.type = "button"; wrap.className = "cms-img-btn"; wrap.textContent = im.dataset.empty ? "+ Add photo" : "Photo…";
      im.insertAdjacentElement("afterend", wrap);
      if (url && framed(slot)) {
        const adj = document.createElement("button"); adj.type = "button"; adj.className = "cms-img-btn adj"; adj.textContent = "Adjust";
        wrap.insertAdjacentElement("afterend", adj);
        adj.onclick = async (e) => { e.preventDefault(); e.stopPropagation(); const out = await adjust(slot, url); if (out !== url) setImage(table, id, field, out); };
      }
      const host = im.closest(".ph") || im;
      if (url) measure(OSB.Photo.fileOf(url)).then((d) => {
        const q = slot ? OSB.Photo.quality(slot, url, d) : (d && Math.max(d.w, d.h) < 150 ? { ok: false, w: d.w, h: d.h, min: 150, zoom: 1 } : null);
        if (q && !q.ok) { const b = document.createElement("span"); b.className = "cms-lowres"; b.textContent = OSB.Photo.qualityMessage(q); host.insertAdjacentElement("afterend", b); }
      });
      wrap.onclick = (e) => { e.preventDefault(); e.stopPropagation(); imageMenu(table, id, field, !!url, slot); };
    });
  }
  function pickFile() {
    return new Promise((res) => { const i = document.createElement("input"); i.type = "file"; i.accept = "image/*"; i.onchange = () => res(i.files[0] || null); i.click(); });
  }
  async function uploadTo(table, id, field) {
    const f = await pickFile(); if (!f) return;
    await warnIfSmallFile(f, minRes(table, rowOf(table, id), field));
    toast("Uploading photo…");
    const url = await run(() => OSB.store.upload(f, (m) => toast(m))); if (!url) return;
    await setImage(table, id, field, await adjust(slotOf(table, rowOf(table, id), field), url, "New photo"));
  }
  async function setImage(table, id, field, url) {
    if (table === "site_settings") { const row = rowOf(table, id); const v = Object.assign({}, row.value, { [field]: url }); await run(() => OSB.store.update(table, id, { value: v }), "Photo saved"); }
    else await run(() => OSB.store.update(table, id, { [field]: url }), url ? "Photo saved" : "Photo removed");
    await OSB.reload();
  }
  function imageMenu(table, id, field, has, slot) {
    const m = modal(`<h2 class="cms-h">Photo</h2><div class="cms-stack"><button type="button" class="cms-btn primary" data-up>Upload a new photo</button>
      ${has && framed(slot) ? `<button type="button" class="cms-btn" data-adj>Adjust what shows in the frame</button>` : ""}
      ${has ? `<button type="button" class="cms-btn danger" data-rm>Remove photo</button>` : ""}<button type="button" class="cms-btn link" data-c>Cancel</button></div>`, "small");
    m.el.querySelector("[data-c]").onclick = m.close;
    m.el.querySelector("[data-up]").onclick = () => { m.close(); uploadTo(table, id, field); };
    const aj = m.el.querySelector("[data-adj]"); if (aj) aj.onclick = async () => { m.close(); const r = rowOf(table, id); const cur = table === "site_settings" ? r.value[field] : r[field]; const out = await adjust(slot, cur); if (out !== cur) setImage(table, id, field, out); };
    const rm = m.el.querySelector("[data-rm]"); if (rm) rm.onclick = async () => { m.close(); if (await confirmBox("Remove this photo?", "Remove")) setImage(table, id, field, null); };
  }

  /* one light "Edit this section" button per section; everything opens the dashboard */
  const ITEM_KINDS = { tiles: "tile", story: "entry", stats: "figure", steps: "stage", cards: "card", contact: "address" };
  const MANAGED = { horarium: ["horarium", "timetable"], events: ["events", "events"], news: ["posts", "news"], gallery: ["albums", "gallery"], intro: ["verses", "verses"] };
  const MANAGED_LABEL = { horarium: "✎ Edit timetable", events: "✎ Edit feasts & events", news: "✎ Edit news", gallery: "✎ Edit gallery", intro: "✎ Edit verses" };
  function editButton(label, onClick, cls = "") {
    const b = document.createElement("button"); b.type = "button"; b.className = "cms-edit-btn " + cls; b.textContent = label;
    b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); onClick(); }; return b;
  }
  function sectionButtons() {
    $$("[data-section]").forEach((secEl) => {
      const s = rowOf("sections", secEl.dataset.section); if (!s) return;
      if (secEl.querySelector(":scope > .cms-edit-sec")) return;   // the opening scene is not re-drawn, so it may already have its buttons
      const box = document.createElement("div"); box.className = "cms-edit-sec";
      if (s.visible === false) { const t = document.createElement("span"); t.className = "cms-hidden-tag"; t.textContent = "Hidden from visitors"; box.appendChild(t); }
      box.appendChild(editButton("✎ Edit this section", () => dashboard("sections", s.id)));
      if (MANAGED[s.kind]) box.appendChild(editButton(MANAGED_LABEL[s.kind], () => dashboard(MANAGED[s.kind][0])));
      secEl.prepend(box);
    });
    if (isAdmin()) { // header, menu and footer belong to the admin-only parts of the dashboard
      const mh = $("#masthead .wrap"); if (mh) { const b = document.createElement("div"); b.className = "cms-edit-sec chrome"; b.appendChild(editButton("✎ Edit name & emblem", () => dashboard("settings"))); b.appendChild(editButton("✎ Edit menu", () => dashboard("menu_items"))); mh.appendChild(b); }
      const ft = $("#footer .wrap"); if (ft) { const b = document.createElement("div"); b.className = "cms-edit-sec chrome"; b.appendChild(editButton("✎ Edit footer", () => dashboard("settings"))); ft.prepend(b); }
    }
  }
  function siblings(table, r) {
    const all = S.db[table] || [];
    const same = table === "section_items" ? all.filter((x) => x.section_id === r.section_id) : table === "media_items" ? all.filter((x) => x.album_id === r.album_id) : table === "menu_items" ? all.filter((x) => (x.parent_id || null) === (r.parent_id || null)) : all;
    return [...same].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  }
  async function move(table, list, i, d) {
    const j = i + d; if (j < 0 || j >= list.length) return;
    const a = list[i], b = list[j]; let sa = a.sort, sb = b.sort; if (sa === sb) { sa = i * 10; sb = j * 10; }
    const ok = await run(async () => { await OSB.store.update(table, a.id, { sort: sb }); await OSB.store.update(table, b.id, { sort: sa }); });
    if (ok !== undefined || true) await OSB.reload();
    if ($("#cms-dash-wrap")) refreshDash();
  }
  const KIND_INFO = { text: "Text block — heading and paragraphs", story: "Story — text with a photo or a list beside it", tiles: "Tiles — a row of short links", stats: "Figures — large numbers with labels", steps: "Steps — a numbered sequence", cards: "Cards — e.g. schools and colleges", contact: "Contact — addresses and phone numbers", horarium: "Daily timetable", events: "Calendar of feasts and events", news: "News & announcements", gallery: "Photo & video gallery", hero: "Large opening image with title", intro: "Opening scene: the statue turning to gold, with a verse" };
  function addSectionDialog() {
    const m = modal(`<h2 class="cms-h">Add a section</h2><form class="cms-form" id="ns">
      <label class="cms-field"><span>Type of section</span><select id="ns-kind">${Object.entries(KIND_INFO).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select></label>
      <label class="cms-field"><span>Heading (English)</span><input id="ns-title" required></label>
      <div class="cms-actions"><button class="cms-btn primary">Add section</button><button type="button" class="cms-btn link" data-c>Cancel</button></div></form>`);
    m.el.querySelector("[data-c]").onclick = m.close;
    m.el.querySelector("#ns").onsubmit = async (e) => {
      e.preventDefault(); const title = m.el.querySelector("#ns-title").value.trim(); const kind = m.el.querySelector("#ns-kind").value;
      let slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "section"; const base = slug; let n = 2;
      while (S.db.sections.some((s) => s.slug === slug)) slug = `${base}-${n++}`;
      m.close();
      const row = await run(() => OSB.store.insert("sections", { slug, kind, title: { en: title, ml: "" }, eyebrow: { en: "", ml: "" }, body: { en: "", ml: "" }, image_caption: { en: "", ml: "" }, cta_label: { en: "", ml: "" }, settings: kind === "story" ? { layout: "image" } : {}, sort: Math.max(0, ...S.db.sections.map((s) => s.sort)) + 10, visible: true }), "Section added at the end of the page");
      if (row) { await OSB.reload(); dashboard("sections", row.id); }
    };
  }

  OSB.afterRender = function () {
    document.body.classList.toggle("cms-editing", S.editing);
    const sl = $("#signin-link"); if (sl) sl.onclick = signInDialog;
    if (S.editing && role()) { pageImageTools(); sectionButtons(); }
  };
  document.addEventListener("click", (e) => { if (S.editing && e.target.closest("a") && !e.target.closest(".cms-edit-sec,#cms-bar,.cms-modal,#cms-dash-wrap")) e.preventDefault(); }, true);

  /* ================= DASHBOARD ================= */
  const CATS = ["feast", "event", "retreat", "ordination", "jubilee"];
  const F = {
    sections: () => [
      ["slug", "text", "Link name (slug)", { help: "Used in links like #contact. Lower-case letters, numbers and dashes.", pattern: "[a-z0-9\\-]+", required: true }],
      ["kind", "select", "Type", { options: Object.entries(KIND_INFO) }],
      ["eyebrow", "i18n", "Small label above the heading"], ["title", "i18n", "Heading"], ["body", "rich", "Text"],
      ["image_url", "image", "Photo"], ["image_caption", "i18n", "Photo caption"],
      ["cta_label", "i18n", "Button text"], ["cta_link", "text", "Button link", { help: "#section-name or https://…" }],
      ["settings", "sectionSettings", "Layout"], ["visible", "bool", "Visible to visitors"]],
    section_items: () => [["label", "i18n", "Short mark (year, number, word)"], ["title", "i18n", "Title"], ["body", "rich", "Text"],
      ["image_url", "image", "Photo"], ["link", "text", "Link", { help: "#section-name or https://…" }],
      ["extra.phone", "text", "Phone"], ["extra.email", "text", "E-mail"], ["visible", "bool", "Visible to visitors"]],
    menu_items: () => [["label", "i18n", "Menu text"], ["target", "target", "Goes to"],
      ["parent_id", "select", "Show under", { options: [["", "— Top level —"], ...S.db.menu_items.filter((m) => !m.parent_id).map((m) => [m.id, plain(trv(m.label))])] }],
      ["visible", "bool", "Visible to visitors"]],
    horarium: () => [["name", "i18n", "Name"], ["start_time", "time", "Starts", { required: true }], ["end_time", "time", "Ends", { required: true }],
      ["days", "days", "Days"], ["is_prayer", "bool", "This is a time of prayer (shown in gold)"], ["note", "i18n", "Note"], ["visible", "bool", "Visible to visitors"]],
    events: () => [["title", "i18n", "Title"], ["category", "select", "Type", { options: CATS.map((c) => [c, OSB.L(c) || c]) }],
      ["starts_on", "date", "Date", { required: true }], ["repeats_yearly", "bool", "Repeats every year on this date (e.g. a feast)"], ["ends_on", "date", "Ends on (optional)"], ["time_label", "text", "Time (optional)", { help: "e.g. 6:30 am" }],
      ["location", "i18n", "Place"], ["description", "i18nArea", "Description"], ["image_url", "image", "Photo"], ["published", "bool", "Published"]],
    posts: () => [["title", "i18n", "Title"], ["excerpt", "i18nArea", "Summary (shown on the homepage)"], ["body", "rich", "Full text"],
      ["cover_url", "image", "Cover photo"], ["published_on", "date", "Date", { required: true }], ["pinned", "bool", "Pin to the top"], ["published", "bool", "Published"]],
    albums: () => [["title", "i18n", "Album title"], ["description", "i18nArea", "Description"], ["cover_url", "image", "Cover photo (optional)"], ["published", "bool", "Published"]],
    media_items: () => [["kind", "select", "Type", { options: [["image", "Photo"], ["video", "YouTube video"]] }], ["url", "image", "Photo"],
      ["youtube_id", "text", "YouTube link or video ID"], ["caption", "i18n", "Caption"]],
    verses: () => [["text", "i18nArea", "Verse"], ["reference", "i18n", "Reference (e.g. Psalm 119:164 · Rule of St. Benedict, ch. 16)"], ["published", "bool", "Shown in the opening scene"]],
  };
  const TABS = [
    ["sections", "Page sections"], ["menu_items", "Menu", true], ["horarium", "Daily timetable"], ["events", "Feasts & events"],
    ["posts", "News"], ["albums", "Gallery"], ["verses", "Welcome verses"], ["deleted", "Recently deleted"], ["settings", "Site settings", true], ["users", "Users & roles", true]];
  const DEF = {
    sections: () => ({ slug: "new-section-" + Date.now().toString(36), kind: "text", title: { en: "New section", ml: "" }, eyebrow: {}, body: {}, image_caption: {}, cta_label: {}, settings: {}, sort: nextSort(S.db.sections), visible: true }),
    menu_items: () => ({ label: { en: "New link", ml: "" }, target: "#", parent_id: null, sort: nextSort(S.db.menu_items), visible: true }),
    horarium: () => ({ name: { en: "New entry", ml: "" }, note: {}, start_time: "09:00", end_time: "09:30", days: [0, 1, 2, 3, 4, 5, 6], is_prayer: true, sort: nextSort(S.db.horarium), visible: true }),
    events: () => ({ title: { en: "New event", ml: "" }, description: {}, location: {}, category: "event", starts_on: OSB.today(), repeats_yearly: false, published: true }),
    posts: () => ({ title: { en: "New post", ml: "" }, excerpt: {}, body: {}, published_on: OSB.today(), published: false, pinned: false }),
    albums: () => ({ title: { en: "New album", ml: "" }, description: {}, sort: nextSort(S.db.albums), published: true }),
    verses: () => ({ text: { en: "", ml: "" }, reference: { en: "", ml: "" }, sort: nextSort(S.db.verses || []), published: true }),
  };
  const nextSort = (rows) => Math.max(0, ...rows.map((r) => r.sort || 0)) + 10;
  let D = null; // dashboard view state

  function dashboard(tab, id) {
    if (!role()) return;
    if (!$("#cms-dash-wrap")) {
      const w = document.createElement("div"); w.id = "cms-dash-wrap";
      w.innerHTML = `<div class="cms-dash" role="dialog" aria-modal="true" aria-label="Dashboard"><button type="button" class="cms-dash-x" id="cms-x" title="Close dashboard" aria-label="Close dashboard">✕</button><aside class="cms-side"><div class="cms-side-head"><strong>Dashboard</strong><span>${esc(S.user.email)} · ${esc(role())}</span></div>
        <nav id="cms-tabs"></nav><button type="button" class="cms-btn" id="cms-close">Close dashboard</button></aside><main class="cms-panel" id="cms-panel" tabindex="-1"></main></div>`;
      document.body.appendChild(w); document.body.classList.add("cms-noscroll");
      $("#cms-close").onclick = closeDash; $("#cms-x").onclick = closeDash;
      w.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$(".cms-modal-wrap")) { e.stopPropagation(); setTimeout(() => guarded(closeDash), 0); } });
      // Typing in a form marks it unsaved; leaving it (another tab, another item, Back, Close, Esc) asks first.
      const mark = (e) => { if (e.target.closest && e.target.closest("#cms-f,#cms-set")) dashDirty = true; };
      w.addEventListener("input", mark); w.addEventListener("change", mark);
      w.addEventListener("click", (e) => {
        if (!dashDirty || e.isTrusted === false) return;
        const b = e.target.closest("button,a"); if (!b || !w.contains(b)) return;
        const inForm = b.closest("#cms-f,#cms-set");
        const leaves = inForm ? b.matches("[data-back]") : !b.matches("[data-history],[data-shist]");
        if (!leaves) return;
        e.preventDefault(); e.stopImmediatePropagation();
        confirmBox("You have changes that are not saved. Leave without saving?", "Leave without saving").then((ok) => { if (ok) { dashDirty = false; b.click(); } });
      }, true);
    }
    D = { tab: tab || (D && D.tab) || "sections", id: id || null, parent: null };
    if (tab === "section_items" && id) { const it = rowOf("section_items", id); D = { tab: "sections", id: it.section_id, child: { table: "section_items", id } }; }
    if (tab === "media_items" && id) { const it = rowOf("media_items", id); D = { tab: "albums", id: it.album_id, child: { table: "media_items", id } }; }
    refreshDash();
  }
  let dashDirty = false;
  function guarded(fn) { if (!dashDirty) return fn(); confirmBox("You have changes that are not saved. Leave without saving?", "Leave without saving").then((ok) => { if (ok) { dashDirty = false; fn(); } }); }
  function closeDash() { $("#cms-dash-wrap") && $("#cms-dash-wrap").remove(); document.body.classList.remove("cms-noscroll"); D = null; dashDirty = false; }
  function refreshDash() {
    if (!D || !$("#cms-dash-wrap")) return;
    dashDirty = false;
    $("#cms-tabs").innerHTML = TABS.filter(([, , adm]) => !adm || isAdmin()).map(([k, l]) => `<button type="button" data-tab="${k}" class="${D.tab === k ? "on" : ""}">${esc(l)}</button>`).join("")
      + (!isAdmin() ? `<p class="cms-side-note">Menu, site settings and users can be changed by an admin.</p>` : "");
    $$("#cms-tabs [data-tab]").forEach((b) => (b.onclick = () => { D = { tab: b.dataset.tab }; refreshDash(); }));
    const p = $("#cms-panel");
    if (D.tab === "settings") return settingsView(p);
    if (D.tab === "deleted") return OSB.HistoryUI.renderDeleted(p, { onRestored: async () => { await OSB.reload(); refreshDash(); } });
    if (D.tab === "users") return usersView(p);
    if (D.child) return formView(p, D.child.table, D.child.id === "new" ? null : D.child.id, { parentTable: D.tab, parentId: D.id });
    if (D.id) return formView(p, D.tab, D.id === "new" ? null : D.id);
    listView(p, D.tab);
  }

  function rowTitle(table, r) {
    if (table === "sections") return plain(trv(r.title)) || plain(trv(r.eyebrow)) || `(${r.kind})`;
    if (table === "media_items") return plain(trv(r.caption)) || (r.kind === "video" ? "Video " + (r.youtube_id || "") : "Photo");
    if (table === "verses") return plain(trv(r.text)) || "(empty verse)";
    return plain(trv(r.title || r.name || r.label)) || "(untitled)";
  }
  function rowMeta(table, r) {
    if (table === "sections") return `#${r.slug} · ${KIND_INFO[r.kind] ? KIND_INFO[r.kind].split(" —")[0] : r.kind}`;
    if (table === "menu_items") return (r.parent_id ? "Sub-menu · " : "") + r.target;
    if (table === "horarium") return `${OSB.fmtTime(r.start_time)} – ${OSB.fmtTime(r.end_time)} · ${r.is_prayer ? "Prayer" : "Other"}${(r.days || []).length < 7 ? " · " + (r.days || []).map((d) => "SMTWTFS"[d]).join("") : ""}`;
    if (table === "events") return `${r.starts_on}${r.ends_on ? " → " + r.ends_on : ""} · ${r.category}`;
    if (table === "posts") return `${r.published_on}${r.pinned ? " · pinned" : ""}`;
    if (table === "verses") return plain(trv(r.reference));
    if (table === "albums") return `${S.db.media_items.filter((m) => m.album_id === r.id).length} items`;
    if (table === "section_items") return plain(trv(r.label));
    if (table === "media_items") return r.kind;
    return "";
  }
  const missingML = (r) => ["title", "name", "label", "caption", "text"].some((k) => r[k] && r[k].en && !(r[k].ml || "").trim());
  function rowsFor(table) {
    const rows = [...(S.db[table] || [])];
    if (table === "events") return rows.sort((a, b) => (a.starts_on < b.starts_on ? 1 : -1));
    if (table === "posts") return rows.sort((a, b) => (a.published_on < b.published_on ? 1 : -1));
    if (table === "menu_items") { const top = rows.filter((r) => !r.parent_id).sort((a, b) => a.sort - b.sort); return top.flatMap((t) => [t, ...rows.filter((r) => r.parent_id === t.id).sort((a, b) => a.sort - b.sort)]); }
    return rows.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  }
  const TAB_HELP = {
    sections: "Every part of the home page. Drag order with the arrows; open one to change its text, photo and layout, and to add or remove its items.",
    menu_items: "The links in the main menu. A link can point to a section (#heritage) or to another website.",
    horarium: "The daily timetable. Times are monastery time (India). The entry happening now is highlighted on the site.",
    events: "Feasts and events. Only today's and future dates appear on the site.",
    posts: "News and announcements. The pinned post appears first and largest.",
    verses: "Short verses shown under the statue in the opening scene. Each time the website opens, one is chosen at random. Add the Malayalam text when it is available.",
    albums: "Photo and video albums. Open an album to add photos or YouTube videos.",
  };
  function listView(p, table, opts = {}) {
    const rows = opts.rows || rowsFor(table);
    const sortable = ["sections", "menu_items", "horarium", "albums", "section_items", "media_items", "verses"].includes(table);
    const label = (TABS.find((t) => t[0] === table) || [, opts.title || ""])[1];
    const html = `${opts.embedded ? `<div class="cms-sub-head"><h3>${esc(opts.title)}</h3><button type="button" class="cms-btn primary" data-add>+ Add</button></div>` :
      `<header class="cms-panel-head"><div><h2>${esc(label)}</h2><p>${esc(TAB_HELP[table] || "")}</p></div><button type="button" class="cms-btn primary" data-add>+ Add</button></header>`}
      ${rows.length ? `<ul class="cms-list">${rows.map((r, i) => {
        const flag = "visible" in r ? r.visible : "published" in r ? r.published : true;
        const sib = sortable ? siblings(table, r) : []; const si = sib.indexOf(r);
        return `<li class="${flag === false ? "off" : ""} ${table === "menu_items" && r.parent_id ? "child" : ""}">
          <button type="button" class="cms-row-main" data-open="${r.id}"><strong>${esc(rowTitle(table, r))}</strong><span>${esc(rowMeta(table, r))}</span></button>
          ${flag === false ? `<span class="cms-chip">${"published" in r ? "Draft" : "Hidden"}</span>` : ""}${missingML(r) ? `<span class="cms-chip warn" title="Malayalam text missing">ML missing</span>` : ""}
          <span class="cms-row-acts">${sortable ? `<button type="button" data-mv="-1" data-i="${r.id}" ${si <= 0 ? "disabled" : ""} aria-label="Move up">↑</button><button type="button" data-mv="1" data-i="${r.id}" ${si >= sib.length - 1 ? "disabled" : ""} aria-label="Move down">↓</button>` : ""}
          <button type="button" data-open="${r.id}">Edit</button><button type="button" class="danger" data-del="${r.id}" aria-label="Delete">✕</button></span></li>`;
      }).join("")}</ul>` : `<p class="cms-empty">Nothing here yet. Use “+ Add” to create the first one.</p>`}`;
    const host = opts.host || p; host.innerHTML = html;
    host.querySelector("[data-add]").onclick = async () => {
      if (opts.onAdd) return opts.onAdd();
      if (table === "sections") return addSectionDialog();
      const row = await run(() => OSB.store.insert(table, DEF[table]()), "Added"); if (!row) return;
      await OSB.reload(); D = { tab: table, id: row.id }; refreshDash();
    };
    if (table === "media_items") rows.forEach((r) => { if (r.kind !== "image") return; measure(r.url).then((d) => { if (d && Math.max(d.w, d.h) < OSB.Photo.SLOTS.full.min) { const li = host.querySelector(`[data-open="${r.id}"]`); if (li) li.insertAdjacentHTML("afterend", `<span class="cms-chip warn" title="${esc(lowMsg(d.w, d.h, 1200))}">Low resolution · ${d.w}×${d.h}</span>`); } }); });
    $$("[data-open]", host).forEach((b) => (b.onclick = () => { if (opts.onOpen) return opts.onOpen(b.dataset.open); D = { tab: table, id: b.dataset.open }; refreshDash(); }));
    $$("[data-mv]", host).forEach((b) => (b.onclick = () => { const r = rowOf(table, b.dataset.i); const sib = siblings(table, r); move(table, sib, sib.indexOf(r), +b.dataset.mv); }));
    $$("[data-del]", host).forEach((b) => (b.onclick = async () => {
      const r = rowOf(table, b.dataset.del);
      if (await confirmBox(`Delete “${rowTitle(table, r)}”? This cannot be undone.`)) { await run(() => OSB.store.remove(table, r.id), "Deleted"); await OSB.reload(); refreshDash(); }
    }));
  }

  /* ---------- generic form ---------- */
  const getPath = (o, path) => path.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
  function fieldHtml(table, r, [key, type, label, o = {}]) {
    const v = getPath(r, key); const id = `f-${key.replace(/\./g, "-")}`;
    const help = o.help ? `<small>${esc(o.help)}</small>` : "";
    if (type === "i18n" || type === "i18nArea") {
      return `<fieldset class="cms-field i18n" data-key="${key}" data-type="i18n"><legend>${esc(label)}</legend><div class="cms-pair">${LANGS.map(([l, n]) =>
        `<label><span>${n}</span>${type === "i18nArea" ? `<textarea id="${id}-${l}" data-l="${l}" rows="3">${esc((v || {})[l] || "")}</textarea>` : `<input id="${id}-${l}" data-l="${l}" value="${esc((v || {})[l] || "")}">`}</label>`).join("")}</div>${help}</fieldset>`;
    }
    if (type === "rich") return `<fieldset class="cms-field i18n" data-key="${key}" data-type="rich"><legend>${esc(label)}</legend><div class="cms-pair">${LANGS.map(([l, n]) =>
      `<div><span class="cms-mini">${n}</span><div class="cms-rich-tb" data-for="${id}-${l}"><button type="button" data-c="bold"><b>B</b></button><button type="button" data-c="italic"><i>I</i></button><button type="button" data-c="quote">“ ”</button><button type="button" data-c="ul">• List</button><button type="button" data-c="link">Link</button></div>
       <div class="cms-rich" id="${id}-${l}" data-l="${l}" contenteditable="true" role="textbox" aria-multiline="true" aria-label="${esc(label)} (${n})">${OSB.clean((v || {})[l] || "")}</div></div>`).join("")}</div>${help}</fieldset>`;
    if (type === "bool") return `<label class="cms-check" data-key="${key}" data-type="bool"><input type="checkbox" id="${id}" ${v ? "checked" : ""}> ${esc(label)}</label>`;
    if (type === "select") return `<label class="cms-field" data-key="${key}" data-type="select"><span>${esc(label)}</span><select id="${id}">${o.options.map(([k, n]) => `<option value="${esc(k)}" ${String(v ?? "") === String(k) ? "selected" : ""}>${esc(n)}</option>`).join("")}</select>${help}</label>`;
    if (type === "image") { const sl = slotOf(table, r, key); return `<div class="cms-field" data-key="${key}" data-type="image" data-min="${minRes(table, r, key)}" data-slot="${sl || ""}"><span>${esc(label)}</span><small>Recommended: at least ${minRes(table, r, key)} px on the longer side.${framed(sl) ? ` Shown in a fixed ${esc(OSB.Photo.SLOTS[sl].label.toLowerCase())} frame; use Adjust to choose what shows.` : ""}</small><div class="cms-image">
      <div class="cms-thumb">${v ? (framed(sl) ? OSB.Photo.frame(sl, v) : `<img src="${esc(OSB.Photo.fileOf(v))}" alt="">`) : "No photo"}</div><div class="cms-stack"><input id="${id}" value="${esc(v && !String(v).startsWith("data:") ? v : v ? "(uploaded photo)" : "")}" placeholder="Paste an image address, or upload" data-raw="${esc(v || "")}">
      <div class="cms-actions"><button type="button" class="cms-btn" data-upload>Upload photo</button>${framed(sl) ? `<button type="button" class="cms-btn" data-adjust ${v ? "" : "hidden"}>Adjust</button>` : ""}${v ? `<button type="button" class="cms-btn link" data-clear>Remove</button>` : ""}</div></div></div>${help}</div>`; }
    if (type === "days") return `<fieldset class="cms-field" data-key="${key}" data-type="days"><legend>${esc(label)}</legend><div class="cms-days">${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => `<label><input type="checkbox" value="${i}" ${(v || []).includes(i) ? "checked" : ""}> ${d}</label>`).join("")}</div></fieldset>`;
    if (type === "target") {
      const opts = S.db.sections.slice().sort((a, b) => a.sort - b.sort).map((s) => ["#" + s.slug, `Section: ${plain(trv(s.title)) || s.slug}`]);
      const isSec = opts.some(([k]) => k === v);
      return `<div class="cms-field" data-key="${key}" data-type="target"><span>${esc(label)}</span><select id="${id}-sel">${opts.map(([k, n]) => `<option value="${esc(k)}" ${k === v ? "selected" : ""}>${esc(n)}</option>`).join("")}<option value="__url" ${!isSec ? "selected" : ""}>Another website or address…</option></select>
        <input id="${id}-url" placeholder="https://…" value="${esc(!isSec ? v || "" : "")}" ${isSec ? "hidden" : ""}></div>`;
    }
    if (type === "sectionSettings") {
      const st = r.settings || {};
      if (r.kind === "story") return `<label class="cms-field" data-key="settings.layout" data-type="select"><span>${esc(label)}</span><select id="f-layout"><option value="image" ${st.layout !== "list" ? "selected" : ""}>Photo with the text; items shown as a timeline</option><option value="list" ${st.layout === "list" ? "selected" : ""}>List of items beside the text</option></select></label>
        <label class="cms-field" data-key="settings.photo_position" data-type="select"><span>Photo position</span><select id="f-photo_position"><option value="above" ${st.photo_position !== "beside" ? "selected" : ""}>Above the text, full width (after the heading)</option><option value="beside" ${st.photo_position === "beside" ? "selected" : ""}>Beside the text</option></select><small>Changing this changes the photo's frame shape; use Adjust afterwards to check what shows.</small></label>`;
      if (r.kind === "events" || r.kind === "news") return `<label class="cms-field" data-key="settings.limit" data-type="number"><span>How many to show</span><input id="f-limit" type="number" min="1" max="24" value="${esc(st.limit || (r.kind === "news" ? 3 : 6))}"></label>`;
      if (r.kind === "cards") return `<label class="cms-field" data-key="settings.photo" data-type="select"><span>Photo shape</span><select id="f-photo"><option value="wide" ${st.photo !== "portrait" ? "selected" : ""}>Wide (buildings, places)</option><option value="portrait" ${st.photo === "portrait" ? "selected" : ""}>Square portrait (people)</option></select></label>
        <label class="cms-check" data-key="settings.feature_first" data-type="bool"><input type="checkbox" id="f-feature" ${st.feature_first ? "checked" : ""}> Show the first item large, in the centre, with the others below it</label>`;
      if (r.kind === "hero") return `<label class="cms-check" data-key="settings.show_now" data-type="bool"><input type="checkbox" id="f-shownow" ${st.show_now !== false ? "checked" : ""}> Show “Now at Mariamala” in the top bar</label>`;
      return "";
    }
    const inputType = { date: "date", time: "time", number: "number" }[type] || "text";
    return `<label class="cms-field" data-key="${key}" data-type="${type}"><span>${esc(label)}</span><input id="${id}" type="${inputType}" value="${esc(type === "time" && v ? String(v).slice(0, 5) : v ?? "")}" ${o.required ? "required" : ""} ${o.pattern ? `pattern="${o.pattern}"` : ""}>${help}</label>`;
  }
  function readForm(form, r) {
    const patch = {};
    const put = (key, val) => { const ks = key.split("."); if (ks.length === 1) patch[key] = val; else { patch[ks[0]] = Object.assign({}, r[ks[0]] || {}, patch[ks[0]] || {}); patch[ks[0]][ks[1]] = val; } };
    $$("[data-key]", form).forEach((f) => {
      const key = f.dataset.key, t = f.dataset.type;
      if (t === "i18n") { const o = {}; $$("[data-l]", f).forEach((i) => (o[i.dataset.l] = i.value.trim())); put(key, o); }
      else if (t === "rich") { const o = {}; $$("[data-l]", f).forEach((i) => (o[i.dataset.l] = OSB.clean(i.innerHTML.replace(/<div>/g, "<p>").replace(/<\/div>/g, "</p>")).replace(/<p><br><\/p>/g, "").trim())); put(key, o); }
      else if (t === "bool") put(key, f.querySelector("input").checked);
      else if (t === "days") put(key, $$("input:checked", f).map((i) => +i.value));
      else if (t === "image") { const i = f.querySelector("input"); put(key, i.dataset.raw || null); }
      else if (t === "target") { const s = f.querySelector("select").value; put(key, s === "__url" ? f.querySelector("input").value.trim() || "#" : s); }
      else if (t === "select") { const v = f.querySelector("select").value; put(key, v === "" ? null : v); }
      else if (t === "number") put(key, Number(f.querySelector("input").value) || null);
      else { const v = f.querySelector("input").value.trim(); put(key, v === "" ? null : v); }
    });
    if ("youtube_id" in patch && patch.youtube_id) { const m = String(patch.youtube_id).match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/); if (m) patch.youtube_id = m[1]; }
    if (patch.kind === "image" && "youtube_id" in patch) patch.youtube_id = patch.youtube_id || null;
    return patch;
  }
  /* Opening scene: warn when the two pictures differ in shape, since they must line up to look like one statue changing. */
  function introPairCheck(form) {
    const note = document.createElement("p"); note.className = "cms-lowres"; note.hidden = true; form.querySelector("[data-key='settings.final_url']").after(note);
    const raw = (k) => { const i = form.querySelector(`[data-key='${k}'] input`); return i ? i.dataset.raw || "" : ""; };
    const check = async () => {
      const a = raw("settings.start_url"), b = raw("settings.final_url"); note.hidden = true;
      if (!a && !b) return;
      if (!a || !b) { note.textContent = "Add both pictures, or leave both empty to use the built-in statue. With only one, the built-in statue is used for the other, and they will not line up."; note.hidden = false; return; }
      const [da, db] = await Promise.all([measure(OSB.Photo.fileOf(a)), measure(OSB.Photo.fileOf(b))]);
      if (da && db && Math.abs(da.w / da.h - db.w / db.h) > 0.02) { note.textContent = `The two pictures have different shapes (${da.w} × ${da.h} and ${db.w} × ${db.h}). They should be the same size, with the statue in the same place, so the change looks like one statue turning gold.`; note.hidden = false; }
    };
    form.addEventListener("input", () => setTimeout(check, 50)); check();
  }
  function wireFormControls(form) {
    $$("[data-type=image]", form).forEach((f) => {
      const inp = f.querySelector("input"); const thumb = f.querySelector(".cms-thumb");
      const min = +(f.dataset.min || 800), slot = f.dataset.slot || null, adjBtn = f.querySelector("[data-adjust]");
      const note = document.createElement("span"); note.className = "cms-lowres"; note.hidden = true; f.appendChild(note);
      const check = async (u) => {
        note.hidden = true; if (!u) return; const d = await measure(OSB.Photo.fileOf(u));
        const q = slot ? OSB.Photo.quality(slot, u, d) : (d && Math.max(d.w, d.h) < min ? { ok: false, w: d.w, h: d.h, min, zoom: 1 } : null);
        if (q && !q.ok) { note.textContent = OSB.Photo.qualityMessage(q); note.hidden = false; }
      };
      const set = (u) => {
        inp.dataset.raw = u || ""; inp.value = u && !u.startsWith("data:") ? u : u ? "(uploaded photo)" : "";
        thumb.innerHTML = u ? (framed(slot) ? OSB.Photo.frame(slot, u) : `<img src="${esc(OSB.Photo.fileOf(u))}" alt="">`) : "No photo";
        if (adjBtn) adjBtn.hidden = !u; check(u);
        form.dispatchEvent(new Event("input", { bubbles: true }));
      };
      if (adjBtn) adjBtn.onclick = async () => { const cur = inp.dataset.raw; const out = await adjust(slot, cur); if (out && out !== cur) { set(out); toast("Position set — press Save"); } };
      check(inp.dataset.raw);
      inp.addEventListener("change", () => set(inp.value.trim()));
      f.querySelector("[data-upload]").onclick = async () => { const file = await pickFile(); if (!file) return; await warnIfSmallFile(file, min); toast("Uploading photo…"); const u = await run(() => OSB.store.upload(file, (m) => toast(m))); if (u) { set(await adjust(slot, u, "New photo")); toast("Photo ready — press Save"); } };
      const c = f.querySelector("[data-clear]"); if (c) c.onclick = () => set("");
    });
    $$("[data-type=target]", form).forEach((f) => { const s = f.querySelector("select"), u = f.querySelector("input"); s.onchange = () => (u.hidden = s.value !== "__url"); });
    $$(".cms-rich-tb", form).forEach((tb) => {
      tb.addEventListener("mousedown", (e) => e.preventDefault());
      tb.onclick = (e) => { const b = e.target.closest("[data-c]"); if (!b) return; document.getElementById(tb.dataset.for).focus();
        const c = b.dataset.c; if (c === "quote") document.execCommand("formatBlock", false, "blockquote"); else if (c === "ul") document.execCommand("insertUnorderedList"); else if (c === "link") linkPrompt(); else document.execCommand(c); };
    });
  }
  function formView(p, table, id, ctx = {}) {
    const isNew = !id; const r = isNew ? (table === "section_items" ? { section_id: ctx.parentId, extra: {}, visible: true } : table === "media_items" ? { album_id: ctx.parentId, kind: "image" } : DEF[table]()) : rowOf(table, id);
    if (!r) { D = { tab: D.tab }; return refreshDash(); }
    let fields = F[table]();
    if (table === "section_items") {
      const sec = rowOf("sections", r.section_id) || {};
      const keep = { tiles: ["label", "title", "body", "link"], story: sec.settings && sec.settings.layout === "list" ? ["title", "body"] : ["label", "title"], stats: ["label", "title"], steps: ["title", "body"], cards: ["label", "title", "body", "image_url", "link"], contact: ["title", "body", "extra.phone", "extra.email"] }[sec.kind];
      if (keep) fields = fields.filter(([k]) => keep.includes(k) || k === "visible");
    }
    if (table === "sections" && r.kind === "intro") fields = [
      ["title", "i18n", "Name (read by screen readers)"],
      ["settings.start_url", "image", "Starting picture (silver)", { help: "Leave empty to use the built-in statue. Use a PNG with a transparent background, or a picture on a plain white background. Both pictures should be the same size, with the statue in the same place." }],
      ["settings.final_url", "image", "Final picture (gold)", { help: "Shown at the end of the animation. Same size and position as the starting picture." }],
      ["visible", "bool", "Visible to visitors"]];
    const back = ctx.parentTable ? `${TABS.find((t) => t[0] === ctx.parentTable)[1]} › ${rowTitle(ctx.parentTable, rowOf(ctx.parentTable, ctx.parentId))}` : (TABS.find((t) => t[0] === table) || [, ""])[1];
    p.innerHTML = `<header class="cms-panel-head"><div><button type="button" class="cms-btn link" data-back>← ${esc(back)}</button><h2>${isNew ? "Add" : esc(rowTitle(table, r))}</h2>${isNew ? "" : `<button type="button" class="cms-btn" data-history>History</button>`}
      ${r.updated_at ? `<p>Last changed ${esc(new Date(r.updated_at).toLocaleString("en-IN"))}</p>` : ""}</div></header>
      <form class="cms-form" id="cms-f" novalidate>${fields.map((f) => fieldHtml(table, r, f)).join("")}
      <p class="cms-err" id="cms-f-err" hidden></p>
      <div class="cms-actions sticky"><button class="cms-btn primary" type="submit">Save</button><button type="button" class="cms-btn" data-back>Cancel</button>
      ${!isNew ? `<button type="button" class="cms-btn danger" data-delete>Delete</button>` : ""}</div></form><div id="cms-children"></div>`;
    const form = $("#cms-f", p); wireFormControls(form);
    if (table === "sections" && r.kind === "intro") introPairCheck(form);
    const hb = $("[data-history]", p); if (hb) hb.onclick = () => OSB.HistoryUI.openRow(table, id, { onRestored: async () => { await OSB.reload(); refreshDash(); } });
    const goBack = () => { if (ctx.parentTable) D = { tab: ctx.parentTable, id: ctx.parentId }; else D = { tab: D.tab }; refreshDash(); };
    $$("[data-back]", p).forEach((b) => (b.onclick = goBack));
    if (table === "media_items") {
      const kindSel = form.querySelector("#f-kind");
      const sync = () => { const v = kindSel.value === "video"; form.querySelector('[data-key="url"]').hidden = v; form.querySelector('[data-key="youtube_id"]').hidden = !v; };
      kindSel.onchange = sync; sync();
    }
    form.onsubmit = async (e) => {
      e.preventDefault(); const err = $("#cms-f-err", p); err.hidden = true;
      const bad = $$("input[required],input[pattern]", form).find((i) => !i.hidden && !i.checkValidity());
      if (bad) { err.textContent = `Please check “${bad.closest("[data-key]").querySelector("span,legend").textContent}”.`; err.hidden = false; bad.focus(); return; }
      const patch = readForm(form, r);
      const badLink = ["link", "cta_link", "target"].find((k) => patch[k] && OSB.safeUrl(patch[k]) === "#" && patch[k] !== "#");
      if (badLink) { err.textContent = "Links must start with https://, http://, mailto:, tel:, # (a section on this page) or /."; err.hidden = false; return; }
      if (patch.ends_on && patch.starts_on && patch.ends_on < patch.starts_on) { err.textContent = "The end date must be on or after the start date."; err.hidden = false; return; }
      try {
        const saved = isNew ? await OSB.store.insert(table, Object.assign({}, r, patch, table === "section_items" ? { sort: nextSort(S.db.section_items.filter((x) => x.section_id === r.section_id)) } : table === "media_items" ? { sort: nextSort(S.db.media_items.filter((x) => x.album_id === r.album_id)) } : {})) : await OSB.store.update(table, id, patch);
        toast("Saved"); await OSB.reload();
        if (isNew && !ctx.parentTable) { D = { tab: table, id: saved.id }; refreshDash(); } else goBack();
      } catch (x) { err.textContent = OSB.friendly(x); err.hidden = false; }
    };
    const del = $("[data-delete]", p); if (del) del.onclick = async () => {
      if (await confirmBox(`Delete “${rowTitle(table, r)}”? This cannot be undone.`)) { await run(() => OSB.store.remove(table, id), "Deleted"); await OSB.reload(); goBack(); }
    };
    // children
    const kids = $("#cms-children", p);
    if (!isNew && table === "sections" && ITEM_KINDS[r.kind]) {
      listView(p, "section_items", { embedded: true, host: kids, title: `Items in this section (${ITEM_KINDS[r.kind]}s)`, rows: siblings("section_items", { section_id: r.id }),
        onOpen: (cid) => { D = { tab: "sections", id: r.id, child: { table: "section_items", id: cid } }; refreshDash(); },
        onAdd: () => { D = { tab: "sections", id: r.id, child: { table: "section_items", id: "new" } }; refreshDash(); } });
    } else if (!isNew && table === "sections" && MANAGED[r.kind]) {
      kids.innerHTML = `<div class="cms-sub-head"><h3>Content</h3></div><p class="cms-p">The entries for this section are managed under <button type="button" class="cms-btn link" data-go="${MANAGED[r.kind][0]}">${esc(TABS.find((t) => t[0] === MANAGED[r.kind][0])[1])}</button>.</p>`;
      kids.querySelector("[data-go]").onclick = (e) => { D = { tab: e.target.dataset.go }; refreshDash(); };
    } else if (!isNew && table === "albums") {
      listView(p, "media_items", { embedded: true, host: kids, title: "Photos and videos in this album", rows: siblings("media_items", { album_id: r.id }),
        onOpen: (cid) => { D = { tab: "albums", id: r.id, child: { table: "media_items", id: cid } }; refreshDash(); },
        onAdd: () => { D = { tab: "albums", id: r.id, child: { table: "media_items", id: "new" } }; refreshDash(); } });
    }
    $("#cms-panel").scrollTop = 0;
  }

  /* ---------- settings ---------- */
  function settingsView(p) {
    const site = OSB.setting("site"), theme = OSB.setting("theme"), labels = OSB.setting("labels");
    const pseudo = { name: site.name, subtitle: site.subtitle, strip: site.strip, footer: site.footer, motto: site.motto, emblem_url: site.emblem_url, timezone: site.timezone,
      palette: theme.palette, show_selector: theme.show_selector !== false, bands: theme.bands !== false, emblem_opacity: theme.emblem_opacity };
    const fields = [["name", "rich", "Site name"], ["subtitle", "i18n", "Line under the name"], ["strip", "i18n", "Footer line (e.g. Archeparchy of Kottayam · Syro-Malabar Church)"], ["footer", "i18n", "Footer text"], ["motto", "i18n", "Motto"],
      ["emblem_url", "image", "Emblem"], ["timezone", "text", "Monastery time zone", { help: "Used for the timetable. India is Asia/Kolkata." }],
      ["palette", "select", "Colour theme for visitors", { options: OSB.PALETTES.map(([k, n]) => [k, n]) }], ["show_selector", "bool", "Show the colour theme picker in the footer (for the demo)"], ["bands", "bool", "Shade every second section with the band colour"],
      ["emblem_opacity", "number", "Emblem opacity (0.3 to 1)"]];
    p.innerHTML = `<header class="cms-panel-head"><div><h2>Site settings</h2><p>Name, footer, emblem, colours, and every small label used on the site.</p>
      <div class="cms-actions"><span class="cms-mini">History:</span><button type="button" class="cms-btn" data-shist="site">Site details</button><button type="button" class="cms-btn" data-shist="theme">Colours</button><button type="button" class="cms-btn" data-shist="labels">Labels</button></div></div></header>
      <form class="cms-form" id="cms-set">${fields.map((f) => fieldHtml("site_settings", pseudo, f)).join("")}
      <h3 class="cms-h3">Labels and messages</h3>${Object.keys(labels).map((k) => fieldHtml("site_settings", labels, [k, "i18n", k.replace(/_/g, " ")])).join("")}
      <p class="cms-err" id="cms-set-err" hidden></p><div class="cms-actions sticky"><button class="cms-btn primary" type="submit">Save settings</button></div></form>`;
    $$("[data-shist]", p).forEach((b) => (b.onclick = () => OSB.HistoryUI.openRow("site_settings", b.dataset.shist, { onRestored: async () => { await OSB.reload(); refreshDash(); } })));
    const form = $("#cms-set", p); wireFormControls(form);
    $$('[data-key="emblem_opacity"] input', form).forEach((i) => { i.step = "0.05"; i.min = "0.3"; i.max = "1"; });
    form.onsubmit = async (e) => {
      e.preventDefault(); const err = $("#cms-set-err", p); err.hidden = true;
      const all = readForm(form, {});
      const op = Math.min(1, Math.max(0.3, Number(all.emblem_opacity) || 0.65));
      if (all.timezone && !OSB.validTz(all.timezone)) { err.textContent = `“${all.timezone}” is not a recognised time zone. For India use Asia/Kolkata.`; err.hidden = false; return; }
      const nextSite = Object.assign({}, site, { name: all.name, subtitle: all.subtitle, strip: all.strip, footer: all.footer, motto: all.motto, emblem_url: all.emblem_url, timezone: all.timezone || "Asia/Kolkata" });
      const nextTheme = Object.assign({}, theme, { palette: all.palette, show_selector: all.show_selector, bands: all.bands, emblem_opacity: op });
      const nextLabels = {}; Object.keys(labels).forEach((k) => (nextLabels[k] = all[k]));
      try {
        await OSB.store.update("site_settings", "site", { value: nextSite });
        await OSB.store.update("site_settings", "theme", { value: nextTheme });
        await OSB.store.update("site_settings", "labels", { value: nextLabels });
        toast("Settings saved"); await OSB.reload(); refreshDash();
      } catch (x) { err.textContent = OSB.friendly(x); err.hidden = false; }
    };
  }

  /* ---------- users ---------- */
  async function usersView(p) {
    p.innerHTML = `<header class="cms-panel-head"><div><h2>Users & roles</h2><p>Admins can change everything. Editors can change content but not the menu, settings or users. People without a role cannot edit.</p></div></header><div id="cms-users">Loading…</div>`;
    const list = await run(() => OSB.store.listProfiles()); if (!list) return;
    const box = $("#cms-users", p);
    box.innerHTML = `<ul class="cms-list">${list.map((u) => `<li><div class="cms-row-main static"><strong>${esc(u.full_name || u.email)}</strong><span>${esc(u.email)}${S.user.id === u.id ? " · you" : ""}</span></div>
      <label class="cms-inline"><span class="sr">Role for ${esc(u.email)}</span><select data-user="${u.id}"><option value="admin" ${u.role === "admin" ? "selected" : ""}>Admin</option><option value="editor" ${u.role === "editor" ? "selected" : ""}>Editor</option><option value="" ${!u.role ? "selected" : ""}>No access</option></select></label></li>`).join("")}</ul>
      <div class="cms-note"><strong>Adding a new person</strong><p>${OSB.store.mode === "demo" ? "In the live site, an admin invites people from the Supabase dashboard (Authentication → Users → Invite user). They appear here with no access until you give them a role." : "Open the Supabase dashboard → Authentication → Users → Invite user, and enter their e-mail. They appear in this list straight away, with no access, and receive an e-mail to choose their password. Then choose Editor or Admin here for them."}</p></div>`;
    $$("[data-user]", box).forEach((s) => (s.onchange = async () => {
      const ok = await run(() => OSB.store.setRole(s.dataset.user, s.value), "Role updated");
      if (ok === undefined) usersView(p);
      else if (s.dataset.user === S.user.id) { S.user = await OSB.store.user(); bar(); refreshDash(); }
    }));
  }

  /* Shown after following an invitation or password-reset e-mail. */
  function passwordDialog() {
    if ($("#cms-setpw")) return;
    const m = modal(`<h2 class="cms-h">Choose your password</h2><p class="cms-p">You will use this password with your e-mail address to sign in.</p>
      <form class="cms-form" id="cms-setpw"><label class="cms-field"><span>New password (at least 8 characters)</span><input id="cms-pw1" type="password" autocomplete="new-password" minlength="8" required></label>
      <label class="cms-field"><span>Type it again</span><input id="cms-pw2" type="password" autocomplete="new-password" minlength="8" required></label>
      <p class="cms-err" id="cms-pw-err" hidden></p><div class="cms-actions"><button class="cms-btn primary" type="submit">Save password</button></div></form>`, "small");
    const f = m.el.querySelector("#cms-setpw"), err = m.el.querySelector("#cms-pw-err");
    f.onsubmit = async (e) => {
      e.preventDefault(); err.hidden = true;
      const a = f.querySelector("#cms-pw1").value, b = f.querySelector("#cms-pw2").value;
      if (a.length < 8) { err.textContent = "The password must have at least 8 characters."; err.hidden = false; return; }
      if (a !== b) { err.textContent = "The two passwords are different."; err.hidden = false; return; }
      try { await OSB.store.setPassword(a); m.close(); toast("Password saved. You're signed in."); S.user = await OSB.store.user(); await OSB.reload(); bar(); }
      catch (x) { err.textContent = OSB.friendly(x); err.hidden = false; }
    };
  }
  OSB.onPasswordSetup = passwordDialog;

  window.addEventListener("beforeunload", (e) => { if (dashDirty && $("#cms-dash-wrap")) { e.preventDefault(); e.returnValue = ""; } });
  OSB.afterUndo = () => { if ($("#cms-dash-wrap")) refreshDash(); };
  OSB.editorInit = function () { if (OSB.Undo) OSB.Undo.attach(OSB.store, () => S.db); if (OSB.store.needsPassword && OSB.store.needsPassword() && S.user) passwordDialog(); bar(); if (location.hash === "#admin") { if (role()) dashboard(); else signInDialog(); } };
})();
