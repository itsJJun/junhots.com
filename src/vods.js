// My Twitch VODs (past broadcasts), so Match history can link each game to the moment it starts in the VOD.
//   GET /api/vods -> everyone: { vods: [{ id, start, dur }] }, newest first; start = ms, dur = seconds.
// Twitch keeps past broadcasts 60 days and then deletes them, so only those show. The list is kept in KV ("vods"):
// the hourly cron refreshes it (and may refresh the Twitch login), and each game the overlay sends refreshes it too,
// but only with a login that's still fresh (readOnly), so only the cron and my schedule editor ever renew the login.
import { helix, TWITCH_ID } from "./schedule.js";

const KEY = "vods";
const KEEP = 60 * 864e5;

// "3h12m40s" -> seconds
const seconds = (d) =>
  [...String(d || "").matchAll(/(\d+)([hms])/g)].reduce((s, [, n, u]) => s + n * { h: 3600, m: 60, s: 1 }[u], 0);

export async function refreshVods(env, readOnly) {
  if (!env.BUILDS) return;
  const j = await helix(env, "GET", `videos?user_id=${TWITCH_ID}&type=archive&first=100`, null, readOnly);
  const vods = (j.data || [])
    .map((v) => ({ id: String(v.id), start: Date.parse(v.created_at), dur: seconds(v.duration) }))
    .filter((v) => /^\d+$/.test(v.id) && v.start && Date.now() - v.start < KEEP)
    .sort((a, b) => b.start - a.start);
  // Twitch sometimes answers with an empty list for a moment: never let that wipe the VODs we already know
  if (!vods.length) {
    let old = null;
    try {
      old = JSON.parse((await env.BUILDS.get(KEY)) || "null");
    } catch {}
    if (old?.vods?.some((v) => Date.now() - v.start < KEEP)) return;
  }
  await env.BUILDS.put(KEY, JSON.stringify({ vods, at: Date.now() }));
}

export async function vodList(env) {
  let d = null;
  try {
    d = JSON.parse((await env.BUILDS?.get(KEY)) || "null");
  } catch {}
  const vods = (d?.vods || []).filter((v) => Date.now() - v.start < KEEP);
  return new Response(JSON.stringify({ vods }), {
    headers: { "content-type": "application/json", "cache-control": "public, max-age=300" },
  });
}
