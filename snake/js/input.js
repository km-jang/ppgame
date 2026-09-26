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

    // 밀기: 누른 자리에서 기준 거리 이상 움직이면 큰 축 방향으로 한 번 꺾는다.
    // 꺾은 뒤에는 그 자리를 새 기준으로 삼아, 손을 떼지 않고 ㄱ자로 밀어도 두 번 꺾인다
    const ptrs = new Map();
    el.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      S.used = S.used || e.pointerType !== 'mouse';
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, last: null });
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
    });
    el.addEventListener('pointermove', e => {
      const p = ptrs.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < S.threshold) return;
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      p.x = e.clientX; p.y = e.clientY;
      if (dir === p.last) return; // 같은 방향으로 계속 미는 건 한 번만
      p.last = dir;
      if (S.onDir) S.onDir(dir);
    });
    const end = e => ptrs.delete(e.pointerId);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('contextmenu', e => e.preventDefault());

    S.reset = () => ptrs.clear();
    return S;
  }

  SN.createInput = createInput;
})(SN);
