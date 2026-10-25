// junhots.com server: serves the site from public/, plus a tiny API so Jun can
// edit "Jun's builds" from the website.
//   GET  /api/builds  -> everyone: the saved builds
//   PUT  /api/builds  -> Jun only (password): replace the saved builds
//   POST /api/login   -> Jun only: check the password
//   GET  /api/tierlist -> everyone: Jun's tier list as the overlay last sent it (404 until it has)
//   PUT  /api/tierlist -> Jun only (password): the overlay sends tierlist.json here when Jun saves
//                         (the server adds "updated" and "changes": which heroes moved tier in the last 2 weeks)
//   GET  /api/games    -> everyone: my recent games (hero, map, win/loss), newest first
//                         (?limit=10 for only the newest, ?hero=jaina for one hero's games)
//   POST /api/games    -> Jun only (password): the overlay sends one game here when a match ends,
//                         or {games: [...]} (up to 200) from the GUI's "Import old replays" button
//   GET  /api/media    -> everyone: my latest YouTube videos and whether I'm live on Twitch (for the Home page)
//   GET  /api/patch-notes -> everyone: Blizzard's official patch notes list, with the heroes each one changed (src/patch-notes.js)
// It also serves /builds/<hero> (share links) as the Builds page with that hero's link preview picture,
// and /sitemap.xml (every page and hero, so Google finds them).
// Needs in Cloudflare: KV binding BUILDS (see wrangler.jsonc) and the secret ADMIN_PASSWORD.

import { patchNotes } from "./patch-notes.js";

const KEY = "builds";
const MAX_BYTES = 300_000;
const TIER_KEY = "tierlist";
const TIER_FIELDS = ["version", "tiers", "overall", "maps", "counters", "synergy", "winrates", "tags"];
const GAMES_KEY = "games";
const MAX_GAMES = 5000;
const MAX_BATCH = 200;
const SAME_GAME = 8 * 60e3;   // same hero within 8 minutes = the same game (sent live, then again by an import)
// Also the same game: same hero, map, result, length (±2s) and K/D/A within 3 hours, whatever time each copy says.
function sameGame(a, b) {
  if (a.id === b.id) return true;
  if (a.hero !== b.hero) return false;
  const gap = Math.abs(a.at - b.at);
  if (gap < SAME_GAME) return true;
  return gap < 3 * 3600e3 && a.result === b.result && a.map === b.map && a.len && b.len && Math.abs(a.len - b.len) <= 2
    && (!a.me || !b.me || (a.me.k === b.me.k && a.me.d === b.me.d && a.me.a === b.me.a));
}
// Which copy of one game to keep: the one with my score line (from the replay), then the earlier time
// (the first import dated games one game length too late).
const better = (a, b) => (!!a.me !== !!b.me ? (a.me ? a : b) : a.at <= b.at ? a : b);
// One copy of each game, newest first. The list is sorted, so only games close in time are compared.
function dedupeGames(list) {
  list.sort((a, b) => b.at - a.at);
  const out = [];
  for (const g of list) {
    let j = out.length - 1;
    while (j >= 0 && out[j].at - g.at < 3 * 3600e3 && !sameGame(out[j], g)) j--;
    if (j >= 0 && out[j].at - g.at < 3 * 3600e3) out[j] = better(out[j], g);
    else out.push(g);
  }
  return out.sort((a, b) => b.at - a.at);
}
const DAY = 864e5;
const SITE = "https://junhots.com";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

// Same-time compare so the password can't be guessed from response timing.
async function passwordOk(request, env) {
  const given = (request.headers.get("authorization") || "").replace(/^Bearer /, "");
  if (!env.ADMIN_PASSWORD || !given) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([given, env.ADMIN_PASSWORD].map(s => crypto.subtle.digest("SHA-256", enc.encode(s))));
  return crypto.subtle.timingSafeEqual(a, b);
}

// Keep only the fields the page uses, with sane sizes.
function clean(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("bad data");
  const out = {};
  for (const [hero, list] of Object.entries(data)) {
    if (!/^[a-z0-9]{1,30}$/.test(hero) || !Array.isArray(list)) throw new Error("bad hero " + hero);
    const builds = list.slice(0, 20).map(b => ({
      name: String(b.name || "").slice(0, 40),
      picks: Array.from({ length: 7 }, (_, i) => Math.max(0, Math.min(9, parseInt(b.picks?.[i], 10) || 0))),
      // Situational talents per level as a string of talent numbers ("23" = #2 and #3), never the main pick
      alt: Array.from({ length: 7 }, (_, i) => { const p = String(parseInt(b.picks?.[i], 10) || 0); return p === "0" ? "" : [...new Set(String(b.alt?.[i] ?? "").replace(/[^1-9]/g, ""))].filter(a => a !== p).sort().join(""); }),
      good: (Array.isArray(b.good) ? b.good : []).filter(g => /^[a-z0-9]{1,30}$/.test(g)).slice(0, 12),
      with: (Array.isArray(b.with) ? b.with : []).filter(g => /^[a-z0-9]{1,30}$/.test(g)).slice(0, 12),
      note: String(b.note || "").replace(/\r\n?/g, "\n").slice(0, 1500),
      ...(b.rec ? { rec: true } : {}),   // Jun's Recommended build(s): shown first with a badge
    }));
    if (builds.length) out[hero] = builds;
  }
  return out;
}

