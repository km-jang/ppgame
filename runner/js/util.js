'use strict';
// 전역 네임스페이스. 다른 스크립트는 모두 이 파일 다음에 로드된다.
var RN = {};

(function (RN) {
  // xorshift32: 시드가 같으면 같은 판이 나온다 (테스트용)
  RN.rng = function (seed) {
    let s = (seed >>> 0) || 0x9e3779b9;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  };

  RN.clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  RN.dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
  RN.lerp = (a, b, t) => a + (b - a) * t;

  // 가중치 목록에서 하나 뽑기. items: [{w, ...}]
  RN.weighted = function (items, rand) {
    let total = 0;
    for (const it of items) total += it.w;
    let r = rand() * total;
    for (const it of items) { r -= it.w; if (r < 0) return it; }
    return items[items.length - 1];
  };

  // 브라우저 저장소. 막혀 있어도(사생활 보호 창 등) 게임은 돈다.
  RN.store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v == null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 무시 */ }
    },
  };


  // ─── 이 기기에 기억하는 것 (난이도·기록·처음 안내). store = { get(key, fallback), set(key, value) } ───
  // 옛 키도 이어받는다: runner.easy(true/false, 쉬움·보통 두 단계였을 때) → runner.diff
  const DIFFS = ['easy', 'normal', 'hard'];
  const blankBest = () => ({ dist: 0, score: 0, stars: 0 });
  RN.Prefs = {
    KEYS: { diff: 'runner.diff', easy: 'runner.easy', rec: 'runner.rec', tut: 'runner.tut', muted: 'runner.muted' },
    // 난이도: 'easy' | 'normal' | 'hard' (처음이면 쉬움)
    diff(store) {
      const d = store.get(this.KEYS.diff, null);
      if (DIFFS.indexOf(d) >= 0) return d;
      const old = store.get(this.KEYS.easy, null);
      const id = old === false ? 'normal' : 'easy';
      if (old != null) store.set(this.KEYS.diff, id);
      return id;
    },
    setDiff(store, id) { if (DIFFS.indexOf(id) >= 0) store.set(this.KEYS.diff, id); },
    blankRec() { return { v: 2, best: { easy: blankBest(), normal: blankBest(), hard: blankBest() }, total: { games: 0, stars: 0, dist: 0 }, medals: {} }; },
    // 기록 장부: 난이도별 최고 기록 + 모두 합친 수 + 메달. 옛 장부(최고 기록 하나)는 그때 고른 난이도의 최고 기록으로 옮긴다
    rec(store) {
      const r = this.blankRec(), got = store.get(this.KEYS.rec, null);
      if (!got || typeof got !== 'object') return r;
      if (got.total && typeof got.total === 'object') Object.assign(r.total, got.total);
      if (got.medals && typeof got.medals === 'object') Object.assign(r.medals, got.medals);
      const b = got.best || {};
      if (got.v === 2) {
        for (const d of DIFFS) if (b[d] && typeof b[d] === 'object') Object.assign(r.best[d], b[d]);
      } else if (typeof b.dist === 'number' || typeof b.score === 'number') {
        const old = store.get(this.KEYS.easy, null) === false ? 'normal' : 'easy';
        Object.assign(r.best[old], b);
        store.set(this.KEYS.rec, r);
      }
      return r;
    },
    // 처음 한 번 나오는 안내를 아직 안 봤나
    tutorialPending(store) { return !store.get(this.KEYS.tut, false); },
    markTutorial(store) { store.set(this.KEYS.tut, 1); },
  };

  RN.fmtTime = function (sec) {
    const s = Math.floor(sec);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };
})(RN);
