// Community tier list: every visitor's tier list from the tier list maker, averaged per hero.
//   POST /api/community  -> everyone: { h: { heroId: score } }, score = where the hero sits in the visitor's tiers,
//                           from +2 (top tier) to -2 (bottom tier). One list per visitor (by a hash of the IP, never
//                           the IP itself): sending again replaces it, fewer than 10 heroes takes it out.
//   GET  /api/community  -> everyone: { lists, heroes: { id: { avg, n } } } for the tier list page's Community view.
// Abuse limits: COMMUNITY_LIMIT (wrangler.jsonc) = a few sends per minute per visitor, and at most MAX_NEW_PER_DAY
// new lists a day. All the lists' totals live in one KV key, so the page reads one value.

const AGG = "community";
const MIN_HEROES = 10;
const MAX_HEROES = 120;
const MAX_NEW_PER_DAY = 400;

function json(data, status = 200, cache = "no-store") {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": cache },
  });
}

async function visitor(request) {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("junhots-community:" + ip));
  return (
    "cm:" +
    [...new Uint8Array(hash)]
      .slice(0, 16)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

function cleanList(h) {
  const out = {};
  if (!h || typeof h !== "object") return out;
  for (const [id, v] of Object.entries(h).slice(0, MAX_HEROES)) {
    const n = Number(v);
    if (/^[a-z]{2,20}$/.test(id) && Number.isFinite(n)) out[id] = Math.round(Math.max(-2, Math.min(2, n)) * 100) / 100;
  }
  return out;
}

export async function community(request, env) {
  if (!env.BUILDS) return json({ error: "storage not set up" }, 503);
  const read = async () => {
    try {
      return JSON.parse((await env.BUILDS.get(AGG)) || "null") || { lists: 0, sum: {}, cnt: {} };
    } catch {
      return { lists: 0, sum: {}, cnt: {} };
    }
  };

  if (request.method === "GET") {
    const agg = await read();
    const heroes = {};
    for (const [id, n] of Object.entries(agg.cnt))
      if (n > 0) heroes[id] = { avg: Math.round((agg.sum[id] / n) * 100) / 100, n };
    return json({ lists: agg.lists, heroes }, 200, "public, max-age=60");
  }

  if (request.method === "POST") {
    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    if (env.COMMUNITY_LIMIT && !(await env.COMMUNITY_LIMIT.limit({ key: ip })).success)
      return json({ error: "slow down" }, 429);
    const text = await request.text();
    if (text.length > 20_000) return json({ error: "too big" }, 413);
    let list;
    try {
      list = cleanList(JSON.parse(text).h);
    } catch {
      return json({ error: "bad list" }, 400);
    }
    const keep = Object.keys(list).length >= MIN_HEROES;
    const key = await visitor(request);
    let old = null;
    try {
      old = JSON.parse((await env.BUILDS.get(key)) || "null");
    } catch {}
    if (!old && !keep) return json({ ok: true, counted: false });
    if (!old) {
      const day = "cmday:" + new Date().toISOString().slice(0, 10);
      const today = Number(await env.BUILDS.get(day)) || 0;
      if (today >= MAX_NEW_PER_DAY) return json({ error: "too many new lists today" }, 429);
      await env.BUILDS.put(day, String(today + 1), { expirationTtl: 2 * 86400 });
    }
    const agg = await read();
    const add = (l, sign) => {
      for (const [id, v] of Object.entries(l || {})) {
        agg.sum[id] = (agg.sum[id] || 0) + sign * v;
        agg.cnt[id] = (agg.cnt[id] || 0) + sign;
        if (agg.cnt[id] <= 0) {
          delete agg.cnt[id];
          delete agg.sum[id];
        }
      }
    };
    if (old) {
      add(old, -1);
      agg.lists = Math.max(0, agg.lists - 1);
    }
    if (keep) {
      add(list, 1);
      agg.lists++;
    }
    for (const id in agg.sum) agg.sum[id] = Math.round(agg.sum[id] * 100) / 100;
    await env.BUILDS.put(AGG, JSON.stringify(agg));
    if (keep) await env.BUILDS.put(key, JSON.stringify(list));
    else await env.BUILDS.delete(key);
    return json({ ok: true, counted: keep, lists: agg.lists });
  }
  return json({ error: "method not allowed" }, 405);
}
