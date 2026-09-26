'use strict';
// 전역 네임스페이스. 다른 스크립트는 모두 이 파일 다음에 로드된다.
var SN = {};

(function (SN) {
  // xorshift32: 시드가 같으면 같은 판이 나온다 (테스트용)
  SN.rng = function (seed) {
    let s = (seed >>> 0) || 0x9e3779b9;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  };

  SN.clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  SN.dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
  SN.lerp = (a, b, t) => a + (b - a) * t;

  // 가중치 목록에서 하나 뽑기. items: [{w, ...}]
  SN.weighted = function (items, rand) {
    let total = 0;
    for (const it of items) total += it.w;
    let r = rand() * total;
    for (const it of items) { r -= it.w; if (r < 0) return it; }
    return items[items.length - 1];
  };

  // 브라우저 저장소. 막혀 있어도(사생활 보호 창 등) 게임은 돈다.
  SN.store = {
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

  SN.fmtTime = function (sec) {
    const s = Math.floor(sec);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };
})(SN);
