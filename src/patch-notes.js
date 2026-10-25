// Patch notes page: Blizzard's official Heroes of the Storm news, read from the same feed news.blizzard.com uses.
// For each patch notes article the server also reads the article once to find its sections, hotfixes and
// which heroes changed (so the page can link them to their builds). Only those facts are kept; the notes
// themselves stay on Blizzard's site and every entry links there.
//   GET /api/patch-notes -> { updated, items: [{ id, title, kind, date, url, summary, sections, heroes, newHero, hotfixes,
//                             changes: { hero: [...] }, verdicts: { hero: "buff" | "nerf" | "mixed" | "changed" } }] }
//   GET /api/patch-notes?hero=garrosh -> only the patches that changed Garrosh, with only his changes (Builds page)
//   GET/PUT /api/patch-takes -> Jun's one-line take on a hero in a patch
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

// What a patch notes article is about, from its headings. Hero names in the balance part count as changed
// heroes (the bug fixes part is left out: those are small fixes, not changes to the hero), and each of those
// heroes' sections is boiled down to short change lines (see heroChanges).
export function outline(html, heroes) {
  const hero = heroIndex(heroes);
  const at = html.indexOf('<section class="blog"');
  if (at >= 0) html = html.slice(at);
  const heads = [...html.matchAll(/<h([1-5])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map(m => ({ text: plain(m[2]), start: m.index, end: m.index + m[0].length })).filter(h => h.text);
  const sections = new Set(), changed = [], hotfixes = [], changes = {}, verdicts = {};
  let newHero = null, part = "";
  heads.forEach((head, n) => {
    const h = head.text;
    const fix = h.match(/^hotfix(?:es)?\s*[-–—:]\s*(.+)$/i);
    if (fix) { hotfixes.push(fix[1].trim()); return; }
    const nh = h.match(/^new hero\s*[-–—:]\s*(.+)$/i);
    if (nh) { sections.add("New hero"); newHero = hero(nh[1]) || newHero; part = "new"; return; }
    if (/^bug fix/i.test(h)) { sections.add("Bug fixes"); part = "bugs"; return; }
    if (/^balance|^hero (updates|changes|reworks?)/i.test(h)) { sections.add("Balance"); part = "balance"; return; }
    if (/^map/i.test(h) && part !== "bugs") { sections.add("Maps"); part = "maps"; return; }
    if (/^(general|collection|design notes?|ranked|storm league|quality of life)\b/i.test(h) && part !== "bugs") {
      sections.add(h.replace(/\s*:$/, "").replace(/\b\w/, c => c.toUpperCase()));
      part = "other";
      return;
    }
    const id = hero(h.replace(/\s*\(.*\)$/, ""));
    // A hero heading outside the bug fixes, after the balance part started (or a rework heading of its own)
    if (id && part !== "bugs" && (part === "balance" || part === "new" || part === "")) {
      if (part === "") sections.add("Balance");
      if (!changed.includes(id) && id !== newHero) {
        changed.push(id);
        const list = heroChanges(html.slice(head.end, heads[n + 1]?.start ?? html.length));
        if (list.length) { changes[id] = list; verdicts[id] = verdict(list); }
      }
    }
  });
  const order = ["New hero", "Collection", "General", "Maps", "Balance", "Bug fixes"];
  return {
    v: PARSER,
    sections: [...sections].sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99)),
    heroes: changed,
    newHero,
    hotfixes,
    changes,
    verdicts,
  };
}
export const PARSER = 2;   // bump to read every article again after changing how they're read

