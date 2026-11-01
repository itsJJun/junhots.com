// Stream schedule (the /schedule/ page and the "Next stream" line on Home).
//
// Where the streams come from: my Twitch schedule. Once I've connected Twitch on /schedule/ (Jun login, then
// "Connect Twitch"), the server reads it fresh from Twitch's API and can also change it: the weekly streams editor
// and the days off both write to Twitch. Before that, it reads Twitch's public calendar file (no keys needed).
// Days off are also kept here (KV), so they show on the site right away, even when Twitch isn't connected.
//
//   GET  /api/schedule          -> everyone: the next two weeks, every time in UTC (browsers show local time)
//   GET  /api/schedule/admin    -> Jun: Twitch connected?, weekly streams, days off
//   PUT  /api/schedule/off      -> Jun: {days: {"2026-11-01": "Business trip", ...}} days off (in the stream's time zone)
//   PUT  /api/schedule/weekly   -> Jun: {tz, rows: [{days: [0-6], time: "18:00", hours: 6, title}]} -> Twitch
//   POST /api/schedule/connect  -> Jun: start Twitch device login (I approve on twitch.tv/activate)
//   POST /api/schedule/poll     -> Jun: finish it once approved
//   POST /api/schedule/disconnect -> Jun: forget the Twitch login
// A daily cron (wrangler.jsonc) refreshes the Twitch login so it never runs out.

export const TWITCH_ID = "131819650";   // junhots_ (Twitch's number for the channel)
export const ICAL = `https://api.twitch.tv/helix/schedule/icalendar?broadcaster_id=${TWITCH_ID}`;
// "Hots Overlay by Junhots_" (my Twitch app, a public client: same one the overlay's "Log in with Twitch" uses)
const CLIENT_ID = "vp2cgz42aa82fo3lf9xyv7kzdm278w";
const SCOPE = "channel:manage:schedule";
const HOTS = "32959";   // Twitch category: Heroes of the Storm
const DAYS = 15, MAX = 40;
const WD = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const K = { off: "schedule_off", tz: "schedule_tz", auth: "twitch_auth", device: "twitch_device" };
const DEFAULT_TZ = "America/Chicago";

// ---------- time zones ----------
function offset(tz, t) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(new Date(t)).map(x => [x.type, x.value]));
  return Date.UTC(+p.year, p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(t / 1000) * 1000;
}
// A wall-clock time in a time zone -> UTC ms (checked twice so days the clocks change come out right)
export function toUtc(y, mo, d, h, mi, s, tz) {
  const guess = Date.UTC(y, mo, d, h, mi, s);
  if (!tz) return guess;
  let t = guess - offset(tz, guess);
  t = guess - offset(tz, t);
  return t;
}
// UTC ms -> {y, mo, d, h, mi, wd, day: "YYYY-MM-DD"} in a time zone
export function local(t, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short" })
    .formatToParts(new Date(t)).map(x => [x.type, x.value]));
  return { y: +p.year, mo: +p.month - 1, d: +p.day, h: +p.hour % 24, mi: +p.minute, wd: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday), day: `${p.year}-${p.month}-${p.day}` };
}
const validTz = tz => { try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; } };

// ---------- the public calendar file ----------
function when(line) {
  const head = line.slice(0, line.indexOf(":")), val = line.slice(line.indexOf(":") + 1);
  let tz = (head.match(/TZID=\/?([^;:]+)/) || [])[1] || "";
  if (tz && !validTz(tz)) tz = "";
  const m = val.trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);
  if (!m) return null;
  const v = { tz: m[7] ? "" : tz, y: +m[1], mo: +m[2] - 1, d: +m[3], h: +(m[4] || 0), mi: +(m[5] || 0), s: +(m[6] || 0) };
  v.utc = toUtc(v.y, v.mo, v.d, v.h, v.mi, v.s, v.tz);
  return v;
}
const unfold = text => text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
const icsText = s => (s || "").replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();

// Every stream in the calendar between from and to (ms), weekly repeats spread out into single days
export function streams(text, from, to) {
  const out = [];
  let ev = null, tz = "";
  for (const line of unfold(text)) {
    if (line === "BEGIN:VEVENT") { ev = { ex: [] }; continue; }
    if (line === "END:VEVENT") { if (ev) { expand(ev, from, to, out); tz ||= ev.start?.tz; } ev = null; continue; }
    if (!ev) continue;
    const key = line.split(/[;:]/)[0];
    const val = line.slice(line.indexOf(":") + 1);
    if (key === "DTSTART") ev.start = when(line);
    else if (key === "DTEND") ev.end = when(line);
    else if (key === "SUMMARY") ev.title = icsText(val);
    else if (key === "CATEGORIES") ev.cat = icsText(val);
    else if (key === "RRULE") ev.rule = Object.fromEntries(val.split(";").map(p => p.split("=")));
    else if (key === "EXDATE") for (const v of val.split(",")) { const w = when(line.slice(0, line.indexOf(":") + 1) + v); if (w) ev.ex.push(w.utc); }
    else if (key === "STATUS") ev.cancelled = /CANCELLED/i.test(val);
  }
  out.sort((a, b) => a.start - b.start);
  const list = out.slice(0, MAX);
  list.tz = tz;
  return list;
}

