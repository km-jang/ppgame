'use strict';
// 코인 · 상점 · 미션. DOM을 쓰지 않는다 (저장은 NG.store를 통해서만). node 테스트가 그대로 불러 쓴다.
//
// 저장 키
//   ngun.shop1 : { v:1, coins, ship, ships:{id:true}, up:{hp,dmg,ultStart,coin,magnet: 0~5},
//                  items:{shield,barrel,fullult: 개수}, missions:[{id,prog,done}], mseed, life:{earned,games} }
(function (NG) {
  const D = NG.DATA;
  const KEY = 'ngun.shop1';

  const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
  const int = v => Math.floor(num(v));
  const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v);
  const shipDef = id => D.SHIPS.find(s => s.id === id) || null;
  const upDef = id => D.UPGRADES.find(u => u.id === id) || null;
  const itemDef = id => D.START_ITEMS.find(u => u.id === id) || null;
  const missionDef = id => D.MISSIONS.find(m => m.id === id) || null;

  function blank() {
    const ships = {};
    for (const s of D.SHIPS) if (!s.price) ships[s.id] = true;
    const up = {}, items = {};
    for (const u of D.UPGRADES) up[u.id] = 0;
    for (const it of D.START_ITEMS) items[it.id] = 0;
    const st = { v: 1, coins: 0, ship: D.SHIPS[0].id, ships, up, items, missions: [], mseed: 1, life: { earned: 0, games: 0 } };
    fillMissions(st);
    return st;
  }

  // 아무 값이나 받아 올바른 모양으로 (망가진 저장본이면 기본값)
  function clean(raw) {
    const st = blank();
    if (!isObj(raw)) return st;
    st.coins = int(raw.coins);
    if (isObj(raw.ships)) for (const s of D.SHIPS) if (raw.ships[s.id] === true) st.ships[s.id] = true;
    if (typeof raw.ship === 'string' && st.ships[raw.ship]) st.ship = raw.ship;
    if (isObj(raw.up)) for (const u of D.UPGRADES) st.up[u.id] = Math.min(D.UPGRADE_MAX, int(raw.up[u.id]));
    if (isObj(raw.items)) for (const it of D.START_ITEMS) st.items[it.id] = Math.min(it.max, int(raw.items[it.id]));
    st.mseed = int(raw.mseed) || 1;
    if (isObj(raw.life)) { st.life.earned = int(raw.life.earned); st.life.games = int(raw.life.games); }
    if (Array.isArray(raw.missions)) {
      const seen = new Set();
      const ms = [];
      for (const m of raw.missions) {
        if (!isObj(m) || !missionDef(m.id) || seen.has(m.id) || ms.length >= D.MISSION_SLOTS) continue;
        seen.add(m.id);
        const def = missionDef(m.id);
        const prog = Math.min(def.goal, num(m.prog));
        ms.push({ id: m.id, prog, done: prog >= def.goal });
      }
      st.missions = ms;
    }
    fillMissions(st);
    return st;
  }

  // 코인은 네 게임이 함께 쓰는 별코인 지갑(common/hub.js, HUB)에 둔다. 처음 한 번은 여기 모아 둔 코인을 지갑으로 옮긴다.
  // HUB가 없으면(node 테스트) 예전처럼 이 저장본의 coins를 쓴다
  const hub = () => (typeof HUB !== 'undefined' && HUB && HUB.coins ? HUB : null);
  function load(store) {
    const st = clean((store || NG.store).get(KEY, null));
    const H = !store && hub();
    if (H) { H.moveIn('ngun', st.coins); st.coins = H.coins(); }
    return st;
  }
  function save(st, store) {
    const H = !store && hub();
    if (H) H.setCoins(st.coins);
    (store || NG.store).set(KEY, st);
  }

  // ─── 가격 ─────────────────────────────────────────────────
  // 살 수 없으면(이미 가짐·최대 단계·가득) null
  function price(st, id) {
    const s = shipDef(id);
    if (s) return st.ships[id] ? null : s.price;
    const u = upDef(id);
    if (u) { const lv = st.up[id] || 0; return lv >= D.UPGRADE_MAX ? null : u.prices[lv]; }
    const it = itemDef(id);
    if (it) return (st.items[id] || 0) >= it.max ? null : it.price;
    return null;
  }

  // 무엇이든 산다 (기체·강화·시작 아이템). {ok, reason: 'owned'|'max'|'coins'|'unknown', cost}
  function buy(st, id) {
    const s = shipDef(id), u = upDef(id), it = itemDef(id);
    if (!s && !u && !it) return { ok: false, reason: 'unknown' };
    const cost = price(st, id);
    if (cost == null) return { ok: false, reason: s ? 'owned' : 'max' };
    if (st.coins < cost) return { ok: false, reason: 'coins', cost };
    st.coins -= cost;
    if (s) { st.ships[id] = true; st.ship = id; }
    else if (u) st.up[id] = (st.up[id] || 0) + 1;
    else st.items[id] = (st.items[id] || 0) + 1;
    fillMissions(st); // 새 기체로 열리는 미션이 있을 수 있다
    return { ok: true, cost };
  }

  function selectShip(st, id) {
    if (!st.ships[id]) return false;
    st.ship = id;
    return true;
  }

  // 판 시작: 가진 시작 아이템을 하나씩 꺼내 쓴다 (없으면 빈 칸). 돌려준 값을 createWorld opts.loadout으로
  function takeLoadout(st) {
    const lo = {};
    for (const it of D.START_ITEMS) if ((st.items[it.id] || 0) > 0) { st.items[it.id] -= 1; lo[it.id] = true; }
    return lo;
  }

  // createWorld의 다섯째 인자
  function worldOpts(st, loadout) {
    return { ship: st.ship, upgrades: Object.assign({}, st.up), loadout: loadout || {} };
  }

  // ─── 판 요약 · 코인 ───────────────────────────────────────
  function runOf(W) {
    const s = W.stats;
    return {
      ship: W.player.ship || 'core', diff: W.diff.id, score: W.score, wave: W.wave, time: s.time,
      kills: s.kills, bosses: W.bossKills, bossKills: W.bossKills, ults: s.ults, dashes: s.dashes,
      bestCombo: s.bestCombo, cleanWaves: s.cleanWaves, maxN: W.player.gun.barrels,
      coinPicks: s.coinPicks || 0, runCoins: s.coins || 0, items: s.items || 0, blocks: s.blocks || 0, bombKills: s.bombKills || 0,
      // 깜짝 선물 상자 · 피버 · 동료 (2026-09-27). giftCoins는 runCoins 안에 들어 있다 (결과 화면에 따로 보여 줌)
      gifts: s.gifts || 0, giftCoins: s.giftCoins || 0, giftItems: Array.isArray(s.giftItems) ? s.giftItems.slice() : [],
      fevers: s.fevers || 0, wingmen: s.wingmen || 0,
      games: 1,
    };
  }

  // 코인 계산: 부분별로 돌려준다 (결과 화면에 나눠 보여 줌)
  function coinsFor(run, st) {
    const C = D.COINS;
    // 선물 상자 코인(giftCoins)은 주운 코인(runCoins) 안에 들어 있어서 따로 떼어 보여 준다. giftExtra: 가득 찬 시작 아이템 선물 대신 주는 코인
    const giftC = Math.min(int(run.runCoins), int(run.giftCoins));
    const parts = {
      score: Math.floor(num(run.score) / C.perScore),
      wave: Math.max(0, int(run.wave) - 1) * C.perWave,
      boss: int(run.bosses) * C.perBoss,
      pickup: int(run.runCoins) - giftC,
      gift: giftC + int(run.giftExtra),
    };
    const base = parts.score + parts.wave + parts.boss + parts.pickup + parts.gift;
    const lv = st ? (st.up.coin || 0) : 0;
    parts.bonus = Math.floor(base * lv * upDef('coin').per);
    return { parts, total: base + parts.bonus };
  }

  // ─── 미션 ─────────────────────────────────────────────────
  // 가진 기체로만 할 수 있는 것, 지금 걸린 것·방금 끝낸 것은 빼고 고른다 (씨앗으로 정해져 테스트가 같은 결과)
  function fillMissions(st, except) {
    while (st.missions.length < D.MISSION_SLOTS) {
      const used = new Set(st.missions.map(m => m.id));
      let pool = D.MISSIONS.filter(m => !used.has(m.id) && m.id !== except && (!m.ship || st.ships[m.ship]));
      if (!pool.length) pool = D.MISSIONS.filter(m => !used.has(m.id) && (!m.ship || st.ships[m.ship]));
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
      if (!def) continue;
      if (def.ship && def.ship !== run.ship) continue;
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
  // 선물 상자에서 받은 "다음 판 시작 아이템"을 넣는다. 칸이 가득이면 그 대신 코인 (run.giftExtra에 더함). 넣은 아이템 id 목록
  function giveGiftItems(st, run) {
    const got = [];
    run.giftExtra = int(run.giftExtra);
    for (const id of Array.isArray(run.giftItems) ? run.giftItems : []) {
      const it = itemDef(id);
      if (!it) continue;
      if ((st.items[id] || 0) < it.max) { st.items[id] = (st.items[id] || 0) + 1; got.push(id); }
      else run.giftExtra += D.GIFT.itemFullCoins;
    }
    return got;
  }

  function finishRun(st, run) {
    const items = giveGiftItems(st, run);
    const c = coinsFor(run, st);
    st.coins += c.total;
    st.life.earned += c.total;
    st.life.games += 1;
    const done = progressMissions(st, run);
    return { coins: c.total, parts: c.parts, done, items };
  }

  // 미션 화면 글: {text, prog, goal, done, reward, pct}
  function missionView(st) {
    return st.missions.map(m => {
      const def = missionDef(m.id);
      return { id: m.id, text: def.text, prog: Math.floor(m.prog), goal: def.goal, done: m.done, reward: def.reward, kind: def.kind, pct: Math.min(1, m.prog / def.goal) };
    });
  }

  NG.Shop = { KEY, blank, clean, load, save, price, buy, selectShip, takeLoadout, worldOpts, runOf, coinsFor, fillMissions, progressMissions, claim, finishRun, missionView, shipDef, upDef, itemDef, missionDef };
})(NG);
