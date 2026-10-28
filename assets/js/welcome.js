/* Welcome screen. Self-contained: needs only the loaded content (verses, site settings) and the language.
   A visitor's first visit each day shows the emblem and one verse picked at random, for about 5 seconds,
   then fades into the page. A click, tap or key press goes straight in. Signed-in editors never see it. */
(function () {
  const OSB = (window.OSB = window.OSB || {});
  const DAY_KEY = "osb-welcome-day", LAST_KEY = "osb-welcome-last";
  const SHOW_MS = 5000, FADE_MS = 700;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pick = (v, lang) => ((v && (v[lang] || v.en)) || "").trim();
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return undefined; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };

  function installStyles() {
    if (document.getElementById("welcome-css")) return;
    const st = document.createElement("style"); st.id = "welcome-css";
    st.textContent = `
#welcome{position:fixed;inset:0;z-index:90;display:grid;place-items:center;padding:24px;background:var(--bg);color:var(--ink);cursor:pointer;transition:opacity ${FADE_MS}ms ease}
#welcome.out{opacity:0;pointer-events:none}
#welcome .w-in{max-width:40rem;text-align:center;display:grid;justify-items:center;gap:1.1rem;animation:w-rise 1s ease both}
#welcome img{width:clamp(96px,16vw,140px);height:auto;opacity:var(--emblem-opacity,.65)}
#welcome blockquote{margin:0;font-family:var(--f-display);font-style:italic;font-size:clamp(1.5rem,3.6vw,2.4rem);line-height:1.3;text-wrap:balance}
#welcome blockquote:lang(ml){font-family:"Noto Serif Malayalam",serif;font-style:normal;font-size:clamp(1.25rem,3vw,1.9rem);line-height:1.5}
#welcome .w-ref{font-family:var(--f-label);font-size:.78rem;letter-spacing:.16em;text-transform:uppercase;color:var(--accent)}
#welcome .w-rule{width:56px;height:1px;background:var(--accent)}
#welcome .w-skip{margin-top:.6rem;font:inherit;font-family:var(--f-ui);font-size:.85rem;color:var(--ink-soft);background:none;border:0;text-decoration:underline;cursor:pointer}
@keyframes w-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){#welcome{transition:none}#welcome .w-in{animation:none}}`;
    document.head.appendChild(st);
  }

  /* Shows the welcome screen if this visitor hasn't seen one today. Returns true if shown. */
  function maybeShow({ db, lang, user, emblem, force }) {
    if (!force) {
      if (user && user.role) return false;              // editors: never
      if (/^#admin/.test(location.hash)) return false;
      const last = get(DAY_KEY);
      if (last === undefined || last === today()) return false; // storage blocked, or already shown today
    }
    const verses = ((db && db.verses) || []).filter((v) => v.published !== false && pick(v.text, lang));
    if (!verses.length) return false;
    const prev = get(LAST_KEY);
    const pool = verses.length > 1 ? verses.filter((v) => v.id !== prev) : verses;
    const v = pool[Math.floor(Math.random() * pool.length)];
    set(DAY_KEY, today()); set(LAST_KEY, v.id);

    installStyles();
    const ref = pick(v.reference, lang);
    const w = document.createElement("div"); w.id = "welcome"; w.setAttribute("role", "dialog"); w.setAttribute("aria-label", "Welcome");
    w.innerHTML = `<div class="w-in">${emblem ? `<img src="${esc(emblem)}" alt="">` : ""}
      <blockquote lang="${lang === "ml" && pick(v.text, "ml") === (v.text || {}).ml ? "ml" : "en"}">“${esc(pick(v.text, lang))}”</blockquote>
      ${ref ? `<div class="w-rule" aria-hidden="true"></div><div class="w-ref">${esc(ref)}</div>` : ""}
      <button type="button" class="w-skip">${lang === "ml" ? "പ്രവേശിക്കുക" : "Enter"}</button></div>`;
    document.body.appendChild(w);
    let done = false;
    const close = () => {
      if (done) return; done = true;
      document.removeEventListener("keydown", close, true);
      w.classList.add("out"); setTimeout(() => w.remove(), FADE_MS + 50);
    };
    w.addEventListener("click", close);
    document.addEventListener("keydown", close, true);
    setTimeout(close, SHOW_MS);
    setTimeout(() => { const b = w.querySelector(".w-skip"); b && b.focus({ preventScroll: true }); }, 50);
    return true;
  }

  OSB.Welcome = { maybeShow, DAY_KEY };
})();
