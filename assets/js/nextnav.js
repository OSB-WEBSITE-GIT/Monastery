/* Floating "Next" button. Self-contained module: reads the menu (English names) and the page sections,
   and needs nothing else. Shows "NEXT: <section> ›" for the next menu section below the one being read,
   and "BACK TO TOP ↑" at the last one. Hidden while the opening scene fills the screen.
   Position: fixed at the bottom; its straight right end touches the screen edge, and its rounded left end
   sits over the bottom right corner of the full-width photos (it starts a little inside the content column). */
(function () {
  const OSB = (window.OSB = window.OSB || {});
  let btn, target = null, ticking = false;

  function installStyles() {
    const st = document.createElement("style"); st.id = "nextnav-css";
    st.textContent = `
.nx{position:fixed;z-index:40;right:0;bottom:calc(22px + env(safe-area-inset-bottom,0px));display:flex;align-items:center;gap:.6rem;
  padding:.72rem calc(1.1rem + env(safe-area-inset-right,0px)) .72rem 1.4rem;border:0;border-radius:999px 0 0 999px;
  background:var(--hl,#e9c46a);color:var(--hl-ink,#2a1f10);box-shadow:0 6px 22px rgba(0,0,0,.22);cursor:pointer;
  font-family:var(--f-label,Georgia,serif);font-size:.78rem;letter-spacing:.14em;text-transform:uppercase;white-space:nowrap;
  opacity:0;transform:translateX(24px);pointer-events:none;transition:opacity .4s ease,transform .4s ease}
.nx.on{opacity:1;transform:none;pointer-events:auto}
.nx:hover{filter:brightness(1.05)}
.nx:focus-visible{outline:2px solid var(--hl-ink,#2a1f10);outline-offset:-5px}
.nx .nx-k{opacity:.7}
.nx .nx-n{overflow:hidden;text-overflow:ellipsis;max-width:22ch}
body.cms-editing .nx,body:has(#cms-bar) .nx{bottom:calc(84px + env(safe-area-inset-bottom,0px))}
@media (max-width:680px){.nx{font-size:.68rem;padding:.6rem calc(.9rem + env(safe-area-inset-right,0px)) .6rem 1.1rem}.nx .nx-n{max-width:16ch}}
@media (max-width:1023.98px){body:has(#cms-bar) .nx{bottom:calc(22px + env(safe-area-inset-bottom,0px))}}
@media (prefers-reduced-motion:reduce){.nx{transition:none}}`;
    document.head.appendChild(st);
  }

  // menu sections, in the order they appear on the page (only sections that are on the page)
  function stops() {
    const db = OSB.state && OSB.state.db; if (!db) return [];
    return (db.menu_items || []).filter((m) => !m.parent_id && m.visible !== false && /^#[\w-]+$/.test(m.target || ""))
      .map((m) => ({ el: document.getElementById(m.target.slice(1)), name: ((m.label || {}).en || "").trim() }))
      .filter((s) => s.el && s.name && s.el.closest("#main"))
      .sort((a, b) => a.el.getBoundingClientRect().top - b.el.getBoundingClientRect().top);
  }

  // left end: a little inside the right edge of the content column (where full-width photos end)
  function place() {
    const wrap = document.querySelector("#main .wrap"); if (!wrap) return;
    const right = wrap.getBoundingClientRect().right, inset = innerWidth <= 680 ? 120 : 170;
    btn.style.left = Math.max(16, Math.round(right - inset)) + "px";
    btn.style.left = btn.offsetWidth > innerWidth - 16 ? "16px" : btn.style.left;
  }

  function update() {
    ticking = false; if (!btn) return;
    const app = document.getElementById("app");
    if (!app || app.hidden || !(OSB.state && OSB.state.db)) { btn.classList.remove("on"); return; }   // still loading
    const intro = document.getElementById("intro");
    if (intro && intro.getBoundingClientRect().bottom > innerHeight * .5) { btn.classList.remove("on"); return; }  // the opening scene has its own Home button
    const line = innerHeight * .35, list = stops();
    const next = list.find((s) => s.el.getBoundingClientRect().top > line + 4);
    target = next ? next.el : null;
    btn.innerHTML = next ? `<span class="nx-k">Next:</span><span class="nx-n">${next.name.replace(/[&<>"]/g, "")}</span><span aria-hidden="true">›</span>`
      : `<span class="nx-n">Back to top</span><span aria-hidden="true">↑</span>`;
    btn.setAttribute("aria-label", next ? "Next section: " + next.name : "Back to top");
    btn.style.left = ""; btn.classList.add("on"); place();
  }
  const schedule = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };

  function init() {
    if (btn) return;
    installStyles();
    btn = document.createElement("button"); btn.type = "button"; btn.className = "nx";
    btn.addEventListener("click", () => {
      const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "auto";
      if (target) target.scrollIntoView({ behavior: smooth, block: "start" }); else scrollTo({ top: 0, behavior: smooth });
    });
    document.body.appendChild(btn);
    addEventListener("scroll", schedule, { passive: true }); addEventListener("resize", schedule);
    new MutationObserver(schedule).observe(document.getElementById("main") || document.body, { childList: true });
    schedule();
  }
  OSB.NextNav = { init, update: schedule };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(init, 0)); else setTimeout(init, 0);
})();
