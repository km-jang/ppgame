'use strict';
// 코인 · 상점 · 미션 · 기록 장부. DOM을 쓰지 않는다 (저장은 넘겨받은 store를 통해서만). node 테스트가 그대로 불러 쓴다.
// 냠냠 뱀·슝슝 달리기 shop.js와 같은 짜임.
//
// 저장 키 (아이마다 따로는 common/profile.js가 알아서)
//   bridge.shop1 : { v:1, coins, char, chars:{id:true}, pen, pens:{id:true}, missions:[{id,prog,done}], mseed, life:{earned,games} }
//   bridge.rec1  : { v:1, levels:{ 판id: {stars, best, clears} }, total:{...}, medals:{id:'YYYY-MM-DD'}, tut:{판id:true} }
// 코인은 다섯 게임이 함께 쓰는 별코인 지갑(common/hub.js, HUB). wallet = { coins(), setCoins(n) }.
// load·save에 wallet을 넘기면 그것을 쓰고(테스트의 가짜 지갑), 안 넘기면 HUB, HUB도 없으면 이 저장본의 coins
(function (BR) {
  const D = BR.DATA;
  const KEY = 'bridge.shop1', REC = 'bridge.rec1';

  const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
  const int = v => Math.floor(num(v));
  const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v);
  const charDef = id => D.CHARS.find(s => s.id === id) || null;
  const penDef = id => D.PENS.find(s => s.id === id) || null;
  const missionDef = id => D.MISSIONS.find(m => m.id === id) || null;

  // ─── 상점 저장본 ───────────────────────────────────────────
  function blank() {
    const chars = {}, pens = {};
    for (const s of D.CHARS) if (!s.price) chars[s.id] = true;
    for (const s of D.PENS) if (!s.price) pens[s.id] = true;
    const st = { v: 1, coins: 0, char: D.CHARS[0].id, chars, pen: D.PENS[0].id, pens, missions: [], mseed: 1, life: { earned: 0, games: 0 } };
    fillMissions(st);
    return st;
  }
  function clean(raw) {
    const st = blank();
    if (!isObj(raw)) return st;
    st.coins = int(raw.coins);
    if (isObj(raw.chars)) for (const s of D.CHARS) if (raw.chars[s.id] === true) st.chars[s.id] = true;
    if (isObj(raw.pens)) for (const s of D.PENS) if (raw.pens[s.id] === true) st.pens[s.id] = true;
    if (typeof raw.char === 'string' && st.chars[raw.char]) st.char = raw.char;
    if (typeof raw.pen === 'string' && st.pens[raw.pen]) st.pen = raw.pen;
    st.mseed = int(raw.mseed) || 1;
    if (isObj(raw.life)) { st.life.earned = int(raw.life.earned); st.life.games = int(raw.life.games); }
    if (Array.isArray(raw.missions)) {
      const seen = new Set(), ms = [];
      for (const m of raw.missions) {
        if (!isObj(m) || !missionDef(m.id) || seen.has(m.id) || ms.length >= D.MISSION_SLOTS) continue;
        seen.add(m.id);
        const def = missionDef(m.id), prog = Math.min(def.goal, num(m.prog));
        ms.push({ id: m.id, prog, done: prog >= def.goal });
      }
      st.missions = ms;
    }
    fillMissions(st);
    return st;
  }
  const hubWallet = () => (typeof HUB !== 'undefined' && HUB && HUB.coins && HUB.setCoins ? HUB : null);
  const pickWallet = w => (w !== undefined ? w : hubWallet());
  function load(store, wallet) {
    const st = clean((store || BR.store).get(KEY, null));
    const W = pickWallet(wallet);
    if (W) { try { st.coins = int(W.coins()); } catch (e) { /* 지갑이 막혀도 게임은 돈다 */ } }
    return st;
  }
  function save(st, store, wallet) {
    const W = pickWallet(wallet);
    if (W) { try { W.setCoins(st.coins); } catch (e) { /* 무시 */ } }
    (store || BR.store).set(KEY, st);
  }

  // 살 수 없으면(이미 가짐) null
  function price(st, id) {
    const c = charDef(id);
    if (c) return st.chars[id] ? null : c.price;
    const p = penDef(id);
    if (p) return st.pens[id] ? null : p.price;
    return null;
  }
  // {ok, reason: 'owned'|'coins'|'unknown', cost}
  function buy(st, id) {
    const c = charDef(id), p = penDef(id);
    if (!c && !p) return { ok: false, reason: 'unknown' };
    const cost = price(st, id);
    if (cost == null) return { ok: false, reason: 'owned' };
    if (st.coins < cost) return { ok: false, reason: 'coins', cost };
    st.coins -= cost;
    if (c) { st.chars[id] = true; st.char = id; } else { st.pens[id] = true; st.pen = id; }
    return { ok: true, cost };
  }
  function select(st, id) {
    if (charDef(id) && st.chars[id]) { st.char = id; return true; }
    if (penDef(id) && st.pens[id]) { st.pen = id; return true; }
    return false;
  }

  // ─── 미션 ─────────────────────────────────────────────────
  function fillMissions(st, except) {
    while (st.missions.length < D.MISSION_SLOTS) {
      const used = new Set(st.missions.map(m => m.id));
      const starter = ((st.life && st.life.games) || 0) < (D.MISSION_STARTER || 0);
      const all = starter && D.MISSIONS.some(m => m.starter && !used.has(m.id) && m.id !== except) ? D.MISSIONS.filter(m => m.starter) : D.MISSIONS;
      let pool = all.filter(m => !used.has(m.id) && m.id !== except);
      if (!pool.length) pool = D.MISSIONS.filter(m => !used.has(m.id));
      if (!pool.length) break;
      st.mseed = (Math.imul(st.mseed || 1, 1103515245) + 12345) >>> 0;
      const def = pool[(st.mseed >>> 8) % pool.length];
      st.missions.push({ id: def.id, prog: 0, done: false });
    }
    return st;
  }
  function progressMissions(st, run) {
    const fresh = [];
    for (const m of st.missions) {
      if (m.done) continue;
      const def = missionDef(m.id);
      if (!def) continue;
      const v = num(run[def.stat]);
      m.prog = Math.min(def.goal, def.kind === 'life' ? m.prog + v : Math.max(m.prog, v));
      if (m.prog >= def.goal) { m.done = true; fresh.push(m.id); }
    }
    return fresh;
  }
  function claim(st, index) {
    const m = st.missions[index];
    if (!m || !m.done) return 0;
    const def = missionDef(m.id);
    st.missions.splice(index, 1);
    st.coins += def.reward;
    st.life.earned += def.reward;
    const before = st.missions.length;
    fillMissions(st, def.id);
    if (st.missions.length > before) st.missions.splice(index, 0, st.missions.pop());
    return def.reward;
  }
  function missionView(st) {
    return st.missions.map(m => {
      const def = missionDef(m.id);
      return { id: m.id, text: def.text, prog: Math.floor(m.prog), goal: def.goal, done: m.done, reward: def.reward, kind: def.kind, pct: Math.min(1, m.prog / def.goal) };
    });
  }

  // ─── 기록 장부 ─────────────────────────────────────────────
  const TOTAL = ['clears', 'three', 'lines', 'dots', 'springs', 'springClears', 'seesaw', 'dotClears', 'oneLine', 'tiny', 'games', 'falls'];
  function blankRec() {
    const total = {};
    for (const k of TOTAL) total[k] = 0;
    total.sec = 0;
    return { v: 1, levels: {}, total, medals: {}, tut: {} };
  }
  function cleanRec(raw) {
    const r = blankRec();
    if (!isObj(raw)) return r;
    if (isObj(raw.levels)) for (const l of D.LEVELS) {
      const x = raw.levels[l.id];
      if (!isObj(x)) continue;
      r.levels[l.id] = { stars: Math.min(3, int(x.stars)), best: num(x.best), clears: int(x.clears) };
    }
    if (isObj(raw.total)) { for (const k of TOTAL) r.total[k] = int(raw.total[k]); r.total.sec = num(raw.total.sec); }
    if (isObj(raw.medals)) for (const m of D.MEDALS) if (typeof raw.medals[m.id] === 'string') r.medals[m.id] = raw.medals[m.id].slice(0, 10);
    if (isObj(raw.tut)) for (const k of Object.keys(raw.tut)) if (raw.tut[k] === true && k.length < 20) r.tut[k] = true;
    return r;
  }
  const loadRec = store => cleanRec((store || BR.store).get(REC, null));
  const saveRec = (rec, store) => (store || BR.store).set(REC, rec);

  // 행성이 열렸나 (달에서 깬 판 수로)
  function planetOpen(rec, planet) {
    const P = D.PLANETS.find(p => p.id === planet);
    if (!P) return false;
    return D.cleared(rec, 'moon') >= P.open;
  }
  // 판이 열렸나: 행성이 열렸고, 그 행성 첫 판이거나 바로 앞 판을 깼다
  function levelOpen(rec, id) {
    const L = D.levelById(id);
    if (!L || !planetOpen(rec, L.planet)) return false;
    if (L.n === 1) return true;
    const prev = rec.levels[L.planet + '-' + (L.n - 1)];
    return !!(prev && prev.stars > 0);
  }
  // 다음에 할 판: 열린 판 중 아직 안 깬 첫 판 (다 깼으면 별 3개가 아닌 첫 판, 그것도 없으면 첫 판)
  function nextLevel(rec, planet) {
    const list = planet ? D.levelsOf(planet) : D.LEVELS;
    const open = list.filter(l => levelOpen(rec, l.id));
    const todo = open.find(l => !(rec.levels[l.id] && rec.levels[l.id].stars > 0));
    if (todo) return todo;
    return open.find(l => rec.levels[l.id].stars < 3) || open[0] || D.LEVELS[0];
  }

  // 판 요약 (미션·놀이 본부): World.runStats + 이번 판으로 늘어난 수
  function runOf(W) {
    const s = BR.World.runStats(W), win = s.win ? 1 : 0;
    return {
      level: s.level, planet: s.planet, win, clears: win, stars: s.stars, three: win && s.stars >= 3 ? 1 : 0,
      marsClears: win && s.planet === 'mars' ? 1 : 0, lines: s.lines, dots: s.dots, oneLine: s.oneLine, springs: s.springs,
      seesaw: win && s.seesaw ? 1 : 0, dotClears: win && s.dots > 0 && s.lines === 0 ? 1 : 0, springClears: win && s.springs > 0 ? 1 : 0,
      used: s.used, falls: s.falls, time: s.time, games: 1,
    };
  }

  // 코인: 처음 깬 판은 크게, 다시 깬 판은 작게, 별이 늘면 덤
  function coinsFor(run, prev) {
    const C = D.COINS, parts = { clear: 0, stars: 0, better: 0 };
    if (!run.win) return { parts, total: 0, first: false };
    const had = prev && prev.stars > 0 ? prev.stars : 0;
    if (!had) { parts.clear = C.base; parts.stars = C.perStar * run.stars; }
    else { parts.clear = C.again; parts.stars = C.againStar * run.stars; parts.better = C.better * Math.max(0, run.stars - had); }
    return { parts, total: parts.clear + parts.stars + parts.better, first: !had };
  }

  // 판이 끝났을 때 (깼을 때만 코인·장부): {coins, parts, first, better, done:[미션], medals:[새 메달]}
  function finishLevel(st, rec, run) {
    const L = D.levelById(run.level);
    const prev = rec.levels[run.level] ? Object.assign({}, rec.levels[run.level]) : null;
    const c = coinsFor(run, prev);
    const T = rec.total;
    T.games++; T.lines += int(run.lines); T.dots += int(run.dots); T.springs += int(run.springs); T.falls += int(run.falls); T.sec += num(run.time);
    let better = false;
    if (run.win) {
      const cur = rec.levels[run.level] || { stars: 0, best: 0, clears: 0 };
      better = run.stars > cur.stars;
      cur.stars = Math.max(cur.stars, run.stars);
      cur.best = cur.best ? Math.min(cur.best, run.used) : run.used;
      cur.clears++;
      rec.levels[run.level] = cur;
      T.clears++; T.three += run.three; T.oneLine += run.oneLine; T.seesaw += run.seesaw; T.dotClears += run.dotClears; T.springClears += run.springClears;
      if (L && run.used <= L.solLen * D.TINY) T.tiny++;
    }
    st.coins += c.total;
    st.life.earned += c.total;
    st.life.games += 1;
    const done = progressMissions(st, run);
    const medals = checkMedals(rec);
    return { coins: c.total, parts: c.parts, first: c.first, better, prevStars: prev ? prev.stars : 0, done, medals };
  }

  // 새로 딴 메달을 장부에 적고 돌려준다
  function checkMedals(rec, day) {
    const fresh = [];
    for (const m of D.MEDALS) {
      if (rec.medals[m.id]) continue;
      let ok = false;
      try { ok = !!m.check(rec); } catch (e) { ok = false; }
      if (ok) { rec.medals[m.id] = day || new Date().toISOString().slice(0, 10); fresh.push(m); }
    }
    return fresh;
  }

  BR.Shop = { KEY, REC, blank, clean, load, save, price, buy, select, charDef, penDef, missionDef, fillMissions, progressMissions, claim, missionView,
    blankRec, cleanRec, loadRec, saveRec, planetOpen, levelOpen, nextLevel, runOf, coinsFor, finishLevel, checkMedals };
})(BR);
