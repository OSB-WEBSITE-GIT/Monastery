/* Opening scene. Self-contained module: needs only the loaded content (the "intro" section, the verses, the menu,
   site settings) and the language. It lives in #intro-root, outside the page sections, so re-drawing the page
   (language switch, saves) never restarts it.
   Every visit: the starting statue (silver) appears with a random verse and an open Bible below it; the statue slowly turns
   to gold, the verse and the Bible turn gold on a grey panel, soft rays of light appear and the menu fades in. The scene
   then stays there; the page moves on only when the visitor scrolls. "Home ›" (after 4 s) skips to the end.
   Signed-in editors see the end state straight away. Settings (speed, rays, panel colour) are at the top of intro.css. */
(function () {
  const OSB = (window.OSB = window.OSB || {});
  const IMG = "assets/img/intro/";
  const SIZES = "(max-width: 680px) 300px, 400px";
  const srcset = (name) => [486, 760, 972].map((w) => `${IMG}statue-${name}-${w}.webp ${w}w`).join(", ");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (v, lang) => ((v && (v[lang] || v.en)) || "").trim();
  const plain = (h) => String(h || "").replace(/<[^>]+>/g, "").trim();
  const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const put = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

  let root, el = {}, verse = null, state = { mounted: false, finished: false, rising: false };

  const BIBLE = `<svg class="ix-bible" viewBox="0 0 64 44" role="img" aria-label="Holy Bible">
    <path class="pg" d="M32 9 C24 4 13 4 5 7 V38 C13 35 24 35 32 40 Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
    <path class="pg" d="M32 9 C40 4 51 4 59 7 V38 C51 35 40 35 32 40 Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M32 9 V40" stroke="currentColor" stroke-width="1.4" fill="none"/>
    <path d="M10 13 C16 11.6 22 11.8 27 13.6 M10 18 C16 16.6 22 16.8 27 18.6 M10 23 C16 21.6 22 21.8 27 23.6 M10 28 C16 26.6 22 26.8 27 28.6 M37 13.6 C42 11.8 48 11.6 54 13 M37 18.6 C42 16.8 48 16.6 54 18 M37 23.6 C42 21.8 48 21.6 54 23 M37 28.6 C42 26.8 48 26.6 54 28" stroke="currentColor" stroke-width=".9" fill="none" opacity=".55"/>
    <path d="M45.5 5.2 V20 L48 17.6 L50.5 20 V4.8" stroke="currentColor" stroke-width="1.2" fill="currentColor" fill-opacity=".35" stroke-linejoin="round"/></svg>`;

  function pickVerse(db, lang) {
    const all = ((db && db.verses) || []).filter((v) => v.published !== false && tr(v.text, "en"));
    if (!all.length) return null;
    const last = get("osb-intro-last");
    const pool = all.length > 1 ? all.filter((v) => v.id !== last) : all;
    const v = pool[Math.floor(Math.random() * pool.length)];
    put("osb-intro-last", v.id);
    return v;
  }
  function fillVerse(lang) {
    if (!el.verse) return;
    if (!verse) { el.verse.hidden = el.ref.hidden = true; return; }
    const ml = lang === "ml" && (verse.text || {}).ml;
    el.verse.textContent = "“" + tr(verse.text, lang) + "”"; el.verse.lang = ml ? "ml" : "en";
    el.ref.textContent = tr(verse.reference, lang);
  }
  function fillBar(db, lang, setting) {
    if (!el.bar) return;
    const site = setting("site") || {};
    if (el.title) el.title.textContent = [plain(tr(site.name, lang)), plain(tr(site.subtitle, lang))].filter(Boolean).join(" · ");   // page heading for screen readers and search engines
    const menu = ((db && db.menu_items) || []).filter((m) => !m.parent_id && m.visible !== false).sort((a, b) => a.sort - b.sort);
    el.bar.innerHTML = `<a class="ix-brand" href="#top">${site.emblem_url ? `<img src="${esc(site.emblem_url)}" alt="">` : ""}<span>${esc(plain(tr(site.name, lang)))}</span></a>
      <nav aria-label="Main">${menu.map((m) => `<a href="${esc(OSB.safeUrl ? OSB.safeUrl(m.target) : m.target)}">${esc(tr(m.label, lang))}</a>`).join("")}</nav>
      <div class="ix-lang" role="group" aria-label="Language"><button type="button" data-lang="en" aria-label="English" aria-pressed="${lang === "en"}">En</button><span aria-hidden="true">/</span><button type="button" data-lang="ml" aria-label="മലയാളം" aria-pressed="${lang === "ml"}">Ma</button></div>`;
  }

  function mount({ db, lang, user, setting }) {
    root = document.getElementById("intro-root"); if (!root) return;
    const sec = ((db && db.sections) || []).find((s) => s.kind === "intro" && s.visible !== false);
    if (!sec) { root.innerHTML = ""; return; }
    state = { mounted: true, finished: false, rising: false };
    verse = pickVerse(db, lang);
    const SLOW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--intro-slow")) || 1.6;   // set in intro.css
    const T = { minStart: 1300 * SLOW, rise: 4200 * SLOW, homeAt: 4000, waitGold: 6000 };

    root.innerHTML = `<section id="intro" aria-label="${esc(plain(tr(sec.title, lang)) || "Welcome")}" data-section="${esc(sec.id)}" data-kind="intro"><div class="ix-aura" aria-hidden="true"></div><div class="ix-stage">
        <figure class="ix-statue" aria-hidden="true">
          <img class="ix-start" alt="" fetchpriority="high" decoding="async" srcset="${srcset("start")}" sizes="${SIZES}">
          <img class="ix-gold" alt="" decoding="async" srcset="${srcset("gold")}" sizes="${SIZES}">
          <div class="ix-glow"></div></figure>
        <h1 class="ix-title"></h1>
        <div class="ix-plaque"><p class="ix-verse"></p><div class="ix-ref"></div>${BIBLE}</div>
      </div></section>
      <header class="ix-bar"></header>
      <button type="button" class="ix-home">${lang === "ml" ? "ഹോം ›" : "Home ›"}</button>`;
    const $ = (s) => root.querySelector(s);
    el = { title: $(".ix-title"), intro: $("#intro"), stage: $(".ix-stage"), statue: $(".ix-statue"), start: $(".ix-start"), gold: $(".ix-gold"), verse: $(".ix-verse"), ref: $(".ix-ref"), bar: $(".ix-bar"), home: $(".ix-home") };
    fillVerse(lang); fillBar(db, lang, setting);

    const cache = new Map();
    const ready = (img) => {
      if (!cache.has(img)) cache.set(img, img.complete && img.naturalWidth ? img.decode().catch(() => {})
        : new Promise((r) => { img.addEventListener("load", () => img.decode().then(r, r), { once: true }); img.addEventListener("error", r, { once: true }); }));
      return cache.get(img);
    };
    // "Dawn": the whole statue turns from silver to gold, as a soft light swells over it and fades
    const setRise = (p) => {               // 0 → 1
      el.gold.style.opacity = String(p);
      el.statue.style.setProperty("--g", String(Math.sin(Math.PI * Math.min(1, Math.max(0, p))) * .55));
    };
    const ease = (x) => (x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
    let raf = 0;
    const end = () => { state.finished = true; el.home.classList.remove("on"); };
    function settle() {
      el.statue.classList.remove("rising"); el.statue.classList.add("gilded"); el.intro.classList.add("golden");
      setTimeout(() => { el.bar.classList.add("on"); end(); }, 2800 * SLOW);
    }
    function rise() {
      if (state.finished || state.rising) return; state.rising = true;
      el.statue.style.setProperty("--sil", `url("${el.gold.currentSrc || el.gold.src}")`);
      el.statue.classList.add("rising");
      setTimeout(() => el.intro.classList.add("golden"), T.rise * .5);
      const s = performance.now();
      const step = (now) => { const p = Math.min(1, (now - s) / T.rise); setRise(ease(p)); if (p < 1) raf = requestAnimationFrame(step); else settle(); };
      raf = requestAnimationFrame(step);
    }
    function finishNow() {
      if (state.finished) return; cancelAnimationFrame(raf);
      el.statue.classList.add("drawn", "gilded"); setRise(1);
      el.intro.classList.add("golden"); el.bar.classList.add("on"); end();
    }
    state.finishNow = finishNow;
    setRise(0);

    const t0 = performance.now();
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const saveData = navigator.connection && navigator.connection.saveData;
    ready(el.start).then(() => el.statue.classList.add("drawn"));
    if (user && user.role) { finishNow(); }                       // editors: no animation
    else if (reduce || saveData) { ready(el.gold).then(finishNow); }
    else {
      Promise.all([ready(el.start), ready(el.gold)]).then(() => setTimeout(rise, Math.max(0, T.minStart - (performance.now() - t0))));
      setTimeout(() => { if (!state.rising) finishNow(); }, T.waitGold + T.minStart);   // very slow connection: don't keep people waiting
      setTimeout(() => { if (!state.finished && scrollY < 8) el.home.classList.add("on"); }, T.homeAt);
    }
    el.home.addEventListener("click", finishNow);

    // scrolling: the scene fades and lifts away as the page slides up; the site's own menu then takes over
    let ticking = false;
    addEventListener("scroll", () => {
      if (!el.intro || !document.body.contains(el.intro)) return;
      if (scrollY > 8) { finishNow(); el.home.classList.remove("on"); }
      if (ticking) return; ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const h = el.intro.offsetHeight, p = Math.min(1, scrollY / (h * .8));
        el.stage.style.opacity = String(1 - p); el.stage.style.transform = p ? `translateY(${-p * 60}px) scale(${1 - p * .04})` : "";
        el.bar.classList.toggle("gone", scrollY > h * .55);
      });
    }, { passive: true });
  }

  /* After the page is re-drawn (language switch, saves): update the words, keep the scene where it is. */
  function sync({ db, lang, user, setting }) {
    if (!root || !state.mounted || !document.getElementById("intro")) return;
    fillVerse(lang); fillBar(db, lang, setting);
    if (el.home) el.home.textContent = lang === "ml" ? "ഹോം ›" : "Home ›";
    if (user && user.role && state.finishNow) state.finishNow();
  }

  OSB.Intro = { mount, sync, isMounted: () => state.mounted };
})();
