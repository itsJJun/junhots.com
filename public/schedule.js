// Stream schedule: shared by the "Next stream" line on Home and the /schedule/ page.
// The streams come from /api/schedule (my Twitch schedule, src/schedule.js) and live or not from /api/media.
// Every time is shown in the visitor's own time zone by their browser.
(() => {
  const T = () => window.SITE_TEXT || {};
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const DAY = 864e5;
  const dayKey = t => new Date(t).toDateString();
  const time = t => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const wd = t => new Date(t).toLocaleDateString("en", { weekday: "short" });
  const date = t => new Date(t).toLocaleDateString("en", { month: "short", day: "numeric" });
  // "Today", "Tomorrow" or "Tue"
  const dayName = (t, long) => {
    const now = Date.now();
    if (dayKey(t) === dayKey(now)) return "Today";
    if (dayKey(t) === dayKey(now + DAY)) return "Tomorrow";
    return new Date(t).toLocaleDateString("en", { weekday: long ? "long" : "short" });
  };
  // "in 5h 20m", "in 2d 4h", "in 12m"
  const until = t => {
    const m = Math.max(1, Math.round((t - Date.now()) / 6e4));
    if (m < 60) return `in ${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `in ${h}h${m % 60 ? ` ${m % 60}m` : ""}`;
    return `in ${Math.floor(h / 24)}d${h % 24 ? ` ${h % 24}h` : ""}`;
  };
  // The visitor's time zone as a short city name ("New York", "Seoul")
  const zone = () => { try { return (Intl.DateTimeFormat().resolvedOptions().timeZone.split("/").pop() || "").replace(/_/g, " "); } catch { return ""; } };

  let got;
  const load = fresh => (fresh && (got = null), got ||= Promise.all([
    fetch("/api/schedule", fresh ? { cache: "no-store" } : {}).then(r => r.ok ? r.json() : null).catch(() => null),
    fetch("/api/media").then(r => r.ok ? r.json() : null).catch(() => null),
  ]).then(([s, m]) => ({ ok: !!s?.ok, streams: s?.streams || [], away: s?.away || null, tz: s?.tz || "", ical: s?.ical || "", channel: s?.twitch || "junhots_", live: !!m?.twitch?.live, title: m?.twitch?.title || "" })));

  // Where we are right now: live, a stream that should be on, or the next one coming
  const state = d => {
    const now = Date.now(), on = d.streams.filter(s => !s.off);
    const cur = on.find(s => s.start <= now && s.end > now);
    // Not live yet up to 30 minutes after the planned start = "Starting soon"; later than that, that stream is skipped
    const soon = !d.live && cur && now - cur.start < 30 * 6e4 ? cur : null;
    const next = on.find(s => s.start > now);
    return { live: d.live, cur, next, soon };
  };

  // Calendar links: subscribing (not a one-time copy), so changes and days off show up in their calendar too
  const calLinks = ical => ical ? {
    google: "https://calendar.google.com/calendar/render?cid=" + encodeURIComponent(ical.replace(/^https:/, "webcal:")),
    webcal: ical.replace(/^https:/, "webcal:"),
  } : null;

  // The next 7 days as small chips: a stream that day, the next one in coral, cancelled or nothing dimmed
  const chips = d => {
    const st = state(d), out = [];
    for (let i = 0; i < 7; i++) {
      const t = Date.now() + i * DAY, list = d.streams.filter(s => dayKey(s.start) === dayKey(t));
      const has = list.some(s => !s.off), isNext = st.next && dayKey(st.next.start) === dayKey(t) && !st.live && !st.soon, isNow = (st.live || st.soon) && i === 0;
      out.push(`<span class="${isNow || isNext ? "nxt" : has ? "on" : list.length ? "cx" : ""}" title="${esc(new Date(t).toLocaleDateString("en", { weekday: "long" }) + ": " + (has ? list.filter(s => !s.off).map(s => time(s.start)).join(", ") : list.length ? "cancelled" : "no stream"))}">${wd(t).slice(0, 2)}</span>`);
    }
    return `<span class="days" aria-hidden="true">${out.join("")}</span>`;
  };

  // Small line icons for the Home line (no second red dot: the Twitch button right above already has one)
  const CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>';
  const WAVE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/></svg>';
  // Home: one line under the buttons
  window.scheduleLine = el => load().then(d => {
    const st = state(d);
    if (!d.ok && !d.live) return;
    if (!st.live && !st.next && !st.soon) return;
    let main;
    if (st.live) main = `<span class="lb live">${WAVE}${esc(T().schedule_live || "Live now")}</span><strong title="${esc(d.title)}">${esc(d.title || "On Twitch")}</strong>`;
    else if (st.soon) main = `<span class="lb">${CLOCK}${esc(T().schedule_next || "Next stream")}</span><strong>Starting soon</strong><span class="cd">${time(st.soon.start)}</span>`;
    else if (d.away && d.away.from <= Date.now()) main = `<span class="lb">${CLOCK}Away till ${date(d.away.to - 12 * 36e5)}</span><strong>${dayName(st.next.start)} ${time(st.next.start)}</strong><span class="cd" data-until="${st.next.start}">${until(st.next.start)}</span>`;
    else main = `<span class="lb">${CLOCK}${esc(T().schedule_next || "Next stream")}</span><strong>${dayName(st.next.start)} ${time(st.next.start)}</strong><span class="cd" data-until="${st.next.start}">${until(st.next.start)}</span>`;
    el.innerHTML = `${main}${d.ok ? chips(d) : ""}<a class="more" href="/schedule/">${esc(T().schedule_more || "Schedule")} ›</a>`;
    el.hidden = false;
    setInterval(() => el.querySelectorAll("[data-until]").forEach(c => { c.textContent = until(+c.dataset.until); }), 30e3);
  });

  window.SCHEDULE = { load, state, time, wd, date, dayName, until, zone, calLinks, esc, dayKey, DAY };
})();
