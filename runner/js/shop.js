'use strict';
// 코인 · 상점 · 미션. DOM을 쓰지 않는다 (저장은 넘겨받은 store를 통해서만). node 테스트가 그대로 불러 쓴다.
// 뿅뿅 우주선 game/js/shop.js와 같은 짜임.
//
// 저장 키
//   runner.shop1 : { v:2, coins, char, chars:{id:true}, up:{magnet,shield,boost,coin: 0~5},
//                    items:{sshield,sboost,sheart: 개수}, missions:[{id,prog,done}], mseed, life:{earned,games} }
//   옛 v1 저장본(skin, skins: 모양만 다른 우주선 6종)은 읽을 때 캐릭터로 옮긴다 (data.js OLD_SKINS:
//   비슷한 캐릭터를 주거나, 없으면 값을 지갑에 한 번 돌려준다). 옮긴 뒤 바로 v2로 저장해서 두 번 돌려주지 않는다
// 코인은 네 게임이 함께 쓰는 별코인 지갑(common/hub.js, HUB)에 둔다. wallet = { coins(), setCoins(n) }.
// load·save에 wallet을 넘기면 그것을 쓰고(테스트의 가짜 지갑), 안 넘기면 HUB, HUB도 없으면 이 저장본의 coins를 쓴다
(function (RN) {
  const D = RN.DATA;
  const KEY = 'runner.shop1';

  const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
  const int = v => Math.floor(num(v));
  const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v);
  const charDef = id => D.CHARS.find(s => s.id === id) || null;
  const upDef = id => D.UPGRADES.find(u => u.id === id) || null;
  const itemDef = id => D.START_ITEMS.find(u => u.id === id) || null;
  const missionDef = id => D.MISSIONS.find(m => m.id === id) || null;

  function blank() {
    const chars = {};
    for (const s of D.CHARS) if (!s.price) chars[s.id] = true;
    const up = {}, items = {};
    for (const u of D.UPGRADES) up[u.id] = 0;
    for (const it of D.START_ITEMS) items[it.id] = 0;
    const st = { v: 2, coins: 0, char: D.CHARS[0].id, chars, up, items, missions: [], mseed: 1, life: { earned: 0, games: 0 } };
    fillMissions(st);
    return st;
  }

  // 옛 꾸미기 → 캐릭터. 가진 것마다 OLD_SKINS를 보고 캐릭터를 주거나 값을 모아 st.refund에 (load가 지갑에 넣는다)
  function migrate(st, raw) {
    let refund = 0;
    if (isObj(raw.skins)) {
      for (const id of Object.keys(D.OLD_SKINS)) {
        if (raw.skins[id] !== true) continue;
        const m = D.OLD_SKINS[id];
        if (m.to && charDef(m.to)) st.chars[m.to] = true;
        else if (m.refund) refund += m.refund;
      }
    }
    const was = typeof raw.skin === 'string' && D.OLD_SKINS[raw.skin];
    if (was && was.to && st.chars[was.to]) st.char = was.to;
    st.migrated = true;
    if (refund) st.refund = refund;
  }

  // 아무 값이나 받아 올바른 모양으로 (망가진 저장본이면 기본값)
  function clean(raw) {
    const st = blank();
    if (!isObj(raw)) return st;
    st.coins = int(raw.coins);
    if (raw.v === 2) {
      if (isObj(raw.chars)) for (const s of D.CHARS) if (raw.chars[s.id] === true) st.chars[s.id] = true;
      if (typeof raw.char === 'string' && st.chars[raw.char]) st.char = raw.char;
    } else migrate(st, raw);
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

  const hubWallet = () => (typeof HUB !== 'undefined' && HUB && HUB.coins && HUB.setCoins ? HUB : null);
  const pickWallet = w => (w !== undefined ? w : hubWallet());
  function load(store, wallet) {
    const S = store || RN.store, raw = S.get(KEY, null);
    const st = clean(raw);
    const W = pickWallet(wallet);
    if (W) { try { st.coins = int(W.coins()); } catch (e) { /* 지갑이 막혀도 게임은 돈다 */ } }
    // 옛 저장본을 옮겼으면: 돌려줄 값을 지갑에 넣고 곧바로 새 모양으로 저장 (한 번만)
    const moved = st.migrated && isObj(raw);
    const refund = st.refund || 0;
    delete st.migrated; delete st.refund;
    if (moved) {
      st.coins += refund;
      save(st, S, wallet);
      if (refund) st.refunded = refund;   // 화면이 한 번 알려 주고 지운다 (저장본에는 남지 않게 clean이 무시)
    }
    return st;
  }
  function save(st, store, wallet) {
    const W = pickWallet(wallet);
    if (W) { try { W.setCoins(st.coins); } catch (e) { /* 무시 */ } }
    (store || RN.store).set(KEY, st);
  }

  // ─── 가격 ─────────────────────────────────────────────────
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

  // 무엇이든 산다 (꾸미기·강화·시작 아이템). {ok, reason: 'owned'|'max'|'coins'|'unknown', cost}
  function buy(st, id) {
    const s = charDef(id), u = upDef(id), it = itemDef(id);
    if (!s && !u && !it) return { ok: false, reason: 'unknown' };
    const cost = price(st, id);
    if (cost == null) return { ok: false, reason: s ? 'owned' : 'max' };
    if (st.coins < cost) return { ok: false, reason: 'coins', cost };
    st.coins -= cost;
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

  // 판 시작: 가진 시작 아이템을 하나씩 꺼내 쓴다 (그 난이도에서 못 쓰는 것은 남겨 둔다)
  function takeLoadout(st, diff) {
    const lo = {};
    for (const it of D.START_ITEMS) {
      if ((st.items[it.id] || 0) <= 0 || (it.not && it.not.indexOf(diff) >= 0)) continue;
      st.items[it.id] -= 1; lo[it.give || it.id] = true;
    }
    return lo;
  }

  // world.js create()에 넘기는 값 (강화 단계·시작 아이템·캐릭터)
  function worldOpts(st, loadout) {
    return { up: Object.assign({}, st.up), loadout: loadout || {}, char: st.char };
  }

  // ─── 판 요약 · 코인 ───────────────────────────────────────
  function runOf(W) {
    const s = RN.World.runStats(W);
    return {
      diff: W.diff, dist: s.dist, stars: s.stars, gates: s.gates, items: s.items, nears: s.nears, perfects: s.perfects,
      boosts: s.boosts, zone: s.zone, milestones: s.milestones, clean: Math.floor(W.clean || 0), time: s.time, games: 1,
      slides: s.slides || 0, bars: s.bars || 0, bhs: s.bhs || 0, pirates: s.pirates || 0,
      gifts: s.gifts || 0, giftCoins: s.giftCoins || 0, giftItems: (s.giftItems || []).slice(), fevers: s.fevers || 0, warps: s.warps || 0,
    };
  }

  // 코인 계산: 부분별로 돌려준다 (결과 화면에 나눠 보여 줌)
  function coinsFor(run, st) {
    const C = D.COINS;
    const parts = {
      dist: Math.floor(num(run.dist) / C.perDist),
      stars: Math.floor(num(run.stars) / C.perStar),
      arch: int(run.milestones) * C.perArch,
      zone: int(run.zone) * C.perZone,
    };
    const base = parts.dist + parts.stars + parts.arch + parts.zone;
    const mul = C.diffMul[run.diff] || 1;
    parts.diff = Math.floor(base * mul) - base;
    const lv = st ? (st.up.coin || 0) : 0;
    parts.bonus = Math.floor((base + parts.diff) * lv * upDef('coin').per);
    // 깜짝 선물 상자에서 나온 코인은 배율 없이 그대로 더한다
    parts.gift = int(run.giftCoins);
    return { parts, total: base + parts.diff + parts.bonus + parts.gift };
  }

  // 선물 상자에서 나온 다음 판 시작 아이템을 넣는다. 가득이면 그 대신 코인 (GIFT.fullCoins). 더한 코인 수
  function giveGiftItems(st, ids) {
    let coins = 0;
    for (const id of Array.isArray(ids) ? ids : []) {
      const it = itemDef(id);
      if (!it) continue;
      if ((st.items[id] || 0) < it.max) st.items[id] = (st.items[id] || 0) + 1;
      else coins += D.GIFT.fullCoins;
    }
    return coins;
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
    if (st.missions.length > before) st.missions.splice(index, 0, st.missions.pop());   // 받은 자리에 새 미션
    return def.reward;
  }

  // 판이 끝났을 때: 코인 지급 + 미션 진행. {coins, parts, done:[새로 끝난 미션 id]}
  function finishRun(st, run) {
    const c = coinsFor(run, st);
    const extra = giveGiftItems(st, run.giftItems);
    if (extra) { c.parts.gift += extra; c.total += extra; }
    st.coins += c.total;
    st.life.earned += c.total;
    st.life.games += 1;
    const done = progressMissions(st, run);
    return { coins: c.total, parts: c.parts, done };
  }

  // 미션 화면 글: {text, prog, goal, done, reward, pct}
  function missionView(st) {
    return st.missions.map(m => {
      const def = missionDef(m.id);
      return { id: m.id, text: def.text, prog: Math.floor(m.prog), goal: def.goal, done: m.done, reward: def.reward, kind: def.kind, pct: Math.min(1, m.prog / def.goal) };
    });
  }

  RN.Shop = { KEY, blank, clean, load, save, price, buy, selectChar, selectSkin: selectChar, charDef, skinDef: charDef, takeLoadout, worldOpts, runOf, coinsFor, fillMissions, progressMissions, claim, finishRun, giveGiftItems, missionView, upDef, itemDef, missionDef };
})(RN);
