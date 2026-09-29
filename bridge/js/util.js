'use strict';
// 슥슥 우주 다리 전역 이름공간. 다른 스크립트는 모두 이 파일 다음에 로드된다 (lib/planck.min.js만 먼저).
var BR = {};

(function (BR) {
  BR.clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  BR.lerp = (a, b, t) => a + (b - a) * t;
  BR.dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

  // xorshift32: 씨앗이 같으면 같은 수열 (그림 꾸밈·테스트용)
  BR.rng = function (seed) {
    let s = (seed >>> 0) || 0x9e3779b9;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  };

  // 브라우저 저장소. 막혀 있어도(사생활 보호 창 등) 게임은 돈다. 아이마다 따로 나누기는 common/profile.js가 한다
  BR.store = {
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

  BR.fmtTime = function (sec) {
    const s = Math.floor(sec);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };
})(BR);
