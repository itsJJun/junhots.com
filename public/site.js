// Fills in the words from text.js (anything with data-edit="name").
for (const el of document.querySelectorAll("[data-edit]")) {
  const v = (window.SITE_TEXT || {})[el.dataset.edit];
  if (typeof v === "string") el.textContent = v;
}

// Cho and Gall are one hero in the draft, so tier lists rank them as one: Cho'gall, under Cho's id ("chogall").
// Their builds, talents and games stay separate.
window.TIER_SHARED = { gall: "chogall" };
window.tierKey = id => TIER_SHARED[id] || id;
// /data/heroes.json rows as a tier list shows them: no Gall row, and Cho's row named Cho'gall
window.tierRows = rows => rows.filter(r => !TIER_SHARED[r[0]]).map(r => r[0] === "chogall" ? ["chogall", "Cho'gall", ...r.slice(2)] : r);
// Tier list pictures: Cho'gall gets the two-headed one
window.tierImg = id => `/img/heroes/${id === "chogall" ? "chogall-both" : id}.webp`;
// Moves Gall's tiers, counters, synergy and win rate onto Cho'gall (lists saved before they were one hero).
// Where both were set, Cho's stays; lists are merged.
// Power combos (public/edge.js): pairs Jun marked as much stronger together. tl.combos = [{ a, b, tier }],
// tier "+" = one step past the top tier. comboTier gives { name, color } with color an index into the page's PALETTE.
window.LINK_ICON = '<svg class="lk" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3.2-3.2a4.5 4.5 0 0 0-6.4-6.4L12 5.6"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3.2 3.2a4.5 4.5 0 0 0 6.4 6.4L12 18.4"/></svg>';
window.combosOf = (tl, id) => (tl.combos || []).filter(c => (c.tier === "+" || tl.tiers.some(t => t.id === c.tier)) && (!id || c.a === id || c.b === id));
// Combos grouped by a shared hero, so "Stitches + Anduin" and "Stitches + Medivh" show as one card: Stitches + Anduin or Medivh.
// The hero in the most combos leads a group (same combo tier only); combos left over stay pairs. Strongest combo tier first.
window.comboGroups = (tl, list) => {
  const left = [...list], out = [];
  while (left.length) {
    const n = {};
    left.forEach(c => { n[c.a] = (n[c.a] || 0) + 1; n[c.b] = (n[c.b] || 0) + 1; });
    const hub = Object.keys(n).reduce((x, y) => n[y] > n[x] ? y : x);
    const mine = n[hub] > 1 ? left.filter(c => c.a === hub || c.b === hub) : [left[0]];
    const lead = n[hub] > 1 ? hub : left[0].a;
    for (const t of new Set(mine.map(c => c.tier))) out.push({ hub: lead, tier: t, partners: mine.filter(c => c.tier === t).map(c => c.a === lead ? c.b : c.a) });
    mine.forEach(c => left.splice(left.indexOf(c), 1));
  }
  const rank = t => t === "+" ? -1 : tl.tiers.findIndex(x => x.id === t);
  return out.sort((x, y) => rank(x.tier) - rank(y.tier) || y.partners.length - x.partners.length);
};
window.comboTier = (tl, t) => { const x = t === "+" ? tl.tiers[0] : tl.tiers.find(y => y.id === t); return { name: (x?.name || "") + (t === "+" ? "+" : ""), color: x?.color || 0 }; };

window.foldTierlist = tl => {
  if (!tl || typeof tl !== "object") return tl;
  const fold = m => { if (!m) return; for (const [a, b] of Object.entries(TIER_SHARED)) if (a in m) { if (!(b in m)) m[b] = m[a]; delete m[a]; } };
  fold(tl.overall);
  Object.values(tl.maps || {}).forEach(fold);
  fold(tl.winrates?.rates);
  fold(tl.tags);
  if (tl.changes) for (const a in TIER_SHARED) delete tl.changes[a];
  for (const k of ["counters", "synergy"]) {
    if (!tl[k]) continue;
    const out = {};
    for (const [h, list] of Object.entries(tl[k])) {
      const a = tierKey(h);
      for (const t of list || []) { const b = tierKey(t); if (b !== a && !(out[a] ||= []).includes(b)) out[a].push(b); }
    }
    tl[k] = Object.fromEntries(Object.entries(out).filter(([, l]) => l.length));
  }
  if (Array.isArray(tl.combos)) tl.combos = tl.combos.map(c => ({ ...c, a: tierKey(c.a), b: tierKey(c.b) })).filter(c => c.a !== c.b);
  return tl;
};

