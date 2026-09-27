'use strict';
// 키보드·조이스틱(밀기 포함) 입력을 방향('up' 'down' 'left' 'right')으로 바꾼다.
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

    // 두 가지 손가락 조작 (둘 다 늘 켜져 있다):
    // 1) 조이스틱: 오른쪽 아래 작은 스틱 근처를 누르면 스틱. 손잡이를 기준 거리 이상 밀면 큰 축 방향으로 꺾는다.
    //    반경 밖으로 끌면 받침이 따라와서 반대로 틀 때 가운데까지 되돌아갈 필요가 없다
    // 2) 밀기(스와이프): 그 밖의 아무 데서나 손가락으로 밀면 민 방향으로 꺾는다. 기준 거리만큼 움직일 때마다
    //    그 자리를 새 기준으로 삼아, 손을 떼지 않고 ㄱ자로 밀어도 두 번 꺾인다. 아주 빠르게 튕기듯 밀어
    //    움직임 신호가 모자라도 손을 뗄 때 한 번 더 살핀다
    // 그리기: render.js가 S.stick·S.home·S.radius(스틱)와 S.swipe(밀기 화살표)를 읽는다
    S.home = { x: 0, y: 0 }; S.radius = 50; S.stick = null; S.swipe = null;
    const ptrs = new Map();
    function local(e) { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    const axis = (dx, dy) => Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    function fire(s, dir, x, y) {
      if (dir === s.last) return; // 같은 방향으로 계속 미는 건 한 번만
      s.last = dir; s.turned = true;
      if (!s.stick) S.swipe = { dir, x, y, t: performance.now() };
      if (S.onDir) S.onDir(dir);
    }
    el.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      S.used = S.used || e.pointerType !== 'mouse';
      const p = local(e), R = S.radius, h = S.home;
      const s = { ox: p.x, oy: p.y, kx: p.x, ky: p.y, sx: p.x, sy: p.y, last: null, turned: false, stick: false };
      if (e.pointerType !== 'mouse' && Math.hypot(p.x - h.x, p.y - h.y) < R * 1.8) {
        s.stick = true; s.ox = h.x; s.oy = h.y; S.stick = s;
      }
      ptrs.set(e.pointerId, s);
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
      if (s.stick) knob(s, p.x, p.y);
    });
    function knob(s, x, y) {
      const R = S.radius;
      let dx = x - s.ox, dy = y - s.oy;
      const d = Math.hypot(dx, dy);
      if (d > R) { s.ox = x - dx / d * R; s.oy = y - dy / d * R; dx = dx / d * R; dy = dy / d * R; }
      s.kx = s.ox + dx; s.ky = s.oy + dy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < Math.min(S.threshold, R * 0.45)) return;
      fire(s, axis(dx, dy), x, y);
    }
    function swipe(s, x, y) {
      const dx = x - s.ox, dy = y - s.oy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < S.threshold) return;
      s.ox = x; s.oy = y;
      fire(s, axis(dx, dy), x, y);
    }
    el.addEventListener('pointermove', e => {
      const s = ptrs.get(e.pointerId);
      if (!s) return;
      const p = local(e);
      if (s.stick) knob(s, p.x, p.y); else swipe(s, p.x, p.y);
    });
    const end = e => {
      const s = ptrs.get(e.pointerId);
      if (s && !s.stick && !s.turned) {
        // 빠른 튕기기: 움직임 신호가 적어 기준을 못 넘었어도, 누른 자리에서 뗀 자리까지가 기준의 절반 이상이면 꺾는다
        const p = local(e), dx = p.x - s.sx, dy = p.y - s.sy;
        if (Math.max(Math.abs(dx), Math.abs(dy)) >= S.threshold * 0.5) fire(s, axis(dx, dy), p.x, p.y);
      }
      if (s && S.stick === s) S.stick = null;
      ptrs.delete(e.pointerId);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', e => { const s = ptrs.get(e.pointerId); if (s && S.stick === s) S.stick = null; ptrs.delete(e.pointerId); });
    el.addEventListener('contextmenu', e => e.preventDefault());

    S.reset = () => { ptrs.clear(); S.stick = null; S.swipe = null; };
    return S;
  }

  SN.createInput = createInput;
})(SN);
