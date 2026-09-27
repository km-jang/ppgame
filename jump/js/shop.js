'use strict';
// 코인 · 상점(꾸미기 · 강화 · 시작 아이템) · 미션. DOM을 쓰지 않는다 (node 테스트가 그대로 불러 쓴다: tests/jumpshop.test.js).
// 뿅뿅 우주선 game/js/shop.js와 같은 짜임.
//
// 저장 키
//   jump.shop1 : { v:1, coins, skin, skins:{id:true}, up:{speed,rocket,coin,cloud: 0~5},
//                  items:{rocket,shield: 개수}, missions:[{id,prog,done}], mseed, life:{earned,games,diffs:{easy,normal,hard}} }
// 코인은 네 게임이 같이 쓰는 별코인 지갑(common/hub.js, HUB)에 둔다. 지갑은 바꿔 끼울 수 있다 (테스트는 가짜 지갑):
//   wallet = { coins(), setCoins(n), moveIn(game, n) }. 지갑이 없으면 이 저장본의 coins만 쓴다
(function (JP) {
  const D = JP.DATA;
  const KEY = 'jump.shop1';

  const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
  const int = v => Math.floor(num(v));
  const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v);
  const skinDef = id => D.SKINS.find(s => s.id === id) || null;
  const upDef = id => D.UPGRADES.find(u => u.id === id) || null;
  const itemDef = id => D.START_ITEMS.find(u => u.id === id) || null;
  const missionDef = id => D.MISSIONS.find(m => m.id === id) || null;

  function blank() {
    const skins = {}, up = {}, items = {}, diffs = {};
    for (const s of D.SKINS) if (!s.price) skins[s.id] = true;
    for (const u of D.UPGRADES) up[u.id] = 0;
    for (const it of D.START_ITEMS) items[it.id] = 0;
    for (const d of D.DIFF_ORDER) diffs[d] = false;
    const st = { v: 1, coins: 0, skin: D.SKINS[0].id, skins, up, items, missions: [], mseed: 1, life: { earned: 0, games: 0, diffs } };
    fillMissions(st);
    return st;
  }

  // 아무 값이나 받아 올바른 모양으로 (망가진 저장본이면 기본값)
  function clean(raw) {
    const st = blank();
    if (!isObj(raw)) return st;
    st.coins = int(raw.coins);
    if (isObj(raw.skins)) for (const s of D.SKINS) if (raw.skins[s.id] === true) st.skins[s.id] = true;
    if (typeof raw.skin === 'string' && st.skins[raw.skin]) st.skin = raw.skin;
    if (isObj(raw.up)) for (const u of D.UPGRADES) st.up[u.id] = Math.min(D.UPGRADE_MAX, int(raw.up[u.id]));
    if (isObj(raw.items)) for (const it of D.START_ITEMS) st.items[it.id] = Math.min(it.max, int(raw.items[it.id]));
    st.mseed = int(raw.mseed) || 1;
    if (isObj(raw.life)) {
      st.life.earned = int(raw.life.earned); st.life.games = int(raw.life.games);
      if (isObj(raw.life.diffs)) for (const d of D.DIFF_ORDER) st.life.diffs[d] = raw.life.diffs[d] === true;
    }
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

  const hubWallet = () => (typeof HUB !== 'undefined' && HUB && HUB.coins ? HUB : null);
  // store: {get, set} (없으면 JP.store), wallet: 지갑 (없으면 HUB, null을 주면 지갑 없이)
  function load(store, wallet) {
    const st = clean((store || JP.store).get(KEY, null));
    const Wl = wallet === undefined ? hubWallet() : wallet;
    if (Wl) { if (Wl.moveIn) Wl.moveIn('jump', st.coins); st.coins = int(Wl.coins()); }
    return st;
  }
  function save(st, store, wallet) {
    const Wl = wallet === undefined ? hubWallet() : wallet;
    if (Wl) Wl.setCoins(st.coins);
    (store || JP.store).set(KEY, st);
  }
  // 지갑 잔액을 다시 읽는다 (다른 게임·게임 고르기에서 코인이 바뀌었을 수 있다)
  function sync(st, wallet) {
    const Wl = wallet === undefined ? hubWallet() : wallet;
    if (Wl) st.coins = int(Wl.coins());
    return st;
  }

  // ─── 가격 ─────────────────────────────────────────────────
  // 살 수 없으면(이미 가짐·최대 단계·가득) null
  function price(st, id) {
    const s = skinDef(id);
    if (s) return st.skins[id] ? null : s.price;
    const u = upDef(id);
    if (u) { const lv = st.up[id] || 0; return lv >= D.UPGRADE_MAX ? null : u.prices[lv]; }
    const it = itemDef(id);
    if (it) return (st.items[id] || 0) >= it.max ? null : it.price;
    return null;
  }

  // 무엇이든 산다 (꾸미기·강화·시작 아이템). {ok, reason: 'owned'|'max'|'coins'|'unknown', cost}
  function buy(st, id) {
    const s = skinDef(id), u = upDef(id), it = itemDef(id);
    if (!s && !u && !it) return { ok: false, reason: 'unknown' };
    const cost = price(st, id);
    if (cost == null) return { ok: false, reason: s ? 'owned' : 'max' };
    if (st.coins < cost) return { ok: false, reason: 'coins', cost };
    st.coins -= cost;
    if (s) { st.skins[id] = true; st.skin = id; }
    else if (u) st.up[id] = (st.up[id] || 0) + 1;
    else st.items[id] = (st.items[id] || 0) + 1;
    return { ok: true, cost };
  }

  function selectSkin(st, id) {
    if (!st.skins[id]) return false;
    st.skin = id;
    return true;
  }

  // 판 시작: 가진 시작 아이템을 하나씩 꺼내 쓴다. 돌려준 값을 World.create opts.loadout으로
  function takeLoadout(st) {
    const lo = {};
    for (const it of D.START_ITEMS) if ((st.items[it.id] || 0) > 0) { st.items[it.id] -= 1; lo[it.id] = true; }
    return lo;
  }
  // World.create에 더할 값
  function worldOpts(st, loadout) {
    return { upgrades: Object.assign({}, st.up), loadout: loadout || {} };
  }

  // ─── 판 요약 · 코인 ───────────────────────────────────────
  function runOf(W) {
    const r = JP.World.runStats(W);
    return {
      diff: r.diff, height: r.height, stars: r.stars, springs: r.springs, rockets: r.rockets, saves: r.saves,
      crumbles: r.crumbles || 0, bounces: r.bounces, maxCombo: r.maxCombo, time: Math.floor(r.time), zone: r.zone, games: 1,
    };
  }

  // 코인 계산: 부분별로 돌려준다 (결과 화면에 나눠 보여 줌)
  function coinsFor(run, st) {
    const C = D.COINS;
    const z = Math.max(0, Math.min(C.zone.length - 1, int(run.zone)));
    let zone = 0;
    for (let i = 0; i <= z; i++) zone += C.zone[i];
    const parts = { height: Math.floor(num(run.height) / C.perMeter), stars: Math.floor(num(run.stars) / C.perStars), zone };
    const base = parts.height + parts.stars + parts.zone;
    const lv = st ? (st.up.coin || 0) : 0;
    parts.bonus = Math.floor(base * lv * upDef('coin').per);
    return { parts, total: base + parts.bonus };
  }

  // ─── 미션 ─────────────────────────────────────────────────
  // 해 본 난이도의 미션만, 지금 걸린 것·방금 끝낸 것은 빼고 고른다 (씨앗으로 정해져 테스트가 같은 결과)
  function fillMissions(st, except) {
    const ok = m => !m.diff || st.life.diffs[m.diff];
    while (st.missions.length < D.MISSION_SLOTS) {
      const used = new Set(st.missions.map(m => m.id));
      let pool = D.MISSIONS.filter(m => !used.has(m.id) && m.id !== except && ok(m));
      if (!pool.length) pool = D.MISSIONS.filter(m => !used.has(m.id) && ok(m));
      if (!pool.length) break;
      st.mseed = (Math.imul(st.mseed || 1, 1103515245) + 12345) >>> 0;
      const def = pool[(st.mseed >>> 8) % pool.length];
      st.missions.push({ id: def.id, prog: 0, done: false });
    }
    return st;
  }

  // 판 요약으로 미션 진행. 누적은 더하고, 한 판 미션은 이번 판 값이 더 크면 바꾼다. 새로 끝난 미션 id 목록
  function progressMissions(st, run) {
    const fresh = [];
    for (const m of st.missions) {
      if (m.done) continue;
      const def = missionDef(m.id);
      if (!def || (def.diff && def.diff !== run.diff)) continue;
      const v = num(run[def.stat]);
      m.prog = Math.min(def.goal, def.kind === 'life' ? m.prog + v : Math.max(m.prog, v));
      if (m.prog >= def.goal) { m.done = true; fresh.push(m.id); }
    }
    return fresh;
  }

  // 끝난 미션 보상 받기: 코인을 더하고 새 미션으로 바꾼다. 받은 코인(없으면 0)
  function claim(st, index) {
    const m = st.missions[index];
    if (!m || !m.done) return 0;
    const def = missionDef(m.id);
    st.missions.splice(index, 1);
    st.coins += def.reward;
    st.life.earned += def.reward;
    const before = st.missions.length;
    fillMissions(st, def.id);
    // 새 미션은 끝에 붙는데, 받은 자리에 넣어 화면에서 자리가 안 바뀌게
    if (st.missions.length > before) st.missions.splice(index, 0, st.missions.pop());
    return def.reward;
  }

  // 판이 끝났을 때: 코인 지급 + 미션 진행. {coins, parts, done:[새로 끝난 미션 id]}
  function finishRun(st, run) {
    const c = coinsFor(run, st);
    st.coins += c.total;
    st.life.earned += c.total;
    st.life.games += 1;
    if (run.diff in st.life.diffs) st.life.diffs[run.diff] = true;
    const done = progressMissions(st, run);
    fillMissions(st);   // 새 난이도로 열리는 미션이 있을 수 있다 (빈 자리가 있을 때만)
    return { coins: c.total, parts: c.parts, done };
  }

  // 미션 화면 글: {id, text, prog, goal, done, reward, kind, pct}
  function missionView(st) {
    return st.missions.map(m => {
      const def = missionDef(m.id);
      return { id: m.id, text: def.text, prog: Math.floor(m.prog), goal: def.goal, done: m.done, reward: def.reward, kind: def.kind, pct: Math.min(1, m.prog / def.goal) };
    });
  }

  JP.Shop = { KEY, blank, clean, load, save, sync, price, buy, selectSkin, takeLoadout, worldOpts, runOf, coinsFor, fillMissions, progressMissions, claim, finishRun, missionView, skinDef, upDef, itemDef, missionDef };
})(JP);