// Jun's tier list: the copy the overlay uploads when Jun saves, or the file in the repo if that isn't there.
// Style tags come along: tl.tags = { hero: ["melee", "dive"] } (Jun's own, starter tags for any hero without),
// tl.tagNames = { dive: "Dive" }, in the editor's order.
window.loadTierlist = () => Promise.all([fetch("/api/tierlist", { cache: "no-store" })
  .then(r => r.ok ? r.json() : Promise.reject())
  .then(d => d && Array.isArray(d.tiers) ? d : Promise.reject())
  .catch(() => fetch("/data/tierlist.json", { cache: "no-cache" }).then(r => r.json())),
  fetch("/data/hero-tags.json").then(r => r.json()).catch(() => ({ tags: [], heroes: {} }))])
  .then(([tl, td]) => {
    foldTierlist(tl);
    tl.tagNames = Object.fromEntries((td.tags || []).map(t => [t.id, t.name]));
    tl.tagInfo = Object.fromEntries((td.tags || []).map(t => [t.id, t]));
    tl.tags = { ...td.heroes, ...(tl.tags || {}) };
    return tl;
  });

// Counters and synergy lists can name a style tag instead of a hero, as "tag:dive":
//   counters.uther = ["tag:dive"]      Uther is good against dive heroes
//   counters["tag:dive"] = ["lunara"]  Lunara is bad against dive heroes
//   synergy.zarya = ["tag:dive"]       Zarya is good with dive heroes
window.isTag = id => String(id).startsWith("tag:");
window.tagLabel = (tl, id) => tl.tagNames?.[String(id).replace(/^tag:/, "")] || String(id).replace(/^tag:/, "");
// A tag's line icon in its color (paths and colors live in /data/hero-tags.json, shared with the overlay)
window.tagColor = (tl, id) => tl.tagInfo?.[String(id).replace(/^tag:/, "")]?.color || "#a89f99";
window.tagIcon = (tl, id, cls = "ti") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" style="fill:none;stroke:${tagColor(tl, id)};stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round">${tl.tagInfo?.[String(id).replace(/^tag:/, "")]?.icon || ""}</svg>`;
window.tagsOf = (tl, id) => tl.tags?.[tierKey(id)] || [];
window.heroesWithTag = (tl, id, heroIds) => heroIds.filter(h => tagsOf(tl, h).includes(String(id).replace(/^tag:/, "")));

// Role icons (the game's six roles), drawn as small SVGs so they stay sharp at any size.
const ROLE_COLORS = { "Tank": "#f5c03b", "Bruiser": "#ff8a3d", "Ranged Assassin": "#b98aff", "Melee Assassin": "#ff5f5f", "Healer": "#4cd471", "Support": "#55aaff" };
const ROLE_PATHS = {
  "Tank": '<path d="M12 2.5 4.5 5.3v5.6c0 4.8 3.1 8.7 7.5 10.6 4.4-1.9 7.5-5.8 7.5-10.6V5.3z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 6.6 8 8.1v3.1c0 2.7 1.6 4.9 4 6.1 2.4-1.2 4-3.4 4-6.1V8.1z" fill="currentColor"/>',
  "Bruiser": '<path d="M20.5 3.5 19.6 7.4 9.6 17.4 6.6 14.4 16.6 4.4zM3.5 3.5 4.4 7.4 14.4 17.4 17.4 14.4 7.4 4.4z" fill="currentColor"/><path d="M5 13l6 6M19 13l-6 6M7.5 16.5 3.5 20.5M16.5 16.5l4 4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  "Ranged Assassin": '<path d="M12 7v14M6 5v4.5a6 6 0 0 0 12 0V5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M12 2l2.6 4.5H9.4zM6 2l2.2 3.6H3.8zM18 2l2.2 3.6h-4.4z" fill="currentColor"/>',
  "Melee Assassin": '<path d="M12 1.5 15.2 13H8.8z" fill="currentColor"/><path d="M6.5 14.5h11M12 14.5v5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="21.3" r="1.7" fill="currentColor"/>',
  "Healer": '<path d="M9.3 3h5.4v6.3H21v5.4h-6.3V21H9.3v-6.3H3V9.3h6.3z" fill="currentColor"/>',
  "Support": '<path d="M12 2 22 12 12 22 2 12z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7.5 16.5 12 12 16.5 7.5 12z" fill="currentColor"/>',
};
window.roleIcon = (role, cls = "ri") => ROLE_PATHS[role] ? `<svg class="${cls}" viewBox="0 0 24 24" style="color:${ROLE_COLORS[role]}" role="img" aria-label="${role}"><title>${role}</title>${ROLE_PATHS[role]}</svg>` : "";
window.ROLES = Object.keys(ROLE_PATHS);
window.ROLE_SHORT = r => r.replace(" Assassin", "");

// "New: ..." line: shows the newest update (or newest overlay update) from /data/updates.json
{
  const els = document.querySelectorAll("[data-latest]");
  if (els.length) fetch("/data/updates.json").then(r => r.json()).then(all => {
    all.sort((a, b) => b.date.localeCompare(a.date));
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    for (const el of els) {
      const f = el.dataset.latest;
      const u = all.find(u => f === "all" || u.area === f || u.area === "both");
      if (!u) continue;
      const day = new Date(u.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
      el.innerHTML = `<b>New</b><span>${esc(u.title)} <i>· ${day}</i></span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      el.hidden = false;
    }
  }).catch(() => {});
}
