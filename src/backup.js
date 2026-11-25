// Backups of the site's own data, so one bad save can't lose builds, the tier list or my games for good.
// Every save to KV overwrites the last one, so the daily cron (worker.js scheduled) copies everything into
// KV key backup:<YYYY-MM-DD> and keeps the newest KEEP. Jun's /backups/ page lists them, downloads one as a
// file and restores parts of one (the current data is backed up first, so a restore can be undone).
//   GET  /api/backup            -> Jun only: the backups, newest first, with what's in each
//   GET  /api/backup?id=<id>    -> Jun only: one backup as a .json download (id "now" = the data as it is now)
//   POST /api/backup {action: "backup"}                 -> Jun only: make one now
//   POST /api/backup {action: "restore", id, parts: []} -> Jun only: put those parts of a backup back
// Not backed up: the Twitch login (secret, and Connect Twitch gets a new one), the visitor stats (their own
// database), and the caches (patch notes, VOD list), which rebuild themselves.

const PARTS = {
  builds: "builds",
  tierlist: "tierlist",
  games: "games",
  community: "community",
  patchtakes: "patchtakes",
  schedule_off: "schedule_off",
  schedule_tz: "schedule_tz",
};
const PREFIX = "backup:";
const KEEP = 20; // about 2 weeks of daily backups plus a few made by hand or before a restore

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });

async function feedbackItems(env) {
  const keys = [];
  let cursor;
  do {
    const page = await env.BUILDS.list({ prefix: "fb:", cursor });
    keys.push(...page.keys);
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return (await Promise.all(keys.map((k) => env.BUILDS.get(k.name, "json")))).filter(Boolean);
}

// What's in a backup, in a few numbers (shown on the /backups/ page; fits KV's 1 KB metadata)
function summary(snap) {
  const read = (name) => {
    try {
      return JSON.parse(snap.parts[name] || "null");
    } catch {
      return null;
    }
  };
  const builds = read("builds") || {},
    tl = read("tierlist"),
    games = read("games");
  return {
    at: snap.at,
    heroes: Object.keys(builds).length,
    builds: Object.values(builds).reduce((a, list) => a + (Array.isArray(list) ? list.length : 0), 0),
    ranked: tl?.overall ? Object.values(tl.overall).filter(Boolean).length : 0,
    games: Array.isArray(games) ? games.length : 0,
    feedback: snap.feedback.length,
    size: JSON.stringify(snap).length,
  };
}

export async function snapshot(env) {
  const parts = {};
  for (const [name, key] of Object.entries(PARTS)) {
    const value = await env.BUILDS.get(key);
    if (value != null) parts[name] = value;
  }
  return { v: 1, at: Date.now(), parts, feedback: await feedbackItems(env) };
}

async function list(env) {
  const keys = [];
  let cursor;
  do {
    const page = await env.BUILDS.list({ prefix: PREFIX, cursor });
    keys.push(...page.keys);
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return keys.map((k) => ({ id: k.name.slice(PREFIX.length), ...(k.metadata || {}) })).sort((a, b) => b.at - a.at);
}

// Saves a backup under backup:<id> and drops the oldest past KEEP. A daily one replaces an earlier one of the same day.
export async function makeBackup(env, label = "") {
  const snap = await snapshot(env);
  const day = new Date(snap.at).toISOString().slice(0, 10);
  const id = label ? `${day}-${new Date(snap.at).toISOString().slice(11, 16).replace(":", "")}-${label}` : day;
  const info = summary(snap);
  await env.BUILDS.put(PREFIX + id, JSON.stringify(snap), { metadata: { ...info, label } });
  const all = await list(env);
  await Promise.all(all.slice(KEEP).map((b) => env.BUILDS.delete(PREFIX + b.id)));
  return { id, ...info, label };
}

export async function backup(request, env, passwordOk) {
  if (!env.BUILDS) return json({ error: "storage not set up" }, 503);
  if (!(await passwordOk(request, env))) return json({ error: "wrong password" }, 401);
  const url = new URL(request.url);

  if (request.method === "GET") {
    const id = url.searchParams.get("id");
    if (!id) return json({ backups: await list(env), keep: KEEP });
    const snap = id === "now" ? await snapshot(env) : await env.BUILDS.get(PREFIX + id, "json");
    if (!snap) return json({ error: "no such backup" }, 404);
    const name = `junhots-backup-${id === "now" ? new Date(snap.at).toISOString().slice(0, 16).replace(":", "") : id}.json`;
    return json(snap, 200, { "content-disposition": `attachment; filename="${name}"` });
  }

  if (request.method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "bad request" }, 400);
    }
    if (body.action === "backup") return json({ made: await makeBackup(env, "by-hand") });
    if (body.action === "restore") {
      const snap = await env.BUILDS.get(PREFIX + String(body.id || ""), "json");
      if (!snap) return json({ error: "no such backup" }, 404);
      const parts = (Array.isArray(body.parts) ? body.parts : []).filter((p) => p in PARTS || p === "feedback");
      if (!parts.length) return json({ error: "pick what to restore" }, 400);
      // The data as it is now, so this restore can be undone from the list
      const before = await makeBackup(env, "before-restore");
      for (const p of parts) {
        if (p === "feedback") {
          for (const item of snap.feedback || [])
            if (item?.id) await env.BUILDS.put("fb:" + item.id, JSON.stringify(item), { metadata: { done: !!item.done } });
        } else if (snap.parts?.[p] != null) await env.BUILDS.put(PARTS[p], snap.parts[p]);
        else await env.BUILDS.delete(PARTS[p]);
      }
      return json({ restored: parts, before: before.id });
    }
    return json({ error: "unknown action" }, 400);
  }
  return json({ error: "method not allowed" }, 405);
}
