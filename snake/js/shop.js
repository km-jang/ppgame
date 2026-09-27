'use strict';
// 코인 · 상점(꾸미기·강화·시작 아이템) · 미션. DOM을 쓰지 않는다 (node 테스트가 그대로 불러 쓴다: tests/snakeshop.test.js).
// 뿅뿅 우주선 game/js/shop.js와 같은 짜임이다.
//
// 코인은 이 저장본에 두지 않고 지갑(wallet)에 둔다.
//   브라우저: 네 게임이 같이 쓰는 별코인 지갑 HUB (common/hub.js)
//   HUB가 없을 때(파일 하나 미리보기 등): 이 기기 저장소 snake.wallet
//   테스트: memWallet(처음 코인)으로 만든 가짜 지갑을 useWallet으로 끼운다
//
// 저장 키
//   snake.shop1 : { v:1, skin, skins:{id:true}, up:{goldTime,itemFreq,comboTime,coin: 0~5},
//                   items:{ghost,slow,double: 개수}, missions:[{id,prog,done}], mseed, life:{earned,games} }
(function (SN) {
  const D = SN.DATA;
  const KEY = 'snake.shop1';
  const WALLET_KEY = 'snake.wallet';

  const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
  const int = v => Math.floor(num(v));
  const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v);
  const skinDef = id => D.SKINS.find(s => s.id === id) || null;
  const upDef = id => D.UPGRADES.find(u => u.id === id) || null;
  const itemDef = id => D.START_ITEMS.find(u => u.id === id) || null;
  const missionDef = id => D.MISSIONS.find(m => m.id === id) || null;

  // ─── 지갑 ─────────────────────────────────────────────────
  // 지갑 모양: { coins(): 잔액, add(n): 새 잔액, spend(n): 모자라면 false }
  function memWallet(start) {
    let n = int(start);
    return { coins: () => n, add(k) { n += int(k); return n; }, spend(k) { k = int(k); if (n < k) return false; n -= k; return true; } };
  }
  function hubWallet(H) {
    return { coins: () => H.coins(), add: k => H.addCoins(k), spend: k => H.spend(k) };
  }
  function storeWallet() {
    const get = () => int(SN.store && SN.store.get(WALLET_KEY, 0));
    const put = n => { if (SN.store) SN.store.set(WALLET_KEY, n); return n; };
    return { coins: get, add: k => put(get() + int(k)), spend(k) { k = int(k); const n = get(); if (n < k) return false; put(n - k); return true; } };
  }
  let wallet = null;
  function getWallet() {
    if (!wallet) wallet = typeof HUB !== 'undefined' && HUB && HUB.coins ? hubWallet(HUB) : storeWallet();
    return wallet;
  }
  function useWallet(w) { wallet = w || null; return getWallet(); }
  const coins = () => getWallet().coins();

  // ─── 저장본 ───────────────────────────────────────────────
  function blank() {
    const skins = {};
    for (const s of D.SKINS) if (!s.price) skins[s.id] = true;
    const up = {}, items = {};
    for (const u of D.UPGRADES) up[u.id] = 0;
    for (const it of D.START_ITEMS) items[it.id] = 0;
    const st = { v: 1, skin: D.SKINS[0].id, skins, up, items, missions: [], mseed: 1, life: { earned: 0, games: 0 } };
    fillMissions(st);
    return st;
  }

  // 아무 값이나 받아 올바른 모양으로 (망가진 저장본이면 기본값)
  function clean(raw) {
    const st = blank();
    if (!isObj(raw)) return st;
    if (isObj(raw.skins)) for (const s of D.SKINS) if (raw.skins[s.id] === true) st.skins[s.id] = true;
    if (typeof raw.skin === 'string' && st.skins[raw.skin]) st.skin = raw.skin;
    if (isObj(raw.up)) for (const u of D.UPGRADES) st.up[u.id] = Math.min(D.UPGRADE_MAX, int(raw.up[u.id]));
    if (isObj(raw.items)) for (const it of D.START_ITEMS) st.items[it.id] = Math.min(it.max, int(raw.items[it.id]));
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

  // store: {get, set} (테스트는 가짜 저장소를 넘긴다, 없으면 SN.store)
  const load = store => clean((store || SN.store).get(KEY, null));
  const save = (st, store) => (store || SN.store).set(KEY, st);

  // ─── 가격 · 사기 ──────────────────────────────────────────
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
    if (!getWallet().spend(cost)) return { ok: false, reason: 'coins', cost };
    if (s) { st.skins[id] = true; st.skin = id; }
    else if (u) st.up[id] = (st.up[id] || 0) + 1;
    else st.items[id] = (st.items[id] || 0) + 1;
    return { ok: true, cost };
  }

  // 가진 꾸미기만 고를 수 있다
  function selectSkin(st, id) {
    if (!skinDef(id) || !st.skins[id]) return false;
    st.skin = id;
    return true;
  }

  // 판 시작: 가진 시작 아이템을 하나씩 꺼내 쓴다. 돌려준 값을 World.create opts.start로
  function takeLoadout(st) {
    const lo = {};
    for (const it of D.START_ITEMS) if ((st.items[it.id] || 0) > 0) { st.items[it.id] -= 1; lo[it.id] = true; }
    return lo;
  }

  // World.create에 넘길 옵션 (모드·난이도 옵션에 덧붙인다)
  function worldOpts(st, loadout, base) {
    return Object.assign({}, base || {}, { up: Object.assign({}, st.up), start: loadout || {} });
  }

  // ─── 판 요약 · 코인 ───────────────────────────────────────
  // World.runStats에 판 수(1)를 붙인 것
  function runOf(W) {
    return Object.assign(SN.World.runStats(W), { games: 1 });
  }

  // 코인 계산: 부분별로 돌려준다 (결과 화면에 나눠 보여 줌)
  function coinsFor(run, st) {
    const C = D.COINS;
    const parts = {
      score: Math.floor(num(run.score) / C.perScore),
      gold: int(run.golds) * C.perGold,
      level: run.mode === 'stage' ? int(run.levelsCleared) * C.perLevel : 0,
    };
    const base = parts.score + parts.gold + parts.level;
    const lv = st ? (st.up.coin || 0) : 0;
    parts.bonus = Math.floor(base * lv * upDef('coin').per);
    return { parts, total: base + parts.bonus };
  }

  // ─── 미션 ─────────────────────────────────────────────────
  // 지금 걸린 것·방금 끝낸 것은 빼고 고른다 (씨앗으로 정해져 테스트가 같은 결과)
  function fillMissions(st, except) {
    while (st.missions.length < D.MISSION_SLOTS) {
      const used = new Set(st.missions.map(m => m.id));
      let pool = D.MISSIONS.filter(m => !used.has(m.id) && m.id !== except);
      if (!pool.length) pool = D.MISSIONS.filter(m => !used.has(m.id));
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
      const v = num(run[def.stat]);
      m.prog = Math.min(def.goal, def.kind === 'life' ? m.prog + v : Math.max(m.prog, v));
      if (m.prog >= def.goal) { m.done = true; fresh.push(m.id); }
    }
    return fresh;
  }

  // 끝난 미션 보상 받기: 지갑에 코인을 넣고 새 미션으로 바꾼다. 받은 코인(없으면 0)
  function claim(st, index) {
    const m = st.missions[index];
    if (!m || !m.done) return 0;
    const def = missionDef(m.id);
    st.missions.splice(index, 1);
    getWallet().add(def.reward);
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
    getWallet().add(c.total);
    st.life.earned += c.total;
    st.life.games += 1;
    const done = progressMissions(st, run);
    return { coins: c.total, parts: c.parts, done };
  }

  // 미션 화면 글: {id, text, prog, goal, done, reward, kind, pct}
  function missionView(st) {
    return st.missions.map(m => {
      const def = missionDef(m.id);
      return { id: m.id, text: def.text, prog: Math.floor(m.prog), goal: def.goal, done: m.done, reward: def.reward, kind: def.kind, pct: Math.min(1, m.prog / def.goal) };
    });
  }

  SN.Shop = { KEY, memWallet, useWallet, getWallet, coins, blank, clean, load, save, price, buy, selectSkin, takeLoadout, worldOpts, runOf, coinsFor, fillMissions, progressMissions, claim, finishRun, missionView, skinDef, upDef, itemDef, missionDef };
})(SN);
