// Visitor counts for Jun's /stats/ page: how many people visit, how many come back, and which pages send them to Twitch.
// No cookies and nothing personal: each page only sends "a page view on Builds", "a click to Twitch from the Tier list"
// and once a day "a visitor, new or returning" (the browser remembers its first visit day itself, nav.js).
// Counts live in one Durable Object with a small SQLite table (STATS binding in wrangler.jsonc, made on deploy, no setup):
//   one row per day + kind + page + target + new/returning, with a count.
//   POST /api/hit   -> everyone: {k, p, t, r} from nav.js (sendBeacon), at most HIT_LIMIT per visitor per minute
//   GET  /api/stats -> Jun only (password): the rows of the last ?days=30 days
import { DurableObject } from "cloudflare:workers";

// What a hit may say. Anything else is dropped, so the table stays small and clean.
const KINDS = ["visit", "view", "click", "copy"];
const PAGES = [
  "home",
  "tierlist",
  "builds",
  "hero",
  "draft",
  "patch-notes",
  "schedule",
  "games",
  "overlay",
  "maker",
  "make-build",
  "updates",
  "other",
];
const TARGETS = ["", "twitch", "twitch-live", "discord", "youtube", "x", "build"];
const KEEP_DAYS = 400;

export class Stats extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS hits (day TEXT, kind TEXT, page TEXT, target TEXT, ret INTEGER, n INTEGER,
      PRIMARY KEY (day, kind, page, target, ret))`);
  }
  add(day, kind, page, target, ret) {
    this.sql.exec(
      `INSERT INTO hits VALUES (?, ?, ?, ?, ?, 1) ON CONFLICT DO UPDATE SET n = n + 1`,
      day,
      kind,
      page,
      target,
      ret,
    );
    // Now and then, forget days older than about a year
    if (Math.random() < 0.002) this.sql.exec(`DELETE FROM hits WHERE day < ?`, dayOf(Date.now() - KEEP_DAYS * 864e5));
  }
  read(since) {
    return this.sql
      .exec(`SELECT day, kind, page, target, ret, n FROM hits WHERE day >= ? ORDER BY day`, since)
      .toArray();
  }
}

const dayOf = (t) => new Date(t).toISOString().slice(0, 10);
const stub = (env) => env.STATS.get(env.STATS.idFromName("all"));

export async function stats(request, env, passwordOk) {
  const url = new URL(request.url);
  const done = (status = 204) => new Response(null, { status, headers: { "cache-control": "no-store" } });
  if (!env.STATS)
    return url.pathname === "/api/hit" ? done() : Response.json({ error: "stats not set up" }, { status: 503 });

  if (url.pathname === "/api/hit" && request.method === "POST") {
    // Ignore other sites and obvious bots; keep each visitor to a sane number of hits
    const from = request.headers.get("origin") || request.headers.get("referer") || "";
    let host = url.host;
    try {
      if (from) host = new URL(from).host;
    } catch {
      host = "";
    }
    if (host !== url.host) return done();
    if (/bot|crawl|spider|headless|preview/i.test(request.headers.get("user-agent") || "")) return done();
    if (env.HIT_LIMIT) {
      const { success } = await env.HIT_LIMIT.limit({ key: request.headers.get("cf-connecting-ip") || "x" });
      if (!success) return done(429);
    }
    let b;
    try {
      b = JSON.parse(await request.text());
    } catch {
      return done(400);
    }
    const kind = String(b?.k || ""),
      page = String(b?.p || ""),
      target = String(b?.t || ""),
      ret = b?.r ? 1 : 0;
    if (!KINDS.includes(kind) || !PAGES.includes(page) || !TARGETS.includes(target)) return done(400);
    await stub(env).add(dayOf(Date.now()), kind, page, target, ret);
    return done();
  }

  if (url.pathname === "/api/stats" && request.method === "GET") {
    if (!(await passwordOk(request, env))) return Response.json({ error: "wrong password" }, { status: 401 });
    const days = Math.max(1, Math.min(KEEP_DAYS, Math.floor(Number(url.searchParams.get("days")) || 30)));
    const rows = await stub(env).read(dayOf(Date.now() - (days - 1) * 864e5));
    return Response.json({ days, today: dayOf(Date.now()), rows }, { headers: { "cache-control": "no-store" } });
  }
  return done(405);
}
