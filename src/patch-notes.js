// Patch notes page: Blizzard's official Heroes of the Storm news, read from the same feed news.blizzard.com uses.
// For each patch notes article the server also reads the article once to find its sections, hotfixes and
// which heroes changed (so the page can link them to their builds). Only those facts are kept; the notes
// themselves stay on Blizzard's site and every entry links there.
//   GET /api/patch-notes -> { updated, items: [{ id, title, kind, date, url, summary, sections, heroes, newHero, hotfixes }] }
// Blizzard gets asked at most every few hours. The last good answer is kept in KV, so the page still works
// if Blizzard is down or changes its feed (and public/data/patch-notes.json is the fallback before the first fetch).

const FEED = "https://news.blizzard.com/en-us/api/news/heroes-of-the-storm";
const STORE = "patchnotes";
const FRESH = 3 * 3600e3;       // ask Blizzard again after 3 hours
const RECHECK = 2;              // the newest articles get hotfixes added later, so read these again each time
const UA = { "user-agent": "Mozilla/5.0 (compatible; junhots.com)", "accept-language": "en-US,en;q=0.9" };

const plain = s => s.replace(/<[^>]+>/g, "").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#0?39;|&rsquo;|&#8217;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)).replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
const norm = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Names Blizzard writes that aren't the hero's name in heroes.json
const ALIAS = { butcher: "butcher", lostvikings: "lostvikings", vikings: "lostvikings", morales: "ltmorales", hammer: "sgthammer", etc: "etc" };

function heroIndex(heroes) {
  const byName = new Map();
  for (const [id, name] of heroes) { byName.set(norm(name), id); byName.set(id, id); }
  for (const [a, id] of Object.entries(ALIAS)) if (!byName.has(a) && heroes.some(h => h[0] === id)) byName.set(a, id);
  return name => byName.get(norm(name)) || null;
}

const kindOf = title => /\bptr\b/i.test(title) ? "ptr" : /balance/i.test(title) ? "balance" : /patch notes/i.test(title) ? "live" : "news";

// What a patch notes article is about, from its headings only. Hero names in the balance part count as changed
// heroes; the bug fixes part is left out (those are small fixes, not changes to the hero).
export function outline(html, heroes) {
  const hero = heroIndex(heroes);
  const heads = [...html.matchAll(/<h([1-5])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map(m => plain(m[2])).filter(Boolean);
  const sections = new Set(), changed = [], hotfixes = [];
  let newHero = null, part = "";
  for (const h of heads) {
    const fix = h.match(/^hotfix(?:es)?\s*[-–—:]\s*(.+)$/i);
    if (fix) { hotfixes.push(fix[1].trim()); continue; }
    const nh = h.match(/^new hero\s*[-–—:]\s*(.+)$/i);
    if (nh) { sections.add("New hero"); newHero = hero(nh[1]) || newHero; part = "new"; continue; }
    if (/^bug fix/i.test(h)) { sections.add("Bug fixes"); part = "bugs"; continue; }
    if (/^balance|^hero (updates|changes|reworks?)/i.test(h)) { sections.add("Balance"); part = "balance"; continue; }
    if (/^map/i.test(h) && part !== "bugs") { sections.add("Maps"); part = "maps"; continue; }
    if (/^(general|collection|design notes?|ranked|storm league|quality of life)\b/i.test(h) && part !== "bugs") {
      sections.add(h.replace(/\s*:$/, "").replace(/\b\w/, c => c.toUpperCase()));
      part = "other";
      continue;
    }
    const id = hero(h.replace(/\s*\(.*\)$/, ""));
    // A hero heading outside the bug fixes, after the balance part started (or a rework heading of its own)
    if (id && part !== "bugs" && (part === "balance" || part === "new" || part === "")) {
      if (part === "") sections.add("Balance");
      if (!changed.includes(id) && id !== newHero) changed.push(id);
    }
  }
  const order = ["New hero", "Collection", "General", "Maps", "Balance", "Bug fixes"];
  return {
    sections: [...sections].sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99)),
    heroes: changed,
    newHero,
    hotfixes,
  };
}

// The feed's articles, newest first, with only the fields the page shows
export function readFeed(data) {
  const items = data?.feed?.contentItems;
  if (!Array.isArray(items) || !items.length) throw new Error("feed changed");
  return items.map(c => c.properties || {}).filter(p => p.newsId && p.title && /^https:\/\/news\.blizzard\.com\//.test(p.newsUrl || "")).map(p => ({
    id: String(p.newsId),
    title: plain(p.title),
    kind: kindOf(p.title),
    date: p.lastUpdated || "",
    url: p.newsUrl,
    summary: plain(p.summary || "").slice(0, 300),
  })).sort((a, b) => b.date.localeCompare(a.date));
}

async function refresh(env, old, heroes) {
  const data = await fetch(FEED, { headers: { ...UA, accept: "application/json" } }).then(r => { if (!r.ok) throw new Error("feed " + r.status); return r.json(); });
  const items = readFeed(data);
  const known = new Map((old?.items || []).map(i => [i.id, i]));
  let patches = 0;
  await Promise.all(items.map(async item => {
    const before = known.get(item.id);
    if (item.kind === "news") return;
    const recheck = patches++ < RECHECK;
    if (before?.sections && !recheck) { Object.assign(item, pick(before)); return; }
    try {
      const html = await fetch(item.url, { headers: UA }).then(r => { if (!r.ok) throw new Error(r.status); return r.text(); });
      Object.assign(item, outline(html, heroes));
    } catch {
      if (before) Object.assign(item, pick(before));
    }
  }));
  return { updated: Date.now(), items };
}
const pick = i => ({ sections: i.sections, heroes: i.heroes, newHero: i.newHero, hotfixes: i.hotfixes });

export async function patchNotes(request, env, ctx) {
  const cache = caches.default, key = new Request(new URL("/api/patch-notes", request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;
  let saved = null;
  try { saved = JSON.parse((await env.BUILDS?.get(STORE)) || "null"); } catch {}
  let data = saved;
  if (!saved || Date.now() - saved.updated > FRESH) {
    try {
      const heroes = await env.ASSETS.fetch(new URL("/data/heroes.json", request.url)).then(r => r.json());
      data = await refresh(env, saved, heroes);
      // Only write when something changed (KV allows a limited number of writes a day)
      const same = saved && JSON.stringify(saved.items) === JSON.stringify(data.items);
      if (env.BUILDS) ctx.waitUntil(same ? env.BUILDS.put(STORE, JSON.stringify({ ...saved, updated: data.updated })) : env.BUILDS.put(STORE, JSON.stringify(data)));
    } catch (e) {
      if (!saved) return new Response(JSON.stringify({ error: "Blizzard's news could not be read: " + e.message }), { status: 502, headers: { "content-type": "application/json", "cache-control": "no-store" } });
      data = saved;   // keep showing the last good list
    }
  }
  const res = new Response(JSON.stringify(data), { headers: { "content-type": "application/json", "cache-control": "public, max-age=600" } });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}