function expand(ev, from, to, out) {
  const s = ev.start;
  if (!s) return;
  const len = ev.end ? ev.end.utc - s.utc : 4 * 3600e3;
  const add = (start, off) => { if (start + len > from && start < to) out.push({ start, end: start + len, title: ev.title || "", cat: ev.cat || "", ...(off ? { off: true } : {}) }); };
  if (!ev.rule) return add(s.utc, ev.cancelled);
  const r = ev.rule, every = Math.max(1, +r.INTERVAL || 1), until = r.UNTIL ? when("X:" + r.UNTIL)?.utc : Infinity;
  if (r.FREQ !== "WEEKLY" && r.FREQ !== "DAILY") return add(s.utc, ev.cancelled);
  const days = r.FREQ === "DAILY" ? null : (r.BYDAY ? r.BYDAY.split(",").map(d => WD.indexOf(d.slice(-2))) : [new Date(Date.UTC(s.y, s.mo, s.d)).getUTCDay()]);
  const week0 = Math.floor((Date.UTC(s.y, s.mo, s.d) / 864e5 + 4) / 7);   // weeks counted from a Sunday
  let count = 0;
  for (let i = 0; i < 3660; i++) {
    const day = Date.UTC(s.y, s.mo, s.d + i), dt = new Date(day);
    const ok = r.FREQ === "DAILY" ? i % every === 0 : days.includes(dt.getUTCDay()) && (Math.floor((day / 864e5 + 4) / 7) - week0) % every === 0;
    if (!ok) continue;
    const start = toUtc(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), s.h, s.mi, s.s, s.tz);
    if (start > until || start >= to) break;
    if (r.COUNT && ++count > +r.COUNT) break;
    add(start, ev.cancelled || ev.ex.some(x => Math.abs(x - start) < 60e3));
  }
}