// /builds/jaina?b=1311132&n=Burn -> the Builds page, with titles and picture for Jaina so link previews show her.
async function heroPage(id, url, env) {
  const heroes = await env.ASSETS.fetch(new URL("/data/heroes.json", url)).then(r => r.json()).catch(() => []);
  const h = heroes.find(x => x[0] === id);
  if (!h) return null;
  const page = await env.ASSETS.fetch(new URL("/builds/", url));
  const name = (url.searchParams.get("n") || "").trim().slice(0, 40);
  const shared = /[1-9]/.test(url.searchParams.get("b") || "");
  const title = shared ? `${name ? name + " · " : ""}${h[1]} build · JunHotS` : `${h[1]} builds and talents · JunHotS`;
  const desc = shared ? `A ${h[1]} talent build made on junhots.com. Open it to see every pick and copy it into Heroes of the Storm.`
    : `${h[1]} talents, abilities and Jun's builds to copy into Heroes of the Storm.`;
  const set = (attr, value) => ({ element: el => el.setAttribute(attr, value) });
  return new HTMLRewriter()
    .on("title", { element: el => el.setInnerContent(title) })
    .on('meta[property="og:title"]', set("content", title))
    .on('meta[name="description"]', set("content", desc))
    .on('meta[property="og:description"]', set("content", desc))
    .on('meta[property="og:url"]', set("content", url.origin + url.pathname + url.search))
    .on('meta[property="og:image"]', set("content", `${url.origin}/img/og/${id}.jpg`))
    .on('link[rel="canonical"]', set("href", `${SITE}/builds/${id}`))
    .transform(page);
}

// The overlay's tierlist.json, keeping only the parts the site reads.
function cleanTierlist(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("bad data");
  if (!Array.isArray(data.tiers) || !data.tiers.length || !data.overall || typeof data.overall !== "object") throw new Error("not a tier list");
  const out = {};
  for (const k of TIER_FIELDS) if (k in data) out[k] = data[k];
  return out;
}

// Which heroes changed tier, so the Tier list page can show "Chen A → S" for a while.
// Kept for 2 weeks; a hero that moves back to where it started drops off. "updated" only moves when a tier really changed
// (the overlay uploads on every Save, even when nothing moved).
function withChanges(next, old, now = Date.now()) {
  if (!old) return { ...next, updated: now, changes: {} };
  const changes = {};
  for (const [h, c] of Object.entries(old.changes || {})) if (now - c.at < 14 * DAY) changes[h] = c;
  for (const h of new Set([...Object.keys(old.overall || {}), ...Object.keys(next.overall)])) {
    const before = old.overall?.[h] || "", after = next.overall[h] || "";
    if (before === after) continue;
    const from = h in changes ? changes[h].from : before;
    if (from === after) delete changes[h];
    else changes[h] = { from, to: after, at: now };
  }
  const moved = JSON.stringify([old.overall, old.maps, old.tiers]) !== JSON.stringify([next.overall, next.maps, next.tiers]);
  return { ...next, updated: moved || !old.updated ? now : old.updated, changes };
}

// One finished game from the overlay. Only what the site shows: hero, map, win or loss, when.
const HERO_ID = /^[a-z0-9]{1,30}$/;
const count = (v, max) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0; };
const heroIds = (v, max) => Array.isArray(v) ? [...new Set(v.map(String).filter(h => HERO_ID.test(h)))].slice(0, max) : [];

