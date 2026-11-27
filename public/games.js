// One of my games as a slim card: my line (K/D/A, best stat, award, talents with "Load this build"), the draft
// edge, and both teams with their bans. Used by Home's "My recent games" and the Match history page (/games/).
// Games come from /api/games; the overlay adds teams, bans, length and my score line from the replay.
// Games with hp: 1 also have the other nine players' lines (/api/games?players=<id>, loaded on the first click):
// click a hero in the teams and the left side shows that player's K/D/A, stat, award and build instead of mine.
(() => {
  const esc = (s) =>
    String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const TIERS = [1, 4, 7, 10, 13, 16, 20];
  // The game's end-of-match awards (names as the replay decoder writes them, lower-cased)
  const AWARDS = {
    mvp: "MVP",
    highestkillstreak: "Dominator",
    mostxpcontribution: "Experienced",
    mostherodamagedone: "Painbringer",
    mostsiegedamagedone: "Siege Master",
    mostdamagetaken: "Bulwark",
    mosthealing: "Main Healer",
    moststuns: "Stunner",
    mostmerccampscaptured: "Headhunter",
    mostkills: "Finisher",
    hattrick: "Hat Trick",
    clutchhealer: "Clutch Healer",
    mostprotection: "Protector",
    zerodeaths: "Sole Survivor",
    mostroots: "Trapper",
    zerooutnumbereddeaths: "Team Player",
    mostdaredevilescapes: "Daredevil",
    mostescapes: "Escape Artist",
    mostsilences: "Silencer",
    mostteamfightdamagetaken: "Guardian",
    mostteamfighthealingdone: "Combat Medic",
    mostteamfightherodamagedone: "Scrapper",
    mostvengeancesperformed: "Avenger",
    mostimmortaldamage: "Immortal Slayer",
    mostcoinspaid: "Moneybags",
    mostcursedamagedone: "Master of the Curse",
    mostdragonshrinescaptured: "Shriner",
    mostdamagetoplants: "Garden Terror",
    mostskullscollected: "Skull Collector",
    mostdamagetominions: "Guardian Slayer",
    mosttimeintemple: "Temple Master",
    mostgemsturnedin: "Jeweler",
    mostaltardamage: "Cannoneer",
    mostdamagedonetozerg: "Zerg Crusher",
    mostnukedamagedone: "Da Bomb",
    mosttimepushing: "Pusher",
    mosttimeonpoint: "Point Guard",
    mostinterruptedcageunlocks: "Loyal Defender",
    mostseedscollected: "Seed Collector",
  };
  // Award icon files in /img/awards (the award's name without spaces); Seed Collector has no icon
  const awIcon = (name) => {
    const k = name.toLowerCase().replace(/[^a-z]/g, "");
    return k && k !== "seedcollector" ? `/img/awards/${k}.webp` : "";
  };
  // Map art in /img/maps, by the map's name ("Blackheart's Bay" -> blackhearts-bay)
  const mapArt = (m) =>
    m
      ? `/img/maps/${m
          .toLowerCase()
          .replace(/'/g, "")
          .replace(/[^a-z0-9]+/g, "-")}.webp`
      : "";
  const MAP_ART = new Set([
    "Alterac Pass",
    "Battlefield of Eternity",
    "Blackheart's Bay",
    "Braxis Holdout",
    "Cursed Hollow",
    "Dragon Shire",
    "Garden of Terror",
    "Hanamura Temple",
    "Haunted Mines",
    "Infernal Shrines",
    "Sky Temple",
    "Tomb of the Spider Queen",
    "Towers of Doom",
    "Volskaya Foundry",
    "Warhead Junction",
  ]);
  const num = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, "") + "k" : String(n));
  const len = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const ago = (d) => {
    const s = (d - Date.now()) / 1000,
      rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
    for (const [u, n] of [
      ["month", 2592000],
      ["week", 604800],
      ["day", 86400],
      ["hour", 3600],
      ["minute", 60],
    ])
      if (Math.abs(s) >= n) return rtf.format(Math.round(s / n), u);
    return "just now";
  };
  // My Twitch VODs (past broadcasts, Twitch keeps them 60 days) from /api/vods, loaded once: [{ id, start, dur }]
  let VODS = null,
    vodsP = null;
  const loadVods = () =>
    (vodsP ||= fetch("/api/vods")
      .then((r) => (r.ok ? r.json() : {}))
      .then((d) => (VODS = d.vods || []))
      .catch(() => (VODS = [])));
  // When the game started: the overlay's game id starts with the loading screen's time; else end time minus the length
  const startOf = (g) => {
    const m = /^(\d{9,11})-/.exec(g.id || "");
    return m ? +m[1] * 1000 : g.at - ((g.len || 1200) + 90) * 1000;
  };
  // The VOD that has this game, and where in it: { url, at } or null (no VOD yet, or Twitch deleted it)
  const vod = (g) => vodAt(startOf(g));
  const vodAt = (t) => {
    if (!VODS?.length) return null;
    const v = VODS.find(
      (v, i) => t >= v.start && t < (i === 0 ? Math.max(v.start + v.dur * 1000, Date.now()) : v.start + v.dur * 1000),
    );
    if (!v) return null;
    const s = Math.max(0, Math.round((t - v.start) / 1000) - 20),
      h = Math.floor(s / 3600),
      m = Math.floor(s / 60) % 60,
      sec = s % 60;
    return {
      url: `https://www.twitch.tv/videos/${v.id}?t=${h}h${m}m${sec}s`,
      at: `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`,
    };
  };
  const TWITCH_ICON =
    '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M2.6 1 1.5 3.8v10h3.3v1.7h1.9l1.8-1.7h2.7L14.5 10V1zm10.7 8.4-2 2H8.4l-1.8 1.8v-1.8H4.2V2.2h9.1zM11.3 4.4h-1.1v3.4h1.1zm-3 0H7.2v3.4h1.1z"/></svg>';

  const talents = {}; // hero id -> promise of its talent tree, loaded the first time a card needs it
  const treeOf = (id) =>
    (talents[id] ||= fetch(`/data/heroes/${id}.json`)
      .then((r) => r.json())
      .then((d) => d.talents)
      .catch(() => null));

  // heroes: /data/heroes.json rows; TL: the tier list (for the draft edge), or null
  const CHEV =
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const GAMES = new Map(); // game id -> game, for the cards whose heroes can be clicked

  window.gameKit = (heroes, TL) => {
    const byId = Object.fromEntries(heroes.map(([id, name, role, grole]) => [id, { id, name, grole }]));
    const M = TL && window.draftModel ? draftModel(TL, Object.values(byId)) : null;
    const full = (g) => g.ally?.length === 5 && g.enemy?.length === 5;
    // The Draft helper's edge for this game's teams, with today's tier list
    const edge = (g) => (M && full(g) ? M.shown(M.edge(g.ally, g.enemy, g.map || "Overall").pct) : null);
    // The stat that says most about the game for the hero's role
    const best = (g, m = g.me, hero = g.hero) => {
      const r = byId[hero]?.grole;
      if (!m) return null;
      if ((r === "Healer" || m.heal > m.hd) && m.heal) return [m.heal, "healing"];
      if (r === "Tank" && m.taken) return [m.taken, "damage taken"];
      if (m.hd) return [m.hd, "hero damage"];
      return m.siege ? [m.siege, "siege damage"] : null;
    };
    const award = (g, m = g.me) => (m?.aw || []).map((a) => AWARDS[a.toLowerCase()]).find(Boolean) || "";
    const code = (g, m = g.me) => (m?.t || "").padEnd(7, "0").slice(0, 7);
    const draftLink = (g) => {
      const p = new URLSearchParams();
      if (g.map) p.set("m", g.map);
      for (const [k, v] of [
        ["e", g.enemy],
        ["a", g.ally],
        ["eb", g.eban],
        ["ab", g.aban],
      ])
        if (v?.length) p.set(k, v.join(","));
      return "/draft/?" + p.toString().replace(/%2C/g, ",");
    };
    const face = (id, cls = "") =>
      byId[id]
        ? `<img class="${cls}" src="/img/heroes/${id}.webp" alt="${esc(byId[id].name)}" title="${esc(byId[id].name)}" loading="lazy">`
        : "";
    const kda = (m) => `<span class="gc-kda"><b>${m.k}</b><i>/</i><b>${m.d}</b><i>/</i><b>${m.a}</b></span>`;

    // With everyone's lines (hp) each face is a button that shows that player on the left
    function team(label, ids, bans, lvl, c, mine, pick) {
      if (!ids?.length) return "";
      const one = (id) =>
        pick && byId[id]
          ? `<button type="button" class="gc-p${id === mine ? " on" : ""}" data-h="${id}" aria-pressed="${id === mine}" title="${esc(byId[id].name)}: see their build">${face(id, id === mine ? "me" : "")}</button>`
          : face(id, id === mine ? "me" : "");
      return `<div class="gc-team" style="--c:var(--${c})"><span class="gc-lbl">${label}${lvl ? `<small>Lvl ${lvl}</small>` : ""}</span>
        <span class="gc-faces">${ids.map(one).join("")}</span>
        ${bans?.length ? `<span class="gc-bans" title="Bans">${bans.map((id) => face(id)).join("")}</span>` : ""}</div>`;
    }

    // The left side for one player of the game: me (m = g.me), or anyone else whose line we have
    function side(g, hero = g.hero, m = g.me) {
      const h = byId[hero] || { name: hero },
        mine = hero === g.hero,
        ally = mine || g.ally?.includes(hero),
        win = (g.result === "win") === ally,
        b = best(g, m, hero),
        aw = award(g, m),
        c = code(g, m);
      const party = g.party ? ["", "Solo", "Duo", "Trio", "Party of 4", "Party of 5"][g.party] : "";
      const meta = [g.map, g.len ? len(g.len) : "", ago(g.at), g.patch ? `Patch ${g.patch}` : "", party].filter(Boolean).map(esc).join(" · ");
      const stats = m
        ? `<div class="gc-stats">${kda(m)}<small>K / D / A</small>${b ? `<span><b>${num(b[0])}</b> ${b[1]}</span>` : ""}${aw ? `<span class="gc-aw${awIcon(aw) ? " ic" : ""}">${awIcon(aw) ? `<img src="${awIcon(aw)}" alt="">` : ""}${esc(aw)}</span>` : ""}</div>`
        : "";
      const who = mine
        ? ""
        : `<span class="gc-who" style="--c:var(--${ally ? "good" : "bad"})">${ally ? "My team" : "Enemy"}</span>`;
      return `<div class="gc-view" style="--c:var(--${win ? "good" : "bad"})">
          <div class="gc-top">
            <img class="gc-hero" src="/img/heroes/${hero}.webp" alt="">
            <div class="gc-head"><div><b>${esc(h.name)}</b><span class="gc-res">${win ? "Win" : "Loss"}</span>${who}</div><span class="gc-meta">${meta}</span></div>
            ${mine ? "" : `<button type="button" class="gc-back" data-h="${g.hero}">Back to mine</button>`}
          </div>
          ${stats}
          ${/[1-9]/.test(c) ? `<div class="gc-tal" data-hero="${hero}" data-code="${c}"><span class="gc-ics">${TIERS.map(() => "<i></i>").join("")}</span><a class="gc-load" href="/builds/${hero}?b=${c}">Load this build<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></a></div>` : ""}
        </div>`;
    }

    // The card's HTML. Talent icons come in after with fill(), once the hero's talent tree has loaded.
    function card(g) {
      const e = edge(g),
        win = g.result === "win",
        pick = !!g.hp && full(g);
      if (pick) GAMES.set(g.id, g);
      const edgeRow =
        e != null
          ? `<a class="gc-edge" href="${draftLink(g)}" title="Open this draft in the Draft helper"><i style="--w:${e}%"></i><span><b>${e}%</b> draft edge</span></a>`
          : "";
      const teams =
        g.ally?.length || g.enemy?.length
          ? `<div class="gc-teams">${team("Your team", g.ally, g.aban, g.lvl?.[0], "good", g.hero, pick)}${edgeRow}${team("Enemy", g.enemy, g.eban, g.lvl?.[1], "bad", "", pick)}${pick ? `<p class="gc-hint"><span>Click any hero to see their build</span><span class="gc-sbtns">${g.htl ? `<button type="button" class="gc-sbtn" data-v="tl" aria-expanded="false">Timeline${CHEV}</button>` : ""}<button type="button" class="gc-sbtn" data-v="sb" aria-expanded="false">Scoreboard${CHEV}</button></span></p>` : ""}</div>${pick ? `<div class="gc-sb" hidden></div>` : ""}`
          : "";
      const art = MAP_ART.has(g.map) ? `;--art:url(${mapArt(g.map)})` : "";
      return `<div class="gc${teams ? "" : " solo"}${art ? " art" : ""}"${pick ? ` data-gid="${esc(g.id)}"` : ""} style="--c:var(--${win ? "good" : "bad"})${art}">
        <div class="gc-me">
          ${side(g)}
          <span class="gc-vod" data-start="${startOf(g)}" hidden></span>
        </div>
        ${teams}
        ${e != null ? `<p class="gc-note">Draft edge uses my tier list as it is today, not as it was on the day.</p>` : !g.me && !g.ally ? `<p class="gc-note">This game was sent before the overlay sent teams and stats.</p>` : ""}
      </div>`;
    }

    // Puts the talent icons into a card made by card()
    async function fill(el) {
      const vb = el.querySelector(".gc-vod");
      if (vb)
        loadVods().then(() => {
          // "Watch this game" when Twitch still has the VOD
          const v = vodAt(+vb.dataset.start);
          if (!v) return;
          vb.innerHTML = `<a class="gc-watch" href="${v.url}" target="_blank" rel="noopener">${TWITCH_ICON}Watch this game <small>${v.at} into the stream</small></a>`;
          vb.hidden = false;
        });
      const g = GAMES.get(el.querySelector(".gc[data-gid]")?.dataset.gid || el.dataset?.gid);
      if (g) {
        const root = el.matches?.(".gc") ? el : el.querySelector(".gc");
        root.addEventListener("click", (ev) => {
          const b = ev.target.closest(".gc-p, .gc-back, .gc-sbr");
          if (b) return show(root, g, b.dataset.h);
          const t = ev.target.closest(".gc-sbtn");
          if (t) panel(root, g, t.dataset.v);
        });
      }
      await icons(el);
    }

    // Shows one player of game g on the card's left side (their line comes from the server on the first click)
    const extra = {}; // game id -> promise of { pl: { hero: line } (all ten players), tl: timeline or null }
    const extraOf = (g) =>
      (extra[g.id] ||= fetch(`/api/games?players=${encodeURIComponent(g.id)}`)
        .then((r) => (r.ok ? r.json() : {}))
        .then((d) => ({ pl: d.pl || {}, tl: d.tl || null }))
        .catch(() => ({ pl: {}, tl: null })));
    const linesOf = (g) => extraOf(g).then((d) => d.pl);
    async function show(root, g, hero) {
      const cur = root.querySelector(".gc-p.on");
      if (cur?.dataset.h === hero) return;
      let m = g.me;
      if (hero !== g.hero) {
        m = (await linesOf(g))[hero];
        if (!m) return;
      }
      for (const p of root.querySelectorAll(".gc-p, .gc-sbr")) {
        const on = p.dataset.h === hero;
        p.classList.toggle("on", on);
        if (p.matches(".gc-p")) p.setAttribute("aria-pressed", on);
      }
      const view = root.querySelector(".gc-view");
      view.outerHTML = side(g, hero, m);
      await icons(root);
    }

    // Under the card: the Scoreboard (all ten players like the game's score screen) or the Timeline. Clicking the
    // open one's button closes it.
    async function panel(root, g, v) {
      const box = root.querySelector(".gc-sb"),
        open = !box.hidden && box.dataset.v === v;
      for (const b of root.querySelectorAll(".gc-sbtn")) b.setAttribute("aria-expanded", !open && b.dataset.v === v);
      if (open) return void (box.hidden = true);
      const d = await extraOf(g);
      if (v === "tl" ? !d.tl : !Object.keys(d.pl).length) {
        for (const b of root.querySelectorAll(".gc-sbtn")) b.setAttribute("aria-expanded", false);
        return;
      }
      box.dataset.v = v;
      if (v === "tl") timeline(box, g, d.tl);
      else board(root, box, g, d.pl);
      box.hidden = false;
    }

    // The scoreboard. Main stats or More stats; the best number in each column lit up; click a heading to sort
    // each team by it (high to low first, click again to flip), Reset puts the players back in draft order.
    // Click a row to show that player on the left.
    const COLS = [
      ["k", "K", "Kills"],
      ["d", "D", "Deaths"],
      ["a", "A", "Assists"],
      ["hd", "Hero dmg", "Hero damage"],
      ["siege", "Siege", "Siege damage"],
      ["heal", "Healing", "Healing"],
      ["taken", "Taken", "Damage taken"],
      ["xp", "XP", "Experience contribution"],
      ["dead", "Dead", "Time spent dead"],
    ];
    const MORE = [
      ["tk", "Takedowns", "Takedowns"],
      ["streak", "Streak", "Best kill streak"],
      ["cc", "CC", "Time stunning, rooting or silencing enemy heroes"],
      ["stun", "Stuns", "Time stunning enemy heroes"],
      ["selfheal", "Self heal", "Self healing"],
      ["shield", "Shielding", "Shields given to allies"],
      ["soak", "Soaked", "Damage soaked"],
      ["struct", "Structure", "Structure damage"],
      ["camps", "Camps", "Merc camps taken"],
      ["esc", "Escapes", "Escapes"],
    ];
    const LOW = new Set(["d", "dead"]); // lower is better: not lit up
    const TIME = new Set(["dead", "cc", "stun"]); // seconds, shown as m:ss
    const COUNT = new Set(["k", "d", "a", "tk", "streak", "camps", "esc"]); // small numbers, 0 shown as 0
    function board(root, box, g, pl) {
      const rows = [...g.ally, ...g.enemy].map((id) => pl[id]).filter(Boolean);
      const has = (k) => rows.some((m) => m[k] > 0 || (COUNT.has(k) && m[k] != null));
      const more = MORE.some(([k]) => rows.some((m) => m[k] > 0));
      let view = "main",
        sort = null; // { k, up }
      const name = (id) => byId[id]?.name || id;
      const cell = (k, v) => (TIME.has(k) ? (v ? len(v) : "–") : COUNT.has(k) ? String(v || 0) : v ? num(v) : "–");
      const ARROW = (up) =>
        `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${up ? "M4 10l4-4 4 4" : "M4 6l4 4 4-4"}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      const render = () => {
        const cols = (view === "more" ? MORE : COLS).filter(([k]) => has(k)),
          top = Object.fromEntries(cols.map(([k]) => [k, LOW.has(k) ? -1 : Math.max(...rows.map((m) => m[k] || 0))])),
          talents = view === "main",
          span = cols.length + (talents ? 2 : 1),
          on = root.querySelector(".gc-p.on")?.dataset.h;
        const row = (id) => {
          const m = pl[id];
          if (!m) return "";
          const aw = award(g, m);
          return `<tr class="gc-sbr${id === on ? " on" : ""}${id === g.hero ? " me" : ""}" data-h="${id}" tabindex="0">
            <th scope="row"><span class="gc-sbh">${face(id)}<b>${esc(name(id))}</b>${aw && awIcon(aw) ? `<img class="gc-sbaw" src="${awIcon(aw)}" alt="${esc(aw)}" title="${esc(aw)}">` : ""}</span></th>
            ${cols.map(([k]) => `<td class="${top[k] > 0 && m[k] === top[k] ? "top" : ""}">${cell(k, m[k])}</td>`).join("")}
            ${talents ? `<td><span class="gc-ics sm" data-hero="${id}" data-code="${code(g, m)}">${TIERS.map(() => "<i></i>").join("")}</span></td>` : ""}</tr>`;
        };
        let order = (ids) => ids,
          note = "";
        if (sort && cols.some(([k]) => k === sort.k || sort.k === "name")) {
          const val = (id) => (sort.k === "name" ? name(id) : pl[id]?.[sort.k] || 0);
          order = (ids) =>
            [...ids].sort((a, b) => {
              const x = val(a),
                y = val(b),
                d = typeof x === "string" ? x.localeCompare(y) : x - y;
              return sort.up ? d : -d;
            });
          const what = sort.k === "name" ? "hero name" : [...COLS, ...MORE].find(([k]) => k === sort.k)[2].toLowerCase();
          const dir = sort.k === "name" ? (sort.up ? "A to Z" : "Z to A") : sort.up ? "low to high" : "high to low";
          note = `<span class="gc-sbn"><span>By ${what}, ${dir}</span><button type="button" class="gc-sbx">Reset</button></span>`;
        } else sort = null;
        const win = g.result === "win";
        const head = (label, ids, lvl, c, w, n = "") =>
          `<tr class="gc-sbt" style="--c:var(--${c})"><th scope="colgroup" colspan="${span}"><span class="gc-sbl">${label} <span>${w ? "Win" : "Loss"}${lvl ? ` · Lvl ${lvl}` : ""}</span>${n}</span></th></tr>${order(ids).map(row).join("")}`;
        const th = (k, label, title) => {
          const s = sort?.k === k;
          return `<th scope="col"${s ? ` aria-sort="${sort.up ? "ascending" : "descending"}" class="srt"` : ""}><button type="button" class="gc-sbs" data-k="${k}" title="${esc(title)}. Click to sort">${label}${s ? ARROW(sort.up) : ""}</button></th>`;
        };
        const x = box.querySelector(".gc-sbw")?.scrollLeft || 0;
        box.innerHTML = `${more ? `<div class="gc-sbv" role="group" aria-label="Stats"><button type="button" data-view="main" aria-pressed="${view === "main"}">Main stats</button><button type="button" data-view="more" aria-pressed="${view === "more"}">More stats</button></div>` : ""}<div class="gc-sbw"><table>
          <thead><tr>${th("name", "Hero", "Hero name")}${cols.map(([k, s, t]) => th(k, s, t)).join("")}${talents ? `<th scope="col">Talents</th>` : ""}</tr></thead>
          <tbody>${head("Your team", g.ally, g.lvl?.[0], "good", win, note)}${head("Enemy", g.enemy, g.lvl?.[1], "bad", !win)}</tbody></table></div>`;
        box.querySelector(".gc-sbw").scrollLeft = x; // phones: stay on the column you sorted
        for (const ics of box.querySelectorAll(".gc-ics")) icons(ics.parentElement);
      };
      render();
      box.onclick = (e) => {
        const b = e.target.closest(".gc-sbs"),
          v = e.target.closest("[data-view]");
        if (b) {
          const k = b.dataset.k;
          // Numbers start high to low, hero names A to Z; the same heading again flips it
          sort = sort?.k === k ? { k, up: !sort.up } : { k, up: k === "name" };
        } else if (e.target.closest(".gc-sbx")) sort = null;
        else if (v) view = v.dataset.view;
        else return;
        render();
        box.querySelector(b ? `.gc-sbs[data-k="${b.dataset.k}"]` : v ? `[data-view="${view}"]` : ".gc-sbs")?.focus({ preventScroll: true });
      };
      box.onkeydown = (e) => {
        const r = e.target.closest(".gc-sbr");
        if (r && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          show(root, g, r.dataset.h);
        }
      };
    }

    // The timeline: the XP lead over the game (my team above the line in green, theirs below in red), every death
    // as a hero face (enemy deaths on top, ours at the bottom), forts, keeps and the core falling, merc camps,
    // and when each team reached levels 10 and 20.
    function timeline(box, g, tl) {
      const W = 1000,
        H = 216,
        L = 44,
        R = 12,
        mid = 104,
        half = 84;
      const end = Math.max(tl.end || 0, (tl.xp.length || 1) * 60, ...tl.k.map((k) => k[0]), ...tl.s.map((s) => s[0]));
      const X = (t) => L + (Math.max(0, t) / end) * (W - L - R);
      const diffs = tl.xp.map(([a, e]) => a - e),
        max = Math.max(1000, ...diffs.map(Math.abs)),
        Y = (d) => mid - (d / max) * half;
      const pts = [[0, 0], ...diffs.map((d, i) => [(i + 1) * 60, d])];
      const line = pts.map(([t, d], i) => `${i ? "L" : "M"}${X(t).toFixed(1)},${Y(d).toFixed(1)}`).join("");
      const area = `${line}L${X(pts.at(-1)[0]).toFixed(1)},${mid}L${X(0)},${mid}Z`;
      const lv = (s, n) => tl.lv?.[s]?.[n - 1] || 0;
      const mmss = (t) => len(Math.max(0, Math.round(t)));
      // Level 10 and 20: a thin line per team, ours from the top, theirs from the bottom
      const lvMark = (s, n) => {
        const t = lv(s, n);
        if (!t) return "";
        const x = X(t).toFixed(1),
          top = s === "a";
        return `<g class="tl-lv ${s}"><line x1="${x}" x2="${x}" y1="${mid - half}" y2="${mid + half}"/><text x="${(+x + 4).toFixed(1)}" y="${top ? mid - half + 10 : mid + half - 3}">${n}</text><title>${s === "a" ? "Your team" : "Enemy"} reached level ${n} at ${mmss(t)}</title></g>`;
      };
      const ticks = [];
      for (let t = 0; t <= end; t += end > 1200 ? 300 : 120)
        ticks.push(`<text class="tl-x" x="${X(t).toFixed(1)}" y="${H - 2}">${mmss(t)}</text>`);
      // Deaths: one face per death; 3+ deaths close together (a team fight) become one count badge.
      // Hover or tap a marker for a tower of who died, when, and who was in on the kill.
      const lane = (s) => {
        const list = tl.k.filter((k) => k[2] === s),
          groups = [];
        for (const k of list) {
          const g0 = groups.at(-1);
          if (g0 && k[0] - g0.at(-1)[0] <= 15) g0.push(k);
          else groups.push([k]);
        }
        // Small groups whose faces would overlap are split back into single faces placed side by side
        const marks = [];
        for (const grp of groups) {
          if (grp.length >= 3) marks.push(grp);
          else for (const k of grp) marks.push([k]);
        }
        let lastX = -99;
        return marks
          .map((grp) => {
            let x = (X(grp[0][0]) + X(grp.at(-1)[0])) / 2;
            if (x - lastX < 22) x = lastX + 22; // keep faces from touching
            lastX = x;
            const many = grp.length >= 3,
              when = many ? `${mmss(grp[0][0])}–${mmss(grp.at(-1)[0])}` : mmss(grp[0][0]);
            const rows = grp
              .map(
                ([t, h, , by]) =>
                  `<li><img class="v" src="/img/heroes/${h}.webp" alt=""><span><b>${esc(byId[h]?.name || h)}</b><small>${mmss(t)}</small></span>${by?.length ? `<span class="by" title="In on the kill">${by.map((b) => `<img src="/img/heroes/${b}.webp" alt="${esc(byId[b]?.name || b)}" title="${esc(byId[b]?.name || b)}">`).join("")}</span>` : ""}</li>`,
              )
              .join("");
            const label = many
              ? `${grp.length} ${s === "e" ? "enemies" : "of us"} died, ${when}`
              : `${byId[grp[0][1]]?.name || grp[0][1]} died at ${when}`;
            const edge = x / W < 0.15 ? " l" : x / W > 0.85 ? " r" : ""; // towers near the sides open inward
            return `<button type="button" class="tl-m ${s}${many ? " n" : ""}${edge}" style="left:${((x / W) * 100).toFixed(2)}%" aria-label="${esc(label)}">${many ? `<span class="tl-n">${grp.length}</span>` : `<img src="/img/heroes/${grp[0][1]}.webp" alt="">`}<span class="tl-tw" role="tooltip"><span class="tl-tw-h">${many ? `${grp.length} ${s === "e" ? "enemies died" : "of us died"} · ${when}` : `${s === "e" ? "Enemy died" : "We lost"} · ${when}`}</span><ul>${rows}</ul></span></button>`;
          })
          .join("");
      };
      const NAMES = { fort: "Fort", keep: "Keep", core: "Core" };
      const towers = tl.s
        .map(([t, k, s]) => {
          const x = X(t).toFixed(1);
          return `<g class="tl-s ${s === "e" ? "a" : "e"}"><path d="M${x},${mid - 7}l6,7l-6,7l-6,-7z"/><title>${s === "e" ? "Enemy" : "Our"} ${NAMES[k].toLowerCase()} destroyed at ${mmss(t)}</title></g>`;
        })
        .join("");
      const camps = tl.c
        .map(([t, s, k]) => `<circle class="tl-c ${s}" cx="${X(t).toFixed(1)}" cy="${mid}" r="3"><title>${s === "a" ? "We" : "Enemy"} took a ${k} camp at ${mmss(t)}</title></circle>`)
        .join("");
      // Talent timing line: when each team hit 10 and 20, the biggest lead, the kill count
      const reach = (n) => {
        const a = lv("a", n),
          e = lv("e", n);
        if (!a && !e) return "";
        const who = (s, t) => (t ? mmss(t) : `never (${s === "a" ? "Lvl " + (g.lvl?.[0] || tl.lv.a.length) : "Lvl " + (g.lvl?.[1] || tl.lv.e.length)})`);
        return `<span><b>Level ${n}</b> us ${who("a", a)} · them ${who("e", e)}</span>`;
      };
      const best = diffs.reduce((b, d, i) => (Math.abs(d) > Math.abs(b[0]) ? [d, (i + 1) * 60] : b), [0, 0]);
      const kills = tl.k.filter((k) => k[2] === "e").length,
        deaths = tl.k.filter((k) => k[2] === "a").length;
      box.innerHTML = `<div class="tl">
        <div class="tl-sum">${reach(10)}${reach(20)}${best[0] ? `<span><b>Biggest lead</b> ${best[0] > 0 ? "us" : "them"} by ${num(Math.abs(best[0]))} XP at ${mmss(best[1])}</span>` : ""}<span><b>Kills</b> ${kills} – ${deaths}</span></div>
        <div class="tl-gw"><div class="tl-lane top">${lane("e")}</div>
        <svg class="tl-g" viewBox="0 0 ${W} ${H}" role="img" aria-label="Game timeline">
          <defs><clipPath id="tlc" clipPathUnits="objectBoundingBox"><circle cx=".5" cy=".5" r=".5"/></clipPath>
            <clipPath id="tlu"><rect x="0" y="0" width="${W}" height="${mid}"/></clipPath><clipPath id="tld"><rect x="0" y="${mid}" width="${W}" height="${H - mid}"/></clipPath></defs>
          <text class="tl-y a" x="${L - 8}" y="${mid - half + 4}">+${num(max)}</text><text class="tl-y e" x="${L - 8}" y="${mid + half + 4}">−${num(max)}</text>
          <path class="tl-area a" d="${area}" clip-path="url(#tlu)"/><path class="tl-area e" d="${area}" clip-path="url(#tld)"/>
          <line class="tl-0" x1="${L}" x2="${W - R}" y1="${mid}" y2="${mid}"/>
          <path class="tl-line" d="${line}"/>
          ${lvMark("a", 10)}${lvMark("a", 20)}${lvMark("e", 10)}${lvMark("e", 20)}
          ${camps}${towers}
          ${ticks.join("")}
        </svg><div class="tl-lane bot">${lane("a")}</div></div>
        <div class="tl-key"><span><i class="k e"></i>Enemy died (top)</span><span><i class="k a"></i>We died (bottom)</span><span><i class="k n">3</i>3+ deaths together: hover to see who</span><span><i class="s"></i>Fort, keep or core down</span><span><i class="c"></i>Merc camp</span><span><i class="l"></i>Level 10 / 20</span><span class="tl-note">XP lead: above the line = my team ahead</span></div>
      </div>`;
    }

    // Puts the talent icons into the card's talent row, once that hero's talent tree has loaded
    async function icons(el) {
      const box = el.querySelector(".gc-tal, .gc-ics[data-hero]");
      if (!box) return;
      const tree = await treeOf(box.dataset.hero);
      if (!tree) return;
      (box.matches(".gc-ics") ? box : box.querySelector(".gc-ics")).innerHTML = TIERS.map((lvl, i) => {
        const n = +box.dataset.code[i],
          t = n && tree[lvl]?.[n - 1];
        return t
          ? `<span title="Lvl ${lvl} · ${esc(t.name)}"><img src="/img/talents/${t.icon}.webp" alt="Level ${lvl}: ${esc(t.name)}"></span>`
          : `<span class="none" title="Lvl ${lvl} · not picked"></span>`;
      }).join("");
    }

    return { byId, edge, best, award, awIcon, card, fill, kda, num, len, ago, esc, vod, loadVods, TWITCH_ICON };
  };
})();
