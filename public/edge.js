// The draft edge model, shared by the Draft helper, Home's "My recent games" and the Match history page.
//
// Every hero gets a value, and every team a score; the edge is how far apart the two scores are.
//   hero value  = tier (per map: top tier +2 ... bottom tier -2, unranked 0)
//               + win rate, pulled toward 50% when it's from few games (a 52% from 300 games counts less than from 30,000)
//   team score  = its heroes' values
//               + 1 for each enemy one of its heroes counters, + 0.6 for each "good with" pair
//               - team comp: no healer, no tank, no ranged damage, doubled tanks/healers (only once the team is mostly picked)
//   edge        = 100 / (1 + e^(-(your score - their score) / 4))
// An empty slot counts as a typical good pick (the average of the 20 best heroes on this map), so a team that has
// picked more heroes doesn't look stronger just for that.
//
// draftModel(tierlist, heroes) with heroes = [{ id, grole }]. map is a tier list map name or "Overall".
window.draftModel = (TL, HEROES) => {
  const W = { counter: 1, synergy: 0.6, wr: 0.35, shrink: 2000, noHealer: 2, noTank: 1.5, noRanged: 1, double: 0.75, spread: 4 };
  const roleOf = Object.fromEntries(HEROES.map(h => [h.id, h.grole]));
  function tierId(id, map) {
    const m = map && map !== "Overall" ? (TL.maps || {})[map] : null;
    if (m && id in m) return m[id] || "";
    return TL.overall[id] || "";
  }
  function tierVal(t) {
    const ids = TL.tiers.map(x => x.id), i = ids.indexOf(t);
    if (i < 0) return 0;
    return ids.length === 1 ? 2 : 2 - 4 * i / (ids.length - 1);
  }
  const wrOf = id => TL.winrates?.rates?.[id]?.wr;
  function wrVal(id) {
    const r = TL.winrates?.rates?.[id];
    if (!r) return 0;
    const n = r.games || 0, adj = (r.wr * n + 50 * W.shrink) / (n + W.shrink);
    return (adj - 50) * W.wr * (n ? 1 : 0.5);
  }
  const beats = (a, b) => (TL.counters?.[a] || []).includes(b);
  const goodWith = (a, b) => (TL.synergy?.[a] || []).includes(b) || (TL.synergy?.[b] || []).includes(a);

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
      parts.counters += W.counter * opp.filter(e => beats(h, e)).length;
    }
    for (let i = 0; i < team.length; i++) for (let k = i + 1; k < team.length; k++) if (goodWith(team[i], team[k])) parts.synergy += W.synergy;
    parts.total = parts.tiers + parts.wr + parts.counters + parts.synergy + parts.comp;
    return parts;
  }
  function edge(ally, enemy, map = "Overall") {
    const a = teamScore(ally, enemy, map), e = teamScore(enemy, ally, map), d = a.total - e.total;
    const pct = 100 / (1 + Math.exp(-d / W.spread));
    return { pct, a, e };
  }
  const shown = pct => Math.round(Math.max(10, Math.min(90, pct)));   // never claim more than 90%
  return { W, tierId, tierVal, wrOf, wrVal, beats, goodWith, comp, teamScore, edge, shown };
};
