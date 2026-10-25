// Hero changes from Blizzard's patch notes, drawn the same way on the Patch notes page and on each hero's
// Builds page. The server boils each hero's part of the notes down to short lines (src/patch-notes.js):
//   [{ g: "Talents", lvl: "13", name: "Bloodcraze", key: "", isNew: false, lines: [{ t, a, b, d }] }]
// Here each one gets the talent or ability icon from /data/heroes/<id>.json, and a green ▲ (buff), red ▼ (nerf)
// or grey dot (can't tell) per line.
(() => {
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const norm = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const cache = {};
  const hero = id => cache[id] ||= fetch(`/data/heroes/${id}.json`).then(r => r.ok ? r.json() : null).catch(() => null);

  // The talent or ability an entry is about: by name (Blizzard sometimes misspells, so the first 6 letters do too)
  function lookup(hd, e) {
    if (!hd || !e.name) return null;
    const n = norm(e.name), all = [...Object.entries(hd.talents || {}).flatMap(([L, ts]) => ts.map(t => ({ ...t, lvl: L }))), ...(hd.abilities || [])];
    return all.find(t => norm(t.name) === n) || (n.length > 6 && all.find(t => norm(t.name).slice(0, 6) === n.slice(0, 6) && Math.abs(norm(t.name).length - n.length) < 3))
      || (e.key && (hd.abilities || []).find(a => a.key === e.key)) || null;
  }

  const ARROW = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M5 1.5 9 8H1z" fill="currentColor"/></svg>';
  const mark = d => d > 0 ? `<i class="pc-m up" title="Buff">${ARROW}</i>` : d < 0 ? `<i class="pc-m down" title="Nerf">${ARROW}</i>` : `<i class="pc-m same" title="Change"></i>`;
  const line = l => `<li>${mark(l.d)}<span>${l.a != null ? `${esc(l.t)} <s>${esc(l.a)}</s><span class="pc-to">→</span><b class="${l.d > 0 ? "up" : l.d < 0 ? "down" : ""}">${esc(l.b)}</b>` : esc(l.t)}</span></li>`;

  function entries(hd, list, opts = {}) {
    return list.map(e => {
      const t = lookup(hd, e);
      const ic = t?.icon ? `<img src="/img/talents/${t.icon}.webp" alt="" loading="lazy">` : e.g === "Base" && !e.name ? `<img src="/img/heroes/${opts.hero}.webp" alt="" loading="lazy">` : `<span class="pc-blank"></span>`;
      const lvl = e.lvl || (t?.lvl && e.g !== "Base" ? t.lvl : "");
      const key = e.key || (t && !t.lvl ? t.key : "");
      const tags = (lvl ? `<span class="pc-tag">Lvl ${esc(lvl)}</span>` : key ? `<span class="pc-tag">${esc(key === "D" ? "Trait" : key)}</span>` : "") + (e.isNew ? `<span class="pc-tag new">New</span>` : "")
        + (opts.picked?.has(norm(e.name)) ? `<span class="pc-tag pc-mine" title="One of my builds takes this talent">In my build</span>` : "");
      return `<div class="pc-e"><span class="pc-ic">${ic}</span><div class="pc-b"><div class="pc-n">${esc(e.name || (e.g === "Base" ? "Base stats" : e.g || "Changes"))}${tags}</div><ul class="pc-l">${e.lines.map(line).join("")}</ul></div></div>`;
    }).join("");
  }

  const WORD = { buff: "Buff", nerf: "Nerf", mixed: "Mixed", changed: "Changed" };
  const verdict = v => `<span class="pc-v ${esc(v)}">${v === "buff" || v === "nerf" ? ARROW : v === "mixed" ? '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M5 1 9 5 5 9 1 5z" fill="currentColor"/></svg>' : ""}${WORD[v] || "Changed"}</span>`;
  const take = text => text ? `<p class="pc-take"><b>Jun:</b> ${esc(text)}</p>` : "";

  window.PatchKit = { hero, lookup, entries, verdict, take, norm, esc };
})();