// One game from the overlay. Hero, map and result always; teams, bans, length, levels and my score line
// (k/d/a, hero damage, siege, healing, damage taken, xp, talent code, awards) when the replay had them.
function cleanGame(g) {
  if (!g || typeof g !== "object") throw new Error("bad game");
  const hero = String(g.hero || ""), result = String(g.result || "");
  if (!HERO_ID.test(hero)) throw new Error("bad hero");
  if (result !== "win" && result !== "loss") throw new Error("bad result");
  const at = Number(g.at) || Date.now();
  const game = {
    id: String(g.id || at).slice(0, 40),
    hero, result,
    map: String(g.map || "").slice(0, 40),
    at: Math.min(at, Date.now()),
  };
  for (const [k, max] of [["ally", 5], ["enemy", 5], ["aban", 3], ["eban", 3]]) {
    const list = heroIds(g[k], max);
    if (list.length) game[k] = list;
  }
  if (count(g.len, 7200)) game.len = count(g.len, 7200);
  if (Array.isArray(g.lvl) && g.lvl.length === 2 && g.lvl.every(l => count(l, 30))) game.lvl = g.lvl.map(l => count(l, 30));
  if (g.me && typeof g.me === "object") {
    const me = {};
    for (const k of ["k", "d", "a"]) me[k] = count(g.me[k], 999);
    for (const k of ["hd", "siege", "heal", "taken", "xp"]) me[k] = count(g.me[k], 10000000);
    if (/^[0-9]{1,7}$/.test(String(g.me.t || ""))) me.t = String(g.me.t);
    const aw = Array.isArray(g.me.aw) ? g.me.aw.map(String).filter(a => /^[A-Za-z0-9]{1,40}$/.test(a)).slice(0, 3) : [];
    if (aw.length) me.aw = aw;
    game.me = me;
  }
  return game;
}

