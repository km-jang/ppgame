'use strict';
// 코인 · 상점(캐릭터·강화·시작 아이템) · 미션. DOM을 쓰지 않는다 (node 테스트가 그대로 불러 쓴다: tests/snakeshop.test.js).
// 뿅뿅 우주선 game/js/shop.js와 같은 짜임이다.
//
// 코인은 이 저장본에 두지 않고 지갑(wallet)에 둔다.
//   브라우저: 네 게임이 같이 쓰는 별코인 지갑 HUB (common/hub.js)
//   HUB가 없을 때(파일 하나 미리보기 등): 이 기기 저장소 snake.wallet
//   테스트: memWallet(처음 코인)으로 만든 가짜 지갑을 useWallet으로 끼운다
//
// 저장 키
//   snake.shop1 : { v:2, char, chars:{id:true}, up:{goldTime,itemFreq,comboTime,coin: 0~5},
//                   items:{ghost,slow,double: 개수}, missions:[{id,prog,done}], mseed, life:{earned,games} }
//   예전(v1) 저장본은 skin·skins(색 꾸미기)였다. 읽을 때 캐릭터로 바꾸고, 맞는 캐릭터가 없는 꾸미기는 값을 한 번 돌려준다 (D.OLD_SKINS)
(function (SN) {
  const D = SN.DATA;
  const KEY = 'snake.shop1';
  const WALLET_KEY = 'snake.wallet';

  const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
  const int = v => Math.floor(num(v));
  const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v);
  const charDef = id => D.CHARS.find(s => s.id === id) || null;
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
    const chars = {};
    for (const s of D.CHARS) if (!s.price) chars[s.id] = true;
    const up = {}, items = {};
    for (const u of D.UPGRADES) up[u.id] = 0;
    for (const it of D.START_ITEMS) items[it.id] = 0;
    const st = { v: 2, char: D.CHARS[0].id, chars, up, items, missions: [], mseed: 1, life: { earned: 0, games: 0 } };
    fillMissions(st);
    return st;
  }

  // 예전 꾸미기(v1 skins) → 캐릭터. {chars:{id:true}, pick: 고르던 것의 새 id, refund: 돌려줄 코인, from:[옛 id]}
  function migrateSkins(raw) {
    const out = { chars: {}, pick: null, refund: 0, from: [] };
    if (!isObj(raw) || isObj(raw.chars) || !isObj(raw.skins)) return out;
    for (const id of Object.keys(D.OLD_SKINS)) {
      if (raw.skins[id] !== true) continue;
      const m = D.OLD_SKINS[id];
      out.from.push(id);
      if (m.to && charDef(m.to)) { out.chars[m.to] = true; if (raw.skin === id) out.pick = m.to; }
      else out.refund += int(m.refund);
    }
    return out;
  }

  // 아무 값이나 받아 올바른 모양으로 (망가진 저장본이면 기본값).
  // 예전 꾸미기에서 돌려줄 코인은 st.refund에 적어 둔다 (load가 지갑에 넣고 지운다)
  function clean(raw) {
    const st = blank();
    if (!isObj(raw)) return st;
    if (isObj(raw.chars)) for (const s of D.CHARS) if (raw.chars[s.id] === true) st.chars[s.id] = true;
    if (typeof raw.char === 'string' && st.chars[raw.char]) st.char = raw.char;
    const mig = migrateSkins(raw);
    if (mig.from.length) {
      Object.assign(st.chars, mig.chars);
      if (mig.pick) st.char = mig.pick;
      if (mig.refund > 0) st.refund = mig.refund;
      st.migrated = mig.from;
    }
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
  // 예전 꾸미기 저장본이면 바꾼 것을 바로 저장해서 돌려주기는 한 번만 일어난다.
  // 바꾼 내용은 lastMigration에 남긴다 (main.js가 한 번 알려 준다)
  let lastMigration = null;
  function load(store) {
    const S = store || SN.store;
    const st = clean(S.get(KEY, null));
    if (st.migrated) {
      const refund = st.refund || 0;
      if (refund > 0) getWallet().add(refund);
      lastMigration = { from: st.migrated, refund, chars: Object.keys(st.chars) };
      delete st.refund; delete st.migrated;
      save(st, S);
    }
    return st;
  }
  const save = (st, store) => (store || SN.store).set(KEY, st);
  const takeMigration = () => { const m = lastMigration; lastMigration = null; return m; };

  // ─── 가격 · 사기 ──────────────────────────────────────────
  // 살 수 없으면(이미 가짐·최대 단계·가득) null
  function price(st, id) {
    const s = charDef(id);
    if (s) return st.chars[id] ? null : s.price;
    const u = upDef(id);
    if (u) { const lv = st.up[id] || 0; return lv >= D.UPGRADE_MAX ? null : u.prices[lv]; }
    const it = itemDef(id);
    if (it) return (st.items[id] || 0) >= it.max ? null : it.price;
    return null;
  }

  // 무엇이든 산다 (캐릭터·강화·시작 아이템). {ok, reason: 'owned'|'max'|'coins'|'unknown', cost}
  function buy(st, id) {
    const s = charDef(id), u = upDef(id), it = itemDef(id);
    if (!s && !u && !it) return { ok: false, reason: 'unknown' };
    const cost = price(st, id);
    if (cost == null) return { ok: false, reason: s ? 'owned' : 'max' };
    if (!getWallet().spend(cost)) return { ok: false, reason: 'coins', cost };
    if (s) { st.chars[id] = true; st.char = id; }
    else if (u) st.up[id] = (st.up[id] || 0) + 1;
    else st.items[id] = (st.items[id] || 0) + 1;
    return { ok: true, cost };
  }

  // 가진 캐릭터만 고를 수 있다
  function selectChar(st, id) {
    if (!charDef(id) || !st.chars[id]) return false;
    st.char = id;
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
    return Object.assign({}, base || {}, { up: Object.assign({}, st.up), start: loadout || {}, char: st.char });
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
    // 깜짝 선물 상자 코인 (강화 보너스는 붙지 않는다)
    parts.gift = int(run.giftCoins);
    return { parts, total: base + parts.bonus + parts.gift };
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
    // 선물로 받은 다음 판 시작 아이템: 가방에 하나 더 (가득이면 그만큼 코인)
    for (const id of (run && Array.isArray(run.giftStart) ? run.giftStart : [])) {
      const it = itemDef(id);
      if (!it) continue;
      if ((st.items[id] || 0) < it.max) st.items[id] = (st.items[id] || 0) + 1;
      else { c.parts.gift += D.GIFT.fullCoins; c.total += D.GIFT.fullCoins; }
    }
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

  // 저장된 난이도 읽기: snake.diff('easy'|'normal'|'hard')가 있으면 그것, 없으면 예전 snake.easy(false면 보통, 그 밖엔 쉬움)
  function diffFrom(stored, oldEasy) {
    if (stored === 'easy' || stored === 'normal' || stored === 'hard') return stored;
    return oldEasy === false ? 'normal' : 'easy';
  }

  // 무한 모드 난이도별 최고 기록 적기. best: {easy|normal|hard: {score, len}}. 돌려주는 값: {score: 신기록?, len: 신기록?}
  // 처음 길이 그대로 끝난 판(구슬을 하나도 못 먹음)은 길이 신기록이 아니다, 0점도 점수 신기록이 아니다
  function recordBest(best, diff, score, len) {
    const B = best[diff] || (best[diff] = { score: 0, len: 0 });
    const out = { score: score > B.score && score > 0, len: len > B.len && len > D.START.len };
    if (out.score) B.score = score;
    if (out.len) B.len = len;
    return out;
  }

  SN.Shop = { diffFrom, recordBest, KEY, memWallet, useWallet, getWallet, coins, blank, clean, load, save, takeMigration, price, buy, selectChar, selectSkin: selectChar, takeLoadout, worldOpts, runOf, coinsFor, fillMissions, progressMissions, claim, finishRun, missionView, charDef, skinDef: charDef, upDef, itemDef, missionDef };
})(SN);
