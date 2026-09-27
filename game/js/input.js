'use strict';
// 키보드·마우스·터치 입력을 게임 입력 {moveX, moveY, aimAngle, dash, ult}로 바꾼다.
(function (NG) {
  const STICK_R = 60;
  // 손바닥 무시: 닿은 면이 이보다 크면(지름 px) 손가락이 아니라 손바닥으로 본다 (CLAUDE.md 성능 원칙)
  const PALM = 70;
  const isPalm = t => Math.max(t.radiusX || 0, t.radiusY || 0) * 2 > PALM;

  function createInput(canvas) {
    const keys = new Set();
    const mouse = { x: 0, y: 0, seen: false };
    // home: 이동 스틱이 쉬는 자리 (왼쪽 아래). main.js가 화면 크기에 맞춰 정한다
    const touch = { radius: STICK_R, move: null, aim: null, used: false, home: { x: 110, y: 400 } };
    let aimMode = 'auto'; // auto | mouse
    let aimModeLocked = false; // F로 직접 고르면 자동 전환하지 않음
    let dashQueued = false;
    let ultQueued = false;

    const S = {
      keys, mouse, touch,
      get aimMode() { return aimMode; },
      toggleAim() { aimMode = aimMode === 'auto' ? 'mouse' : 'auto'; aimModeLocked = true; return aimMode; },
      queueDash() { dashQueued = true; },
      queueUlt() { ultQueued = true; },
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
      if ((e.code === 'KeyQ' || e.code === 'KeyE') && !e.repeat) ultQueued = true;
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
        if (isPalm(t)) continue;
        const s = stickFrom(t);
        if (s.ox < w / 2) {
          if (touch.move) continue;
          // 스틱 근처를 누르면 스틱 자리에서 시작 (진짜 조이스틱처럼),
          // 멀리 누르면 스틱이 그 자리로 따라온다
          const R = touch.radius, h = touch.home;
          if (Math.hypot(s.ox - h.x, s.oy - h.y) < R * 1.6) { s.ox = h.x; s.oy = h.y; }
          touch.move = s;
          moveKnob(s, s.kx, s.ky);
        } else if (!touch.aim) touch.aim = s;
      }
    }, { passive: false });

    // 손가락이 스틱 반경 밖으로 나가면 받침이 손가락을 따라 끌려온다.
    // 그래서 방향을 반대로 틀 때 받침 중심까지 되돌아갈 필요가 없다
    function moveKnob(s, x, y, follow) {
      const R = touch.radius;
      let dx = x - s.ox, dy = y - s.oy;
      const d = Math.hypot(dx, dy);
      if (d > R) {
        if (follow) { s.ox = x - dx / d * R; s.oy = y - dy / d * R; }
        dx = dx / d * R; dy = dy / d * R;
      }
      s.kx = s.ox + dx; s.ky = s.oy + dy;
    }
    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        for (const s of [touch.move, touch.aim]) {
          if (!s || s.id !== t.identifier) continue;
          const p = local(t.clientX, t.clientY);
          moveKnob(s, p.x, p.y, true);
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
        // 반응 곡선: 가운데 12%는 무시, 반경의 70%만 밀어도 최고 속도.
        // 엄지를 조금만 움직여도 시원하게 움직이고, 살짝 닿은 떨림에는 안 움직인다
        const R = touch.radius;
        const dx = touch.move.kx - touch.move.ox, dy = touch.move.ky - touch.move.oy;
        const d = Math.hypot(dx, dy);
        const dead = R * 0.12, full = R * 0.7;
        if (d > dead) {
          const m = Math.min(1, (d - dead) / (full - dead));
          mx = dx / d * m; my = dy / d * m;
        }
      }
      if (touch.aim) {
        const dx = touch.aim.kx - touch.aim.ox, dy = touch.aim.ky - touch.aim.oy;
        if (Math.hypot(dx, dy) > 12) aimAngle = Math.atan2(dy, dx);
      } else if (!touch.used && aimMode === 'mouse' && mouse.seen && player) {
        aimAngle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
      }
      const dash = dashQueued, ult = ultQueued;
      dashQueued = false; ultQueued = false;
      return { moveX: mx, moveY: my, aimAngle, dash, ult };
    };

    S.reset = function () {
      touch.move = null; touch.aim = null; dashQueued = false; ultQueued = false; keys.clear();
    };
    // 카드 고르기·계속하기 뒤: 눌러 둔 대시·필살기·키만 지운다. 화면에 댄 엄지(이동·조준 스틱)는 그대로 둬서
    // 손을 떼지 않고 바로 이어 움직일 수 있다 (예전엔 reset()이 스틱까지 지워 엄지를 뗐다 다시 대야 움직였다)
    S.clearButtons = function () {
      dashQueued = false; ultQueued = false; keys.clear();
    };
    S.isPalm = isPalm;

    return S;
  }

  NG.createInput = createInput;
})(NG);
