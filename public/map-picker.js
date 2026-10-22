// Map picker for the Tier list and Draft pages: replaces a plain dropdown with a button that shows the map's
// icon in the map's color, and opens a grid of maps (objective under each name). Icons are simple line drawings.
(() => {
  const ICONS = {
    Overall: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
    "Alterac Pass": '<path d="M6 21V4"/><path d="M6 5h11l-2.5 4L17 13H6"/>',
    "Battlefield of Eternity": '<path d="M5 19L17 7"/><path d="M15 5h4v4"/><path d="M19 19L7 7"/><path d="M5 9V5h4"/>',
    "Braxis Holdout": '<circle cx="12" cy="12" r="2"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14"/>',
    "Cursed Hollow": '<path d="M19 14.5A8 8 0 1 1 9.5 5a6.5 6.5 0 0 0 9.5 9.5z"/>',
    "Dragon Shire": '<path d="M12 21c-4 0-6.5-2.6-6.5-6 0-3.5 3-5.5 3.5-9 2 1.3 3 3.2 3 5 1-.6 1.7-1.8 1.8-3.3 2.3 1.8 3.7 4.5 3.7 7.3 0 3.4-2.5 6-5.5 6z"/>',
    "Garden of Terror": '<path d="M12 21v-9"/><path d="M12 12c0-4 2.5-7 7-7 0 4.5-3 7-7 7z"/><path d="M12 15c0-3-2-5.5-6-5.5 0 3.5 2.5 5.5 6 5.5z"/>',
    "Hanamura Temple": '<path d="M3 5.5c6 1.5 12 1.5 18 0"/><path d="M5 9.5h14"/><path d="M7.5 6.5V21M16.5 6.5V21"/>',
    "Infernal Shrines": '<path d="M12 3l8 14H4z"/><circle cx="12" cy="12.5" r="2"/>',
    "Sky Temple": '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12h2.5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
    "Tomb of the Spider Queen": '<path d="M12 3l7 6-7 12-7-12z"/><path d="M5 9h14M12 3l-2.5 6L12 21l2.5-12z"/>',
    "Towers of Doom": '<path d="M7 21V9h10v12"/><path d="M6 9V4h2.5v2h2V4h3v2h2V4H18v5"/><path d="M10.5 21v-4a1.5 1.5 0 0 1 3 0v4"/>',
    "Volskaya Foundry": '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/><circle cx="12" cy="12" r="6.5"/>',
  };
  // [name, color, objective]
  const INFO = [
    ["Overall", "#f26a4b", "every map"],
    ["Alterac Pass", "#8fb8e0", "Prisoners, cavalry"],
    ["Battlefield of Eternity", "#e9cf7a", "Immortals"],
    ["Braxis Holdout", "#5fd0c4", "Beacons, zerg"],
    ["Cursed Hollow", "#b48ad8", "Tributes, curse"],
    ["Dragon Shire", "#ef7f5f", "Shrines, Dragon Knight"],
    ["Garden of Terror", "#93cc76", "Seeds, Garden Terror"],
    ["Hanamura Temple", "#f2a0bd", "Payloads"],
    ["Infernal Shrines", "#e05f6f", "Punishers"],
    ["Sky Temple", "#e8b17a", "Temples"],
    ["Tomb of the Spider Queen", "#a5d36b", "Gems, webweavers"],
    ["Towers of Doom", "#9aa3b5", "Altars"],
    ["Volskaya Foundry", "#d7c49e", "Protector"],
  ];
  window.MAPS = INFO.slice(1).map(m => m[0]);
  const ico = name => `<svg class="mp-ico" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
  const car = '<svg class="mp-car" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

  // host: an empty element. overall: what "Overall" is called on this page. Returns { set(map) }.
  window.mapPicker = (host, { value = "Overall", overall = "Overall", onChange }) => {
    let cur = value, menu = null;
    host.classList.add("mp");
    host.innerHTML = '<button class="tab mp-btn" type="button" aria-haspopup="true" aria-expanded="false"></button>';
    const btn = host.firstChild, label = n => n === "Overall" ? overall : n;
    const drawBtn = () => {
      const m = INFO.find(x => x[0] === cur);
      btn.style.setProperty("--c", m[1]);
      btn.setAttribute("aria-label", `Map: ${label(cur)}`);
      btn.innerHTML = `<span class="l">${ico(cur)}${label(cur)}</span>${car}`;
    };
    const place = () => {
      const r = btn.getBoundingClientRect(), w = menu.offsetWidth;
      menu.style.top = `${r.bottom + 6}px`;
      menu.style.left = `${Math.max(16, Math.min(r.right - w, innerWidth - w - 16))}px`;
    };
    const close = (focus) => {
      if (!menu) return;
      menu.remove(); menu = null;
      btn.setAttribute("aria-expanded", "false");
      removeEventListener("scroll", place, true); removeEventListener("resize", place);
      if (focus) btn.focus();
    };
    const open = () => {
      menu = document.createElement("div");
      menu.className = "mp-menu";
      menu.setAttribute("role", "menu");
      menu.innerHTML = INFO.map(([n, c, obj]) => `<button role="menuitem" class="${n === cur ? "cur" : ""}${n === "Overall" ? " all" : ""}" style="--c:${c}" data-map="${n}">${ico(n)}<b>${label(n)}</b><small>${n === "Overall" ? "· " + obj : obj}</small></button>`).join("");
      document.body.append(menu);
      btn.setAttribute("aria-expanded", "true");
      place();
      addEventListener("scroll", place, true); addEventListener("resize", place);
      (menu.querySelector(".cur") || menu.firstChild).focus({ preventScroll: true });
    };
    btn.addEventListener("click", e => { e.stopPropagation(); menu ? close() : open(); });
    document.addEventListener("click", e => {
      if (!menu) return;
      const b = e.target.closest(".mp-menu button");
      if (b && menu.contains(b)) { cur = b.dataset.map; drawBtn(); close(true); onChange?.(cur); }
      else if (!menu.contains(e.target)) close();
    });
    document.addEventListener("keydown", e => {
      if (!menu) return;
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); return; }
      const items = [...menu.children], i = items.indexOf(document.activeElement);
      if (i < 0) return;
      const cols = getComputedStyle(menu).gridTemplateColumns.split(" ").length;
      // Overall spans the whole first row, so moving down from it lands on the first map
      const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: i === 0 ? 1 : cols, ArrowUp: i <= cols ? -i : -cols }[e.key];
      if (step === undefined) return;
      e.preventDefault();
      items[Math.max(0, Math.min(items.length - 1, i + step))].focus();
    }, true);
    drawBtn();
    return { set(v) { cur = v; drawBtn(); } };
  };
})();
