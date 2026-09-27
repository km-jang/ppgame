'use strict';
// 기록과 메달. DOM을 쓰지 않는다 (저장은 NG.store를 통해서만, 막혀 있으면 조용히 건너뜀).
// node 테스트가 그대로 불러 쓴다.
//
// 저장 키
//   ngun.rec1  : { v:1, best:{easy|normal|hard:{score,wave,kills,time,combo}},
//                  life:{games,kills,bosses,ults,time}, medals:{id:'YYYY-MM-DD'},
//                  bossKinds:{보스 id:'YYYY-MM-DD'} }  (보스 스티커, 2026-09-27. 없던 저장본은 빈 칸)
//   ngun.best2 : 예전 키 {easy:{score,wave},...}. 계속 같이 써서 옛 화면·기록과 맞춘다
(function (NG) {
  const D = NG.DATA;
  const KEY = 'ngun.rec1';
  const OLD_KEY = 'ngun.best2';
  const OLDEST_KEY = 'ngun.best';
  const DIFFS = ['easy', 'normal', 'hard'];
  const BEST_FIELDS = ['score', 'wave', 'kills', 'time', 'combo'];
  const LIFE_FIELDS = ['games', 'kills', 'bosses', 'ults', 'time'];

  // 저장소에서 읽은 값은 믿지 않는다: 숫자가 아니거나 음수면 0
  const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
  const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v);

  function blankBest() { return { score: 0, wave: 0, kills: 0, time: 0, combo: 0 }; }
  function blank() {
    const best = {};
    for (const d of DIFFS) best[d] = blankBest();
    return { v: 1, best, life: { games: 0, kills: 0, bosses: 0, ults: 0, time: 0 }, medals: {}, bossKinds: {} };
  }

  // 아무 값이나 받아서 올바른 모양의 기록으로 (망가진 저장본이 와도 게임이 안 멈추게)
  function clean(raw) {
    const r = blank();
    if (!isObj(raw)) return r;
    if (isObj(raw.best)) for (const d of DIFFS) if (isObj(raw.best[d])) for (const f of BEST_FIELDS) r.best[d][f] = num(raw.best[d][f]);
    if (isObj(raw.life)) for (const f of LIFE_FIELDS) r.life[f] = num(raw.life[f]);
    if (isObj(raw.medals)) {
      const ids = new Set(D.MEDALS.map(m => m.id));
      for (const id of Object.keys(raw.medals)) if (ids.has(id)) r.medals[id] = typeof raw.medals[id] === 'string' ? raw.medals[id].slice(0, 10) : '';
    }
    if (isObj(raw.bossKinds)) {
      const ids = new Set((D.BOSSES || []).map(b => b.id));
      for (const id of Object.keys(raw.bossKinds)) if (ids.has(id)) r.bossKinds[id] = typeof raw.bossKinds[id] === 'string' ? raw.bossKinds[id].slice(0, 10) : '';
    }
    return r;
  }

  // 옛 최고 기록(점수·웨이브)을 합친다. 둘 중 큰 값
  function mergeOld(r, old) {
    if (!isObj(old)) return r;
    for (const d of DIFFS) {
      if (!isObj(old[d])) continue;
      r.best[d].score = Math.max(r.best[d].score, num(old[d].score));
      r.best[d].wave = Math.max(r.best[d].wave, num(old[d].wave));
    }
    return r;
  }

  function load(store) {
    store = store || NG.store;
    const r = clean(store.get(KEY, null));
    let old = store.get(OLD_KEY, null);
    if (!isObj(old)) {
      // 난이도 도입 전 기록은 '보통'으로
      const oldest = store.get(OLDEST_KEY, null);
      old = isObj(oldest) ? { normal: oldest } : null;
    }
    return mergeOld(r, old);
  }

  function save(rec, store) {
    store = store || NG.store;
    store.set(KEY, rec);
    const old = {};
    for (const d of DIFFS) old[d] = { score: rec.best[d].score, wave: rec.best[d].wave };
    store.set(OLD_KEY, old);
  }

  // 한 판의 기록 (판 도중에도 부를 수 있다)
  function runOf(W) {
    const s = W.stats;
    return {
      diff: W.diff.id, score: W.score, wave: W.wave, kills: s.kills, time: s.time,
      bossKills: W.bossKills, maxN: W.player.gun.barrels, ults: s.ults, dashes: s.dashes,
      cleanWaves: s.cleanWaves, cleanBoss: s.cleanBoss, bestCombo: s.bestCombo,
      ultBoss: s.ultBoss, ultBest: s.ultBest, picks: s.picks.length,
    };
  }

  // 평생 기록 + 이번 판. finished면 판 수도 하나 더한다 (판 도중엔 아직 안 끝났으니 안 더함)
  function lifeWith(life, run, finished) {
    return {
      games: life.games + (finished ? 1 : 0),
      kills: life.kills + run.kills,
      bosses: life.bosses + run.bossKills,
      ults: life.ults + run.ults,
      time: life.time + run.time,
    };
  }

  // 아직 없는 메달 중 이번 판으로 딴 것
  function newMedals(rec, run, finished) {
    const L = lifeWith(rec.life, run, finished);
    const out = [];
    for (const m of D.MEDALS) {
      if (rec.medals[m.id] != null) continue;
      let ok = false;
      try { ok = !!m.check(run, L); } catch (e) { ok = false; }
      if (ok) out.push(m);
    }
    return out;
  }

  function award(rec, medals, date) {
    const day = date || new Date().toISOString().slice(0, 10);
    for (const m of medals) if (rec.medals[m.id] == null) rec.medals[m.id] = day;
    return rec;
  }

  // 판이 끝났을 때: 난이도별 최고 기록·평생 합계를 갱신하고, 깬 기록 이름 목록을 돌려준다
  function finish(rec, run) {
    const d = DIFFS.indexOf(run.diff) >= 0 ? run.diff : 'normal';
    const b = rec.best[d];
    const now = { score: run.score, wave: run.wave, kills: run.kills, time: run.time, combo: run.bestCombo };
    const broken = [];
    for (const f of BEST_FIELDS) {
      const v = num(now[f]);
      if (v > b[f]) { if (b[f] > 0 || f === 'score') broken.push(f); b[f] = v; }
    }
    rec.life = lifeWith(rec.life, run, true);
    return broken;
  }

  const count = rec => Object.keys(rec.medals).length;

  // 보스 스티커: 이번 판에 이긴 보스 종류(ids) 중 처음 이긴 것을 기록에 넣고 그 id 목록을 돌려준다
  function addBossKinds(rec, ids, date) {
    const day = date || new Date().toISOString().slice(0, 10);
    const known = new Set((D.BOSSES || []).map(b => b.id));
    const fresh = [];
    for (const id of Array.isArray(ids) ? ids : []) {
      if (!known.has(id) || rec.bossKinds[id] != null) continue;
      rec.bossKinds[id] = day;
      fresh.push(id);
    }
    return fresh;
  }
  // 지금까지 이긴 보스 종류 수 (놀이 본부 스티커 bossKinds)
  const bossKindCount = rec => Object.keys(rec.bossKinds || {}).length;

  NG.Records = { KEY, OLD_KEY, DIFFS, blank, clean, load, save, runOf, lifeWith, newMedals, award, finish, count, addBossKinds, bossKindCount };
})(NG);
