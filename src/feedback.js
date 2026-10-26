// Feedback from visitors (the Feedback button on every page, public/nav.js) and Jun's inbox (public/inbox/).
//   POST   /api/feedback          -> everyone: {type, text, name, page, hp, ms}
//   GET    /api/feedback          -> Jun only: every message, newest first (?count=1: only how many are new, cheap)
//   PATCH  /api/feedback          -> Jun only: {id, done} marks a message done / not done
//   DELETE /api/feedback?id=...   -> Jun only: removes a message
// Each message is its own KV key ("fb:<newest-first stamp>"), so two visitors sending at once never overwrite each other.
// Spam guard, invisible to people: a hidden field only bots fill in (hp), forms sent faster than a person can type (ms),
// a burst limit per visitor that costs no storage (FEEDBACK_LIMIT in wrangler.jsonc), Cloudflare Turnstile when its keys
// are set (TURNSTILE_SITEKEY + secret TURNSTILE_SECRET), at most RATE messages per visitor per hour, at most DAY_CAP
// messages a day in total (so a big attack can't use up the free storage quota the builds and tier list share),
// and messages stuffed with links are dropped.
//   GET /api/feedback?config -> everyone: the Turnstile site key ("" when Turnstile is off)

const TYPES = { bug: "Bug", idea: "Idea", info: "Wrong info", other: "Other" };
const COLORS = { bug: 0xef7d8b, idea: 0xf5c04a, info: 0xf58b70, other: 0xa89f99 };
const MAX_TEXT = 1500;
const MAX_KEPT = 500;
const RATE = 5;
const DAY_CAP = 100;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

async function visitorKey(request) {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("junhots-fb:" + ip));
  return "fbrate:" + [...new Uint8Array(hash).slice(0, 12)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function send(request, env, ctx) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "bad data" }, 400); }
  // Bots: pretend it worked so they don't try again
  if (body.hp || Number(body.ms) < 1200) return json({ ok: true });
  const text = String(body.text || "").trim().slice(0, MAX_TEXT);
  if (text.length < 3) return json({ error: "Write a little more first." }, 400);
  if ((text.match(/https?:\/\//g) || []).length > 6) return json({ ok: true });

  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  if (env.FEEDBACK_LIMIT && !(await env.FEEDBACK_LIMIT.limit({ key: ip })).success)
    return json({ error: "Slow down a little and try again in a minute." }, 429);
  if (env.TURNSTILE_SECRET) {
    const form = new FormData();
    form.append("secret", env.TURNSTILE_SECRET);
    form.append("response", String(body.token || ""));
    form.append("remoteip", ip);
    const check = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form })
      .then(r => r.json()).catch(() => ({ success: false }));
    if (!check.success) return json({ error: "Couldn't check you're human. Close the form, open it again and resend." }, 403);
  }

  const rk = await visitorKey(request);
  const sent = Number(await env.BUILDS.get(rk)) || 0;
  if (sent >= RATE) return json({ error: "Thanks, that's plenty for now. Try again in an hour." }, 429);
  const dk = "fbday:" + new Date().toISOString().slice(0, 10);
  const today = Number(await env.BUILDS.get(dk)) || 0;
  if (today >= DAY_CAP) return json({ error: "The inbox is full for today. Try again tomorrow, or message Jun on Discord." }, 429);
  await env.BUILDS.put(rk, String(sent + 1), { expirationTtl: 3600 });
  await env.BUILDS.put(dk, String(today + 1), { expirationTtl: 2 * 86400 });

  const now = Date.now();
  const item = {
    id: `${String(9e15 - now).padStart(16, "0")}-${crypto.randomUUID().slice(0, 6)}`,
    at: now,
    type: TYPES[body.type] ? body.type : "other",
    text,
    name: String(body.name || "").trim().slice(0, 60),
    page: /^\/(?!\/)[\w\-./?=&%#]*$/.test(body.page || "") ? String(body.page).slice(0, 200) : "",
    device: /Mobi|Android|iPhone/i.test(request.headers.get("user-agent") || "") ? "phone" : "computer",
    country: request.cf?.country || "",
    done: false,
  };
  await env.BUILDS.put("fb:" + item.id, JSON.stringify(item), { metadata: { done: false } });

  if (env.FEEDBACK_WEBHOOK) ctx.waitUntil(fetch(env.FEEDBACK_WEBHOOK, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: "junhots.com feedback",
      allowed_mentions: { parse: [] },
      embeds: [{
        title: TYPES[item.type] + (item.page ? " · " + item.page : ""),
        url: "https://junhots.com/inbox/",
        description: text.slice(0, 1000),
        color: COLORS[item.type],
        footer: { text: [item.name && "From " + item.name, item.device, item.country].filter(Boolean).join(" · ") },
        timestamp: new Date(now).toISOString(),
      }],
    }),
  }).catch(() => {}));
  return json({ ok: true });
}

async function keysOf(env) {
  const keys = [];
  let cursor;
  do {
    const page = await env.BUILDS.list({ prefix: "fb:", cursor });
    keys.push(...page.keys);
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor && keys.length < MAX_KEPT);
  return keys.slice(0, MAX_KEPT);
}

async function list(env) {
  const keys = await keysOf(env);
  const items = (await Promise.all(keys.map(k => env.BUILDS.get(k.name, "json")))).filter(Boolean);
  return json({ items });
}

export async function feedback(request, env, ctx, passwordOk) {
  if (!env.BUILDS) return json({ error: "storage not set up" }, 503);
  if (request.method === "POST") return send(request, env, ctx);
  if (request.method === "GET" && new URL(request.url).searchParams.has("config")) return json({ sitekey: env.TURNSTILE_SITEKEY || "" });
  if (!(await passwordOk(request, env))) return json({ error: "wrong password" }, 401);
  if (request.method === "GET") {
    if (!new URL(request.url).searchParams.has("count")) return list(env);
    // The key list can lag a minute behind a Done/Delete; reading the few "new" messages themselves is up to date
    const fresh = (await keysOf(env)).filter(k => !k.metadata?.done);
    const items = await Promise.all(fresh.map(k => env.BUILDS.get(k.name, "json")));
    return json({ new: items.filter(i => i && !i.done).length });
  }
  const id = request.method === "DELETE" ? new URL(request.url).searchParams.get("id") : null;
  if (request.method === "DELETE") {
    if (!/^[\w-]{1,40}$/.test(id || "")) return json({ error: "bad id" }, 400);
    await env.BUILDS.delete("fb:" + id);
    return json({ ok: true });
  }
  if (request.method === "PATCH") {
    let body;
    try { body = await request.json(); } catch { return json({ error: "bad data" }, 400); }
    if (!/^[\w-]{1,40}$/.test(body.id || "")) return json({ error: "bad id" }, 400);
    const item = await env.BUILDS.get("fb:" + body.id, "json");
    if (!item) return json({ error: "not found" }, 404);
    item.done = !!body.done;
    await env.BUILDS.put("fb:" + item.id, JSON.stringify(item), { metadata: { done: item.done } });
    return json({ ok: true });
  }
  return json({ error: "method not allowed" }, 405);
}
