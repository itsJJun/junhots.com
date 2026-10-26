// "Make your own" in the top bar opens a small menu: Tier list maker or Build maker.
// The menu sits outside the tab row (which scrolls sideways on phones) so it never gets cut off.
(() => {
  const tab = document.querySelector('.tabs a[href="/tierlist-maker/"]');
  if (!tab) return;
  const css = document.createElement("style");
  css.textContent = `
.mk-caret { width: 10px; height: 10px; margin-left: 5px; vertical-align: 0; transition: transform .15s; }
.tabs a[aria-expanded="true"] { color: #f4efec; }
.tabs a[aria-expanded="true"] .mk-caret { transform: rotate(180deg); }
.mk-menu { position: fixed; z-index: 50; width: 260px; padding: 6px; border-radius: 12px; border: 1px solid #3d3531; background: #1a1716; box-shadow: 0 16px 40px rgba(0, 0, 0, 0.55); font: 14px/1.4 "Geist", "Segoe UI", system-ui, sans-serif; animation: mk-in .12s ease-out; }
@keyframes mk-in { from { opacity: 0; transform: translateY(-4px); } }
.mk-menu a { display: grid; grid-template-columns: 34px 1fr; gap: 2px 12px; align-items: center; padding: 9px 10px; border-radius: 8px; color: #f4efec; text-decoration: none; }
.mk-menu a:hover, .mk-menu a:focus-visible { background: #221e1c; outline: none; }
.mk-menu a[aria-current="page"] { background: #221e1c; box-shadow: inset 2px 0 0 #f26a4b; }
.mk-menu .mk-ic { grid-row: span 2; display: grid; place-items: center; width: 34px; height: 34px; border-radius: 8px; background: #221e1c; border: 1px solid #332d2a; color: #f26a4b; }
.mk-menu .mk-ic svg { width: 18px; height: 18px; }
.mk-menu b { font-weight: 600; }
.mk-menu small { color: #a89f99; font-size: 12px; }
@media (prefers-reduced-motion: reduce) { .mk-menu { animation: none; } }`;
  document.head.append(css);

  const building = location.pathname.startsWith("/builds") && new URLSearchParams(location.search).has("make");
  if (building) {
    document.querySelector(".tabs a[aria-current]")?.removeAttribute("aria-current");
    tab.setAttribute("aria-current", "page");
  }
  const here = location.pathname.startsWith("/tierlist-maker") ? 0 : building ? 1 : -1;
  tab.innerHTML = `Make your own<svg class="mk-caret" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  tab.setAttribute("aria-haspopup", "true");
  tab.setAttribute("aria-expanded", "false");

  const items = [
    ["/tierlist-maker/", "Tier list", "Rank every hero and share it", '<path d="M4 5h16M4 12h11M4 19h6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'],
    ["/builds/?make", "Build", "Pick a hero, make a talent build", '<path d="M12 3v4M12 17v4M3 12h4M17 12h4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2.2"/>'],
  ];
  const menu = document.createElement("div");
  menu.className = "mk-menu";
  menu.hidden = true;
  menu.innerHTML = items.map(([href, name, sub, ic], i) => `<a href="${href}"${i === here ? ' aria-current="page"' : ""}><span class="mk-ic"><svg viewBox="0 0 24 24" aria-hidden="true">${ic}</svg></span><b>${name}</b><small>${sub}</small></a>`).join("");
  document.body.append(menu);

  let shut;
  const open = on => {
    clearTimeout(shut);
    menu.hidden = !on;
    tab.setAttribute("aria-expanded", on);
    if (!on) return;
    const r = tab.getBoundingClientRect();
    menu.style.top = r.bottom + 4 + "px";
    menu.style.left = Math.max(12, Math.min(r.left - 10, innerWidth - menu.offsetWidth - 12)) + "px";
  };
  // Mouse: opens on hover, and a click keeps it open. Touch: tap to open or close, tap outside to close.
  let hovering = false;
  tab.addEventListener("click", e => { e.preventDefault(); open(hovering || menu.hidden); });
  if (matchMedia("(hover: hover)").matches) {
    tab.addEventListener("mouseenter", () => { hovering = true; });
    tab.addEventListener("mouseleave", () => { hovering = false; });
    for (const el of [tab, menu]) {
      el.addEventListener("mouseenter", () => open(true));
      el.addEventListener("mouseleave", () => { shut = setTimeout(() => open(false), 180); });
    }
  }
  document.addEventListener("click", e => { if (!menu.hidden && !tab.contains(e.target) && !menu.contains(e.target)) open(false); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !menu.hidden) { open(false); tab.focus(); } });
  addEventListener("scroll", () => open(false), { passive: true });
  addEventListener("resize", () => open(false));
})();

// Quick search: Ctrl+K (or / or the search button) opens a box to jump to any hero's builds or tier list spot, or any page.
(() => {
  const live = document.querySelector("nav .nav-live");
  if (!live) return;
  const css = document.createElement("style");
  css.textContent = `
.qk { display: inline-flex; align-items: center; gap: 8px; height: 32px; padding: 0 8px 0 10px; border-radius: 8px; border: 1px solid var(--line, #332d2a); background: var(--surface, #1a1716); color: var(--muted, #a89f99); font: 13px/1 var(--sans, "Geist", system-ui, sans-serif); cursor: pointer; }
.qk:hover { color: var(--text, #f4efec); border-color: #4a413c; }
/* Wider box that reads like a search field: "Search Abathur" with the hero name taking turns */
.qk { width: 236px; } .qk kbd { margin-left: auto; }
.qk span { display: flex; gap: .3em; min-width: 0; overflow: hidden; white-space: nowrap; }
.qk i { font-style: normal; color: #7d736d; display: inline-block; overflow: hidden; text-overflow: ellipsis; transition: transform .4s cubic-bezier(.22, 1, .36, 1), opacity .3s, filter .3s; }
.qk i.out { transform: translateY(-60%); opacity: 0; filter: blur(3px); transition-timing-function: cubic-bezier(.5, 0, .75, 0); transition-duration: .25s; }
.qk i.in { transform: translateY(60%); opacity: 0; filter: blur(3px); transition: none; }
.qk svg { width: 15px; height: 15px; }
.qk kbd, .qk-foot kbd { font: 500 11px/1 var(--mono, ui-monospace, monospace); padding: 3px 5px; border-radius: 4px; border: 1px solid var(--line, #332d2a); background: var(--bg, #12100f); color: var(--muted, #a89f99); }
@media (max-width: 900px) { .qk { width: auto; } .qk i { display: none; } }
@media (max-width: 640px) { .qk { margin-left: auto; width: 34px; padding: 0; justify-content: center; } .qk span, .qk kbd { display: none; } .qk + .nav-live { margin-left: 14px; } }
.qk-box { position: fixed; inset: 0; z-index: 60; display: grid; justify-items: center; align-items: start; padding: 12vh 16px 16px; background: rgba(5, 6, 8, 0.6); backdrop-filter: blur(3px); animation: qk-fade .12s ease-out; }
@keyframes qk-fade { from { opacity: 0; } }
.qk-panel { width: min(560px, 100%); max-height: 70vh; display: grid; grid-template-rows: auto 1fr auto; border-radius: 14px; border: 1px solid #3d3531; background: var(--surface, #1a1716); box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6); overflow: hidden; font: 14px/1.4 var(--sans, "Geist", system-ui, sans-serif); color: var(--text, #f4efec); animation: qk-in .14s ease-out; }
@keyframes qk-in { from { opacity: 0; transform: translateY(-6px) scale(.99); } }
.qk-in { display: flex; align-items: center; gap: 10px; padding: 0 14px; border-bottom: 1px solid var(--line, #332d2a); color: var(--muted, #a89f99); }
.qk-in svg { width: 18px; height: 18px; flex: none; }
.qk-in input { flex: 1; height: 52px; border: 0; outline: 0; background: transparent; color: var(--text, #f4efec); font: 16px var(--sans, "Geist", system-ui, sans-serif); min-width: 0; }
.qk-list { overflow-y: auto; padding: 6px; }
.qk-sec { padding: 8px 10px 4px; font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--muted, #a89f99); }
.qk-sec .qk-ti { width: 13px; height: 13px; vertical-align: -2px; }
.qk-row { display: flex; align-items: center; gap: 12px; padding: 7px 10px; border-radius: 8px; color: inherit; text-decoration: none; cursor: pointer; }
.qk-row img { width: 32px; height: 32px; border-radius: 6px; object-fit: cover; background: var(--surface-2, #221e1c); }
.qk-row .qk-ic { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 6px; background: var(--surface-2, #221e1c); border: 1px solid var(--line, #332d2a); color: var(--brand, #f26a4b); }
.qk-row .qk-ic svg { width: 16px; height: 16px; }
.qk-row b { font-weight: 500; }
.qk-row small { color: var(--muted, #a89f99); font-size: 12px; display: inline-flex; align-items: center; gap: 5px; }
.qk-row small svg { width: 13px; height: 13px; }
.qk-row .qk-go { margin-left: auto; display: flex; gap: 6px; }
.qk-row .qk-go a { font-size: 12px; padding: 4px 8px; border-radius: 6px; border: 1px solid var(--line, #332d2a); color: var(--muted, #a89f99); text-decoration: none; }
.qk-row .qk-go a:hover { color: var(--text, #f4efec); border-color: #4a413c; }
.qk-row[aria-selected="true"] { background: var(--surface-2, #221e1c); box-shadow: inset 2px 0 0 var(--brand, #f26a4b); }
.qk-row[aria-selected="true"] .qk-go a:first-child { color: var(--text, #f4efec); border-color: var(--brand, #f26a4b); }
.qk-none { padding: 18px 10px; color: var(--muted, #a89f99); text-align: center; }
.qk-foot { display: flex; gap: 16px; flex-wrap: wrap; padding: 9px 14px; border-top: 1px solid var(--line, #332d2a); font-size: 12px; color: var(--muted, #a89f99); }
@media (hover: none) { .qk-foot { display: none; } }
@media (prefers-reduced-motion: reduce) { .qk-box, .qk-panel { animation: none; } }`;
  document.head.append(css);

  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  const glass = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="m16 16 4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const btn = document.createElement("button");
  btn.className = "qk";
  btn.type = "button";
  btn.setAttribute("aria-label", "Search heroes and pages");
  btn.innerHTML = `${glass}<span>Search<i></i></span><kbd>${mac ? "⌘" : "Ctrl"} K</kbd>`;
  live.before(btn);

  const PAGES = [
    ["Home", "/", "Start page"], ["Tier list", "/tierlist/", "Jun's ranked tier list"], ["Builds", "/builds/", "Talent builds for every hero"], ["Draft helper", "/draft/", "Best picks against the enemy team"], ["Match history", "/games/", "My recent ranked games"],
    ["Make a tier list", "/tierlist-maker/", "Rank every hero and share it"], ["Make a build", "/builds/?make", "Pick a hero, make a talent build"], ["Overlay", "/overlay/", "The stream overlay"],
  ];
  const pageIc = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const norm = s => s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");
  let heroes = null, box = null, rows = [], at = 0;
  const load = () => heroes ? Promise.resolve(heroes) : fetch("/data/heroes.json").then(r => r.json()).then(list => heroes = list.map(([id, name, , grole]) => ({ id, name, grole, key: norm(name), words: name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean) })).sort((a, b) => a.name.localeCompare(b.name))).catch(() => heroes = []);

  // Hero names take turns in the button ("Search Abathur", "Search Valla"...), in a random order, every few seconds.
  // Home already cycles names in its headline, so there the button just says "Search heroes".
  const home = location.pathname === "/" || location.pathname === "/index.html";
  if (home) btn.querySelector("i").textContent = "heroes";
  else if (!matchMedia("(prefers-reduced-motion: reduce)").matches) load().then(list => {
    const names = list.map(h => h.name);
    for (let i = names.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [names[i], names[j]] = [names[j], names[i]]; }
    const el = btn.querySelector("i");
    if (!el || !names.length) return;
    let k = 0;
    el.textContent = names[0];
    setInterval(() => {
      if (document.hidden || box) return;
      el.classList.add("out");
      setTimeout(() => {
        el.textContent = names[k = (k + 1) % names.length];
        el.classList.replace("out", "in");
        el.offsetWidth;   // place it below before it rises
        el.classList.remove("in");
      }, 250);
    }, 2600);
  });

  // Style tags from the tier list ("dive" lists the dive heroes). Loaded the first time the box opens.
  let TL = null;
  const loadTags = () => TL || !window.loadTierlist ? Promise.resolve() : loadTierlist().then(t => { TL = t; }).catch(() => {});
  function find(q) {
    const k = norm(q);
    const hs = !k ? [] : (heroes || []).map(h => [h, h.key.startsWith(k) || h.id.startsWith(k) ? 0 : h.words.some(w => w.startsWith(k)) ? 1 : h.key.includes(k) ? 2 : 9]).filter(x => x[1] < 9).sort((a, b) => a[1] - b[1]).map(x => x[0]).slice(0, 8);
    const tag = k.length >= 3 && TL ? Object.keys(TL.tagNames || {}).find(t => norm(TL.tagNames[t]).startsWith(k)) : null;
    const ts = tag ? (heroes || []).filter(h => !hs.includes(h) && h.id !== "gall" && tagsOf(TL, h.id).includes(tag)) : [];
    const ps = PAGES.filter(p => !k || norm(p[0]).includes(k) || norm(p[2]).includes(k));
    return { hs, tag, ts, ps };
  }
  function draw() {
    const q = box.querySelector("input").value, { hs: named, tag, ts, ps } = find(q), hs = [...named, ...ts];
    rows = [...hs.map(h => ["/builds/#" + h.id, h]), ...ps.map(p => [p[1], p])];
    at = Math.min(at, Math.max(0, rows.length - 1));
    const list = box.querySelector(".qk-list");
    const heroRow = (h, i) => `<div class="qk-row" role="option" data-i="${i}" data-href="/builds/#${h.id}"><img src="/img/heroes/${h.id}.webp" alt=""><span><b>${esc(h.name)}</b><br><small>${window.roleIcon ? roleIcon(h.grole) : ""}${esc(h.grole)}</small></span><span class="qk-go"><a href="/builds/#${h.id}" tabindex="-1">Builds</a><a href="/tierlist/#${h.id}" tabindex="-1">Tier list</a></span></div>`;
    list.innerHTML = (named.length ? `<div class="qk-sec">Heroes</div>` + named.map(heroRow).join("") : "")
      + (ts.length ? `<div class="qk-sec">${tagIcon(TL, tag, "qk-ti")} ${esc(TL.tagNames[tag])} heroes</div>` + ts.map((h, j) => heroRow(h, named.length + j)).join("") : "")
      + (ps.length ? `<div class="qk-sec">Pages</div>` + ps.map((p, j) => `<div class="qk-row" role="option" data-i="${hs.length + j}" data-href="${p[1]}"><span class="qk-ic">${pageIc}</span><span><b>${esc(p[0])}</b><br><small>${esc(p[2])}</small></span></div>`).join("") : "")
      || `<div class="qk-none">No hero or page called “${esc(q)}”</div>`;
    mark();
  }
  function mark() {
    box.querySelectorAll(".qk-row").forEach(r => r.setAttribute("aria-selected", +r.dataset.i === at));
    box.querySelector(`.qk-row[data-i="${at}"]`)?.scrollIntoView({ block: "nearest" });
  }
  function go(href) {
    close();
    const u = new URL(href, location.href);
    if (u.pathname === location.pathname && u.search === location.search && u.hash) location.hash = u.hash;   // same page: just switch hero
    else location.href = href;
  }
  function open() {
    if (box) return;
    Promise.all([load(), loadTags()]).then(() => box && draw());
    box = document.createElement("div");
    box.className = "qk-box";
    box.innerHTML = `<div class="qk-panel" role="dialog" aria-label="Search"><label class="qk-in">${glass}<input type="text" placeholder="Search a hero or page…" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true"></label><div class="qk-list" role="listbox"></div><div class="qk-foot"><span><kbd>↑</kbd> <kbd>↓</kbd> move</span><span><kbd>Enter</kbd> builds</span><span><kbd>Shift</kbd>+<kbd>Enter</kbd> tier list</span><span><kbd>Esc</kbd> close</span></div></div>`;
    document.body.append(box);
    const input = box.querySelector("input");
    at = 0;
    draw();
    input.focus();
    input.addEventListener("input", () => { at = 0; draw(); });
    input.addEventListener("keydown", e => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); at = (at + (e.key === "ArrowDown" ? 1 : -1) + rows.length) % Math.max(1, rows.length); mark(); }
      else if (e.key === "Enter" && rows[at]) { e.preventDefault(); const [href, item] = rows[at]; go(e.shiftKey && item.id ? "/tierlist/#" + item.id : href); }
    });
    box.addEventListener("mousemove", e => { const r = e.target.closest(".qk-row"); if (r && +r.dataset.i !== at) { at = +r.dataset.i; mark(); } });
    box.addEventListener("click", e => {
      const a = e.target.closest(".qk-go a"), r = e.target.closest(".qk-row");
      if (a || r) { e.preventDefault(); go(a ? a.getAttribute("href") : r.dataset.href); return; }
      if (!e.target.closest(".qk-panel")) close();
    });
  }
  function close() { box?.remove(); box = null; }
  btn.addEventListener("click", open);
  document.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); box ? close() : open(); }
    else if (e.key === "/" && !box && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) && !document.activeElement?.isContentEditable) { e.preventDefault(); open(); }
    else if (e.key === "Escape" && box) close();
  });
})();

// The coral line under the current tab (made by a tiny script at the top of each page) stays under its tab
// when the fonts finish loading, the window changes size, or "Make your own" becomes the current tab.
// Clicking another tab slides it there straight away, before the next page has even loaded; the page change
// (site.css view transitions) then carries on from wherever the line is, so it's one smooth move.
(() => {
  const ind = document.querySelector(".tabs .tab-ind");
  if (!ind) return;
  const tabs = ind.parentNode;
  const place = a => {
    a = a || tabs.querySelector('a[aria-current="page"]');
    ind.hidden = !a;
    if (a) ind.style.cssText = `left:${a.offsetLeft}px;width:${a.offsetWidth}px`;
  };
  place();
  document.fonts?.ready.then(() => place());
  addEventListener("resize", () => place());
  const go = a => {
    if (!a || a.getAttribute("aria-current") === "page") return;
    ind.classList.add("moving");
    place(a);
    tabs.querySelector('a[aria-current="page"]')?.classList.add("leaving");
    a.classList.add("going");
  };
  document.addEventListener("click", e => {
    if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest("a[href]");
    if (!a || a.target === "_blank" || a.origin !== location.origin) return;
    if (a.closest(".tabs") && a.getAttribute("aria-haspopup") !== "true") go(a);
    else if (a.closest(".mk-menu")) go(tabs.querySelector('a[aria-haspopup="true"]'));
  });
  // Back/forward from the cache: put the line back where it belongs
  addEventListener("pageshow", e => { if (e.persisted) { ind.classList.remove("moving"); tabs.querySelectorAll(".going, .leaving").forEach(x => x.classList.remove("going", "leaving")); place(); } });
})();

// Get the next page ready while the mouse is still on its link (Chrome and Edge: "prerender"), so clicking
// opens it instantly. Only pages on this site, never the API, and only after a short hover or a touch.
(() => {
  if (!HTMLScriptElement.supports?.("speculationrules")) return;
  const s = document.createElement("script");
  s.type = "speculationrules";
  s.textContent = JSON.stringify({ prerender: [{
    where: { and: [{ href_matches: "/*" }, { not: { href_matches: "/api/*" } }, { not: { selector_matches: "[target=_blank]" } }] },
    eagerness: "moderate",
  }] });
  document.head.append(s);
})();

// Feedback: a small button in the corner (and a footer link) opens a short form; messages go to Jun's inbox (/inbox/, src/feedback.js).
(() => {
  if (location.pathname.startsWith("/inbox")) return;
  const css = document.createElement("style");
  css.textContent = `
.fb-btn { position: fixed; right: 18px; bottom: calc(18px + var(--fb-lift, 0px)); z-index: 18; display: inline-flex; align-items: center; gap: 8px; height: 38px; padding: 0 14px 0 12px; border-radius: 999px; border: 1px solid #3d3531; background: rgba(26, 23, 22, .92); backdrop-filter: blur(6px); color: #f4efec; font: 500 13px/1 var(--sans, "Geist", system-ui, sans-serif); cursor: pointer; box-shadow: 0 8px 24px rgba(0, 0, 0, .45); transition: border-color .15s, transform .15s, opacity .2s; }
.fb-btn svg { width: 16px; height: 16px; color: var(--brand, #f26a4b); }
.fb-btn:hover { border-color: #5a4c45; transform: translateY(-1px); }
.fb-btn[aria-expanded="true"] { opacity: 0; pointer-events: none; }
.fb-btn.away { transform: translateY(calc(100% + 24px)); opacity: 0; pointer-events: none; }
.fb-btn b { min-width: 18px; height: 18px; padding: 0 5px; margin-right: -4px; border-radius: 9px; background: var(--brand, #f26a4b); color: #1a0f0b; font: 700 11px/18px var(--sans, "Geist", sans-serif); text-align: center; }
@media (max-width: 640px) { .fb-btn { right: 14px; bottom: calc(14px + var(--fb-lift, 0px)); width: 44px; height: 44px; padding: 0; justify-content: center; } .fb-btn span { display: none; } .fb-btn svg { width: 19px; height: 19px; } .fb-btn b { position: absolute; top: -4px; right: -2px; margin: 0; } }
.fb-panel { position: fixed; right: 18px; bottom: 18px; z-index: 55; width: 360px; max-width: calc(100vw - 32px); border-radius: 14px; border: 1px solid #3d3531; background: var(--surface, #1a1716); box-shadow: 0 24px 60px rgba(0, 0, 0, .6); color: var(--text, #f4efec); font: 14px/1.45 var(--sans, "Geist", system-ui, sans-serif); transform-origin: bottom right; animation: fb-in .16s cubic-bezier(.22, 1, .36, 1); }
@keyframes fb-in { from { opacity: 0; transform: translateY(8px) scale(.97); } }
@media (max-width: 640px) { .fb-panel { right: 0; left: 0; bottom: 0; width: auto; max-width: none; border-radius: 16px 16px 0 0; border-bottom: 0; padding-bottom: env(safe-area-inset-bottom); transform-origin: bottom; } }
.fb-head { display: flex; align-items: start; gap: 10px; padding: 16px 16px 4px; }
.fb-head h2 { margin: 0; font: 600 16px/1.3 var(--display, "Sora", sans-serif); letter-spacing: -.01em; }
.fb-head p { margin: 2px 0 0; font-size: 12.5px; color: var(--muted, #a89f99); }
.fb-x { margin-left: auto; flex: none; display: grid; place-items: center; width: 28px; height: 28px; border-radius: 7px; border: 0; background: none; color: var(--muted, #a89f99); cursor: pointer; }
.fb-x:hover { background: var(--surface-2, #221e1c); color: var(--text, #f4efec); }
.fb-x svg { width: 14px; height: 14px; }
.fb-body { display: grid; gap: 12px; padding: 12px 16px 16px; }
.fb-types { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.fb-types button { display: grid; justify-items: center; gap: 4px; padding: 9px 4px 8px; border-radius: 9px; border: 1px solid var(--line, #332d2a); background: var(--bg, #12100f); color: var(--muted, #a89f99); font: 500 12px/1.1 var(--sans, "Geist", sans-serif); cursor: pointer; transition: border-color .12s, color .12s, background .12s; }
.fb-types button svg { width: 18px; height: 18px; }
.fb-types button:hover { color: var(--text, #f4efec); border-color: #4a413c; }
.fb-types button[aria-pressed="true"] { color: var(--text, #f4efec); border-color: var(--brand, #f26a4b); background: rgba(242, 106, 75, .08); }
.fb-types button[aria-pressed="true"] svg { color: var(--brand, #f26a4b); }
.fb-panel textarea, .fb-panel input[type=text] { width: 100%; box-sizing: border-box; border-radius: 9px; border: 1px solid var(--line, #332d2a); background: var(--bg, #12100f); color: var(--text, #f4efec); font: 14px/1.45 var(--sans, "Geist", sans-serif); padding: 10px 12px; outline: none; transition: border-color .12s; }
.fb-panel textarea { min-height: 112px; resize: vertical; }
.fb-panel textarea:focus, .fb-panel input[type=text]:focus { border-color: var(--brand, #f26a4b); }
.fb-panel ::placeholder { color: #6f6560; }
.fb-meta { display: flex; justify-content: space-between; gap: 8px; margin-top: -6px; font-size: 11.5px; color: #7d736d; }
.fb-meta b { font-weight: 500; color: var(--muted, #a89f99); }
.fb-trap { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }
.fb-foot { display: flex; align-items: center; gap: 10px; }
.fb-foot a { font-size: 12.5px; color: var(--muted, #a89f99); display: inline-flex; align-items: center; gap: 6px; }
.fb-foot a:hover { color: var(--text, #f4efec); }
.fb-foot a svg { width: 15px; height: 15px; }
.fb-send { margin-left: auto; height: 36px; padding: 0 16px; border-radius: 9px; border: 0; background: var(--brand, #f26a4b); color: #1a0f0b; font: 600 13.5px var(--sans, "Geist", sans-serif); cursor: pointer; transition: filter .12s, opacity .12s; }
.fb-send:hover { filter: brightness(1.08); }
.fb-send:disabled { opacity: .45; cursor: default; filter: none; }
.fb-err { margin: -4px 0 0; font-size: 12.5px; color: var(--bad, #ef7d8b); }
.fb-done { display: grid; justify-items: center; text-align: center; gap: 6px; padding: 26px 20px 28px; }
.fb-done .fb-ok { display: grid; place-items: center; width: 46px; height: 46px; border-radius: 50%; background: rgba(95, 207, 143, .12); color: var(--good, #5fcf8f); margin-bottom: 4px; }
.fb-done .fb-ok svg { width: 22px; height: 22px; stroke-dasharray: 24; stroke-dashoffset: 24; animation: fb-tick .4s .1s ease-out forwards; }
@keyframes fb-tick { to { stroke-dashoffset: 0; } }
.fb-done h2 { margin: 0; font: 600 16px var(--display, "Sora", sans-serif); }
.fb-done p { margin: 0; font-size: 13px; color: var(--muted, #a89f99); }
.fb-done button { margin-top: 10px; font: 500 13px var(--sans, "Geist", sans-serif); color: var(--muted, #a89f99); background: none; border: 1px solid var(--line, #332d2a); border-radius: 8px; padding: 7px 12px; cursor: pointer; }
.fb-done button:hover { color: var(--text, #f4efec); border-color: #4a413c; }
.fb-inbox { display: flex; align-items: center; gap: 8px; margin: 0 16px; padding: 8px 10px; border-radius: 9px; background: var(--surface-2, #221e1c); font-size: 12.5px; color: var(--muted, #a89f99); }
.fb-inbox:hover { color: var(--text, #f4efec); }
.fb-inbox b { color: var(--brand, #f26a4b); font-weight: 600; }
@media (prefers-reduced-motion: reduce) { .fb-panel, .fb-done .fb-ok svg { animation: none; stroke-dashoffset: 0; } }`;
  document.head.append(css);

  const ic = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const BUBBLE = ic('<path d="M20 12.5a7.5 7.5 0 0 1-11 6.6L4 20.5l1.4-4.6A7.5 7.5 0 1 1 20 12.5Z"/>');
  const TYPES = [
    ["bug", "Bug", ic('<rect x="7" y="8" width="10" height="12" rx="5"/><path d="M9 8a3 3 0 0 1 6 0M3 13h4M17 13h4M4.5 8.5 7 10M19.5 8.5 17 10M4.5 18.5 7 17M19.5 18.5 17 17"/>'), "What happened, and what did you expect?"],
    ["idea", "Idea", ic('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z"/>'), "What would make the site better for you?"],
    ["info", "Wrong info", ic('<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 10v4M12 17h.01"/>'), "Which hero, build or tier looks wrong, and why?"],
    ["other", "Other", BUBBLE, "Anything else you want Jun to know."],
  ];
  const where = () => {
    const p = location.pathname, hero = p.match(/^\/builds\/([a-z0-9]+)/)?.[1] || location.hash.slice(1).split("?")[0];
    const name = { "/": "Home", "/tierlist/": "Tier list", "/tierlist-maker/": "Tier list maker", "/draft/": "Draft helper", "/games/": "Match history", "/patch-notes/": "Patch notes", "/overlay/": "Overlay", "/updates/": "Updates" }[p];
    if (p.startsWith("/builds")) return hero ? "Builds · " + hero.charAt(0).toUpperCase() + hero.slice(1) : "Builds";
    return name || p;
  };
  let DRAFT = {}; try { DRAFT = JSON.parse(localStorage.getItem("junhots_feedback") || "{}"); } catch {}
  const keep = () => { try { localStorage.setItem("junhots_feedback", JSON.stringify(DRAFT)); } catch {} };

  const btn = document.createElement("button");
  btn.className = "fb-btn";
  btn.type = "button";
  btn.setAttribute("aria-expanded", "false");
  btn.innerHTML = BUBBLE + "<span>Feedback</span>";
  btn.title = "Send feedback to Jun";
  document.body.append(btn);
  // Also in the footer, next to Updates
  const social = document.querySelector("footer .social");
  if (social) {
    const a = document.createElement("a");
    a.href = "#feedback"; a.textContent = "Feedback";
    a.addEventListener("click", e => { e.preventDefault(); open(); });
    social.prepend(a);
  }

  const panel = document.createElement("div");
  panel.className = "fb-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Send feedback");
  panel.hidden = true;
  document.body.append(panel);
  let openedAt = 0;

  function form() {
    const type = DRAFT.type || "idea";
    panel.innerHTML = `
      <div class="fb-head"><div><h2>Send feedback</h2><p>Goes straight to Jun. Bugs, ideas, a build that looks off, anything.</p></div>
        <button class="fb-x" type="button" aria-label="Close">${ic('<path d="M6 6l12 12M18 6 6 18"/>')}</button></div>
      <div class="fb-inbox-slot"></div>
      <form class="fb-body" novalidate>
        <div class="fb-types" role="group" aria-label="Type">${TYPES.map(([k, n, svg]) => `<button type="button" data-t="${k}" aria-pressed="${k === type}">${svg}${n}</button>`).join("")}</div>
        <textarea name="text" maxlength="1500" aria-label="Your message" placeholder="${TYPES.find(t => t[0] === type)[3]}">${(DRAFT.text || "").replace(/</g, "&lt;")}</textarea>
        <div class="fb-meta"><span>From <b>${where()}</b></span><span class="fb-count"></span></div>
        <input type="text" name="name" maxlength="60" autocomplete="nickname" placeholder="Your name or Discord (optional, if you want a reply)" value="${(DRAFT.name || "").replace(/"/g, "&quot;")}">
        <input class="fb-trap" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
        <p class="fb-err" hidden></p>
        <div class="fb-foot"><a href="https://discord.gg/72sNc5a88b" target="_blank" rel="noopener">${BUBBLE}Rather chat? Discord</a><button class="fb-send" type="submit">Send</button></div>
      </form>`;
    const f = panel.querySelector("form"), ta = f.text, send = f.querySelector(".fb-send"), count = f.querySelector(".fb-count");
    const sync = () => { const n = ta.value.trim().length; send.disabled = n < 3; count.textContent = n > 1200 ? `${1500 - ta.value.length} left` : ""; };
    sync();
    ta.addEventListener("input", () => { DRAFT.text = ta.value; keep(); sync(); });
    f.name.addEventListener("input", () => { DRAFT.name = f.name.value; keep(); });
    f.querySelectorAll(".fb-types button").forEach(b => b.addEventListener("click", () => {
      DRAFT.type = b.dataset.t; keep();
      f.querySelectorAll(".fb-types button").forEach(x => x.setAttribute("aria-pressed", x === b));
      ta.placeholder = TYPES.find(t => t[0] === b.dataset.t)[3];
      ta.focus();
    }));
    ta.addEventListener("keydown", e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !send.disabled) f.requestSubmit(); });
    panel.querySelector(".fb-x").addEventListener("click", close);
    f.addEventListener("submit", async e => {
      e.preventDefault();
      const err = f.querySelector(".fb-err");
      send.disabled = true; send.textContent = "Sending…"; err.hidden = true;
      const r = await fetch("/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        type: DRAFT.type || "idea", text: ta.value, name: f.name.value, page: location.pathname + location.hash, hp: f.website.value, ms: Date.now() - openedAt,
      }) }).catch(() => null);
      const data = r && await r.json().catch(() => ({}));
      if (r?.ok) { DRAFT = { name: DRAFT.name }; keep(); thanks(); return; }
      err.textContent = data?.error || "Couldn't send. Check your connection and try again.";
      err.hidden = false; send.textContent = "Send"; send.disabled = false;
    });
    inboxLink();
  }
  function thanks() {
    const auto = setTimeout(() => { if (panel.querySelector(".fb-done")) close(); }, 3000);
    panel.addEventListener("pointerdown", () => clearTimeout(auto), { once: true });
    panel.innerHTML = `<div class="fb-done"><span class="fb-ok">${ic('<path d="M5 12.5l4.5 4.5L19 7.5"/>')}</span><h2>Thanks!</h2><p>Jun reads every message.</p><button type="button">Close</button></div>`;
    panel.querySelector("button").addEventListener("click", close);
    panel.querySelector("button").focus();
  }
  // Jun only (logged in on the Builds page): a link to the inbox with how many messages are new
  async function inboxLink() {
    const n = await newCount();
    if (n == null) return;
    const slot = panel.querySelector(".fb-inbox-slot");
    if (slot) slot.innerHTML = `<a class="fb-inbox" href="/inbox/">${ic('<path d="M3 13h5l1.5 3h5L16 13h5M5 5h14l2 8v6H3v-6l2-8Z"/>').replace("<svg", '<svg width="15" height="15"')}Your inbox · <b>${n} new</b></a>`;
  }
  // Jun only (logged in): how many messages are new, at most one check a minute while browsing.
  // The inbox page writes the exact number here after every Done/Delete, so the badge follows at once (in every tab).
  async function newCount() {
    let pw = "", cached; try { pw = localStorage.getItem("junhots_admin") || ""; cached = JSON.parse(localStorage.getItem("junhots_fbnew") || "null"); } catch {}
    if (!pw) return null;
    if (cached && Date.now() - cached.t < 60e3) return cached.n;
    const r = await fetch("/api/feedback?count=1", { headers: { authorization: "Bearer " + pw } }).catch(() => null);
    if (!r?.ok) return null;
    const n = (await r.json()).new;
    try { localStorage.setItem("junhots_fbnew", JSON.stringify({ n, t: Date.now() })); } catch {}
    return n;
  }
  const badge = n => {
    btn.querySelector("b")?.remove();
    if (n) btn.insertAdjacentHTML("beforeend", `<b title="${n} new in your inbox">${n}</b>`);
    const link = panel.querySelector(".fb-inbox b");
    if (link) link.textContent = n + " new";
  };
  newCount().then(badge);
  addEventListener("storage", e => { if (e.key === "junhots_fbnew") try { badge(JSON.parse(e.newValue)?.n || 0); } catch {} });
  function open() {
    if (!panel.hidden) return;
    form();
    openedAt = Date.now();
    panel.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    // On phones the keyboard would cover the form before they've picked a type, so only focus with a mouse
    if (matchMedia("(hover: hover)").matches) panel.querySelector("textarea").focus({ preventScroll: true });
  }
  function close() {
    panel.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    btn.focus({ preventScroll: true });
  }
  btn.addEventListener("click", open);
  // Sit above a bar stuck to the bottom of the page (the "Your build" bar on Builds) instead of covering its buttons
  const lift = () => {
    const bar = document.querySelector(".mine"), r = bar?.getBoundingClientRect();
    btn.style.setProperty("--fb-lift", r && r.height && r.top < innerHeight && r.bottom >= innerHeight - 2 ? innerHeight - r.top + "px" : "0px");
  };
  // Phones: tuck the button away while scrolling down through content, bring it back when scrolling up
  let lastY = scrollY;
  addEventListener("scroll", () => {
    const y = scrollY, small = innerWidth <= 640, atEnd = innerHeight + y >= document.documentElement.scrollHeight - 40;
    if (Math.abs(y - lastY) > 8) { btn.classList.toggle("away", small && y > lastY && y > 120 && !atEnd); lastY = y; }
  }, { passive: true });
  addEventListener("scroll", lift, { passive: true }); addEventListener("resize", lift); addEventListener("click", () => setTimeout(lift, 50)); lift();
  if (location.hash === "#feedback") open();
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !panel.hidden) close(); });
  document.addEventListener("pointerdown", e => { if (!panel.hidden && !panel.contains(e.target) && !btn.contains(e.target) && !e.target.closest('a[href="#feedback"]')) close(); });
})();
