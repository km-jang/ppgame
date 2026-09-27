'use strict';
// 키보드·밀기(스와이프) 입력을 방향('up' 'down' 'left' 'right')으로 바꾼다.
// 방향이 정해지면 onDir(dir), 그 밖의 키는 onKey(code)로 알린다 (main.js가 채운다).
(function (SN) {
  const KEY_DIR = {
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  };

  function createInput(el) {
    const S = { onDir: null, onKey: null, threshold: 24, used: false };

    window.addEventListener('keydown', e => {
      const dir = KEY_DIR[e.code];
      if (dir || e.code === 'Space') e.preventDefault();
      if (e.repeat) return;
      if (dir && S.onDir) S.onDir(dir);
      else if (S.onKey) S.onKey(e.code);
    });

    // 밀기(스와이프): 화면 아무 데서나 손가락으로 밀면 민 방향으로 꺾는다 (조이스틱은 없다, 2026-09-27 소유자 결정).
    // 기준 거리만큼 움직일 때마다 그 자리를 새 기준으로 삼아, 손을 떼지 않고 ㄱ자로 밀어도 두 번 꺾인다.
    // 아주 빠르게 튕기듯 밀어 움직임 신호가 모자라도 손을 뗄 때 한 번 더 살핀다.
    // 그리기: render.js가 S.swipe(민 자리 화살표)를 읽는다
    S.swipe = null;
    const ptrs = new Map();
    function local(e) { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    const axis = (dx, dy) => Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    function fire(s, dir, x, y, touch) {
      if (dir === s.last) return; // 같은 방향으로 계속 미는 건 한 번만
      s.last = dir; s.turned = true;
      S.swipe = { dir, x, y, t: performance.now() };
      if (S.onDir) S.onDir(dir, touch);
    }
    el.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      S.used = S.used || e.pointerType !== 'mouse';
      const p = local(e);
      ptrs.set(e.pointerId, { ox: p.x, oy: p.y, sx: p.x, sy: p.y, last: null, turned: false, touch: e.pointerType !== 'mouse' });
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
    });
    el.addEventListener('pointermove', e => {
      const s = ptrs.get(e.pointerId);
      if (!s) return;
      const p = local(e), dx = p.x - s.ox, dy = p.y - s.oy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < S.threshold) return;
      s.ox = p.x; s.oy = p.y;
      fire(s, axis(dx, dy), p.x, p.y, s.touch);
    });
    const end = e => {
      const s = ptrs.get(e.pointerId);
      if (s && !s.turned) {
        // 빠른 튕기기: 누른 자리에서 뗀 자리까지가 기준의 절반 이상이면 꺾는다
        const p = local(e), dx = p.x - s.sx, dy = p.y - s.sy;
        if (Math.max(Math.abs(dx), Math.abs(dy)) >= S.threshold * 0.5) fire(s, axis(dx, dy), p.x, p.y, s.touch);
      }
      ptrs.delete(e.pointerId);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', e => ptrs.delete(e.pointerId));
    el.addEventListener('contextmenu', e => e.preventDefault());

    S.reset = () => { ptrs.clear(); S.swipe = null; };
    return S;
  }

  SN.createInput = createInput;
})(SN);
