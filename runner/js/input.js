'use strict';
// 키보드·밀기(스와이프)·누르기 입력을 동작('left' 'right' 'jump')으로 바꾼다.
// 동작이 정해지면 onMove(dir, touch), 그 밖의 키는 onKey(code)로 알린다 (main.js가 채운다).
(function (RN) {
  const KEY_MOVE = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'jump', KeyW: 'jump', Space: 'jump',
  };
  // 밀기 방향 → 동작 (아래로 밀기는 쓰지 않는다)
  const SWIPE_MOVE = { left: 'left', right: 'right', up: 'jump' };

  function createInput(el) {
    const S = { onMove: null, onKey: null, threshold: 24, used: false, active: false };

    window.addEventListener('keydown', e => {
      const mv = KEY_MOVE[e.code];
      if (mv || e.code === 'ArrowDown') e.preventDefault();
      if (e.repeat) return;
      // 게임 중이 아니면 스페이스는 다른 키처럼 onKey로 (시작·다시 하기)
      if (mv && S.onMove && S.active) S.onMove(mv, false);
      else if (S.onKey) S.onKey(e.code);
    });

    // 밀기: 화면 아무 데서나 옆으로 밀면 줄 바꾸기, 위로 밀면 점프 (냠냠 뱀과 같은 손맛).
    // 기준 거리만큼 움직일 때마다 그 자리를 새 기준으로 삼아, 손을 떼지 않고 오른쪽 → 왼쪽으로 밀어도 두 번 움직인다.
    // 아주 빠르게 튕기듯 밀어 움직임 신호가 모자라도 손을 뗄 때 한 번 더 살핀다.
    // 거의 안 움직이고 뗐으면 누르기: 화면 왼쪽 3분의 1은 왼쪽, 오른쪽 3분의 1은 오른쪽, 가운데는 점프.
    // 그리기: render.js가 S.swipe(민 자리 화살표)를 읽는다
    S.swipe = null;
    const ptrs = new Map();
    function local(e) { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width }; }
    const axis = (dx, dy) => Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    function fire(s, dir, x, y, touch) {
      if (dir === s.last) return;   // 같은 방향으로 계속 미는 건 한 번만
      s.last = dir; s.turned = true;
      const mv = SWIPE_MOVE[dir];
      if (!mv) return;
      S.swipe = { dir, x, y, t: performance.now() };
      if (S.onMove) S.onMove(mv, touch);
    }
    el.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      // 손바닥: 닿은 면적이 아주 크면 무시
      if (e.width > 70 && e.height > 70) return;
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
      ptrs.delete(e.pointerId);
      if (!s || s.turned) return;
      const p = local(e), dx = p.x - s.sx, dy = p.y - s.sy;
      // 빠른 튕기기: 누른 자리에서 뗀 자리까지가 기준의 절반 이상이면 민 것으로
      if (Math.max(Math.abs(dx), Math.abs(dy)) >= S.threshold * 0.5) { fire(s, axis(dx, dy), p.x, p.y, s.touch); return; }
      // 누르기: 화면을 세 칸으로 나눠 왼쪽·점프·오른쪽
      const third = p.w / 3, dir = s.sx < third ? 'left' : s.sx > third * 2 ? 'right' : 'up';
      fire(s, dir, s.sx, s.sy, s.touch);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', e => ptrs.delete(e.pointerId));
    el.addEventListener('contextmenu', e => e.preventDefault());

    S.reset = () => { ptrs.clear(); S.swipe = null; };
    return S;
  }

  RN.createInput = createInput;
})(RN);
