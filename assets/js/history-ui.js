/* Change history screens. Self-contained; uses only the store's history API:
     store.listHistory(table, pk), store.listDeleted(), store.restoreRows(entries)
   OSB.HistoryUI.openRow(table, pk, { onRestored })   → window listing earlier versions with "Restore"
   OSB.HistoryUI.renderDeleted(panelEl, { onRestored }) → the "Recently deleted" dashboard page */
(function () {
  const OSB = (window.OSB = window.OSB || {});
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const plain = (h) => String(h || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const when = (d) => new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
  const IGNORE = new Set(["updated_at", "updated_by", "sort"]);
  const FIELD = { title: "Title", eyebrow: "Small label", body: "Text", image_url: "Photo", image_caption: "Caption", cta_label: "Button text", cta_link: "Button link",
    settings: "Layout", visible: "Visibility", published: "Published", label: "Label", link: "Link", extra: "Contact details", name: "Name", start_time: "Start", end_time: "End",
    days: "Days", is_prayer: "Prayer", note: "Note", description: "Description", location: "Place", category: "Type", starts_on: "Date", ends_on: "End date",
    repeats_yearly: "Repeats yearly", time_label: "Time", excerpt: "Summary", cover_url: "Cover photo", published_on: "Date", pinned: "Pinned", caption: "Caption",
    url: "Photo", youtube_id: "Video", kind: "Type", slug: "Link name", target: "Link", parent_id: "Menu position", value: "Settings", role: "Role", full_name: "Name" };
  const TABLE = { sections: "Section", section_items: "Item", menu_items: "Menu link", horarium: "Timetable entry", events: "Event", posts: "News post", albums: "Album",
    media_items: "Photo or video", site_settings: "Site settings", profiles: "User" };

  function titleOf(table, r) {
    const pick = (o) => (o && (o.en || o.ml)) || "";
    return plain(pick(r.title) || pick(r.name) || pick(r.label) || pick(r.caption) || r.slug || r.key || r.email || "") || "(untitled)";
  }
  function changedFields(older, newer) {
    if (!newer) return [];
    return Object.keys(Object.assign({}, older, newer)).filter((k) => !IGNORE.has(k) && JSON.stringify(older[k]) !== JSON.stringify(newer[k])).map((k) => FIELD[k] || k);
  }
  function frame(html) {
    const w = document.createElement("div"); w.className = "cms-modal-wrap";
    w.innerHTML = `<div class="cms-modal hist" role="dialog" aria-modal="true">${html}</div>`; document.body.appendChild(w);
    const last = document.activeElement;
    const close = () => { w.remove(); document.removeEventListener("keydown", k, true); last && last.focus && last.focus(); };
    const k = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    document.addEventListener("keydown", k, true);
    return { el: w, close };
  }

  async function openRow(table, pk, o = {}) {
    const m = frame(`<h2 class="cms-h">History</h2><p class="cms-p">Earlier versions of this ${esc((TABLE[table] || "item").toLowerCase())}, newest first. Restoring a version replaces the current one, and the current one is kept in the history too.</p><div id="hist-list">Loading…</div><div class="cms-actions end"><button type="button" class="cms-btn link" data-close>Close</button></div>`);
    m.el.querySelector("[data-close]").onclick = m.close;
    let list;
    try { list = await OSB.store.listHistory(table, pk); } catch (e) { m.el.querySelector("#hist-list").textContent = OSB.friendly(e); return; }
    const box = m.el.querySelector("#hist-list");
    if (!list.length) { box.innerHTML = `<p class="cms-empty">No earlier versions yet. Versions are kept from now on, each time this is changed.</p>`; return; }
    const current = (OSB.state.db[table] || []).find((r) => String(r[table === "site_settings" ? "key" : "id"]) === String(pk));
    box.innerHTML = `<ul class="cms-list">${list.map((h, i) => {
      const newer = i === 0 ? current : list[i - 1].old_row;
      const ch = h.action === "delete" ? ["deleted"] : changedFields(h.old_row, newer);
      return `<li><div class="cms-row-main static"><strong>${esc(when(h.changed_at))}</strong><span>${h.action === "delete" ? "Before it was deleted" : "Before this change"}${h.changed_by_email ? " by " + esc(h.changed_by_email) : ""}${ch.length && h.action !== "delete" ? " · changed: " + esc(ch.join(", ")) : ""}</span><span>“${esc(titleOf(table, h.old_row))}”</span></div>
        <span class="cms-row-acts"><button type="button" data-restore="${i}">Restore this version</button></span></li>`;
    }).join("")}</ul>`;
    box.querySelectorAll("[data-restore]").forEach((b) => (b.onclick = async () => {
      b.disabled = true;
      try { await OSB.store.restoreRows([list[+b.dataset.restore]]); OSB.toast("Earlier version restored"); m.close(); if (o.onRestored) await o.onRestored(); }
      catch (e) { b.disabled = false; OSB.toast(OSB.friendly(e), "err"); }
    }));
  }

  async function renderDeleted(panel, o = {}) {
    panel.innerHTML = `<header class="cms-panel-head"><div><h2>Recently deleted</h2><p>Anything deleted can be brought back here. Items deleted together, such as a section and its items, come back together.</p></div></header><div id="del-list">Loading…</div>`;
    let rows;
    try { rows = await OSB.store.listDeleted(); } catch (e) { panel.querySelector("#del-list").textContent = OSB.friendly(e); return; }
    const exists = (h) => (OSB.state.db[h.table_name] || []).some((r) => String(r[h.table_name === "site_settings" ? "key" : "id"]) === h.row_pk);
    const groups = []; const byTx = new Map();
    rows.forEach((h) => { if (!byTx.has(h.tx_id)) { const g = { tx: h.tx_id, rows: [] }; byTx.set(h.tx_id, g); groups.push(g); } byTx.get(h.tx_id).rows.push(h); });
    const live = groups.filter((g) => !g.rows.every(exists));
    const box = panel.querySelector("#del-list");
    if (!live.length) { box.innerHTML = `<p class="cms-empty">Nothing has been deleted.</p>`; return; }
    box.innerHTML = `<ul class="cms-list">${live.map((g, i) => {
      const main = [...g.rows].sort((a, b) => ["sections", "albums", "menu_items"].indexOf(b.table_name) - ["sections", "albums", "menu_items"].indexOf(a.table_name))[0];
      const more = g.rows.length - 1;
      return `<li><div class="cms-row-main static"><strong>${esc(TABLE[main.table_name] || main.table_name)}: “${esc(titleOf(main.table_name, main.old_row))}”${more ? ` and ${more} item${more > 1 ? "s" : ""} in it` : ""}</strong><span>Deleted ${esc(when(main.changed_at))}${main.changed_by_email ? " by " + esc(main.changed_by_email) : ""}</span></div>
        <span class="cms-row-acts"><button type="button" data-restore="${i}">Restore</button></span></li>`;
    }).join("")}</ul>`;
    box.querySelectorAll("[data-restore]").forEach((b) => (b.onclick = async () => {
      b.disabled = true;
      try { await OSB.store.restoreRows(live[+b.dataset.restore].rows.filter((h) => !exists(h))); OSB.toast("Restored"); if (o.onRestored) await o.onRestored(); }
      catch (e) { b.disabled = false; OSB.toast(OSB.friendly(e), "err"); }
    }));
  }

  OSB.HistoryUI = { openRow, renderDeleted };
})();
