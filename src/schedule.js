// GET /api/schedule -> everyone: my next streams for the /schedule/ page and the "Next stream" line on Home.
// The times come from my Twitch schedule (Creator Dashboard -> Settings -> Schedule), so I only keep it up to date
// in one place. Twitch shares it as a public calendar file (no keys needed); this turns that file into a plain list
// of the next two weeks, every time in UTC (each visitor's browser shows it in their own time zone).
// Cancelled days (marked on Twitch) stay in the list with off: true, so the page can cross them out.

export const TWITCH_ID = "131819650";   // junhots_ (Twitch's number for the channel)
export const ICAL = `https://api.twitch.tv/helix/schedule/icalendar?broadcaster_id=${TWITCH_ID}`;
const DAYS = 15, MAX = 40;
const WD = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

// How far a time zone is from UTC at a moment, in ms ("America/Chicago" is -5h in summer, -6h in winter)
function offset(tz, t) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(new Date(t)).map(x => [x.type, x.value]));
  return Date.UTC(+p.year, p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(t / 1000) * 1000;
}
// A wall-clock time in a time zone -> UTC ms (checked twice so days the clocks change come out right)
function toUtc(y, mo, d, h, mi, s, tz) {
  const guess = Date.UTC(y, mo, d, h, mi, s);
  if (!tz) return guess;
  let t = guess - offset(tz, guess);
  t = guess - offset(tz, t);
  return t;
}

// "DTSTART;TZID=/America/Chicago:20240706T180000" -> { tz, y, mo, d, h, mi, s, utc }
function when(line) {
  const [head, val = ""] = [line.slice(0, line.indexOf(":")), line.slice(line.indexOf(":") + 1)];
  let tz = (head.match(/TZID=\/?([^;:]+)/) || [])[1] || "";
  try { if (tz) new Intl.DateTimeFormat("en-US", { timeZone: tz }); } catch { tz = ""; }
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
  let ev = null;
  for (const line of unfold(text)) {
    if (line === "BEGIN:VEVENT") { ev = { ex: [] }; continue; }
    if (line === "END:VEVENT") { if (ev) expand(ev, from, to, out); ev = null; continue; }
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
  return out.slice(0, MAX);
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
  // Walk day by day in the stream's own calendar (same wall-clock time each day, even across clock changes)
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

export async function schedule(request, ctx) {
  const cache = caches.default, key = new Request(new URL("/api/schedule", request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;
  const now = Date.now();
  let list = null;
  try {
    const r = await fetch(ICAL, { headers: { "user-agent": "junhots.com" }, cf: { cacheTtl: 600 } });
    if (r.ok) list = streams(await r.text(), now - 864e5, now + DAYS * 864e5);
  } catch {}
  const res = new Response(JSON.stringify({ ok: !!list, streams: list || [], ical: ICAL, twitch: "junhots_" }), {
    headers: { "content-type": "application/json", "cache-control": `public, max-age=${list ? 600 : 60}` },
  });
  if (list) ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}
