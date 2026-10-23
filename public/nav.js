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
