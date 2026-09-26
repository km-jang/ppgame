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

    // 조이스틱 (N-GUN처럼 화면 안에 작게): 스틱 근처를 누르면 스틱 자리에서, 멀리 누르면 누른 자리에서 시작.
    // 손잡이를 기준 거리 이상 밀면 큰 축 방향으로 꺾는다. 반경 밖으로 끌면 받침이 따라와서
    // 반대로 틀 때 가운데까지 되돌아갈 필요가 없다. 빠르게 밀기(스와이프)도 그대로 된다.
    // 스틱 모양은 render.js가 S.stick·S.home·S.radius를 읽어 그린다
    S.home = { x: 0, y: 0 }; S.radius = 50; S.stick = null;
    const ptrs = new Map();
    function local(e) { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    el.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      S.used = S.used || e.pointerType !== 'mouse';
      const p = local(e), R = S.radius, h = S.home;
      const s = { ox: p.x, oy: p.y, kx: p.x, ky: p.y, last: null };
      if (e.pointerType !== 'mouse' && Math.hypot(p.x - h.x, p.y - h.y) < R * 1.8) { s.ox = h.x; s.oy = h.y; }
      ptrs.set(e.pointerId, s);
      if (e.pointerType !== 'mouse') S.stick = s;
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
      knob(s, p.x, p.y);
    });
    function knob(s, x, y) {
      const R = S.radius;
      let dx = x - s.ox, dy = y - s.oy;
      const d = Math.hypot(dx, dy);
      if (d > R) { s.ox = x - dx / d * R; s.oy = y - dy / d * R; dx = dx / d * R; dy = dy / d * R; }
      s.kx = s.ox + dx; s.ky = s.oy + dy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < Math.min(S.threshold, R * 0.45)) return;
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      if (dir === s.last) return; // 같은 방향으로 계속 미는 건 한 번만
      s.last = dir;
      if (S.onDir) S.onDir(dir);
    }
    el.addEventListener('pointermove', e => {
      const s = ptrs.get(e.pointerId);
      if (!s) return;
      const p = local(e);
      knob(s, p.x, p.y);
    });
    const end = e => { const s = ptrs.get(e.pointerId); if (s && S.stick === s) S.stick = null; ptrs.delete(e.pointerId); };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('contextmenu', e => e.preventDefault());

    S.reset = () => { ptrs.clear(); S.stick = null; };
    return S;
  }

  SN.createInput = createInput;
})(SN);
