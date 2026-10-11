// junhots.com server: serves the site from public/, plus a tiny API so Jun can
// edit "Jun's builds" from the website.
//   GET  /api/builds  -> everyone: the saved builds
//   PUT  /api/builds  -> Jun only (password): replace the saved builds
//   POST /api/login   -> Jun only: check the password
// Needs in Cloudflare: KV binding BUILDS (see wrangler.jsonc) and the secret ADMIN_PASSWORD.

const KEY = "builds";
const MAX_BYTES = 300_000;

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
      note: String(b.note || "").slice(0, 300),
    }));
    if (builds.length) out[hero] = builds;
  }
  return out;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

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

    if (url.pathname === "/api/login" && request.method === "POST") {
      const ok = await passwordOk(request, env);
      if (!ok) await new Promise(r => setTimeout(r, 800));   // slow down guessing
      return json({ ok }, ok ? 200 : 401);
    }

    return env.ASSETS.fetch(request);
  },
};
