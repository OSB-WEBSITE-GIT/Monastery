/* Photo module: everything about how photos are framed on the site lives here.
   - SLOTS: the fixed, responsive frame shape of each place a photo appears, its minimum size, and its layout width.
   - Photo address format: "<path>.<width>.jpg#w=800,1200,1600&f=50,35,1.2"
       w = the published widths (see the upload code in store.js and tools/make_variants.py)
       f = focus point across %, down %, and zoom (1 = no zoom). Missing f means centred, no zoom.
     The original photo is never cut; the frame simply shows the chosen area.
   - frame(): the one function the site uses to draw a framed photo.
   Changing a frame shape, a breakpoint or a minimum size only needs an edit in this file. */
(function () {
  const OSB = (window.OSB = window.OSB || {});
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* Screen widths (px) where the frame shape may change. */
  const BREAKPOINTS = { phone: 0, tablet: 680, laptop: 1100 };
  const DEVICE_LABEL = { phone: "Phone", tablet: "Tablet", laptop: "Laptop" };

  /* ratio: width / height per device (null = show the whole photo, never trimmed).
     min: smallest acceptable longer side in px, after zoom. band: share of the frame's height that text may cover. */
  const SLOTS = {
    hero:     { label: "Main photo at the top", ratio: { phone: 4 / 3, tablet: 3 / 2, laptop: 16 / 9 }, min: 1200, band: 0,
                sizes: "(max-width: 680px) 100vw, min(100vw, 1200px)" },
    section:  { label: "Section photo above the text", ratio: { phone: 4 / 3, tablet: 16 / 9, laptop: 21 / 9 }, min: 1200, sizes: "(max-width: 680px) 100vw, min(100vw, 1200px)" },
    sectionSide: { label: "Section photo beside the text", ratio: { phone: 4 / 3, tablet: 4 / 3, laptop: 4 / 3 }, min: 1000, sizes: "(max-width: 760px) 100vw, 42vw" },
    card:     { label: "Card photo", ratio: { phone: 16 / 10, tablet: 16 / 10, laptop: 16 / 10 }, min: 800, sizes: "(max-width: 600px) 100vw, 340px" },
    portrait: { label: "Portrait", ratio: { phone: 1, tablet: 1, laptop: 1 }, min: 400, sizes: "(max-width: 600px) 100vw, 340px" },
    cover:    { label: "Album cover", ratio: { phone: 4 / 3, tablet: 4 / 3, laptop: 4 / 3 }, min: 800, sizes: "(max-width: 600px) 100vw, 380px" },
    news:     { label: "News photo", ratio: { phone: 16 / 10, tablet: 16 / 10, laptop: 16 / 10 }, min: 1000, sizes: "(max-width: 820px) 100vw, 56vw" },
    full:     { label: "Gallery photo (always shown whole)", ratio: null, min: 1200, sizes: "100vw" },
  };

  /* Which slot a stored photo field is shown in. */
  function slotFor(table, row, field, db) {
    row = row || {};
    if (table === "sections") return row.kind === "hero" ? "hero" : (row.settings || {}).photo_position === "beside" ? "sectionSide" : "section";
    if (table === "section_items") {
      const sec = ((db && db.sections) || []).find((s) => s.id === row.section_id) || {};
      return (sec.settings || {}).photo === "portrait" ? "portrait" : "card";
    }
    if (table === "posts") return "news";
    if (table === "albums") return "cover";
    if (table === "media_items") return "full";
    if (table === "events") return "card";
    return null; // e.g. the emblem: not framed
  }

  /* ---------- photo address ---------- */
  function parse(url) {
    const s = String(url || "");
    const i = s.indexOf("#");
    const path = i < 0 ? s : s.slice(0, i);
    const params = {};
    if (i >= 0) s.slice(i + 1).split("&").forEach((kv) => { const [k, v] = kv.split("="); if (k) params[k] = v || ""; });
    const widths = (params.w || "").split(",").map(Number).filter((n) => n > 0);
    const m = /^(.*)\.(\d+)\.jpg$/.exec(path);
    const f = (params.f || "").split(",").map(Number);
    const focus = { x: clamp(isFinite(f[0]) && params.f ? f[0] : 50, 0, 100), y: clamp(isFinite(f[1]) && params.f ? f[1] : 50, 0, 100), z: clamp(isFinite(f[2]) && f[2] ? f[2] : 1, 1, 4) };
    return { path, base: m && widths.length ? m[1] : null, widths: m ? widths : [], focus };
  }
  function build(p) {
    const parts = [];
    if (p.widths && p.widths.length) parts.push("w=" + p.widths.join(","));
    const f = p.focus || {};
    if (f.x !== 50 || f.y !== 50 || f.z !== 1) parts.push(`f=${round(f.x)},${round(f.y)},${round(f.z, 2)}`);
    return p.path + (parts.length ? "#" + parts.join("&") : "");
  }
  function withFocus(url, focus) { const p = parse(url); p.focus = Object.assign({}, p.focus, focus); return build(p); }
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

  /* Photo mirror: copies of uploaded photos kept in the website's own files by the daily job
     (assets/data/mirror.json). Visitors are served the copy when one exists; stored addresses never change. */
  let mirror = null;
  function setMirror(m) { mirror = m && m.prefix && Array.isArray(m.files) ? { prefix: m.prefix, local: m.local, files: new Set(m.files) } : null; }
  function resolve(url) {
    const s = String(url || "");
    if (!mirror || !s.startsWith(mirror.prefix)) return s;
    const rel = s.slice(mirror.prefix.length), key = rel.split("#")[0].replace(/\.\d+\.jpg$|\.png$|\.jpe?g$/i, "");
    return mirror.files.has(key) ? mirror.local + rel : s;
  }

  /* The largest published file (for measuring), and the src/srcset attributes. */
  const fileOf = (url) => parse(url).path;
  function imgAttrs(url, sizes) {
    const p = parse(resolve(url));
    if (!p.base) return `src="${esc(p.path)}"`;
    const ws = p.widths, fallback = ws.find((w) => w >= 1200) || ws[ws.length - 1];
    return `src="${esc(`${p.base}.${fallback}.jpg`)}" srcset="${esc(ws.map((w) => `${p.base}.${w}.jpg ${w}w`).join(", "))}" sizes="${sizes}"`;
  }
  function focusStyle(focus) {
    const { x, y, z } = focus;
    return `object-position:${x}% ${y}%;transform-origin:${x}% ${y}%;${z !== 1 ? `transform:scale(${z});` : ""}`;
  }

  /* ---------- drawing ---------- */
  /* frame(slot, url, { alt, eager, attrs }) → HTML of the framed photo. "attrs" are extra attributes for the <img>. */
  function frame(slot, url, o = {}) {
    const cfg = SLOTS[slot] || SLOTS.card;
    const p = parse(url);
    const loading = o.eager ? 'fetchpriority="high"' : 'loading="lazy" decoding="async"';
    if (!cfg.ratio) return `<img class="ph-whole" ${imgAttrs(url, cfg.sizes)} alt="${esc(o.alt || "")}" ${loading} ${o.attrs || ""}>`;
    return `<div class="ph" data-slot="${slot}"><img ${url ? imgAttrs(url, cfg.sizes) : 'src=""'} alt="${esc(o.alt || "")}" style="${focusStyle(p.focus)}" ${loading} ${o.attrs || ""}></div>`;
  }

  /* Resolution check: how many pixels of the photo the frame actually shows (zoom uses fewer). */
  function quality(slot, url, natural) {
    const cfg = SLOTS[slot]; if (!cfg || !natural) return null;
    const z = parse(url).focus.z;
    const shown = Math.round(Math.max(natural.w, natural.h) / z);
    return { ok: shown >= cfg.min, shown, min: cfg.min, zoom: z, w: natural.w, h: natural.h };
  }
  function qualityMessage(q) {
    if (!q || q.ok) return "";
    return q.zoom > 1
      ? `Low resolution: at this zoom only about ${q.shown} px of the photo is shown. Zoom out, or use a photo of at least ${Math.round(q.min * q.zoom)} px on its longer side.`
      : `Low resolution: this photo is ${q.w} × ${q.h} px. For good quality use a photo of at least ${q.min} px on its longer side.`;
  }

  /* Frame shapes as CSS, generated from SLOTS so that the shapes are defined only here. */
  function installStyles() {
    if (document.getElementById("photo-frames")) return;
    const rules = [`.ph{position:relative;overflow:hidden;width:100%;background:var(--bg-2,#eee)}`,
      `.ph>img{display:block;width:100%;height:100%;object-fit:cover}`,
      `.ph-whole{max-width:100%;height:auto;object-fit:contain}`,
      `:root{--ph-band:${SLOTS.hero.band}}`];
    for (const [dev, minW] of Object.entries(BREAKPOINTS)) {
      const r = Object.entries(SLOTS).filter(([, c]) => c.ratio).map(([k, c]) => `.ph[data-slot="${k}"]{aspect-ratio:${round(c.ratio[dev], 4)}}`).join("");
      rules.push(minW ? `@media (min-width:${minW}px){${r}}` : r);
    }
    const st = document.createElement("style"); st.id = "photo-frames"; st.textContent = rules.join("\n"); document.head.appendChild(st);
  }

  OSB.Photo = { setMirror, resolve, SLOTS, BREAKPOINTS, DEVICE_LABEL, slotFor, parse, build, withFocus, fileOf, imgAttrs, focusStyle, frame, quality, qualityMessage, installStyles, esc };
})();
