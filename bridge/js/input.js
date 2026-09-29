'use strict';
// 손가락·마우스로 선 그리기. 한 번에 손가락 하나만 그린다 (두 번째 손가락은 무시).
// 손바닥(닿은 넓이가 큰 것)은 무시한다. 좌표는 화면 px로 넘기고, main.js가 판 좌표로 바꾼다.
(function (BR) {
  const PALM = 70;
  BR.createInput = function (el) {
    const I = { active: false, id: null, onDown: null, onMove: null, onUp: null, last: null };
    const palm = e => e.pointerType === 'touch' && (e.width > PALM || e.height > PALM);
    el.addEventListener('pointerdown', e => {
      if (!I.active || I.id != null || palm(e)) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      I.id = e.pointerId;
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
      I.last = [e.clientX, e.clientY];
      if (I.onDown) I.onDown(e.clientX, e.clientY);
      e.preventDefault();
    });
    el.addEventListener('pointermove', e => {
      if (e.pointerId !== I.id) return;
      // 빠르게 그어도 점이 빠지지 않게 사이 점들까지
      const list = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
      for (const q of list && list.length ? list : [e]) { I.last = [q.clientX, q.clientY]; if (I.onMove) I.onMove(q.clientX, q.clientY); }
      e.preventDefault();
    });
    const up = e => {
      if (e.pointerId !== I.id) return;
      I.id = null;
      if (I.onUp) I.onUp();
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    el.addEventListener('contextmenu', e => e.preventDefault());
    I.reset = () => { if (I.id != null && I.onUp) I.onUp(); I.id = null; };
    return I;
  };
})(BR);
