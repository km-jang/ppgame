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
    // 손바닥 무시: 닿은 면적이 크면(SN.DATA.SWIPE.palm px 넘게) 손바닥이나 쥔 손으로 보고 따라가지 않는다
    const SW = (SN.DATA && SN.DATA.SWIPE) || {};
    const palm = e => e.pointerType === 'touch' && SW.palm > 0 && ((e.width || 0) > SW.palm || (e.height || 0) > SW.palm);
    el.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (palm(e)) return;
      S.used = S.used || e.pointerType !== 'mouse';
      const p = local(e);
      ptrs.set(e.pointerId, { ox: p.x, oy: p.y, sx: p.x, sy: p.y, last: null, turned: false, touch: e.pointerType !== 'mouse', t0: performance.now() });
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
    });
    el.addEventListener('pointermove', e => {
      const s = ptrs.get(e.pointerId);
      if (!s) return;
      if (palm(e)) { ptrs.delete(e.pointerId); return; }   // 누르다가 손바닥이 닿으면 그 손가락은 그만 본다
      const p = local(e), dx = p.x - s.ox, dy = p.y - s.oy;
      // 다른 손가락이 함께 화면에 있고 이 손가락이 한참 가만히 있었으면(쥔 손) 조금 더 밀어야 꺾인다. 한 손가락으로 미는 것은 그대로
      const rest = ptrs.size > 1 && !s.turned && performance.now() - s.t0 > (SW.restAfter || 0.5) * 1000;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < S.threshold * (rest ? SW.restMul || 1 : 1)) return;
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
