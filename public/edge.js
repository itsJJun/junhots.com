// The draft edge model, shared by the Draft helper, Home's "My recent games" and the Match history page.
//
// Every hero gets a value, and every team a score; the edge is how far apart the two scores are.
//   hero value  = tier (per map: top tier +2 ... bottom tier -2, unranked 0)
//               + win rate, pulled toward 50% when it's from few games (a 52% from 300 games counts less than from 30,000)
//   team score  = its heroes' values
//               + 1 for each enemy one of its heroes counters, + 0.6 for each "good with" pair
//               + tags: 0.4 for each enemy a hero beats only by tag ("good against Dive"), at most 1.2 per hero;
//                 0.25 for each pair good together only by tag. A hero-to-hero entry for the same pair counts instead.
//               - team comp: no healer, no tank, no ranged damage, doubled tanks/healers (only once the team is mostly picked)
//   edge        = 100 / (1 + e^(-(your score - their score) / 4))
// An empty slot counts as a typical good pick (the average of the 20 best heroes on this map), so a team that has
// picked more heroes doesn't look stronger just for that.
//
// Gall is looked up as Cho'gall (site.js tierKey), and Cho + Gall on one team count once for counters and "good with".
//
// The overlay's match banner uses the same model (tierlist.py EDGE_WEIGHTS): change a weight in both.
// draftModel(tierlist, heroes) with heroes = [{ id, grole }]. map is a tier list map name or "Overall".
window.draftModel = (TL, HEROES) => {
  const W = { counter: 1, synergy: 0.6, tagCounter: 0.4, tagCounterMax: 1.2, tagSynergy: 0.25, wr: 0.35, shrink: 2000, noHealer: 2, noTank: 1.5, noRanged: 1, double: 0.75, spread: 4 };
  const roleOf = Object.fromEntries(HEROES.map(h => [h.id, h.grole]));
  const key = window.tierKey || (id => id);
  function tierId(id, map) {
    id = key(id);
    const m = map && map !== "Overall" ? (TL.maps || {})[map] : null;
    if (m && id in m) return m[id] || "";
    return TL.overall[id] || "";
  }
  function tierVal(t) {
    const ids = TL.tiers.map(x => x.id), i = ids.indexOf(t);
    if (i < 0) return 0;
    return ids.length === 1 ? 2 : 2 - 4 * i / (ids.length - 1);
  }
  const wrOf = id => TL.winrates?.rates?.[key(id)]?.wr;
  function wrVal(id) {
    const r = TL.winrates?.rates?.[key(id)];
    if (!r) return 0;
    const n = r.games || 0, adj = (r.wr * n + 50 * W.shrink) / (n + W.shrink);
    return (adj - 50) * W.wr * (n ? 1 : 0.5);
  }
  const beats = (a, b) => (TL.counters?.[key(a)] || []).includes(key(b));
  const goodWith = (a, b) => { a = key(a); b = key(b); return a !== b && ((TL.synergy?.[a] || []).includes(b) || (TL.synergy?.[b] || []).includes(a)); };
  const once = ids => [...new Set(ids.map(key))];
  // Style tags: the tag a beats b by ("tag:dive"), or null. a good against one of b's tags, or b bad against one of a's.
  const tagsOf = id => (TL.tags?.[key(id)] || []).map(t => "tag:" + t);
  const beatsByTag = (a, b) => { a = key(a); b = key(b); const c = TL.counters || {};
    return tagsOf(b).find(t => (c[a] || []).includes(t)) || tagsOf(a).find(t => (c[t] || []).includes(b)) || null; };
  const withByTag = (a, b) => { a = key(a); b = key(b); const s = TL.synergy || {};
    return a === b ? null : tagsOf(b).find(t => (s[a] || []).includes(t)) || tagsOf(a).find(t => (s[b] || []).includes(t)) || null; };

  function comp(team) {
    const n = team.length, roles = team.map(id => roleOf[id]), count = r => roles.filter(x => x === r).length;
    const ramp = Math.max(0, (n - 2) / 3);   // 0 with 2 heroes or fewer, full at 5
    let v = 0;
    if (!count("Healer")) v -= W.noHealer * ramp;
    if (!count("Tank")) v -= W.noTank * ramp;
    if (n >= 4 && !count("Ranged Assassin")) v -= W.noRanged * ramp;
    v -= W.double * (Math.max(0, count("Healer") - 1) + Math.max(0, count("Tank") - 1));
    return v;
  }
  const BASE = {};   // what an empty slot is worth, per map
  function base(map) {
    if (BASE[map]) return BASE[map];
    const vals = HEROES.map(h => [tierVal(tierId(h.id, map)), wrVal(h.id)]).sort((x, y) => (y[0] + y[1]) - (x[0] + x[1])).slice(0, 20);
    return BASE[map] = { tiers: vals.reduce((a, v) => a + v[0], 0) / vals.length, wr: vals.reduce((a, v) => a + v[1], 0) / vals.length };
  }
  function teamScore(team, opp, map) {
    const b = base(map), open = 5 - team.length;
    const parts = { tiers: open * b.tiers, wr: open * b.wr, counters: 0, synergy: 0, comp: comp(team) };
    for (const h of team) {
      parts.tiers += tierVal(tierId(h, map));
      parts.wr += wrVal(h);
    }
    const mine = once(team), theirs = once(opp);
    for (const h of mine) {
      const exact = theirs.filter(e => beats(h, e)), byTag = theirs.filter(e => !exact.includes(e) && beatsByTag(h, e));
      parts.counters += W.counter * exact.length + Math.min(W.tagCounterMax, W.tagCounter * byTag.length);
    }
    for (let i = 0; i < mine.length; i++) for (let k = i + 1; k < mine.length; k++) {
      if (goodWith(mine[i], mine[k])) parts.synergy += W.synergy;
      else if (withByTag(mine[i], mine[k])) parts.synergy += W.tagSynergy;
    }
    parts.total = parts.tiers + parts.wr + parts.counters + parts.synergy + parts.comp;
    return parts;
  }
  function edge(ally, enemy, map = "Overall") {
    const a = teamScore(ally, enemy, map), e = teamScore(enemy, ally, map), d = a.total - e.total;
    const pct = 100 / (1 + Math.exp(-d / W.spread));
    return { pct, a, e };
  }
  // The matchups behind an edge, biggest first: [{ v (+ helps your team, − theirs), text }]
  function explain(ally, enemy) {
    const name = id => HEROES.find(h => h.id === id)?.name || id, tagName = t => TL.tagNames?.[t.slice(4)] || t.slice(4);
    const out = [];
    for (const [team, opp, sign, own, other] of [[ally, enemy, 1, "", "their"], [enemy, ally, -1, "Their ", "your"]]) {
      const mine = once(team), theirs = once(opp), groups = {};
      for (const h of mine) {
        const exact = theirs.filter(e => beats(h, e));
        exact.forEach(e => out.push({ v: sign * W.counter, text: `${own}${name(h)} counters ${other} ${name(e)}` }));
        // "Uther is good vs their Dive (Genji, Tracer)" or "Their Lunara is weak vs your Dive (Genji)"
        let left = W.tagCounterMax;
        theirs.filter(e => !exact.includes(e)).forEach(e => {
          const t = beatsByTag(h, e);
          if (!t) return;
          const v = Math.min(left, W.tagCounter);   // past the cap the hero still shows, it just adds nothing
          left -= v;
          const good = (TL.counters?.[key(h)] || []).includes(t), k = good ? `g ${h} ${t}` : `w ${e} ${t}`;
          const g = groups[k] ||= { v: 0, list: [], text: good ? n => `${own}${name(h)} is good vs ${other} ${tagName(t)} (${n})`
            : n => `${own ? "Your" : "Their"} ${name(e)} is weak vs ${own ? "their" : "your"} ${tagName(t)} (${n})` };
          g.v += sign * v; g.list.push(name(good ? e : h));
        });
      }
      for (const g of Object.values(groups)) out.push({ v: g.v, text: g.text(g.list.join(", ")) });
      for (let i = 0; i < mine.length; i++) for (let k = i + 1; k < mine.length; k++) {
        const a = mine[i], b = mine[k];
        if (goodWith(a, b)) out.push({ v: sign * W.synergy, text: `${own}${name(a)} + ${name(b)} work well together` });
        else if (withByTag(a, b)) out.push({ v: sign * W.tagSynergy, text: `${own}${name(a)} + ${name(b)} work well together (${tagName(withByTag(a, b))})` });
      }
      const c = comp(team);
      if (c <= -1) out.push({ v: sign * c, text: `${own ? "Their" : "Your"} team comp has a hole (${["Healer", "Tank"].filter(r => !team.some(id => roleOf[id] === r)).map(r => "no " + r.toLowerCase()).join(", ") || "doubled roles"})` });
    }
    return out.sort((x, y) => Math.abs(y.v) - Math.abs(x.v));
  }
  const shown = pct => Math.round(Math.max(10, Math.min(90, pct)));   // never claim more than 90%
  return { W, tierId, tierVal, wrOf, wrVal, beats, goodWith, beatsByTag, withByTag, comp, teamScore, edge, explain, shown };
};