// Blizzard writes each hero as: a group label (Base / Talents / Abilities), then lists: "Level 4" > talent or
// ability name (with [Q] etc.) > one item per change. Old values crossed out (<s>) are dropped.
// Result: [{ g: "Talents", lvl: "4", name: "In For The Kill", key: "", isNew: false, lines: [{ t, a, b, d }] }]
// where a line is either "t: a → b" (d = +1 buff, -1 nerf, 0 can't tell) or plain short text in t.
export function heroChanges(part) {
  part = part.replace(/<s\b[^>]*>[\s\S]*?<\/s>/gi, "");
  const out = [];
  let group = "", lvl = "", entry = null, buf = "", inP = false, depth = 0;
  const flush = kids => {
    const text = plain(buf); buf = "";
    if (!text) return;
    const level = text.match(/^level\s+(\d+)$/i);
    if (level) { lvl = level[1]; entry = null; return; }
    if (kids) {   // has its own list under it: a talent or ability name
      const key = (text.match(/\[([QWERD1-5]|Trait|Heroic)\]/i) || [])[1] || "";
      entry = { g: group, lvl: depth > 1 ? lvl : "", name: text.replace(/\s*\[[^\]]*\]\s*/g, " ").replace(/^\(new\)\s*/i, "").trim(), key: key.toUpperCase(), isNew: /^\(new\)/i.test(text), lines: [] };
      out.push(entry);
      return;
    }
    if (!entry) { entry = { g: group, lvl: "", name: "", key: "", isNew: false, lines: [] }; out.push(entry); }
    entry.lines.push(...changeLines(text));
  };
  for (const m of part.matchAll(/<(\/?)(ul|li|p)\b[^>]*>|<br\s*\/?>|([^<]+)|<[^>]*>/gi)) {
    const [tag, close, name, text] = m;
    if (text) { buf += text; continue; }
    if (/^<br/i.test(tag)) { buf += " "; continue; }
    if (!name) continue;
    const n = name.toLowerCase();
    if (n === "p") {
      if (close) {
        const label = plain(buf); buf = "";
        if (/^(base|talents?|abilities|stats|heroic abilities|trait)$/i.test(label)) { group = label.replace(/^\w/, c => c.toUpperCase()); lvl = ""; entry = null; }
        inP = false;
      } else { buf = ""; inP = true; }
      continue;
    }
    if (inP) continue;
    if (n === "ul") { if (!close) { flush(true); depth++; } else depth--; continue; }
    if (n === "li") { if (close) flush(false); else buf = ""; }
  }
  return out.filter(e => e.lines.length || e.isNew).slice(0, 40);
}

// Up is good, except for these (a longer cooldown or a higher cost is a nerf).
const WORSE_UP = /cooldown|cost|cast time|channel(ing)? time|delay|arming|recharge|required|requirement|penalty|charge time|wind-?up|self[- ]damage|damage taken|health decay|duration between/i;
// Size of the first number ("-35" armor reduction to "-25" is a smaller reduction)
const num = s => { const m = String(s).replace(/,/g, "").match(/\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; };

// "Damage bonus reduced from 125% to 75%. Total healing remains the same." -> two lines
export function changeLines(text) {
  return text.split(/(?<=[a-z0-9%)])\.\s+(?=[A-Z(])/).map(s => s.trim().replace(/\.$/, "")).filter(Boolean).slice(0, 4).map(s => {
    const m = s.match(/^(.*?)\s*(?:(?:was\s+)?(?:increased|reduced|decreased|lowered|raised|lessened|changed|adjusted|extended|shortened|improved|moved)\s+)?from\s+(.+?)\s+to\s+(.+)$/i);
    if (m && m[2].length < 40 && m[3].length < 40) {
      let [, t, a, b] = m;
      t = t.replace(/\s+(increased|reduced|decreased|lowered|raised|lessened|changed|adjusted|extended|shortened|improved)(\s+to)?:?$/i, "").trim();
      if (/^moved$/i.test(t) || !t) return { t: /^moved/i.test(s) ? "Moved" : "Changed", a, b, d: 0 };
      // "from 45 to 75 seconds": give the first number the same unit
      const unit = (b.match(/^[\d.,]+\s*([a-z%]+.*)$/i) || [])[1];
      if (unit && /^[\d.,]+$/.test(a)) a += /^%/.test(unit) ? unit : " " + unit;
      const x = num(a), y = num(b);
      let d = x == null || y == null || x === y ? 0 : y > x ? 1 : -1;
      if (WORSE_UP.test(t) && !/(cooldown|cost|decay|delay|time) reduction/i.test(t)) d = -d;
      return { t, a, b, d };
    }
    return { t: s.length > 200 ? s.slice(0, 197).replace(/\s+\S*$/, "") + "…" : s, d: 0 };
  });
}

// Whole hero: all ups = buff, all downs = nerf, both = mixed, nothing to compare = changed
export function verdict(list) {
  const ds = list.flatMap(e => e.lines.map(l => l.d));
  const up = ds.includes(1), down = ds.includes(-1);
  return up && down ? "mixed" : up ? "buff" : down ? "nerf" : "changed";
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
    if (before?.v === PARSER && !recheck) { Object.assign(item, pick(before)); return; }
    try {
      const html = await fetch(item.url, { headers: UA }).then(r => { if (!r.ok) throw new Error(r.status); return r.text(); });
      Object.assign(item, outline(html, heroes));
    } catch {
      if (before) Object.assign(item, pick(before));
    }
  }));
  return { updated: Date.now(), items };
}
const pick = i => ({ v: i.v, sections: i.sections, heroes: i.heroes, newHero: i.newHero, hotfixes: i.hotfixes, changes: i.changes || {}, verdicts: i.verdicts || {} });

