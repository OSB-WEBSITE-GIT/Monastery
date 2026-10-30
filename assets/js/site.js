/* Public site: renders every word, menu item and image from the data layer. */
(function () {
  const OSB = (window.OSB = window.OSB || {});
  const S = (OSB.state = { db: null, lang: "en", user: null, editing: false, palette: null });
  const $ = (sel, el = document) => el.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  OSB.esc = esc;
  /* Links: only web, e-mail, phone and on-site addresses are allowed. Anything else (e.g. javascript:) becomes "#". */
  function safeUrl(u) {
    const v = String(u ?? "").trim();
    if (/^(https?:\/\/|mailto:|tel:)/i.test(v) || /^#[\w-]*$/.test(v) || /^\/(?!\/)/.test(v)) return v;
    return "#";
  }
  OSB.safeUrl = safeUrl;
  /* Rich-text sanitiser (built in, no external library). Parses into an inert document and keeps only
     simple formatting tags; everything else is unwrapped or removed. Running it twice gives the same result. */
  const KEEP = new Set(["P", "BR", "B", "STRONG", "I", "EM", "U", "A", "UL", "OL", "LI", "BLOCKQUOTE", "H3", "H4", "SPAN"]);
  const DROP = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "TEMPLATE", "NOSCRIPT", "SVG", "MATH", "TITLE", "TEXTAREA", "SELECT", "BUTTON", "INPUT", "FORM", "LINK", "META", "BASE", "IMG", "VIDEO", "AUDIO", "SOURCE", "FRAME", "FRAMESET"]);
  function walk(node) {
    for (const c of Array.from(node.childNodes)) {
      if (c.nodeType === 3) continue;
      if (c.nodeType !== 1) { c.remove(); continue; }
      const tag = c.tagName.toUpperCase();
      if (DROP.has(tag)) { c.remove(); continue; }
      walk(c);
      if (!KEEP.has(tag)) { c.replaceWith(...Array.from(c.childNodes)); continue; }
      const href = tag === "A" ? c.getAttribute("href") : null;
      for (const a of Array.from(c.attributes)) c.removeAttribute(a.name);
      if (tag === "A") {
        const u = safeUrl(href);
        if (u === "#" && href !== "#") { c.replaceWith(...Array.from(c.childNodes)); continue; }
        c.setAttribute("href", u);
        if (/^https?:/i.test(u)) { c.setAttribute("target", "_blank"); c.setAttribute("rel", "noopener"); }
      }
    }
  }
  function clean(html) {
    if (!html) return "";
    const doc = new DOMParser().parseFromString("<!doctype html><body>" + String(html) + "</body>", "text/html");
    walk(doc.body);
    return doc.body.innerHTML;
  }
  OSB.clean = clean;
  const ext = (u) => (/^https?:/i.test(u) ? ' target="_blank" rel="noopener"' : "");
  /* Photos are drawn by the photo module (assets/js/photo.js), which owns frame shapes and sizes. */
  const Photo = () => OSB.Photo;

  /* ---------- i18n ---------- */
  function tr(obj) {
    if (!obj) return { v: "", fb: false };
    const v = obj[S.lang];
    if (v && String(v).trim()) return { v, fb: false };
    return { v: obj.en || "", fb: S.lang !== "en" && !!obj.en };
  }
  OSB.tr = (o) => tr(o).v;
  const setting = (k) => (S.db.site_settings.find((r) => r.key === k) || { value: {} }).value;
  const L = (k) => tr((setting("labels") || {})[k]).v;
  OSB.L = L; OSB.setting = setting;

  /* editable text: data-e = table|id|field|mode  (mode: text | rich | inline) */
  function T(tag, table, id, field, obj, cls = "", mode = "text") {
    const { v, fb } = tr(obj);
    const body = mode === "text" ? esc(v) : clean(v);
    const empty = !String(v).trim();
    if (empty && !S.inlineText) return "";
    const classes = [cls, mode === "rich" ? "rich" : "", fb && S.inlineText ? "is-fallback" : "", empty ? "is-empty" : ""].filter(Boolean).join(" ");
    return `<${tag} class="${classes}" data-e="${table}|${id}|${field}|${mode}">${body}</${tag}>`;
  }
  /* An editable framed photo: slot = hero | section | card | portrait (see SLOTS in photo.js). */
  const PH = (slot, table, id, field, url, alt, eager = false) => {
    if (!url && !S.editing) return "";
    const attrs = `data-src="${esc(url || "")}" data-img="${table}|${id}|${field}" data-slot="${slot}"`;
    return url ? Photo().frame(slot, url, { alt, eager, attrs }) : `<div class="ph" data-slot="${slot}"><img src="" alt="" ${attrs} data-empty="1"></div>`;
  };
  const rowAttr = (table, r) => `data-row="${table}|${r.id}"${(r.visible === false || r.published === false) ? ' data-hidden="1"' : ""}`;

  /* ---------- time (monastery time zone) ---------- */
  function validTz(z) { try { new Intl.DateTimeFormat("en-GB", { timeZone: z }); return true; } catch (e) { return false; } }
  OSB.validTz = validTz;
  function tz() { const z = setting("site").timezone; return z && validTz(z) ? z : "Asia/Kolkata"; }
  function nowParts() {
    const p = new Intl.DateTimeFormat("en-GB", { timeZone: tz(), hour: "2-digit", minute: "2-digit", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
    const g = (t) => (p.find((x) => x.type === t) || {}).value;
    const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(g("weekday"));
    return { min: +g("hour") * 60 + +g("minute"), day: wd, date: `${g("year")}-${g("month")}-${g("day")}` };
  }
  OSB.today = () => nowParts().date;
  const toMin = (t) => { const [h, m] = String(t).split(":"); return +h * 60 + +m; };
  function fmtTime(t) {
    const m = typeof t === "number" ? t : toMin(t); let h = Math.floor(m / 60) % 24; const mm = String(m % 60).padStart(2, "0");
    const ap = h < 12 ? "am" : "pm"; h = h % 12 || 12; return `${h}:${mm} ${ap}`;
  }
  OSB.fmtTime = fmtTime;
  function hourState() {
    const n = nowParts();
    const rows = S.db.horarium.filter((r) => r.visible !== false && (r.days || []).includes(n.day)).sort((a, b) => toMin(a.start_time) - toMin(b.start_time));
    const cur = rows.find((r) => toMin(r.start_time) <= n.min && n.min < toMin(r.end_time)) || null;
    const next = rows.find((r) => toMin(r.start_time) > n.min) || rows[0] || null;
    return { n, rows, cur, next };
  }

  /* ---------- renderers ---------- */
  const R = {};
  /* Hero: photo in a fixed responsive frame; only the label and headline sit over it, in a band of at most
     30% of the photo's height (SLOTS.hero.band). The text and button follow below the photo. */
  R.hero = (s) => `
    <div class="hero" id="${esc(s.slug)}" data-section="${s.id}"><div class="wrap">
      ${tr(s.eyebrow).v ? `<div class="head hero-head">${T("span", "sections", s.id, "eyebrow", s.eyebrow, "label")}</div>` : ""}
      <figure class="hero-fig"><div class="banner-frame">
        ${PH("hero", "sections", s.id, "image_url", s.image_url, tr(s.image_caption).v, true)}
        ${tr(s.title).v ? T("h1", "sections", s.id, "title", s.title, "banner-title hero-title") : ""}
      </div></figure>
      ${T("p", "sections", s.id, "image_caption", s.image_caption, "caption")}
      <div class="hero-text">${T("div", "sections", s.id, "body", s.body, "", "rich")}${cta(s)}</div>
      ${tilesAfterHero()}
    </div></div>`;
  function cta(s) {
    if (!s.cta_link && !S.inlineText) return "";
    const lab = tr(s.cta_label).v; if (!lab && !S.inlineText) return "";
    return `<div class="cta-row"><a class="btn" href="${esc(safeUrl(s.cta_link || "#"))}"${ext(s.cta_link)}>${T("span", "sections", s.id, "cta_label", s.cta_label)}<span aria-hidden="true">→</span></a></div>`;
  }
  let heroTiles = null;
  function tilesAfterHero() { return heroTiles ? R._tiles(heroTiles) : ""; }
  R._tiles = (s) => `<div class="tiles" data-section="${s.id}" data-inline-section="1">${items(s).map((it) => {
      const tag = it.link && !S.editing ? "a" : "div";
      return `<${tag} class="tile" ${tag === "a" ? `href="${esc(safeUrl(it.link))}"${ext(it.link)}` : ""} ${rowAttr("section_items", it)}>
        ${T("span", "section_items", it.id, "label", it.label, "mark")}
        ${T("span", "section_items", it.id, "title", it.title, "t")}
        ${T("span", "section_items", it.id, "body", it.body, "d")}</${tag}>`;
    }).join("")}</div>`;
  R.tiles = (s) => `<section class="block" id="${esc(s.slug)}" data-section="${s.id}"><div class="wrap">${head(s)}${R._tiles(s)}</div></section>`;
  const items = (s) => S.db.section_items.filter((i) => i.section_id === s.id).sort((a, b) => a.sort - b.sort);
  function head(s) {
    const h = [T("span", "sections", s.id, "eyebrow", s.eyebrow, "label"), T("h2", "sections", s.id, "title", s.title), T("div", "sections", s.id, "body", s.body, "", "rich")].join("");
    return h.trim() ? `<div class="head">${h}</div>` : "";
  }
  function headNoBody(s) {
    const h = [T("span", "sections", s.id, "eyebrow", s.eyebrow, "label"), T("h2", "sections", s.id, "title", s.title)].join("");
    return h.trim() ? `<div class="head">${h}</div>` : "";
  }
  R.text = (s) => `<section class="block" id="${esc(s.slug)}" data-section="${s.id}"><div class="wrap">${head(s)}${cta(s)}</div></section>`;
  /* Story: by default the photo comes straight after the heading, full width, with the text below
     (settings.photo_position = "above"); "beside" puts it next to the text. */
  R.story = (s) => {
    const st = s.settings || {}; const its = items(s);
    const listMode = st.layout === "list";
    const above = !listMode && st.photo_position !== "beside";
    const aside = listMode
      ? (its.length || S.inlineText ? `<ul class="list">${its.map((it) => `<li ${rowAttr("section_items", it)}>${T("span", "section_items", it.id, "title", it.title, "t")}${T("span", "section_items", it.id, "body", it.body, "d")}</li>`).join("")}</ul>` : "")
      : above ? "" : (s.image_url || S.editing ? `<figure>${PH("sectionSide", "sections", s.id, "image_url", s.image_url, tr(s.image_caption).v)}${T("figcaption", "sections", s.id, "image_caption", s.image_caption)}</figure>` : "");
    // With a photo above the text, the heading sits on the photo (top left) in a box of the menu colour; the small label stays above.
    const onPhoto = above && !!s.image_url && !!tr(s.title).v && st.title_on_photo !== false;
    const banner = above && (s.image_url || S.editing) ? `<figure class="story-banner"><div class="banner-frame">${PH("section", "sections", s.id, "image_url", s.image_url, tr(s.image_caption).v)}${onPhoto ? T("h2", "sections", s.id, "title", s.title, "banner-title") : ""}</div>${T("figcaption", "sections", s.id, "image_caption", s.image_caption)}</figure>` : "";
    const timeline = !listMode && its.length ? `<ol class="timeline">${its.map((it) => `<li ${rowAttr("section_items", it)}>${T("span", "section_items", it.id, "label", it.label, "mark")}${T("span", "section_items", it.id, "title", it.title, "t")}</li>`).join("")}</ol>` : "";
    return `<section class="block" id="${esc(s.slug)}" data-section="${s.id}"><div class="wrap">
      ${onPhoto ? (tr(s.eyebrow).v ? `<div class="head">${T("span", "sections", s.id, "eyebrow", s.eyebrow, "label")}</div>` : "") : headNoBody(s)}
      ${banner}
      <div class="story ${aside ? "" : "no-aside"}"><div>${T("div", "sections", s.id, "body", s.body, "", "rich")}${cta(s)}</div>${aside}</div>
      ${timeline}</div></section>`;
  };
  R.stats = (s) => `<section class="block" id="${esc(s.slug)}" data-section="${s.id}"><div class="wrap">${head(s)}
    <div class="stats">${items(s).map((it) => `<div class="stat" ${rowAttr("section_items", it)}>${T("span", "section_items", it.id, "label", it.label, "mark")}${T("span", "section_items", it.id, "title", it.title, "t")}</div>`).join("")}</div></div></section>`;
  R.steps = (s) => `<section class="block" id="${esc(s.slug)}" data-section="${s.id}"><div class="wrap">${head(s)}
    <ol class="steps">${items(s).map((it) => `<li ${rowAttr("section_items", it)}>${T("span", "section_items", it.id, "title", it.title, "t")}${T("span", "section_items", it.id, "body", it.body, "d")}</li>`).join("")}</ol>${cta(s)}</div></section>`;
  R.cards = (s) => {
    const its = items(s), st = s.settings || {};
    // the featured card shows the whole photo (not cropped) on the left, with the text on the right
    const card = (it, cls = "") => `<div class="card ${cls}" ${rowAttr("section_items", it)}>${under ? T("span", "section_items", it.id, "label", it.label, "label") : ""}${PH(cls === "featured" ? "full" : st.photo === "portrait" ? "portrait" : "card", "section_items", it.id, "image_url", it.image_url, tr(it.title).v)}${cls === "featured" ? '<div class="card-text">' : ""}${under ? "" : T("span", "section_items", it.id, "label", it.label, "label")}${T("span", "section_items", it.id, "title", it.title, "t")}${T("div", "section_items", it.id, "body", it.body, "d", "rich")}${it.link ? `<a href="${esc(safeUrl(it.link))}"${ext(it.link)}>${esc(L("read_more"))} →</a>` : ""}${cls === "featured" ? "</div>" : ""}</div>`;
    // "feature_first": the first card is shown large in the centre, the others below it
    const feature = st.feature_first && its.length > 1;
    let under = false;   // cards below a featured one: role above the photo, name below
    const list = feature ? its.slice(1) : its;
    return `<section class="block" id="${esc(s.slug)}" data-section="${s.id}"><div class="wrap">${its.length ? head(s) : headNoBody(s)}
      ${its.length ? "" : `<div class="note">${T("div", "sections", s.id, "body", s.body, "", "rich") || esc(L("empty_cards"))}</div>`}
      ${feature ? `<div class="card-feature">${card(its[0], "featured")}</div>` : ""}
      ${list.length ? `<div class="cards ${st.photo === "portrait" ? "portrait" : ""} ${feature ? "under-feature" : ""}" data-more="${st.limit || 8}">${list.map((it) => { under = feature; const h = card(it); under = false; return h; }).join("")}</div>` : ""}
      ${cta(s)}</div></section>`;
  };
  R.contact = (s) => `<section class="block" id="${esc(s.slug)}" data-section="${s.id}"><div class="wrap">${headNoBody(s)}
    <div class="contact">${items(s).map((it) => {
      const x = it.extra || {};
      return `<div class="addr" ${rowAttr("section_items", it)}>${T("h3", "section_items", it.id, "title", it.title)}${T("div", "section_items", it.id, "body", it.body, "d", "inline")}
        ${x.phone ? `<span class="k">${esc(L("phone"))}</span><span class="v">${esc(x.phone)}</span>` : ""}
        ${x.email ? `<span class="k">${esc(L("email"))}</span><span class="v">${esc(x.email)}</span>` : ""}</div>`;
    }).join("")}</div>
    ${tr(s.body).v || S.inlineText ? `<div class="note contact-note">${T("div", "sections", s.id, "body", s.body, "", "rich")}</div>` : ""}</div></section>`;

  /* horarium with a 24-hour dial */
  R.horarium = (s) => {
    const { rows, cur, next } = hourState();
    const list = rows.map((r) => `<li class="${r.is_prayer ? "prayer" : "work"} ${cur && cur.id === r.id ? "current" : ""}" ${rowAttr("horarium", r)}>
        <span class="time">${fmtTime(r.start_time)}</span>${T("span", "horarium", r.id, "name", r.name, "name")}
        ${cur && cur.id === r.id ? `<span class="pill">${esc(L("now"))}</span>` : !cur && next && next.id === r.id ? `<span class="pill next">${esc(L("next"))}</span>` : "<span></span>"}</li>`).join("");
    if (!rows.length) return `<section class="block" id="${esc(s.slug)}" data-section="${s.id}" data-managed="horarium"><div class="wrap">${head(s)}<p class="note">${esc(L("no_hours"))}</p></div></section>`;
    return `<section class="block" id="${esc(s.slug)}" data-section="${s.id}" data-managed="horarium"><div class="wrap">${head(s)}
      <div class="horarium"><div>${dial(rows, cur)}</div><ol class="hours">${list}</ol></div></div></section>`;
  };
  function dial(rows, cur) {
    const c = 120, r = 92, n = nowParts();
    const pt = (min, rad) => { const a = (min / 1440) * 2 * Math.PI - Math.PI / 2; return [c + rad * Math.cos(a), c + rad * Math.sin(a)]; };
    const arc = (a, b) => { const [x1, y1] = pt(a, r), [x2, y2] = pt(b, r); const big = b - a > 720 ? 1 : 0; return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 ${big} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`; };
    const segs = rows.map((x) => `<path class="seg ${x.is_prayer ? "prayer" : "work"} ${cur && cur.id === x.id ? "current" : ""}" d="${arc(toMin(x.start_time) + 2, toMin(x.end_time) - 2)}"><title>${esc(tr(x.name).v)} · ${fmtTime(x.start_time)}–${fmtTime(x.end_time)}</title></path>`).join("");
    const ticks = [0, 360, 720, 1080].map((m, i) => { const [x1, y1] = pt(m, 104), [x2, y2] = pt(m, 112), [lx, ly] = pt(m, 70);
      return `<line class="tick" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><text class="tick-label" x="${lx}" y="${ly}">${["12 am", "6 am", "noon", "6 pm"][i]}</text>`; }).join("");
    const [hx, hy] = pt(n.min, 112);
    return `<svg class="dial" viewBox="0 0 240 240" role="img" aria-label="Today's timetable as a 24-hour dial">
      <circle class="face" cx="${c}" cy="${c}" r="116"/>${ticks}${segs}
      <line class="hand" x1="${c}" y1="${c}" x2="${hx.toFixed(2)}" y2="${hy.toFixed(2)}"/><circle class="hub" cx="${c}" cy="${c}" r="4"/>
      <text class="time" x="${c}" y="${c + 34}">${fmtTime(n.min).replace(/ (am|pm)/, "")}</text>
      <text class="zone" x="${c}" y="${c + 50}">${fmtTime(n.min).slice(-2).toUpperCase()} · ${esc(L("ist"))}</text></svg>`;
  }

  /* events: one-off, or repeating every year on the same day (feasts) */
  function occurrence(e, today) {
    if (!e.repeats_yearly) return (e.ends_on || e.starts_on) >= today ? e : null;
    const md = e.starts_on.slice(5), len = e.ends_on ? (Date.parse(e.ends_on) - Date.parse(e.starts_on)) : 0;
    const end = (yy) => (len ? new Date(Date.parse(`${yy}-${md}`) + len).toISOString().slice(0, 10) : `${yy}-${md}`);
    let y = Math.max(+today.slice(0, 4), +e.starts_on.slice(0, 4));
    if (end(y) < today) y += 1;
    return Object.assign({}, e, { starts_on: `${y}-${md}`, ends_on: len ? end(y) : null });
  }
  OSB.occurrence = occurrence;
  R.events = (s) => {
    const today = nowParts().date; const lim = (s.settings || {}).limit || 6;
    const list = S.db.events.map((e) => occurrence(e, today)).filter(Boolean).sort((a, b) => (a.starts_on > b.starts_on ? 1 : -1));
    // past one-off events (yearly feasts simply move on to next year)
    const past = S.db.events.filter((e) => !e.repeats_yearly && (e.ends_on || e.starts_on) < today).sort((a, b) => (a.starts_on < b.starts_on ? 1 : -1));
    const loc = S.lang === "ml" ? "ml-IN" : "en-IN";
    const evt = (e) => {
      const d = new Date(e.starts_on + "T00:00:00");
      return `<article class="event" ${rowAttr("events", e)}>
        <div class="date"><span class="m">${esc(d.toLocaleDateString(loc, { month: "short" }))}</span><span class="d">${d.getDate()}</span><span class="y">${d.getFullYear()}</span></div>
        <div class="body"><span class="cat">${esc(L(e.category) || e.category)}${e.time_label ? " · " + esc(e.time_label) : ""}</span>
          ${T("h3", "events", e.id, "title", e.title, "t")}${T("p", "events", e.id, "description", e.description, "d2")}${T("p", "events", e.id, "location", e.location, "d2")}</div></article>`;
    };
    const body = (list.length ? `<div class="events" data-more="${lim}">${list.map(evt).join("")}</div>` : `<p class="muted">${esc(L("no_events"))}</p>`)
      + (past.length ? `<div class="past-wrap"><button type="button" class="view-more" data-toggle-past>${S.lang === "ml" ? "കഴിഞ്ഞ പരിപാടികൾ" : "Past events"} (${past.length})</button>
          <div class="events past" hidden data-more="${lim}">${past.map(evt).join("")}</div></div>` : "");
    return `<section class="block" id="${esc(s.slug)}" data-section="${s.id}" data-managed="events"><div class="wrap">${head(s)}${body}</div></section>`;
  };

  /* news */
  const fmtDate = (d) => new Date(d + "T00:00:00").toLocaleDateString(S.lang === "ml" ? "ml-IN" : "en-IN", { day: "numeric", month: "long", year: "numeric" });
  R.news = (s) => {
    const lim = (s.settings || {}).limit || 3;
    const posts = [...S.db.posts].sort((a, b) => (b.pinned - a.pinned) || (a.published_on < b.published_on ? 1 : -1));
    const mm = S.db.sections.find((x) => x.slug === "mariamala") || {};
    const thumb = s.image_url || mm.image_url;   // the section's photo; otherwise the Mariamala photo
    const row = (p) => `<article class="news-row ${p.cover_url ? "" : "no-pic"}" ${rowAttr("posts", p)} data-open-post="${p.id}" tabindex="0" role="button">
      ${p.cover_url ? Photo().frame("card", p.cover_url) : ""}
      <div class="nr-text"><span class="when">${esc(fmtDate(p.published_on))}</span>
      ${T("h3", "posts", p.id, "title", p.title, "t")}${T("p", "posts", p.id, "excerpt", p.excerpt, "x")}
      <span class="more">${esc(L("read_more"))} →</span></div></article>`;
    return `<section class="block" id="${esc(s.slug)}" data-section="${s.id}" data-managed="posts"><div class="wrap">
      <div class="news-head">${thumb ? `<div class="news-thumb">${PH("card", "sections", s.id, "image_url", thumb, tr(s.title).v)}</div>` : ""}${head(s)}</div>
      ${posts.length ? `<div class="news-list" data-more="${lim}">${posts.map(row).join("")}</div>` : `<p class="muted">${esc(L("no_posts"))}</p>`}</div></section>`;
  };

  /* new members: a two-column list, photo | name, event and date, house; newest first */
  R.members = (s) => {
    const its = items(s).sort((a, b) => ((b.extra || {}).date || "").localeCompare((a.extra || {}).date || ""));
    return `<section class="block" id="${esc(s.slug)}" data-section="${s.id}"><div class="wrap">${head(s)}
      ${its.length ? `<div class="members" data-more="${(s.settings || {}).limit || 6}">${its.map((it) => { const x = it.extra || {}; return `<div class="member" ${rowAttr("section_items", it)}>
        ${PH("portrait", "section_items", it.id, "image_url", it.image_url, tr(it.title).v)}
        <div class="mb-text">${T("span", "section_items", it.id, "title", it.title, "t")}
          <span class="mb-ev">${esc(tr(it.label).v)}${x.date ? `${tr(it.label).v ? " · " : ""}${esc(fmtDate(x.date))}` : ""}</span>
          ${x.house ? `<span class="mb-house">${esc(x.house)}</span>` : ""}</div></div>`; }).join("")}</div>` : `<p class="muted">${S.lang === "ml" ? "ഉടൻ ചേർക്കും." : "Coming soon."}</p>`}</div></section>`;
  };

  /* creative corner: writing, art and films (video links only); filter tabs; open to read or view */
  const plain = (h) => String(h || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  const ytId = (u) => ((u || "").match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/) || [])[1];
  const CTYPES = [["all", "All", "എല്ലാം"], ["writing", "Writing", "രചനകൾ"], ["art", "Art", "ചിത്രങ്ങൾ"], ["film", "Films", "ചിത്രങ്ങൾ (വീഡിയോ)"]];
  R.creative = (s) => {
    const its = items(s);
    const typeOf = (it) => ((it.extra || {}).type || (it.link ? "film" : it.image_url ? "art" : "writing"));
    const present = new Set(its.map(typeOf));
    const tabs = CTYPES.filter(([k]) => k === "all" || present.has(k));
    const card = (it) => { const t = typeOf(it), x = it.extra || {}, id = ytId(it.link);
      const pic = t === "film" ? (id ? `<div class="ph cr-film" data-slot="card"><img src="https://i.ytimg.com/vi/${esc(id)}/hqdefault.jpg" alt="" loading="lazy"><span aria-hidden="true">▶</span></div>` : "")
        : it.image_url ? PH("card", "section_items", it.id, "image_url", it.image_url, tr(it.title).v) : "";
      const ex = t === "writing" ? plain(tr(it.body).v).slice(0, 170) : "";
      return `<article class="cr-card" data-type="${t}" ${rowAttr("section_items", it)} data-open-creative="${it.id}" tabindex="0" role="button">${pic}
        <span class="label">${esc(tr(it.label).v || (CTYPES.find((c) => c[0] === t) || [])[1] || "")}</span>
        ${T("h3", "section_items", it.id, "title", it.title, "t")}${x.author ? `<span class="cr-by">${esc(x.author)}</span>` : ""}
        ${ex ? `<p class="x">${esc(ex)}${plain(tr(it.body).v).length > 170 ? "…" : ""}</p>` : ""}</article>`; };
    return `<section class="block" id="${esc(s.slug)}" data-section="${s.id}"><div class="wrap">${head(s)}
      ${its.length ? `${tabs.length > 2 ? `<div class="cr-tabs" role="group" aria-label="Show">${tabs.map(([k, en, ml]) => `<button type="button" data-cr-tab="${k}" aria-pressed="${k === "all"}">${S.lang === "ml" ? ml : en}</button>`).join("")}</div>` : ""}
        <div class="cr-grid" data-more="${(s.settings || {}).limit || 6}">${its.map(card).join("")}</div>` : `<p class="muted">${S.lang === "ml" ? "ഉടൻ ചേർക്കും." : "Coming soon."}</p>`}</div></section>`;
  };
  function openCreative(id) {
    const it = S.db.section_items.find((x) => x.id === id); if (!it) return;
    const x = it.extra || {}, yid = ytId(it.link), t = x.type || (it.link ? "film" : it.image_url ? "art" : "writing");
    if (t === "film" && it.link && !yid) { window.open(it.link, "_blank", "noopener"); return; }
    overlay(`<article class="reader" role="dialog" aria-modal="true" aria-label="${esc(tr(it.title).v)}"><button type="button" class="x-btn" data-close>${esc(L("close"))} ✕</button>
      ${t === "film" && yid ? `<div class="cr-video"><iframe src="https://www.youtube-nocookie.com/embed/${esc(yid)}" title="${esc(tr(it.title).v)}" allow="accelerometer; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>`
        : it.image_url ? Photo().frame("full", it.image_url, { eager: true }) : ""}
      <span class="label">${esc(tr(it.label).v)}</span><h2>${esc(tr(it.title).v)}</h2>${x.author ? `<p class="cr-by">${esc(x.author)}</p>` : ""}
      <div class="rich">${clean(tr(it.body).v)}</div></article>`);
  }

  /* gallery */
  const mediaOf = (a) => S.db.media_items.filter((m) => m.album_id === a.id).sort((x, y) => x.sort - y.sort);
  R.gallery = (s) => {
    const albums = [...S.db.albums].sort((a, b) => a.sort - b.sort);
    return `<section class="block" id="${esc(s.slug)}" data-section="${s.id}" data-managed="albums"><div class="wrap">${head(s)}
      <div class="albums" data-more="8">${albums.map((a) => {
        const m = mediaOf(a); const cover = a.cover_url || (m.find((x) => x.kind === "image") || {}).url;
        return `<article class="album" ${rowAttr("albums", a)} data-open-album="${a.id}" tabindex="0" role="button">
          <div class="cover">${cover ? Photo().frame("cover", cover) : esc(L("empty_album"))}</div>
          ${T("h3", "albums", a.id, "title", a.title, "t")}<span class="n">${m.length} ${esc(m.length === 1 && S.lang !== "ml" ? L("items").replace(/s$/, "") : L("items"))}</span></article>`;
      }).join("")}</div></div></section>`;
  };

  /* ---------- chrome: strip, header, nav, footer ---------- */
  function chrome() {
    const site = setting("site");
    const menu = S.db.menu_items.filter((m) => !m.parent_id).sort((a, b) => a.sort - b.sort);
    const kids = (m) => S.db.menu_items.filter((x) => x.parent_id === m.id).sort((a, b) => a.sort - b.sort);
    const link = (m) => `<a href="${esc(safeUrl(m.target))}"${ext(m.target)} ${rowAttr("menu_items", m)}>${T("span", "menu_items", m.id, "label", m.label)}</a>`;
    $("#masthead").innerHTML = `<div class="wrap">${site.emblem_url ? `<img class="emblem" src="${esc(site.emblem_url)}" alt="Arms of Vallombrosa" data-img="site_settings|site|emblem_url">` : ""}
      <a class="wordmark" href="#top">${T("span", "site_settings", "site", "name", site.name, "name", "inline")}${T("span", "site_settings", "site", "subtitle", site.subtitle, "sub")}</a>
      <div class="lang" role="group" aria-label="Language / ഭാഷ"><button type="button" id="lang-en" data-lang="en" lang="en" aria-label="English" title="English" aria-pressed="${S.lang === "en"}">En</button><span aria-hidden="true">/</span><button type="button" id="lang-ml" data-lang="ml" lang="en" aria-label="മലയാളം (Malayalam)" title="മലയാളം" aria-pressed="${S.lang === "ml"}">Ma</button></div></div>`;
    $("#nav").innerHTML = `<div class="wrap"><ul>${menu.map((m) => {
      const k = kids(m);
      return `<li>${k.length ? `<button type="button" data-submenu="${m.id}" ${rowAttr("menu_items", m)}>${T("span", "menu_items", m.id, "label", m.label)} ▾</button>` : link(m)}</li>`;
    }).join("")}</ul></div><div class="sub-row" id="sub-row" hidden></div>`;
    $("#nav").__kids = kids; $("#nav").__link = link;
    fitNav();
    const th = setting("theme");
    $("#footer").innerHTML = `<div class="wrap"><div class="row">${site.emblem_url ? `<img class="emblem" src="${esc(site.emblem_url)}" alt="">` : "<span></span>"}
      <div style="display:grid;gap:.3rem">${T("span", "site_settings", "site", "motto", site.motto, "motto")}${T("span", "site_settings", "site", "footer", site.footer)}${T("span", "site_settings", "site", "strip", site.strip, "foot-strip")}<span class="now-chip" id="now-chip"></span></div></div>
      ${th.show_selector !== false ? palettePicker() : ""}
      <div class="foot-bottom"><span>© ${new Date().getFullYear()} · ${esc(tr(site.name).v.replace(/<[^>]+>/g, ""))}</span>
      <button type="button" class="signin-link" id="signin-link">${S.user ? esc(S.user.email) : esc(L("sign_in"))}</button></div></div>`;
  }
  const PALETTES = [["ivory", "Ivory White", "ഐവറി വൈറ്റ്", "#ffffff", "#8a6a2b"], ["marian", "Marian Blue", "മരിയൻ ബ്ലൂ", "#ffffff", "#2a4a86"], ["sage", "Vallombrosa Sage", "വല്ലോംബ്രോസ സേജ്", "#ffffff", "#556b3e"], ["parchment", "Parchment", "പാർച്ച്മെന്റ്", "#f3ede0", "#8f6f2e"], ["night", "Benedictine Night", "ബെനഡിക്ടൈൻ നൈറ്റ്", "#1c1814", "#d1b06d"], ["rose", "Rose", "റോസ്", "#ffffff", "#ec776e"]];
  OSB.PALETTES = PALETTES;
  function palettePicker() {
    return `<div class="palette" role="group" aria-labelledby="pal-label"><span class="label" id="pal-label">${esc(L("theme"))}</span><div class="swatches">
      ${PALETTES.map(([k, en, ml, a, b]) => `<button type="button" id="pal-${k}" data-palette="${k}" aria-pressed="${S.palette === k}"><span class="dot" style="--a:${a};--b:${b}"></span>${S.lang === "ml" ? ml : en}</button>`).join("")}</div></div>`;
  }

  /* ---------- live "now" ---------- */
  function updateNow() {
    const chip = $("#now-chip"); if (!chip || !S.db) return;
    const hero = S.db.sections.find((x) => x.kind === "hero");
    if (hero && (hero.settings || {}).show_now === false) { chip.innerHTML = ""; return; }
    const { cur, next } = hourState();
    const r = cur || next; if (!r) { chip.innerHTML = ""; return; }
    chip.innerHTML = cur
      ? `<span class="dot" aria-hidden="true"></span><span>${esc(L("now_at"))}: <b>${esc(tr(cur.name).v)}</b> · ${fmtTime(cur.start_time)}–${fmtTime(cur.end_time)}</span>`
      : `<span>${esc(L("next"))}: <b>${esc(tr(next.name).v)}</b> · ${fmtTime(next.start_time)} ${esc(L("ist"))}</span>`;
  }

  /* Every minute: update only the "now" line and the timetable, leaving the rest of the page (and keyboard focus) alone. */
  function refreshClock() {
    if (!S.db) return;
    updateNow();
    if (S.editing) return;
    const el = document.querySelector('[data-kind="horarium"]'); if (!el || el.contains(document.activeElement)) return;
    const s = S.db.sections.find((x) => x.id === el.dataset.section); if (!s) return;
    const t = document.createElement("template");
    t.innerHTML = R.horarium(s).replace(/data-section="([^"]+)"/, `data-section="$1"${s.visible === false ? ' data-hidden="1"' : ""} data-kind="horarium"`).trim();
    el.replaceWith(t.content.firstElementChild);
  }
  OSB.refreshClock = refreshClock;

  /* Menu on one line: tighten spacing step by step; if it still doesn't fit, it scrolls sideways (as on phones). */
  function fitNav() {
    const nav = $("#nav"), ul = nav && nav.querySelector(".wrap > ul"); if (!ul) return;
    nav.classList.remove("fit-1", "fit-2", "fit-scroll");
    const over = () => ul.scrollWidth > ul.clientWidth + 1;
    if (S.editing || !over()) return;
    nav.classList.add("fit-1"); if (!over()) return;
    nav.classList.add("fit-2"); if (!over()) return;
    nav.classList.add("fit-scroll");
  }
  OSB.fitNav = fitNav;

  /* ---------- main render ---------- */
  OSB.render = function () {
    const th = setting("theme");
    document.documentElement.style.setProperty("--emblem-opacity", th.emblem_opacity ?? 0.65);
    document.documentElement.setAttribute("data-palette", S.palette || th.palette || "ivory");
    document.documentElement.lang = S.lang;
    const secs = [...S.db.sections].sort((a, b) => a.sort - b.sort);
    // the tiles section directly after the hero is drawn inside the hero band
    heroTiles = null;
    const hi = secs.findIndex((s) => s.kind === "hero");
    if (hi >= 0 && secs[hi + 1] && secs[hi + 1].kind === "tiles" && !tr(secs[hi + 1].title).v) heroTiles = secs[hi + 1];
    chrome();
    $("#main").innerHTML = secs.filter((s) => s !== heroTiles && s.kind !== "intro").map((s) => (R[s.kind] || R.text)(s).replace(/data-section="([^"]+)"/, `data-section="$1"${s.visible === false ? ' data-hidden="1"' : ""} data-kind="${s.kind}"`)).join("");
    // the band colour on every second section, starting with the first one (Leadership)
    const bands = th.bands !== false; let n = 0;
    document.querySelectorAll("#main > section.block").forEach((el) => { if (el.dataset.hidden === "1" && !S.editing) return; el.classList.toggle("band", bands && n++ % 2 === 0); });
    moreButtons();
    updateNow();
    if (OSB.Intro && OSB.Intro.isMounted()) OSB.Intro.sync({ db: S.db, lang: S.lang, user: S.user, setting });
    if (OSB.afterRender) OSB.afterRender();
  };

  /* ---------- public interactions ---------- */
  function overlay(html, onKey) {
    const o = document.createElement("div"); o.className = "overlay"; o.innerHTML = html; document.body.appendChild(o);
    const close = () => { o.remove(); document.removeEventListener("keydown", key); last && last.focus(); };
    const last = document.activeElement;
    const key = (e) => { if (e.key === "Escape") close(); else if (onKey) onKey(e); };
    document.addEventListener("keydown", key);
    o.addEventListener("click", (e) => { if (e.target === o || e.target.closest("[data-close]")) close(); });
    setTimeout(() => { const f = o.querySelector("button"); f && f.focus(); }, 0);
    return { el: o, close };
  }
  OSB.overlay = overlay;
  function openPost(id) {
    const p = S.db.posts.find((x) => x.id === id); if (!p) return;
    overlay(`<article class="reader" role="dialog" aria-modal="true" aria-label="${esc(tr(p.title).v)}"><button type="button" class="x-btn" data-close>${esc(L("close"))} ✕</button>
      ${p.cover_url ? Photo().frame("news", p.cover_url, { eager: true }) : ""}<span class="label">${esc(fmtDate(p.published_on))}</span>
      <h2>${esc(tr(p.title).v)}</h2><div class="rich">${clean(tr(p.body).v || tr(p.excerpt).v)}</div></article>`);
  }
  function openAlbum(id, start = 0) {
    const a = S.db.albums.find((x) => x.id === id); if (!a) return;
    const m = mediaOf(a); let i = start;
    const ov = overlay(`<div class="lightbox" role="dialog" aria-modal="true" aria-label="${esc(tr(a.title).v)}">
      <div class="bar"><strong>${esc(tr(a.title).v)}</strong><button type="button" data-close>${esc(L("close"))} ✕</button></div>
      <div class="stage" id="lb-stage"></div><div class="bar"><span id="lb-cap"></span><div class="nav"><button type="button" id="lb-prev" aria-label="Previous">←</button><span id="lb-n"></span><button type="button" id="lb-next" aria-label="Next">→</button></div></div></div>`,
      (e) => { if (e.key === "ArrowRight") go(1); if (e.key === "ArrowLeft") go(-1); });
    const stage = ov.el.querySelector("#lb-stage");
    function show() {
      if (!m.length) { stage.innerHTML = `<p>${esc(L("empty_album"))}</p>`; ov.el.querySelector("#lb-n").textContent = "0 / 0"; return; }
      const x = m[i];
      if (x.kind === "video") {
        const yt = esc(x.youtube_id);
        stage.innerHTML = OSB.config.embedVideos
          ? `<iframe src="https://www.youtube-nocookie.com/embed/${yt}" title="${esc(tr(x.caption).v)}" allow="accelerometer; encrypted-media; picture-in-picture" allowfullscreen></iframe>`
          : `<div class="video-card"><span style="font-size:2.5rem" aria-hidden="true">▶</span><a href="https://www.youtube.com/watch?v=${yt}" target="_blank" rel="noopener">${esc(L("watch"))}</a></div>`;
      } else stage.innerHTML = Photo().frame("full", x.url, { alt: tr(x.caption).v, eager: true });
      ov.el.querySelector("#lb-cap").textContent = tr(x.caption).v;
      ov.el.querySelector("#lb-n").textContent = `${i + 1} / ${m.length}`;
    }
    function go(d) { if (!m.length) return; i = (i + d + m.length) % m.length; show(); }
    ov.el.querySelector("#lb-prev").onclick = () => go(-1); ov.el.querySelector("#lb-next").onclick = () => go(1);
    show();
  }

  /* "View more": a list marked data-more="N" shows its first N items, the rest behind a button (editors see everything) */
  function moreButtons() {
    document.querySelectorAll("#main [data-more]").forEach((list) => {
      const n = +list.dataset.more || 6, kids = [...list.children];
      if (S.editing || kids.length <= n) return;
      kids.slice(n).forEach((k) => k.classList.add("is-more"));
      const b = document.createElement("button"); b.type = "button"; b.className = "view-more"; b.dataset.viewMore = "";
      b.textContent = `${S.lang === "ml" ? "കൂടുതൽ കാണുക" : "View more"} (${kids.length - n})`;
      list.after(b);
    });
  }
  function wire() {
    document.addEventListener("click", (e) => {
      const lb = e.target.closest("[data-lang]"); if (lb) { S.lang = lb.dataset.lang; store("osb-lang", S.lang); OSB.render(); return; }
      const pb = e.target.closest("[data-palette]"); if (pb && pb.tagName === "BUTTON") { S.palette = pb.dataset.palette; store("osb-palette", S.palette); OSB.render(); return; }
      const vm = e.target.closest("[data-view-more]"); if (vm) { const l = vm.previousElementSibling; l && l.querySelectorAll(".is-more").forEach((k) => k.classList.remove("is-more")); vm.remove(); return; }
      const tp = e.target.closest("[data-toggle-past]"); if (tp) { const l = tp.nextElementSibling; l.hidden = !l.hidden; tp.setAttribute("aria-expanded", String(!l.hidden)); return; }
      const ct = e.target.closest("[data-cr-tab]"); if (ct) { const sec = ct.closest("section"); sec.querySelectorAll("[data-cr-tab]").forEach((b) => b.setAttribute("aria-pressed", String(b === ct))); const g = sec.querySelector(".cr-grid"); g.dataset.filter = ct.dataset.crTab; return; }
      if (S.editing) return;
      const cr = e.target.closest("[data-open-creative]"); if (cr) { openCreative(cr.dataset.openCreative); return; }
      const sm = e.target.closest("[data-submenu]");
      if (sm) { const row = $("#sub-row"); const m = S.db.menu_items.find((x) => x.id === sm.dataset.submenu);
        const open = !row.hidden && row.dataset.for === m.id; row.hidden = open; row.dataset.for = m.id;
        row.innerHTML = `<div class="wrap"><ul>${$("#nav").__kids(m).map((k) => `<li>${$("#nav").__link(k)}</li>`).join("")}</ul></div>`; return; }
      const po = e.target.closest("[data-open-post]"); if (po) { openPost(po.dataset.openPost); return; }
      const al = e.target.closest("[data-open-album]"); if (al) { openAlbum(al.dataset.openAlbum); return; }
    });
    document.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && !S.editing) {
        const t = e.target.closest && e.target.closest("[data-open-post],[data-open-album],[data-open-creative]");
        if (t) { e.preventDefault(); t.click(); }
      }
    });
    setInterval(refreshClock, 60000);
    let rz; window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(fitNav, 120); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitNav);
  }
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  OSB.reload = async function () { S.db = await OSB.store.loadAll(); OSB.render(); };
  OSB.boot = async function () {
    Photo().installStyles();
    OSB.config = Object.assign({ supabaseUrl: "", supabaseAnonKey: "", seedUrl: "assets/data/seed.json", embedVideos: true }, window.OSB_CONFIG || {});
    S.lang = read("osb-lang") || "en"; S.palette = read("osb-palette");
    try {
      OSB.store = OSB.createStore(OSB.config);
      let ready = true;
      try { await OSB.store.init(); S.user = await OSB.store.user(); }
      catch (e) { if (OSB.store.mode !== "live" || !OSB.Cache) throw e; ready = false; S.user = null; }
      // Visitors are served through the cache (cache.js); editors and the demo always load live content.
      S.db = !ready ? await OSB.Cache.offline(new Error("The database library could not be loaded."))
        : OSB.Cache ? await OSB.Cache.load(OSB.store, S.user) : await OSB.store.loadAll();
      OSB.render();
      wire();
      document.getElementById("boot").remove();
      document.getElementById("app").hidden = false;
      if (OSB.Intro) { try { OSB.Intro.mount({ db: S.db, lang: S.lang, user: S.user, setting }); } catch (e) { console.warn("Opening scene:", e); } }
      if (OSB.editorInit) OSB.editorInit();
    } catch (err) {
      console.error(err);
      let b = document.getElementById("boot");
      if (!b) { b = document.createElement("div"); b.id = "boot"; document.body.prepend(b); }
      b.innerHTML = `<div class="boot-error"><strong>The website could not load its content.</strong><span>${esc(OSB.friendly ? OSB.friendly(err) : String(err))}</span></div>`;
      const app = document.getElementById("app"); if (app) app.hidden = true;
    }
  };
})();
