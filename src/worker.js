// junhots.com server: serves the site from public/, plus a tiny API so Jun can
// edit "Jun's builds" from the website.
//   GET  /api/builds  -> everyone: the saved builds
//   PUT  /api/builds  -> Jun only (password): replace the saved builds
//   POST /api/login   -> Jun only: check the password
//   GET  /api/tierlist -> everyone: Jun's tier list as the overlay last sent it (404 until it has)
//   PUT  /api/tierlist -> Jun only (password): the overlay sends tierlist.json here when Jun saves
//   GET  /api/media    -> everyone: my latest YouTube videos and whether I'm live on Twitch (for the Home page)
// It also serves /builds/<hero> (share links) as the Builds page with that hero's link preview picture.
// Needs in Cloudflare: KV binding BUILDS (see wrangler.jsonc) and the secret ADMIN_PASSWORD.

const KEY = "builds";
const MAX_BYTES = 300_000;
const TIER_KEY = "tierlist";
const TIER_FIELDS = ["version", "tiers", "overall", "maps", "counters", "synergy", "winrates"];

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
        await env.BUILDS.put(TIER_KEY, JSON.stringify(data));
        return json({ ok: true, heroes: Object.keys(data.overall).length });
      }
      return json({ error: "method not allowed" }, 405);
    }

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
