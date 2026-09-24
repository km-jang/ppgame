'use strict';
// 키보드·마우스·터치 입력을 게임 입력 {moveX, moveY, aimAngle, dash}로 바꾼다.
(function (NG) {
  const STICK_R = 60;

  function createInput(canvas) {
    const keys = new Set();
    const mouse = { x: 0, y: 0, seen: false };
    const touch = { radius: STICK_R, move: null, aim: null, used: false };
    let aimMode = 'auto'; // auto | mouse
    let aimModeLocked = false; // F로 직접 고르면 자동 전환하지 않음
    let dashQueued = false;

    const S = {
      keys, mouse, touch,
      get aimMode() { return aimMode; },
      toggleAim() { aimMode = aimMode === 'auto' ? 'mouse' : 'auto'; aimModeLocked = true; return aimMode; },
      queueDash() { dashQueued = true; },
      onKey: null, // main.js가 단축키 처리용으로 채운다
    };

    const MOVE_KEYS = {
      KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1],
      KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
    };

    window.addEventListener('keydown', e => {
      if (MOVE_KEYS[e.code] || e.code === 'Space') e.preventDefault();
      if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        if (!e.repeat) dashQueued = true;
      }
      keys.add(e.code);
      if (S.onKey && !e.repeat) S.onKey(e.code);
    });
    window.addEventListener('keyup', e => keys.delete(e.code));
    window.addEventListener('blur', () => keys.clear());

    function local(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      return { x: clientX - r.left, y: clientY - r.top };
    }

    canvas.addEventListener('mousemove', e => {
      const p = local(e.clientX, e.clientY);
      mouse.x = p.x; mouse.y = p.y;
      if (!mouse.seen) { mouse.seen = true; if (!aimModeLocked) aimMode = 'mouse'; }
    });
    canvas.addEventListener('mousedown', e => { if (e.button === 2) dashQueued = true; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    // 터치: 왼쪽 절반 = 이동 스틱, 오른쪽 절반 = 조준 스틱. 누른 자리가 스틱 중심
    function stickFrom(t) {
      const p = local(t.clientX, t.clientY);
      return { id: t.identifier, ox: p.x, oy: p.y, kx: p.x, ky: p.y };
    }
    canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      touch.used = true;
      const w = canvas.getBoundingClientRect().width;
      for (const t of e.changedTouches) {
        const s = stickFrom(t);
        if (s.ox < w / 2) { if (!touch.move) touch.move = s; }
        else if (!touch.aim) touch.aim = s;
      }
    }, { passive: false });
    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        for (const s of [touch.move, touch.aim]) {
          if (!s || s.id !== t.identifier) continue;
          const p = local(t.clientX, t.clientY);
          let dx = p.x - s.ox, dy = p.y - s.oy;
          const d = Math.hypot(dx, dy);
          if (d > STICK_R) { dx = dx / d * STICK_R; dy = dy / d * STICK_R; }
          s.kx = s.ox + dx; s.ky = s.oy + dy;
        }
      }
    }, { passive: false });
    function endTouch(e) {
      for (const t of e.changedTouches) {
        if (touch.move && touch.move.id === t.identifier) touch.move = null;
        if (touch.aim && touch.aim.id === t.identifier) touch.aim = null;
      }
    }
    canvas.addEventListener('touchend', endTouch);
    canvas.addEventListener('touchcancel', endTouch);

    // 한 프레임 입력 읽기. player: 마우스 조준 각도 계산용
    S.read = function (player) {
      let mx = 0, my = 0;
      for (const code of keys) {
        const v = MOVE_KEYS[code];
        if (v) { mx += v[0]; my += v[1]; }
      }
      let aimAngle = null;
      if (touch.move) {
        const dx = touch.move.kx - touch.move.ox, dy = touch.move.ky - touch.move.oy;
        const d = Math.hypot(dx, dy);
        if (d > 8) { mx = dx / STICK_R; my = dy / STICK_R; }
      }
      if (touch.aim) {
        const dx = touch.aim.kx - touch.aim.ox, dy = touch.aim.ky - touch.aim.oy;
        if (Math.hypot(dx, dy) > 12) aimAngle = Math.atan2(dy, dx);
      } else if (!touch.used && aimMode === 'mouse' && mouse.seen && player) {
        aimAngle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
      }
      const dash = dashQueued;
      dashQueued = false;
      return { moveX: mx, moveY: my, aimAngle, dash };
    };

    S.reset = function () {
      touch.move = null; touch.aim = null; dashQueued = false; keys.clear();
    };

    return S;
  }

  NG.createInput = createInput;
})(NG);
