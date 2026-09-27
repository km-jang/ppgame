'use strict';
// 좌우 입력: 화면 왼쪽 절반을 누르고 있으면 왼쪽, 오른쪽 절반이면 오른쪽 (크고 단순하게).
// 키보드는 ← → 또는 A D. 그 밖의 키는 onKey(code)로 알린다 (main.js가 채운다).
// 그리기: render.js가 S.side(지금 누른 쪽)를 읽어 양옆 화살표를 밝힌다.
(function (JP) {
  const KEY_DIR = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1 };

  function createInput(el) {
    const S = { onKey: null, onPress: null, side: 0, used: false };
    const keys = new Set();
    const ptrs = new Map();   // 누르고 있는 손가락마다 어느 쪽인지 (마지막에 누른 손가락이 이긴다)
    let order = 0;

    window.addEventListener('keydown', e => {
      const d = KEY_DIR[e.code];
      if (d || e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'ArrowDown') e.preventDefault();
      if (d) { keys.add(e.code); if (S.onPress) S.onPress(); return; }
      if (e.repeat) return;
      if (S.onKey) S.onKey(e.code);
    });
    window.addEventListener('keyup', e => keys.delete(e.code));
    window.addEventListener('blur', () => { keys.clear(); ptrs.clear(); });

    const sideOf = e => {
      const r = el.getBoundingClientRect();
      return e.clientX - r.left < r.width / 2 ? -1 : 1;
    };
    el.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      // 손바닥 무시: 닿은 면이 아주 넓으면 손가락이 아니다
      if (e.pointerType === 'touch' && (e.width > 70 || e.height > 70)) return;
      S.used = S.used || e.pointerType !== 'mouse';
      ptrs.set(e.pointerId, { side: sideOf(e), n: ++order });
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
      if (S.onPress) S.onPress(e.pointerType !== 'mouse');
    });
    // 누른 채로 반대쪽으로 옮기면 방향도 바뀐다
    el.addEventListener('pointermove', e => {
      const s = ptrs.get(e.pointerId);
      if (s) s.side = sideOf(e);
    });
    const end = e => ptrs.delete(e.pointerId);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
    el.addEventListener('contextmenu', e => e.preventDefault());

    // 지금 방향: 키보드가 눌려 있으면 키보드, 아니면 가장 나중에 누른 손가락
    S.dir = () => {
      let k = 0;
      for (const c of keys) k += KEY_DIR[c];
      if (k) { S.side = k > 0 ? 1 : -1; return S.side; }
      let best = null;
      for (const p of ptrs.values()) if (!best || p.n > best.n) best = p;
      S.side = best ? best.side : 0;
      return S.side;
    };
    S.reset = () => { ptrs.clear(); keys.clear(); S.side = 0; };
    return S;
  }

  JP.createInput = createInput;
})(JP);
