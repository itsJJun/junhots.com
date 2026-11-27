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
      const meta = [g.map, g.len ? len(g.len) : "", ago(g.at)].filter(Boolean).map(esc).join(" · ");
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
          ? `<div class="gc-teams">${team("Your team", g.ally, g.aban, g.lvl?.[0], "good", g.hero, pick)}${edgeRow}${team("Enemy", g.enemy, g.eban, g.lvl?.[1], "bad", "", pick)}${pick ? `<p class="gc-hint"><span>Click any hero to see their build</span><button type="button" class="gc-sbtn" aria-expanded="false">Scoreboard<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button></p>` : ""}</div>${pick ? `<div class="gc-sb" hidden></div>` : ""}`
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
          if (ev.target.closest(".gc-sbtn")) board(root, g);
        });
      }
      await icons(el);
    }

    // Shows one player of game g on the card's left side (their line comes from the server on the first click)
    const lines = {}; // game id -> promise of { hero: line }, all ten players
    const linesOf = (g) =>
      (lines[g.id] ||= fetch(`/api/games?players=${encodeURIComponent(g.id)}`)
        .then((r) => (r.ok ? r.json() : {}))
        .then((d) => d.pl || {})
        .catch(() => ({})));
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

    // The full scoreboard: all ten players like the game's score screen, the best number in each column lit up.
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
    const LOW = new Set(["d", "dead"]); // lower is better: not lit up
    async function board(root, g) {
      const box = root.querySelector(".gc-sb"),
        btn = root.querySelector(".gc-sbtn"),
        open = box.hidden;
      btn.setAttribute("aria-expanded", open);
      if (!open) return void (box.hidden = true);
      if (!box.innerHTML) {
        const pl = await linesOf(g);
        if (!Object.keys(pl).length) return void btn.setAttribute("aria-expanded", false);
        const rows = [...g.ally, ...g.enemy].map((id) => pl[id]).filter(Boolean),
          cols = COLS.filter(([k]) => rows.some((m) => m[k] != null && (m[k] > 0 || k === "d" || k === "k" || k === "a"))),
          top = Object.fromEntries(cols.map(([k]) => [k, LOW.has(k) ? -1 : Math.max(...rows.map((m) => m[k] || 0))]));
        const cell = (k, v) =>
          k === "dead"
            ? v
              ? len(v)
              : "–"
            : ["k", "d", "a"].includes(k)
              ? String(v || 0)
              : v
                ? num(v)
                : "–";
        const on = root.querySelector(".gc-p.on")?.dataset.h;
        const row = (id) => {
          const m = pl[id];
          if (!m) return "";
          const aw = award(g, m);
          return `<tr class="gc-sbr${id === on ? " on" : ""}${id === g.hero ? " me" : ""}" data-h="${id}" tabindex="0">
            <th scope="row"><span class="gc-sbh">${face(id)}<b>${esc(byId[id]?.name || id)}</b>${aw && awIcon(aw) ? `<img class="gc-sbaw" src="${awIcon(aw)}" alt="${esc(aw)}" title="${esc(aw)}">` : ""}</span></th>
            ${cols.map(([k]) => `<td class="${top[k] > 0 && m[k] === top[k] ? "top" : ""}">${cell(k, m[k])}</td>`).join("")}
            <td><span class="gc-ics sm" data-hero="${id}" data-code="${code(g, m)}">${TIERS.map(() => "<i></i>").join("")}</span></td></tr>`;
        };
        const head = (label, ids, lvl, c, win) =>
          `<tr class="gc-sbt" style="--c:var(--${c})"><th scope="colgroup" colspan="${cols.length + 2}">${label} <span>${win ? "Win" : "Loss"}${lvl ? ` · Lvl ${lvl}` : ""}</span></th></tr>${ids.map(row).join("")}`;
        const win = g.result === "win";
        box.innerHTML = `<div class="gc-sbw"><table>
          <thead><tr><th scope="col">Hero</th>${cols.map(([, s, t]) => `<th scope="col" title="${t}">${s}</th>`).join("")}<th scope="col">Talents</th></tr></thead>
          <tbody>${head("Your team", g.ally, g.lvl?.[0], "good", win)}${head("Enemy", g.enemy, g.lvl?.[1], "bad", !win)}</tbody></table></div>`;
        box.addEventListener("keydown", (e) => {
          const r = e.target.closest(".gc-sbr");
          if (r && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            show(root, g, r.dataset.h);
          }
        });
        for (const ics of box.querySelectorAll(".gc-ics")) icons(ics.parentElement);
      }
      box.hidden = false;
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