// Every page and every hero's builds page, for search engines.
async function sitemap(url, env) {
  const heroes = await env.ASSETS.fetch(new URL("/data/heroes.json", url)).then(r => r.json()).catch(() => []);
  const paths = ["/", "/tierlist/", "/builds/", "/draft/", "/games/", "/patch-notes/", "/tierlist-maker/", "/overlay/", "/updates/", ...heroes.map(h => `/builds/${h[0]}`)];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map(p => `  <url><loc>${SITE}${p}</loc></url>`).join("\n")}\n</urlset>\n`;
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}

// Home page: latest YouTube uploads (from the channel's public RSS feed) and whether the Twitch channel is live.
// No API keys needed. Cached by Cloudflare so YouTube and Twitch get asked at most every few minutes.
const YT_HANDLE = "junhots";
const YT_CHANNEL = "UCwBBJyB6UqE44Fhok-NZ3fQ";   // @junhots (found again from the handle if the feed stops working)
const TWITCH = "junhots_";
const UA = { "user-agent": "Mozilla/5.0 (compatible; junhots.com)", "accept-language": "en-US,en;q=0.9" };

const xmlText = s => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

async function feed(id) {
  // "UULF" + channel = the uploads list without Shorts and live streams; fall back to every upload
  for (const q of ["playlist_id=UULF" + id.slice(2), "channel_id=" + id]) {
    const r = await fetch("https://www.youtube.com/feeds/videos.xml?" + q, { headers: UA, cf: { cacheTtl: 600 } }).catch(() => null);
    if (!r?.ok) continue;
    const xml = await r.text();
    const videos = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].slice(0, 4).map(([, e]) => ({
      id: (e.match(/<yt:videoId>([\w-]{11})<\/yt:videoId>/) || [])[1],
      title: xmlText((e.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || ""),
      date: (e.match(/<published>([^<]+)<\/published>/) || [])[1] || "",
      views: +((e.match(/<media:statistics views="(\d+)"/) || [])[1] || 0),
    })).filter(v => v.id);
    if (videos.length) return videos;
  }
  return null;
}

async function youtube() {
  let videos = await feed(YT_CHANNEL);
  if (!videos) {
    const page = await fetch("https://www.youtube.com/@" + YT_HANDLE, { headers: UA }).then(r => r.text()).catch(() => "");
    const id = (page.match(/"externalId":"(UC[\w-]{22})"/) || page.match(/channel\/(UC[\w-]{22})/) || [])[1];
    if (id && id !== YT_CHANNEL) videos = await feed(id);
  }
  return videos || [];
}

// Twitch's channel page says "isLiveBroadcast" in its search-engine data only while the stream is on.
async function twitch() {
  const page = await fetch("https://www.twitch.tv/" + TWITCH, { headers: UA }).then(r => r.ok ? r.text() : "").catch(() => "");
  const live = /"isLiveBroadcast":\s*true/.test(page);
  // The stream title sits in the same data; if Twitch changes it, the card just shows no title
  let title = "";
  if (live) try { title = JSON.parse('"' + ((page.match(/"description":"((?:[^"\\]|\\.)*)"/) || [])[1] || "") + '"').slice(0, 140); } catch {}
  return { channel: TWITCH, live, title };
}

async function media(request, ctx) {
  const cache = caches.default, key = new Request(new URL("/api/media", request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;
  const [videos, tw] = await Promise.all([youtube().catch(() => []), twitch().catch(() => ({ channel: TWITCH, live: false, title: "" }))]);
  const res = new Response(JSON.stringify({ youtube: { handle: YT_HANDLE, videos }, twitch: tw }), {
    headers: { "content-type": "application/json", "cache-control": "public, max-age=60" },
  });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/media" && request.method === "GET") return media(request, ctx);
    if (url.pathname === "/api/patch-notes" && request.method === "GET") return patchNotes(request, env, ctx);

    if (url.pathname === "/api/builds") {
      if (!env.BUILDS) return json({ error: "storage not set up" }, 503);
      if (request.method === "GET") return json(JSON.parse((await env.BUILDS.get(KEY)) || "{}"));
      if (request.method === "PUT") {
        if (!(await passwordOk(request, env))) return json({ error: "wrong password" }, 401);
        const text = await request.text();
        if (text.length > MAX_BYTES) return json({ error: "too big" }, 413);
        let data;
        try { data = clean(JSON.parse(text)); } catch (e) { return json({ error: e.message }, 400); }
        await env.BUILDS.put(KEY, JSON.stringify(data));
        return json(data);
      }
      return json({ error: "method not allowed" }, 405);
    }

    if (url.pathname === "/api/tierlist") {
      if (!env.BUILDS) return json({ error: "storage not set up" }, 503);
      if (request.method === "GET") {
        const saved = await env.BUILDS.get(TIER_KEY);
        return saved ? new Response(saved, { headers: { "content-type": "application/json", "cache-control": "no-store" } }) : json({ error: "not uploaded yet" }, 404);
      }
      if (request.method === "PUT") {
        if (!(await passwordOk(request, env))) return json({ error: "wrong password" }, 401);
        const text = await request.text();
        if (text.length > MAX_BYTES) return json({ error: "too big" }, 413);
        let data;
        try { data = cleanTierlist(JSON.parse(text)); } catch (e) { return json({ error: e.message }, 400); }
        let old = null;
        try { old = JSON.parse((await env.BUILDS.get(TIER_KEY)) || "null"); } catch {}
        data = withChanges(data, old);
        await env.BUILDS.put(TIER_KEY, JSON.stringify(data));
        return json({ ok: true, heroes: Object.keys(data.overall).length });
      }
      return json({ error: "method not allowed" }, 405);
    }

    if (url.pathname === "/api/games") {
      if (!env.BUILDS) return json({ error: "storage not set up" }, 503);
      const games = () => env.BUILDS.get(GAMES_KEY).then(t => JSON.parse(t || "[]")).catch(() => []);
      if (request.method === "GET") {
        const hero = url.searchParams.get("hero"), limit = Math.max(0, Number(url.searchParams.get("limit")) || 0);
        let list = await games();
        if (hero) list = list.filter(g => g.hero === hero);
        return json({ games: limit ? list.slice(0, limit) : list });
      }
      if (request.method === "POST") {
        if (!(await passwordOk(request, env))) return json({ error: "wrong password" }, 401);
        let incoming;
        try {
          const body = JSON.parse(await request.text());
          const raw = Array.isArray(body?.games) ? body.games : [body];
          if (raw.length > MAX_BATCH) throw new Error(`at most ${MAX_BATCH} games at once`);
          incoming = raw.map(cleanGame);
        } catch (e) { return json({ error: e.message }, 400); }
        const before = await games();
        // Sending the same game twice keeps one (sameGame); a resent copy with the same id replaces the old one.
        const ids = new Set(incoming.map(g => g.id));
        const list = dedupeGames([...before.filter(g => !ids.has(g.id)), ...incoming]);
        const added = Math.max(0, list.length - before.length);
        await env.BUILDS.put(GAMES_KEY, JSON.stringify(list.slice(0, MAX_GAMES)));
        return json({ ok: true, added, games: Math.min(list.length, MAX_GAMES) });
      }
      return json({ error: "method not allowed" }, 405);
    }

    if (url.pathname === "/sitemap.xml") return sitemap(url, env);

    if (url.pathname === "/api/login" && request.method === "POST") {
      const ok = await passwordOk(request, env);
      if (!ok) await new Promise(r => setTimeout(r, 800));   // slow down guessing
      return json({ ok }, ok ? 200 : 401);
    }

    const hero = url.pathname.match(/^\/builds\/([a-z0-9]{1,30})\/?$/);
    if (hero && request.method === "GET") {
      const page = await heroPage(hero[1], url, env);
      if (page) return page;
    }

    return env.ASSETS.fetch(request);
  },
};
