/* Undo: after any change an editor makes, a bar offers "Undo" for a few seconds.
   Self-contained. OSB.Undo.attach(store, getCache) wraps the store's change methods; every change records
   how to reverse it, using the cached copy of the data from just before. Changes made within a moment of each
   other (e.g. moving an item swaps two rows) are undone together. Older mistakes are covered by the change
   history (history-ui.js). */
(function () {
  const OSB = (window.OSB = window.OSB || {});
  const SHOW_MS = 10000, GROUP_MS = 700;
  const CHILDREN = { sections: [["section_items", "section_id"]], albums: [["media_items", "album_id"]], menu_items: [["menu_items", "parent_id"]] };
  let raw = null, cache = () => ({}), pending = [], groupTimer = null, hideTimer = null, current = null, busy = false;

  const pkOf = (t) => (t === "site_settings" ? "key" : "id");
  const copy = (o) => JSON.parse(JSON.stringify(o));
  const find = (t, id) => ((cache() || {})[t] || []).find((r) => r[pkOf(t)] === id);

  function attach(store, getCache) {
    if (store.__undo) return;
    store.__undo = true; cache = getCache;
    raw = { insert: store.insert.bind(store), update: store.update.bind(store), upsert: store.upsert.bind(store), remove: store.remove.bind(store) };
    store.insert = async (t, row) => { const out = await raw.insert(t, row); add(() => raw.remove(t, out[pkOf(t)])); return out; };
    store.update = async (t, id, patch) => {
      const before = find(t, id); const out = await raw.update(t, id, patch);
      if (before && t !== "profiles") { const back = {}; Object.keys(patch).forEach((k) => (back[k] = before[k] === undefined ? null : copy(before[k]))); add(() => raw.update(t, id, back)); }
      return out;
    };
    store.upsert = async (t, row) => {
      const before = find(t, row[pkOf(t)]); const out = await raw.upsert(t, row);
      add(before ? () => raw.upsert(t, copy(before)) : () => raw.remove(t, out[pkOf(t)])); return out;
    };
    store.remove = async (t, id) => {
      const before = find(t, id);
      const kids = (CHILDREN[t] || []).flatMap(([ct, fk]) => ((cache() || {})[ct] || []).filter((r) => r[fk] === id).map((r) => [ct, copy(r)]));
      await raw.remove(t, id);
      if (before) add(async () => { await raw.upsert(t, copy(before)); for (const [ct, r] of kids) await raw.upsert(ct, r); });
      return undefined;
    };
  }

  function add(inverse) {
    if (busy) return; // reversing an undo is not itself undoable
    pending.push(inverse);
    clearTimeout(groupTimer);
    groupTimer = setTimeout(() => { current = pending.reverse(); pending = []; show(); }, GROUP_MS);
  }

  function show() {
    let bar = document.getElementById("undo-bar");
    if (!bar) {
      bar = document.createElement("div"); bar.id = "undo-bar"; bar.setAttribute("role", "status");
      bar.innerHTML = `<span>Change saved</span><button type="button" class="cms-btn" id="undo-btn">Undo</button>`;
      document.body.appendChild(bar);
      bar.querySelector("#undo-btn").onclick = run;
    }
    bar.hidden = false; bar.querySelector("span").textContent = "Change saved";
    clearTimeout(hideTimer); hideTimer = setTimeout(hide, SHOW_MS);
  }
  function hide() { const b = document.getElementById("undo-bar"); if (b) b.hidden = true; current = null; }

  async function run() {
    if (!current) return;
    const steps = current; current = null; clearTimeout(hideTimer);
    const bar = document.getElementById("undo-bar"); bar.querySelector("span").textContent = "Undoing…"; bar.querySelector("button").disabled = true;
    busy = true;
    try { for (const step of steps) await step(); if (OSB.toast) OSB.toast("Undone"); }
    catch (e) { if (OSB.toast) OSB.toast((OSB.friendly ? OSB.friendly(e) : String(e)) + " You can also restore earlier versions from History.", "err"); }
    finally { busy = false; bar.querySelector("button").disabled = false; hide(); if (OSB.reload) await OSB.reload(); if (OSB.afterUndo) OSB.afterUndo(); }
  }

  OSB.Undo = { attach, hide };
})();