// The full list (cached at Cloudflare for 10 minutes), or ?hero=garrosh for only the patches that changed that hero.
export async function patchNotes(request, env, ctx) {
  const url = new URL(request.url), hero = url.searchParams.get("hero") || "";
  if (hero && !/^[a-z0-9]{1,30}$/.test(hero)) return json({ error: "bad hero" }, 400);
  const cache = caches.default, key = new Request(new URL("/api/patch-notes" + (hero ? "?hero=" + hero : ""), request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;
  let data;
  try { data = await current(request, env, ctx); } catch (e) { return json({ error: "Blizzard's news could not be read: " + e.message }, 502); }
  if (hero) {
    const takes = await readTakes(env);
    data = {
      updated: data.updated,
      items: data.items.filter(i => i.heroes?.includes(hero) || i.newHero === hero).map(i => ({
        id: i.id, title: i.title, kind: i.kind, date: i.date, url: i.url, newHero: i.newHero === hero,
        verdict: i.verdicts?.[hero] || "changed", changes: i.changes?.[hero] || [], take: takes[i.id]?.[hero] || "",
      })),
    };
  }
  const res = new Response(JSON.stringify(data), { headers: { "content-type": "application/json", "cache-control": "public, max-age=600" } });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

async function current(request, env, ctx) {
  let saved = null;
  try { saved = JSON.parse((await env.BUILDS?.get(STORE)) || "null"); } catch {}
  if (saved && saved.v === PARSER && Date.now() - saved.updated < FRESH) return saved;
  try {
    const heroes = await env.ASSETS.fetch(new URL("/data/heroes.json", request.url)).then(r => r.json());
    const data = { ...(await refresh(env, saved, heroes)), v: PARSER };
    // Only write the whole list when something changed (KV allows a limited number of writes a day)
    const same = saved && JSON.stringify(saved.items) === JSON.stringify(data.items);
    if (env.BUILDS) ctx.waitUntil(env.BUILDS.put(STORE, JSON.stringify(same ? { ...saved, updated: data.updated, v: PARSER } : data)));
    return data;
  } catch (e) {
    if (!saved) throw e;
    return saved;   // keep showing the last good list
  }
}

// Jun's own one-line take on a hero in a patch: { "<patch id>": { "<hero>": "text" } }
const TAKES = "patchtakes";
const readTakes = env => env.BUILDS?.get(TAKES).then(t => JSON.parse(t || "{}")).catch(() => ({})) ?? {};
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

//   GET /api/patch-takes -> everyone: every take
//   PUT /api/patch-takes -> Jun only: { patch, hero, text } sets one take (empty text removes it)
export async function patchTakes(request, env, passwordOk) {
  if (!env.BUILDS) return json({ error: "storage not set up" }, 503);
  if (request.method === "GET") return json(await readTakes(env));
  if (request.method !== "PUT") return json({ error: "method not allowed" }, 405);
  if (!(await passwordOk(request, env))) return json({ error: "wrong password" }, 401);
  let body;
  try { body = JSON.parse(await request.text()); } catch { return json({ error: "bad data" }, 400); }
  const patch = String(body?.patch || ""), hero = String(body?.hero || ""), text = String(body?.text || "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (!/^\d{1,12}$/.test(patch) || !/^[a-z0-9]{1,30}$/.test(hero)) return json({ error: "bad patch or hero" }, 400);
  const takes = await readTakes(env);
  if (text) (takes[patch] ||= {})[hero] = text;
  else if (takes[patch]) { delete takes[patch][hero]; if (!Object.keys(takes[patch]).length) delete takes[patch]; }
  await env.BUILDS.put(TAKES, JSON.stringify(takes));
  // The hero's builds page shows the take too: drop its cached copy here so the change shows at once
  await caches.default.delete(new Request(new URL("/api/patch-notes?hero=" + hero, request.url).toString())).catch(() => {});
  return json(takes);
}
