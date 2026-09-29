'use strict';
// 코인 · 상점(캐릭터 · 강화 · 시작 아이템) · 미션. DOM을 쓰지 않는다 (node 테스트가 그대로 불러 쓴다: tests/jumpshop.test.js).
// 뿅뿅 우주선 game/js/shop.js와 같은 짜임.
//
// 저장 키
//   jump.shop1 : { v:2, coins, char, chars:{id:true}, up:{speed,rocket,coin,cloud: 0~5},
//                  items:{rocketStart,shieldStart: 개수}, missions:[{id,prog,done}], mseed, life:{earned,games,diffs:{easy,normal,hard}},
//                  pet: 데리고 다니는 펫 id 또는 null(펫 없음), pets:{id:true} }
//   펫(2026-09-29)이 없던 저장본은 꼬마 별(공짜)을 가진 채 데리고 다니는 것으로 연다 (누구나 펫을 본다)
//   v:1 (예전 꾸미기 skin·skins)은 불러올 때 캐릭터로 옮긴다 (D.OLD_SKINS: 값이 같은 캐릭터로, 없으면 값만큼 코인 한 번 돌려줌)
// 코인은 네 게임이 같이 쓰는 별코인 지갑(common/hub.js, HUB)에 둔다. 지갑은 바꿔 끼울 수 있다 (테스트는 가짜 지갑):
//   wallet = { coins(), setCoins(n), moveIn(game, n) }. 지갑이 없으면 이 저장본의 coins만 쓴다
(function (JP) {
  const D = JP.DATA;
  const KEY = 'jump.shop1';

  const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
  const int = v => Math.floor(num(v));
  const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v);
  const charDef = id => D.CHARS.find(c => c.id === id) || null;
  const upDef = id => D.UPGRADES.find(u => u.id === id) || null;
  const itemDef = id => D.START_ITEMS.find(u => u.id === id) || null;
  const missionDef = id => D.MISSIONS.find(m => m.id === id) || null;
  const petDef = id => D.PETS.find(p => p.id === id) || null;
  const firstPet = () => (D.PETS.find(p => !p.price) || D.PETS[0]).id;

  function blank() {
    const chars = {}, up = {}, items = {}, diffs = {}, pets = {};
    for (const c of D.CHARS) if (!c.price) chars[c.id] = true;
    for (const p of D.PETS) if (!p.price) pets[p.id] = true;
    for (const u of D.UPGRADES) up[u.id] = 0;
    for (const it of D.START_ITEMS) items[it.id] = 0;
    for (const d of D.DIFF_ORDER) diffs[d] = false;
    const st = { v: 2, coins: 0, char: D.CHARS[0].id, chars, up, items, missions: [], mseed: 1, life: { earned: 0, games: 0, diffs }, pet: firstPet(), pets };
    fillMissions(st);
    return st;
  }

  // 아무 값이나 받아 올바른 모양으로 (망가진 저장본이면 기본값)
  function clean(raw) {
    const st = blank();
    if (!isObj(raw)) return st;
    st.coins = int(raw.coins);
    if (isObj(raw.chars)) {
      for (const c of D.CHARS) if (raw.chars[c.id] === true) st.chars[c.id] = true;
      if (typeof raw.char === 'string' && st.chars[raw.char]) st.char = raw.char;
    } else if (isObj(raw.skins)) {
      // 예전 꾸미기 저장본: 값이 같은 캐릭터로 옮기고, 맞는 캐릭터가 없는 것은 값을 돌려줄 몫(refund)으로 모은다.
      // refund는 load가 지갑에 한 번 넣고 곧바로 새 모양(chars)으로 저장하므로 두 번 돌려주지 않는다
      let refund = 0;
      for (const id of Object.keys(D.OLD_SKINS)) {
        if (raw.skins[id] !== true) continue;
        const m = D.OLD_SKINS[id];
        if (m.to && charDef(m.to)) st.chars[m.to] = true; else refund += num(m.refund);
      }
      const was = typeof raw.skin === 'string' && D.OLD_SKINS[raw.skin];
      if (was && was.to && st.chars[was.to]) st.char = was.to;
      if (refund) st.refund = refund;
    }
    // 펫: 가진 펫 · 데리고 다니는 펫 (null = 펫 없음을 고름). 펫 칸이 없던 예전 저장본은 기본(꼬마 별)
    if (isObj(raw.pets)) for (const p of D.PETS) if (raw.pets[p.id] === true) st.pets[p.id] = true;
    if (raw.pet === null || raw.pet === 'none') st.pet = null;
    else if (typeof raw.pet === 'string' && st.pets[raw.pet]) st.pet = raw.pet;
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
    // 예전 꾸미기 값 돌려주기 (한 번만: 곧바로 새 모양으로 저장)
    if (st.refund) {
      st.coins += st.refund;
      delete st.refund;
      save(st, store, Wl);
    }
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
    const c = charDef(id);
    if (c) return st.chars[id] ? null : c.price;
    const pt = petDef(id);
    if (pt) return st.pets[id] ? null : pt.price;
    const u = upDef(id);
    if (u) { const lv = st.up[id] || 0; return lv >= D.UPGRADE_MAX ? null : u.prices[lv]; }
    const it = itemDef(id);
    if (it) return (st.items[id] || 0) >= it.max ? null : it.price;
    return null;
  }

  // 무엇이든 산다 (캐릭터·펫·강화·시작 아이템). 캐릭터·펫은 사면 바로 고른다. {ok, reason: 'owned'|'max'|'coins'|'unknown', cost}
  function buy(st, id) {
    const s = charDef(id), pt = petDef(id), u = upDef(id), it = itemDef(id);
    if (!s && !pt && !u && !it) return { ok: false, reason: 'unknown' };
    const cost = price(st, id);
    if (cost == null) return { ok: false, reason: s || pt ? 'owned' : 'max' };
    if (st.coins < cost) return { ok: false, reason: 'coins', cost };
    st.coins -= cost;
    if (s) { st.chars[id] = true; st.char = id; }
    else if (pt) { st.pets[id] = true; st.pet = id; }
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

  // 펫 고르기: 가진 펫만, null·'none'이면 펫 없이
  function selectPet(st, id) {
    if (id == null || id === 'none') { st.pet = null; return true; }
    if (!petDef(id) || !st.pets[id]) return false;
    st.pet = id;
    return true;
  }

  // 판 시작: 가진 시작 아이템을 하나씩 꺼내 쓴다. 돌려준 값을 World.create opts.loadout으로
  function takeLoadout(st) {
    const lo = {};
    for (const it of D.START_ITEMS) if ((st.items[it.id] || 0) > 0) { st.items[it.id] -= 1; lo[it.give] = true; }
    return lo;
  }
  // World.create에 더할 값
  function worldOpts(st, loadout) {
    return { upgrades: Object.assign({}, st.up), loadout: loadout || {}, char: st.char, pet: st.pet || null };
  }

  // ─── 판 요약 · 코인 ───────────────────────────────────────
  function runOf(W) {
    const r = JP.World.runStats(W);
    return {
      // height: 이번 판에 오른 거리 (미션 "오르기"는 출발 장소에서 시작해도 오른 만큼만) · top: 끝 높이 · start: 출발 높이
      diff: r.diff, height: r.climb != null ? r.climb : r.height, top: r.height, start: r.start || 0, stars: r.stars, springs: r.springs, rockets: r.rockets, saves: r.saves,
      crumbles: r.crumbles || 0, bounces: r.bounces, maxCombo: r.maxCombo, time: Math.floor(r.time), zone: r.zone, stomps: r.stomps || 0, games: 1,
      gifts: r.gifts || 0, giftCoins: r.giftCoins || 0, giftItems: (r.giftItems || []).slice(), fevers: r.fevers || 0, rooms: r.rooms || 0,
      petStars: r.petStars || 0,
    };
  }

  // 코인 계산: 부분별로 돌려준다 (결과 화면에 나눠 보여 줌).
  // run.height = 이번 판에 오른 거리 (runOf). run.start가 있으면 출발 구역까지의 구역 보너스는 없다 (올라서 닿은 구역만)
  function coinsFor(run, st) {
    const C = D.COINS;
    const zoneOfM = m => { let z = 0; D.ZONES.forEach((Z, i) => { if (m >= Z.from) z = i; }); return z; };
    const z = Math.max(0, Math.min(C.zone.length - 1, int(run.zone)));
    const z0 = Math.min(z, zoneOfM(num(run.start)));
    let zone = 0;
    for (let i = z0 + 1; i <= z; i++) zone += C.zone[i];
    const parts = { height: Math.floor(num(run.height) / C.perMeter), stars: Math.floor(num(run.stars) / C.perStars), zone };
    const raw = parts.height + parts.stars + parts.zone;
    parts.level = Math.floor(raw * ((C.level[run.diff] || 1) - 1));   // 보통·어려움 보너스
    const base = raw + parts.level;
    const lv = st ? (st.up.coin || 0) : 0;
    parts.bonus = Math.floor(base * lv * upDef('coin').per);
    // 논 시간: perSec초마다 1코인 (배율 없음)
    parts.time = C.perSec > 0 ? Math.floor(num(run.time) / C.perSec) : 0;
    // 도전 코인: tryTime초 넘게 논 판마다 (배율 없음. 바로 떨어지기만 되풀이해서는 모이지 않게)
    parts.try = num(run.time) >= (C.tryTime || 0) ? int(C.tryCoins) : 0;
    // 깜짝 선물 코인: 난이도·강화 배율 없이 그대로 더한다
    parts.gift = int(run.giftCoins);
    return { parts, total: base + parts.bonus + parts.time + parts.try + parts.gift };
  }

  // ─── 미션 ─────────────────────────────────────────────────
  // 해 본 난이도의 미션만, 지금 걸린 것·방금 끝낸 것은 빼고 고른다 (씨앗으로 정해져 테스트가 같은 결과)
  function fillMissions(st, except) {
    const ok = m => (!m.diff || st.life.diffs[m.diff]) && (!m.pet || !!st.pet);
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
    // 깜짝 선물로 받은 다음 판 시작 아이템 (가득이면 그만큼 코인)
    for (const id of Array.isArray(run.giftItems) ? run.giftItems : []) {
      const it = itemDef(id);
      if (!it) continue;
      if ((st.items[id] || 0) < it.max) st.items[id] = (st.items[id] || 0) + 1;
      else { c.parts.gift += D.GIFT.itemCoins; c.total += D.GIFT.itemCoins; }
    }
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

  JP.Shop = { KEY, blank, clean, load, save, sync, price, buy, selectChar, selectSkin: selectChar, selectPet, takeLoadout, worldOpts, runOf, coinsFor, fillMissions, progressMissions, claim, finishRun, missionView, charDef, petDef, upDef, itemDef, missionDef };
})(JP);
