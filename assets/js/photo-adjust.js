/* Adjust Photo dialog: choose which part of a photo shows inside its fixed frame (drag + zoom).
   Self-contained: depends only on OSB.Photo. Usage:
     const newUrl = await OSB.PhotoAdjust.open({ slot: "hero", url, title: "Main photo" });   // null if cancelled
   The photo file is never changed; only the focus point and zoom in the photo address are. */
(function () {
  const OSB = (window.OSB = window.OSB || {});
  const P = () => OSB.Photo;
  const DEVICES = ["laptop", "tablet", "phone"];

  function open({ slot, url, title }) {
    const Photo = P();
    const cfg = Photo.SLOTS[slot];
    if (!cfg || !cfg.ratio || !url) return Promise.resolve(url);
    let focus = Object.assign({}, Photo.parse(url).focus);
    const file = Photo.fileOf(url);
    const devices = DEVICES.filter((d, i, a) => a.findIndex((x) => cfg.ratio[x] === cfg.ratio[d]) === i); // distinct shapes only
    const band = slot === "hero" ? cfg.band : 0;

    return new Promise((resolve) => {
      const wrap = document.createElement("div"); wrap.className = "pa-wrap";
      wrap.innerHTML = `<div class="pa" role="dialog" aria-modal="true" aria-labelledby="pa-title">
        <header class="pa-head"><div><h2 id="pa-title">Adjust photo</h2><p>${Photo.esc(title || cfg.label)} · Drag the photo to choose what shows in the frame. Use the slider to zoom.${band ? ` The shaded strip is where the headline sits on laptops and tablets.` : ""}</p></div></header>
        <div class="pa-body">
          <div class="pa-main">
            <div class="pa-frame pa-stage" tabindex="0" aria-label="Photo position. Use the arrow keys to move it." style="aspect-ratio:${cfg.ratio[devices[0]]}">
              <img alt="" draggable="false" src="${Photo.esc(file)}">${band ? `<div class="pa-band" style="height:${band * 100}%"></div>` : ""}
            </div>
            <span class="pa-cap">${Photo.DEVICE_LABEL[devices[0]]}${devices.length === 1 ? " and all other screens" : ""}</span>
          </div>
          ${devices.length > 1 ? `<div class="pa-previews">${devices.slice(1).map((d) => `<div class="pa-prev"><div class="pa-frame" style="aspect-ratio:${cfg.ratio[d]}"><img alt="" src="${Photo.esc(file)}">${band && d !== "phone" ? `<div class="pa-band" style="height:${band * 100}%"></div>` : ""}</div><span class="pa-cap">${Photo.DEVICE_LABEL[d]}</span></div>`).join("")}</div>` : ""}
        </div>
        <div class="pa-controls">
          <label class="pa-zoom"><span>Zoom</span><input type="range" id="pa-zoom" min="1" max="3" step="0.05" value="${focus.z}"></label>
          <p class="pa-warn" id="pa-warn" hidden></p>
          <div class="pa-actions"><button type="button" class="cms-btn primary" data-save>Save</button><button type="button" class="cms-btn" data-reset>Centre and reset zoom</button><button type="button" class="cms-btn link" data-cancel>Cancel</button></div>
        </div></div>`;
      document.body.appendChild(wrap);
      const imgs = Array.from(wrap.querySelectorAll(".pa-frame img"));
      const stage = wrap.querySelector(".pa-stage"), zoom = wrap.querySelector("#pa-zoom"), warn = wrap.querySelector("#pa-warn");
      let natural = null;
      imgs[0].onload = () => { natural = { w: imgs[0].naturalWidth, h: imgs[0].naturalHeight }; paint(); };

      function paint() {
        const st = Photo.focusStyle(focus);
        imgs.forEach((im) => im.setAttribute("style", st));
        zoom.value = focus.z;
        const q = Photo.quality(slot, Photo.withFocus(url, focus), natural);
        warn.textContent = Photo.qualityMessage(q); warn.hidden = !warn.textContent;
      }
      // How far (px) the photo can move inside the stage, per axis.
      function travel() {
        const W = stage.clientWidth, H = stage.clientHeight; if (!natural) return { x: 0, y: 0 };
        const s = Math.max(W / natural.w, H / natural.h);
        return { x: Math.max(0, natural.w * s * focus.z - W), y: Math.max(0, natural.h * s * focus.z - H) };
      }
      const clamp = (n) => Math.min(100, Math.max(0, n));
      let drag = null;
      stage.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, f: Object.assign({}, focus) }; stage.setPointerCapture(e.pointerId); stage.classList.add("dragging"); });
      stage.addEventListener("pointermove", (e) => {
        if (!drag) return; const t = travel();
        focus.x = t.x ? clamp(drag.f.x - ((e.clientX - drag.x) / t.x) * 100) : focus.x;
        focus.y = t.y ? clamp(drag.f.y - ((e.clientY - drag.y) / t.y) * 100) : focus.y;
        paint();
      });
      const end = () => { drag = null; stage.classList.remove("dragging"); };
      stage.addEventListener("pointerup", end); stage.addEventListener("pointercancel", end);
      stage.addEventListener("keydown", (e) => {
        const step = e.shiftKey ? 10 : 2, k = { ArrowLeft: ["x", -step], ArrowRight: ["x", step], ArrowUp: ["y", -step], ArrowDown: ["y", step] }[e.key];
        if (k) { e.preventDefault(); focus[k[0]] = clamp(focus[k[0]] + k[1]); paint(); }
      });
      zoom.addEventListener("input", () => { focus.z = Number(zoom.value); paint(); });

      const last = document.activeElement;
      const close = (val) => { wrap.remove(); document.removeEventListener("keydown", esc, true); last && last.focus && last.focus(); resolve(val); };
      const esc = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(null); } };
      document.addEventListener("keydown", esc, true);
      wrap.querySelector("[data-cancel]").onclick = () => close(null);
      wrap.querySelector("[data-reset]").onclick = () => { focus = { x: 50, y: 50, z: 1 }; paint(); };
      wrap.querySelector("[data-save]").onclick = () => close(Photo.withFocus(url, focus));
      paint(); setTimeout(() => stage.focus(), 0);
    });
  }

  OSB.PhotoAdjust = { open };
})();
