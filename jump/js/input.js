'use strict';
// 좌우 입력 두 가지 (손가락마다 저절로 고른다):
//   누르기: 화면 왼쪽 절반을 누르고 있으면 왼쪽, 오른쪽 절반이면 오른쪽 (크고 단순하게)
//   끌기: 누른 채 옆으로 밀면 (D.DRAG.start px 넘게) 주인공이 손가락을 따라간다. 손가락을 멈추면 주인공도 멈춘다
// 키보드는 ← → 또는 A D. 그 밖의 키는 onKey(code)로 알린다 (main.js가 채운다).
// 그리기: render.js가 S.side(지금 누른 쪽)를 읽어 양옆 화살표를 밝힌다.
(function (JP) {
  const KEY_DIR = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1 };

  function createInput(el) {
    const S = { onKey: null, onPress: null, side: 0, used: false, drag: false };
    const keys = new Set();
    const ptrs = new Map();   // 누르고 있는 손가락마다 어느 쪽인지 (마지막에 누른 손가락이 이긴다)
    let order = 0;
    let pending = 0, prevX = null;   // 끌기: 주인공이 더 가야 할 거리(점) · 지난번 주인공 x
    let steer = null;                // 지금 방향을 정하는 손가락 (바뀌면 끌기 값을 새로 시작한다)

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
    const palm = e => e.pointerType === 'touch' && (e.width > 70 || e.height > 70);
    const adopt = e => {
      ptrs.set(e.pointerId, { side: sideOf(e), n: ++order, x0: e.clientX, x: e.clientX, last: e.clientX, drag: false });
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
    };
    el.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      // 손바닥 무시: 닿은 면이 아주 넓으면 손가락이 아니다
      if (palm(e)) return;
      S.used = S.used || e.pointerType !== 'mouse';
      adopt(e);
      if (S.onPress) S.onPress(e.pointerType !== 'mouse');
    });
    // 누른 채로 반대쪽으로 옮기면 방향도 바뀐다. 옆으로 조금 넘게 밀면 끌기로 바뀐다
    el.addEventListener('pointermove', e => {
      let s = ptrs.get(e.pointerId);
      // 모르는 손가락인데 눌려 있으면 (멈춤 화면 동안 계속 누르고 있던 손가락) 다시 받아들인다
      if (!s) {
        const down = e.pointerType === 'touch' ? e.pressure > 0 || e.buttons > 0 : (e.buttons & 1) === 1;
        if (!down || palm(e)) return;
        adopt(e);
        s = ptrs.get(e.pointerId);
      }
      s.side = sideOf(e);
      s.x = e.clientX;
      if (!s.drag && Math.abs(s.x - s.x0) > JP.DATA.DRAG.start) { s.drag = true; s.last = s.x0; pending = 0; prevX = null; }
    });
    const end = e => ptrs.delete(e.pointerId);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
    el.addEventListener('contextmenu', e => e.preventDefault());

    // 지금 방향 (-1 ~ 1): 키보드가 눌려 있으면 키보드, 아니면 가장 나중에 누른 손가락.
    // 끌기 중이면 W(주인공 위치)와 v(화면 배율 v.scale)로 손가락을 따라갈 방향과 세기를 낸다
    S.dir = (W, v) => {
      let k = 0;
      for (const c of keys) k += KEY_DIR[c];
      if (k) { S.side = k > 0 ? 1 : -1; S.drag = false; return S.side; }
      let best = null;
      for (const p of ptrs.values()) if (!best || p.n > best.n) best = p;
      // 방향을 정하는 손가락이 바뀌면 (두 번째 손가락을 대거나 뗐을 때) 모든 손가락의 끌기 기준을 지금 자리로, 밀린 거리는 0으로.
      // 그러지 않으면 쉬던 손가락이 그동안 움직인 거리가 한꺼번에 더해져 주인공이 갑자기 튄다
      if (best !== steer) { steer = best; for (const p of ptrs.values()) p.last = p.x; pending = 0; prevX = null; }
      S.drag = !!(best && best.drag && W && W.p && v && v.scale > 0);
      if (!S.drag) { S.side = best ? best.side : 0; prevX = null; for (const p of ptrs.values()) p.last = p.x; return S.side; }
      const G = JP.DATA.DRAG, WW = JP.DATA.WORLD.w;
      // 주인공이 지난번부터 간 만큼 빼고 (한쪽 끝을 넘어 반대쪽으로 들어간 것은 짧은 쪽으로 잰다)
      if (prevX !== null) {
        let moved = W.p.x - prevX;
        if (moved > WW / 2) moved -= WW; else if (moved < -WW / 2) moved += WW;
        if (moved * pending > 0) pending = Math.abs(moved) >= Math.abs(pending) ? 0 : pending - moved;
      }
      prevX = W.p.x;
      // 손가락이 새로 간 만큼 더한다
      pending += (best.x - best.last) / v.scale * G.gain;
      for (const p of ptrs.values()) p.last = p.x;   // 다른 손가락도 함께 (나중에 그 손가락이 이어받아도 튀지 않게)
      const lim = WW * G.max;
      pending = Math.max(-lim, Math.min(lim, pending));
      let d = Math.max(-1, Math.min(1, pending / G.full));
      if (Math.abs(d) < G.dead) { d = 0; pending = 0; }
      S.side = d > 0 ? 1 : d < 0 ? -1 : 0;
      return d;
    };
    S.reset = () => { ptrs.clear(); keys.clear(); S.side = 0; S.drag = false; pending = 0; prevX = null; steer = null; };
    // 멈춤 · 다시 하기: 누르고 있는 손가락은 그대로 두고 끌기 값만 새로 (계속하기 뒤에도 손가락이 바로 먹힌다)
    S.soft = () => { for (const p of ptrs.values()) { p.x0 = p.x; p.last = p.x; p.drag = false; } keys.clear(); S.side = 0; S.drag = false; pending = 0; prevX = null; steer = null; };
    return S;
  }

  JP.createInput = createInput;
})(JP);
