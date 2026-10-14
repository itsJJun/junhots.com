// "Make your own" in the top bar opens a small menu: Tier list maker or Build maker.
// The menu sits outside the tab row (which scrolls sideways on phones) so it never gets cut off.
(() => {
  const tab = document.querySelector('.tabs a[href="/tierlist-maker/"]');
  if (!tab) return;
  const css = document.createElement("style");
  css.textContent = `
.mk-caret { width: 10px; height: 10px; margin-left: 5px; vertical-align: 0; transition: transform .15s; }
.tabs a[aria-expanded="true"] { color: #ececef; }
.tabs a[aria-expanded="true"] .mk-caret { transform: rotate(180deg); }
.mk-menu { position: fixed; z-index: 50; width: 260px; padding: 6px; border-radius: 12px; border: 1px solid #2e323c; background: #121419; box-shadow: 0 16px 40px rgba(0, 0, 0, 0.55); font: 14px/1.4 "Geist", "Segoe UI", system-ui, sans-serif; animation: mk-in .12s ease-out; }
@keyframes mk-in { from { opacity: 0; transform: translateY(-4px); } }
.mk-menu a { display: grid; grid-template-columns: 34px 1fr; gap: 2px 12px; align-items: center; padding: 9px 10px; border-radius: 8px; color: #ececef; text-decoration: none; }
.mk-menu a:hover, .mk-menu a:focus-visible { background: #181b21; outline: none; }
.mk-menu a[aria-current="page"] { background: #181b21; box-shadow: inset 2px 0 0 #52c7ff; }
.mk-menu .mk-ic { grid-row: span 2; display: grid; place-items: center; width: 34px; height: 34px; border-radius: 8px; background: #181b21; border: 1px solid #23262e; color: #52c7ff; }
.mk-menu .mk-ic svg { width: 18px; height: 18px; }
.mk-menu b { font-weight: 600; }
.mk-menu small { color: #8b8f9a; font-size: 12px; }
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
