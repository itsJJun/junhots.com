// One of my games as a slim card: my line (K/D/A, best stat, award, talents with "Load this build"), the draft
// edge, and both teams with their bans. Used by Home's "My recent games" and the Match history page (/games/).
// Games come from /api/games; the overlay adds teams, bans, length and my score line from the replay.
(() => {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const TIERS = [1, 4, 7, 10, 13, 16, 20];
  // The game's end-of-match awards (names as the replay decoder writes them, lower-cased)
  const AWARDS = { mvp: "MVP", highestkillstreak: "Dominator", mostxpcontribution: "Experienced", mostherodamagedone: "Painbringer", mostsiegedamagedone: "Siege Master", mostdamagetaken: "Bulwark", mosthealing: "Main Healer", moststuns: "Stunner", mostmerccampscaptured: "Headhunter", mostkills: "Finisher", hattrick: "Hat Trick", clutchhealer: "Clutch Healer", mostprotection: "Protector", zerodeaths: "Sole Survivor", mostroots: "Trapper", zerooutnumbereddeaths: "Team Player", mostdaredevilescapes: "Daredevil", mostescapes: "Escape Artist", mostsilences: "Silencer", mostteamfightdamagetaken: "Guardian", mostteamfighthealingdone: "Combat Medic", mostteamfightherodamagedone: "Scrapper", mostvengeancesperformed: "Avenger", mostimmortaldamage: "Immortal Slayer", mostcoinspaid: "Moneybags", mostcursedamagedone: "Master of the Curse", mostdragonshrinescaptured: "Shriner", mostdamagetoplants: "Garden Terror", mostskullscollected: "Skull Collector", mostdamagetominions: "Guardian Slayer", mosttimeintemple: "Temple Master", mostgemsturnedin: "Jeweler", mostaltardamage: "Cannoneer", mostdamagedonetozerg: "Zerg Crusher", mostnukedamagedone: "Da Bomb", mosttimepushing: "Pusher", mosttimeonpoint: "Point Guard", mostinterruptedcageunlocks: "Loyal Defender", mostseedscollected: "Seed Collector" };
  const num = n => n >= 1000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, "") + "k" : String(n);
  const len = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const ago = d => {
    const s = (d - Date.now()) / 1000, rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
    for (const [u, n] of [["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]])
      if (Math.abs(s) >= n) return rtf.format(Math.round(s / n), u);
    return "just now";
  };
  const talents = {};   // hero id -> promise of its talent tree, loaded the first time a card needs it
  const treeOf = id => talents[id] ||= fetch(`/data/heroes/${id}.json`).then(r => r.json()).then(d => d.talents).catch(() => null);

  // heroes: /data/heroes.json rows; TL: the tier list (for the draft edge), or null
  window.gameKit = (heroes, TL) => {
    const byId = Object.fromEntries(heroes.map(([id, name, role, grole]) => [id, { id, name, grole }]));
    const M = TL && window.draftModel ? draftModel(TL, Object.values(byId)) : null;
    const full = g => g.ally?.length === 5 && g.enemy?.length === 5;
    // The Draft helper's edge for this game's teams, with today's tier list
    const edge = g => M && full(g) ? M.shown(M.edge(g.ally, g.enemy, g.map || "Overall").pct) : null;
    // The stat that says most about the game for the hero's role
    const best = g => {
      const m = g.me, r = byId[g.hero]?.grole;
      if (!m) return null;
      if ((r === "Healer" || m.heal > m.hd) && m.heal) return [m.heal, "healing"];
      if (r === "Tank" && m.taken) return [m.taken, "damage taken"];
      if (m.hd) return [m.hd, "hero damage"];
      return m.siege ? [m.siege, "siege damage"] : null;
    };
    const award = g => (g.me?.aw || []).map(a => AWARDS[a.toLowerCase()]).find(Boolean) || "";
    const code = g => (g.me?.t || "").padEnd(7, "0").slice(0, 7);
    const draftLink = g => {
      const p = new URLSearchParams();
      if (g.map) p.set("m", g.map);
      for (const [k, v] of [["e", g.enemy], ["a", g.ally], ["eb", g.eban], ["ab", g.aban]]) if (v?.length) p.set(k, v.join(","));
      return "/draft/?" + p.toString().replace(/%2C/g, ",");
    };
    const face = (id, cls = "") => byId[id] ? `<img class="${cls}" src="/img/heroes/${id}.webp" alt="${esc(byId[id].name)}" title="${esc(byId[id].name)}" loading="lazy">` : "";
    const kda = m => `<span class="gc-kda"><b>${m.k}</b><i>/</i><b>${m.d}</b><i>/</i><b>${m.a}</b></span>`;

    function team(label, ids, bans, lvl, c, mine) {
      if (!ids?.length) return "";
      return `<div class="gc-team" style="--c:var(--${c})"><span class="gc-lbl">${label}${lvl ? `<small>Lvl ${lvl}</small>` : ""}</span>
        <span class="gc-faces">${ids.map(id => face(id, id === mine ? "me" : "")).join("")}</span>
        ${bans?.length ? `<span class="gc-bans" title="Bans">${bans.map(id => face(id)).join("")}</span>` : ""}</div>`;
    }

    // The card's HTML. Talent icons come in after with fill(), once the hero's talent tree has loaded.
    function card(g) {
      const h = byId[g.hero], e = edge(g), b = best(g), aw = award(g), win = g.result === "win";
      const meta = [g.map, g.len ? len(g.len) : "", ago(g.at)].filter(Boolean).map(esc).join(" · ");
      const stats = g.me ? `<div class="gc-stats">${kda(g.me)}<small>K / D / A</small>${b ? `<span><b>${num(b[0])}</b> ${b[1]}</span>` : ""}${aw ? `<span class="gc-aw">${esc(aw)}</span>` : ""}</div>` : "";
      const edgeRow = e != null ? `<a class="gc-edge" href="${draftLink(g)}" title="Open this draft in the Draft helper"><i style="--w:${e}%"></i><span><b>${e}%</b> draft edge</span></a>` : "";
      const teams = g.ally?.length || g.enemy?.length ? `<div class="gc-teams">${team("Your team", g.ally, g.aban, g.lvl?.[0], "good", g.hero)}${edgeRow}${team("Enemy", g.enemy, g.eban, g.lvl?.[1], "bad")}</div>` : "";
      return `<div class="gc${teams ? "" : " solo"}" style="--c:var(--${win ? "good" : "bad"})">
        <div class="gc-me">
          <div class="gc-top">
            <img class="gc-hero" src="/img/heroes/${g.hero}.webp" alt="">
            <div class="gc-head"><div><b>${esc(h.name)}</b><span class="gc-res">${win ? "Win" : "Loss"}</span></div><span class="gc-meta">${meta}</span></div>
          </div>
          ${stats}
          ${/[1-9]/.test(code(g)) ? `<div class="gc-tal" data-hero="${g.hero}" data-code="${code(g)}"><span class="gc-ics">${TIERS.map(() => "<i></i>").join("")}</span><a class="gc-load" href="/builds/${g.hero}?b=${code(g)}">Load this build<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></a></div>` : ""}
        </div>
        ${teams}
        ${e != null ? `<p class="gc-note">Draft edge uses my tier list as it is today, not as it was on the day.</p>` : !g.me && !g.ally ? `<p class="gc-note">This game was sent before the overlay sent teams and stats.</p>` : ""}
      </div>`;
    }

    // Puts the talent icons into a card made by card()
    async function fill(el) {
      const box = el.querySelector(".gc-tal");
      if (!box) return;
      const tree = await treeOf(box.dataset.hero);
      if (!tree) return;
      box.querySelector(".gc-ics").innerHTML = TIERS.map((lvl, i) => {
        const n = +box.dataset.code[i], t = n && tree[lvl]?.[n - 1];
        return t ? `<span title="Lvl ${lvl} · ${esc(t.name)}"><img src="/img/talents/${t.icon}.webp" alt="Level ${lvl}: ${esc(t.name)}"></span>` : `<span class="none" title="Lvl ${lvl} · not picked"></span>`;
      }).join("");
    }

    return { byId, edge, best, award, card, fill, kda, num, len, ago, esc };
  };
})();