// ---------- Twitch login (device flow: no secret, no redirect page) ----------
const form = o => new URLSearchParams(o);
// readOnly: the public page only uses a login that's still fresh and never refreshes it itself. Refreshing happens
// only from my editor and the daily cron, so two places can't use up the same one-time refresh token at once.
async function token(env, readOnly) {
  const a = JSON.parse((await env.BUILDS.get(K.auth)) || "null");
  if (!a) return null;
  if (a.expires - Date.now() > 5 * 60e3) return a;
  return readOnly ? null : refresh(env, a);
}
// A failed refresh never deletes the login (storage can be a minute behind in other places, so the "old" token may
// already be replaced); the editor just says to connect again if it keeps failing.
async function refresh(env, a) {
  const r = await fetch("https://id.twitch.tv/oauth2/token", { method: "POST", body: form({ client_id: CLIENT_ID, grant_type: "refresh_token", refresh_token: a.refresh }) });
  if (!r.ok) return null;
  const t = await r.json();
  const next = { ...a, access: t.access_token, refresh: t.refresh_token || a.refresh, expires: Date.now() + (t.expires_in || 3600) * 1000, refreshed: Date.now() };
  await env.BUILDS.put(K.auth, JSON.stringify(next));
  return next;
}
// Daily: refresh so the login stays alive even when I don't edit for weeks
export async function keepTwitchAlive(env) {
  const a = env.BUILDS && JSON.parse((await env.BUILDS.get(K.auth)) || "null");
  if (a) await refresh(env, a);
}
async function helix(env, method, path, body, readOnly) {
  const a = await token(env, readOnly);
  if (!a) throw new Error("the Twitch login ran out. Press Disconnect Twitch, then Connect Twitch again");
  const r = await fetch("https://api.twitch.tv/helix/" + path, {
    method, headers: { "client-id": CLIENT_ID, authorization: "Bearer " + a.access, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 204) return {};
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || `Twitch said ${r.status}`);
  return j;
}
// All the coming segments (Twitch gives 25 at a time); a schedule that's empty is a 404
async function segments(env, readOnly) {
  const out = []; let after = "", vacation = null;
  for (let i = 0; i < 4; i++) {
    let j;
    try { j = await helix(env, "GET", `schedule?broadcaster_id=${TWITCH_ID}&first=25${after ? "&after=" + after : ""}`, null, readOnly); }
    catch (e) { if (/not found|404/i.test(e.message)) break; throw e; }
    out.push(...(j.data?.segments || []));
    vacation = j.data?.vacation || vacation;
    after = j.pagination?.cursor || "";
    if (!after || out.length && Date.parse(out[out.length - 1].start_time) > Date.now() + DAYS * 864e5) break;
  }
  return { segments: out, vacation };
}
// A recurring segment's id stands for the whole weekly series: {"segmentID":..., "isoYear":..., "isoWeek":...} in base64
const seriesOf = id => { try { return JSON.parse(atob(id)).segmentID || id; } catch { return id; } };

// ---------- days off ----------
async function offDays(env) { return JSON.parse((await env.BUILDS?.get(K.off)) || "{}"); }
async function streamTz(env) { return (await env.BUILDS?.get(K.tz)) || DEFAULT_TZ; }
// Runs of days in a row: [{from: "2026-11-01", to: "2026-11-02", note}]
function runs(days) {
  const keys = Object.keys(days).sort(), out = [];
  for (const k of keys) {
    const last = out[out.length - 1];
    if (last && Date.parse(k) - Date.parse(last.to) === 864e5) last.to = k;
    else out.push({ from: k, to: k, note: days[k] || "" });
  }
  return out;
}
const dayStart = (day, tz) => { const [y, m, d] = day.split("-").map(Number); return toUtc(y, m - 1, d, 0, 0, 0, tz); };

// ---------- the public list ----------
export async function schedule(request, env, ctx) {
  const cache = caches.default, key = new Request(new URL("/api/schedule", request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;
  const now = Date.now(), from = now - 864e5, to = now + DAYS * 864e5;
  let list = null, tz = await streamTz(env), source = "ical";
  // Connected to Twitch (and the login is fresh): read straight from the API, so an edit shows at once.
  // Otherwise Twitch's public calendar file.
  if (env.BUILDS && await env.BUILDS.get(K.auth)) try {
    const { segments: seg } = await segments(env, true);
    list = seg.map(s => ({ start: Date.parse(s.start_time), end: Date.parse(s.end_time || s.start_time) || Date.parse(s.start_time) + 4 * 3600e3, title: s.title || "", cat: s.category?.name || "", ...(s.canceled_until ? { off: true } : {}) }))
      .filter(s => s.end > from && s.start < to).sort((a, b) => a.start - b.start).slice(0, MAX);
    source = "twitch";
  } catch { list = null; }
  if (!list) try {
    const r = await fetch(ICAL, { headers: { "user-agent": "junhots.com" }, cf: { cacheTtl: 300 } });
    if (r.ok) { list = streams(await r.text(), from, to); if (list.tz) tz = list.tz; }
  } catch {}
  // My days off (kept here): every stream that starts on one of those days (in the stream's time zone) is off
  const days = await offDays(env).catch(() => ({}));
  for (const s of list || []) { const d = local(s.start, tz).day; if (d in days) { s.off = "day"; if (days[d]) s.note = days[d]; } }
  const away = runs(days).map(r => ({ from: dayStart(r.from, tz), to: dayStart(r.to, tz) + 864e5, note: r.note })).find(r => r.to > now && r.from < to) || null;
  const res = new Response(JSON.stringify({ ok: !!list, streams: list || [], tz, away, source, ical: ICAL, twitch: "junhots_" }), {
    headers: { "content-type": "application/json", "cache-control": "public, max-age=120" },
  });
  if (list) ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}
const forget = request => caches.default.delete(new Request(new URL("/api/schedule", request.url).toString()));

// ---------- Jun's editor ----------
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

// Twitch's weekly streams grouped into rows of the same time, length and title: "Every day 6:00 PM, 6 h"
function weekly(seg, tz) {
  const series = new Map();
  for (const s of seg) {
    if (!s.is_recurring) continue;
    const st = Date.parse(s.start_time), l = local(st, tz);
    // One weekly series shows up once per week: keep the first (by Twitch's series id, and by day + time + title
    // in case Twitch ever changes how its ids look)
    const hours = Math.round((Date.parse(s.end_time) - st) / 36e5 * 4) / 4;
    const id = seriesOf(s.id), alt = [l.wd, l.h, l.mi, hours, s.title].join("|");
    if (series.has(id) || series.has(alt)) continue;
    series.set(alt, null);
    series.set(id, { id: s.id, wd: l.wd, time: `${String(l.h).padStart(2, "0")}:${String(l.mi).padStart(2, "0")}`, hours, title: s.title || "" });
  }
  const rows = new Map();
  for (const s of series.values()) {
    if (!s) continue;
    const k = [s.time, s.hours, s.title].join("|");
    if (!rows.has(k)) rows.set(k, { time: s.time, hours: s.hours, title: s.title, days: [], ids: {} });
    const r = rows.get(k);
    r.days.push(s.wd); r.ids[s.wd] = s.id;
  }
  return [...rows.values()].map(r => ({ ...r, days: r.days.sort() })).sort((a, b) => a.time.localeCompare(b.time));
}

// The next time a weekday + clock time comes up, as Twitch wants it (RFC3339 UTC)
function nextStart(wd, time, tz) {
  const [h, mi] = time.split(":").map(Number), now = Date.now(), today = local(now, tz);
  for (let i = 0; i < 8; i++) {
    const t = toUtc(today.y, today.mo, today.d + i, h, mi, 0, tz);
    if (local(t, tz).wd === wd && t > now + 60e3) return new Date(t).toISOString().replace(/\.\d{3}Z$/, "Z");
  }
}

// What Twitch has vs what I want, day by day: change, add or delete single weekly segments
export function plan(current, wanted) {
  const ops = [];
  for (let wd = 0; wd < 7; wd++) {
    const have = current.flatMap(r => r.days.includes(wd) ? [{ id: r.ids[wd], time: r.time, hours: r.hours, title: r.title }] : []).sort((a, b) => a.time.localeCompare(b.time));
    const want = wanted.filter(r => r.days.includes(wd)).map(r => ({ time: r.time, hours: r.hours, title: r.title })).sort((a, b) => a.time.localeCompare(b.time));
    const n = Math.max(have.length, want.length);
    for (let i = 0; i < n; i++) {
      const h = have[i], w = want[i];
      // Twitch can't move the start time of a weekly segment, so a new time = delete it and add a new one
      if (h && w && h.time !== w.time) ops.push({ op: "delete", id: h.id, wd }, { op: "add", wd, ...w });
      else if (h && w) { if (h.hours !== w.hours || h.title !== w.title) ops.push({ op: "patch", id: h.id, wd, ...w }); }
      else if (w) ops.push({ op: "add", wd, ...w });
      else ops.push({ op: "delete", id: h.id, wd });
    }
  }
  return ops;
}

// Twitch keeps one vacation: my current or next run of days off (or none)
async function syncVacation(env, days, tz) {
  const now = Date.now(), run = runs(days).map(r => ({ from: dayStart(r.from, tz), to: dayStart(r.to, tz) + 864e5 })).find(r => r.to > now);
  const iso = t => new Date(t).toISOString().replace(/\.\d{3}Z$/, "Z");
  const q = run
    ? `is_vacation_enabled=true&vacation_start_time=${iso(Math.max(run.from, now + 60e3))}&vacation_end_time=${iso(run.to)}&timezone=${encodeURIComponent(tz)}`
    : "is_vacation_enabled=false";
  await helix(env, "PATCH", `schedule/settings?broadcaster_id=${TWITCH_ID}&${q}`);
}

export async function scheduleAdmin(request, env, ctx, passwordOk) {
  if (!env.BUILDS) return json({ error: "storage not set up" }, 503);
  if (!(await passwordOk(request, env))) return json({ error: "wrong password" }, 401);
  const path = new URL(request.url).pathname.replace("/api/schedule/", ""), m = request.method;
  const body = m === "GET" ? {} : await request.json().catch(() => ({}));
  const tz = await streamTz(env);

  if (path === "admin" && m === "GET") {
    const a = JSON.parse((await env.BUILDS.get(K.auth)) || "null");
    let rows = null, vacation = null, error = "";
    if (a) try { const s = await segments(env); rows = weekly(s.segments, tz); vacation = s.vacation; } catch (e) { error = e.message; }
    return json({ connected: !!a, login: a?.login || "", tz, rows, vacation, error, days: await offDays(env) });
  }

  if (path === "off" && m === "PUT") {
    const days = {};
    for (const [k, v] of Object.entries(body.days || {})) if (/^\d{4}-\d{2}-\d{2}$/.test(k)) days[k] = String(v || "").slice(0, 60);
    // Forget days off that are over
    const today = local(Date.now(), tz).day;
    for (const k of Object.keys(days)) if (k < today) delete days[k];
    await env.BUILDS.put(K.off, JSON.stringify(days));
    let twitch = "not connected";
    if (await env.BUILDS.get(K.auth)) try { await syncVacation(env, days, tz); twitch = "ok"; } catch (e) { twitch = e.message; }
    await forget(request);
    return json({ ok: true, days, twitch });
  }

  if (path === "weekly" && m === "PUT") {
    const ntz = body.tz && validTz(body.tz) ? body.tz : tz;
    const wanted = (body.rows || []).slice(0, 14).map(r => ({
      days: [...new Set((r.days || []).map(Number).filter(d => d >= 0 && d < 7))],
      time: /^\d{2}:\d{2}$/.test(r.time) ? r.time : "18:00",
      hours: Math.min(23, Math.max(0.5, Math.round((+r.hours || 4) * 4) / 4)),   // Twitch: 30 min to 23 h
      title: String(r.title || "").trim().slice(0, 140),
    })).filter(r => r.days.length);
    // Never wipe the whole schedule by accident (say the editor loaded without Twitch's list): that needs clearAll
    if (!wanted.length && !body.clearAll) return json({ error: "no streams left; remove them on purpose with clearAll" }, 400);
    try {
      const { segments: seg } = await segments(env);
      const ops = plan(ntz === tz ? weekly(seg, tz) : [], wanted);
      // A new time zone: start over (Twitch keeps one time zone per segment)
      if (ntz !== tz) for (const r of weekly(seg, tz)) for (const wd of r.days) ops.unshift({ op: "delete", id: r.ids[wd], wd });
      for (const o of ops) {
        if (o.op === "delete") await helix(env, "DELETE", `schedule/segment?broadcaster_id=${TWITCH_ID}&id=${encodeURIComponent(o.id)}`);
        else {
          const seg = { duration: String(Math.round(o.hours * 60)), title: o.title, category_id: HOTS };
          if (o.op === "add") await helix(env, "POST", `schedule/segment?broadcaster_id=${TWITCH_ID}`, { ...seg, start_time: nextStart(o.wd, o.time, ntz), timezone: ntz, is_recurring: true });
          else await helix(env, "PATCH", `schedule/segment?broadcaster_id=${TWITCH_ID}&id=${encodeURIComponent(o.id)}`, seg);
        }
      }
      await env.BUILDS.put(K.tz, ntz);
      await forget(request);
      const after = await segments(env);
      return json({ ok: true, changes: ops.length, rows: weekly(after.segments, ntz), tz: ntz });
    } catch (e) { return json({ error: e.message }, 502); }
  }

  if (path === "connect" && m === "POST") {
    const r = await fetch("https://id.twitch.tv/oauth2/device", { method: "POST", body: form({ client_id: CLIENT_ID, scopes: SCOPE }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return json({ error: d.message || "Twitch didn't answer" }, 502);
    await env.BUILDS.put(K.device, d.device_code, { expirationTtl: Math.max(60, d.expires_in || 1800) });
    return json({ code: d.user_code, url: d.verification_uri, interval: d.interval || 5, expires: d.expires_in || 1800 });
  }

  if (path === "poll" && m === "POST") {
    const device = await env.BUILDS.get(K.device);
    if (!device) return json({ state: "expired" });
    const r = await fetch("https://id.twitch.tv/oauth2/token", { method: "POST", body: form({ client_id: CLIENT_ID, scopes: SCOPE, device_code: device, grant_type: "urn:ietf:params:oauth:grant-type:device_code" }) });
    const t = await r.json().catch(() => ({}));
    if (!r.ok) return json({ state: /pending/i.test(t.message || "") ? "pending" : /slow/i.test(t.message || "") ? "pending" : "failed", message: t.message || "" });
    const v = await fetch("https://id.twitch.tv/oauth2/validate", { headers: { authorization: "OAuth " + t.access_token } }).then(x => x.json()).catch(() => ({}));
    if (v.user_id && v.user_id !== TWITCH_ID) return json({ state: "failed", message: `That's ${v.login}, not junhots_. Log in to Twitch as junhots_ and try again.` });
    await env.BUILDS.put(K.auth, JSON.stringify({ access: t.access_token, refresh: t.refresh_token, expires: Date.now() + (t.expires_in || 3600) * 1000, login: v.login || "junhots_", at: Date.now() }));
    await env.BUILDS.delete(K.device);
    // Days off saved before connecting go to Twitch now too
    try { await syncVacation(env, await offDays(env), tz); } catch {}
    await forget(request);
    return json({ state: "ok", login: v.login || "junhots_" });
  }

  if (path === "disconnect" && m === "POST") {
    await env.BUILDS.delete(K.auth);
    await forget(request);
    return json({ ok: true });
  }
  return json({ error: "not found" }, 404);
}
