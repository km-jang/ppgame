'use strict';
// 구조할 친구(고양이·강아지·꼬마 로봇), 하늘 풍선, 절반 지점 축하 문 그리기.
// 참고: 몬스터 트럭 유아 게임(풍선·축하 종이), 로보카폴리(구조). 그림체는 뚝딱 로봇카의 광택·그라디언트를 따른다.
(function (RC) {
  const A = RC.Art;
  const { TAU, shade, rgba, rr, lin, glow } = A;
  const GY = RC.DATA.RUN.groundY;

  // ─── 친구 ────────────────────────────────────────────────
  // x, y = 발 아래 가운데. s = 크기 배율. wave = 손 흔들기(도와줘!) 여부
  function friend(ctx, kind, x, y, s, t, wave) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    // 그림자
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0, 0, 20, 4, 0, 0, TAU); ctx.fill();
    const bob = Math.sin(t * 6) * (wave ? 2 : 0.8);
    ctx.translate(0, bob);
    if (kind === 'bot') bot(ctx, t, wave); else animal(ctx, kind, t, wave);
    ctx.restore();
  }
  function animal(ctx, kind, t, wave) {
    const cat = kind === 'cat';
    const base = cat ? '#ff9f43' : '#c8a27a', dark = shade(base, 0.62), light = shade(base, 1.25);
    // 꼬리
    ctx.strokeStyle = dark; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-12, -10);
    const tw = Math.sin(t * 5) * 6;
    if (cat) ctx.bezierCurveTo(-30, -14, -26, -40 + tw, -18, -44 + tw); else ctx.quadraticCurveTo(-24, -16, -22 + tw, -28);
    ctx.stroke();
    // 몸
    ctx.fillStyle = lin(ctx, 0, -34, 0, 0, [[0, light], [1, dark]]);
    ctx.beginPath(); ctx.ellipse(0, -14, 16, 15, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = rgba('#ffffff', 0.55); ctx.beginPath(); ctx.ellipse(3, -10, 8, 9, 0, 0, TAU); ctx.fill();
    // 머리
    const hy = -38;
    ctx.fillStyle = lin(ctx, 0, hy - 16, 0, hy + 14, [[0, light], [1, base]]);
    ctx.beginPath(); ctx.ellipse(2, hy, 15, 13, 0, 0, TAU); ctx.fill();
    // 귀
    ctx.fillStyle = dark;
    if (cat) {
      for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(2 + sx * 6, hy - 9); ctx.lineTo(2 + sx * 14, hy - 22); ctx.lineTo(2 + sx * 14, hy - 5); ctx.closePath(); ctx.fill(); }
    } else {
      for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(2 + sx * 13, hy - 1, 5, 10, sx * 0.4, 0, TAU); ctx.fill(); }
    }
    // 얼굴 (작고 단정하게: 왕눈이 대신 반짝이는 점 눈)
    ctx.fillStyle = '#1b1f2c';
    ctx.beginPath(); ctx.arc(-3, hy - 1, 2.2, 0, TAU); ctx.arc(8, hy - 1, 2.2, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(-3, hy - 2.5, 1, 1); ctx.fillRect(8, hy - 2.5, 1, 1);
    ctx.fillStyle = cat ? '#ff6b8a' : '#3a2a1e'; ctx.beginPath(); ctx.arc(2.5, hy + 4, cat ? 1.8 : 2.4, 0, TAU); ctx.fill();
    // 손 흔들기
    ctx.strokeStyle = base; ctx.lineWidth = 6;
    const a = wave ? -1.2 + Math.sin(t * 10) * 0.5 : 0.3;
    ctx.beginPath(); ctx.moveTo(12, -22); ctx.lineTo(12 + Math.cos(a) * 14, -22 + Math.sin(a) * 14); ctx.stroke();
    ctx.lineCap = 'butt';
  }
  function bot(ctx, t, wave) {
    // 몸통
    rr(ctx, -14, -30, 28, 26, 7);
    ctx.fillStyle = lin(ctx, 0, -30, 0, -4, [[0, '#bfeaff'], [1, '#3a8fc9']]); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(-10, -27, 8, 3);
    // 바퀴 발
    ctx.fillStyle = '#1b1f2c'; ctx.beginPath(); ctx.arc(-8, -3, 5, 0, TAU); ctx.arc(8, -3, 5, 0, TAU); ctx.fill();
    // 머리 (화면 얼굴)
    rr(ctx, -12, -52, 24, 20, 6); ctx.fillStyle = lin(ctx, 0, -52, 0, -32, [[0, '#e8f7ff'], [1, '#8fc3e6']]); ctx.fill();
    rr(ctx, -9, -49, 18, 13, 4); ctx.fillStyle = '#0c1424'; ctx.fill();
    ctx.fillStyle = wave && Math.floor(t * 4) % 2 ? '#ffb020' : '#39d8ff';
    ctx.fillRect(-6, -45, 4, 4); ctx.fillRect(2, -45, 4, 4);
    // 안테나
    ctx.strokeStyle = '#8fa4bd'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -52); ctx.lineTo(0, -60); ctx.stroke();
    glow(ctx, wave ? '#ff5a5a' : '#39d8ff', 0, -61, 8, 0.9);
    // 팔
    ctx.strokeStyle = '#8fa4bd'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    const a = wave ? -1.1 + Math.sin(t * 10) * 0.5 : 0.4;
    ctx.beginPath(); ctx.moveTo(14, -22); ctx.lineTo(14 + Math.cos(a) * 12, -22 + Math.sin(a) * 12); ctx.stroke();
    ctx.lineCap = 'butt';
  }

  // 길가에서 기다리는 친구 + "도와줘!" 말풍선
  function waiting(ctx, o, x, t) {
    // 작은 안전 고깔 두 개 사이에 앉아 있다
    friend(ctx, o.kind, x, GY - 2, 1.35, t, true);
    const by = GY - 120 + Math.sin(t * 3) * 4;
    ctx.save();
    ctx.font = '22px "Black Han Sans", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText('도와줘!').width + 28;
    rr(ctx, x - w / 2, by - 18, w, 36, 12); ctx.fillStyle = 'rgba(10,16,32,0.9)'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#ffb020'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 7, by + 17); ctx.lineTo(x + 7, by + 17); ctx.lineTo(x, by + 27); ctx.closePath(); ctx.fillStyle = 'rgba(10,16,32,0.9)'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText('도와줘!', x, by + 1);
    ctx.restore();
    glow(ctx, '#ffb020', x, GY - 40, 70, 0.25 + Math.abs(Math.sin(t * 3)) * 0.2);
  }

  // 구한 친구들이 차 지붕(로봇일 땐 어깨)에 탄다
  function riders(ctx, R, x, y, form, t) {
    const list = R.riders;
    if (!list || !list.length) return;
    for (let i = 0; i < list.length; i++) {
      const rx = form === 'robot' ? x - 34 - i * 22 : x - 12 - i * 30;
      const ry = form === 'robot' ? y - 168 : y - (R.cfg.body === 'fire' ? 88 : 64);
      friend(ctx, list[i], rx, ry, 0.72, t + i, false);
    }
  }

  // ─── 풍선 ────────────────────────────────────────────────
  function balloon(ctx, o, x, t) {
    const y = o.y + Math.sin(t * 2 + o.x * 0.01) * 6, sw = Math.sin(t * 1.6 + o.x) * 0.08;
    ctx.save(); ctx.translate(x, y); ctx.rotate(sw);
    // 끈
    ctx.strokeStyle = 'rgba(230,236,245,0.7)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, 30); ctx.bezierCurveTo(6, 44, -6, 56, 2, 70); ctx.stroke();
    // 풍선 (광택)
    const g = ctx.createRadialGradient(-8, -12, 3, 0, 0, 34);
    g.addColorStop(0, shade(o.color, 1.6)); g.addColorStop(0.45, o.color); g.addColorStop(1, shade(o.color, 0.55));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(0, 30); ctx.bezierCurveTo(-30, 18, -28, -34, 0, -34); ctx.bezierCurveTo(28, -34, 30, 18, 0, 30); ctx.fill();
    ctx.fillStyle = shade(o.color, 0.6); ctx.beginPath(); ctx.moveTo(-4, 34); ctx.lineTo(4, 34); ctx.lineTo(0, 28); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.ellipse(-10, -16, 5, 9, -0.4, 0, TAU); ctx.fill();
    // 안에 든 별 표시
    ctx.globalAlpha = 0.9; RC.Draw.drawStar(ctx, 0, -2, 9, t); ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ─── 절반 지점 축하 문 ────────────────────────────────────
  function gate(ctx, x, t, passed) {
    const top = GY - 250;
    for (const sx of [-90, 90]) {
      rr(ctx, x + sx - 7, top, 14, GY - top, 5);
      ctx.fillStyle = lin(ctx, x + sx - 7, 0, x + sx + 7, 0, [[0, '#3a4150'], [0.5, '#8a95a8'], [1, '#2a303c']]); ctx.fill();
    }
    // 흐르는 불빛 줄
    const cols = ['#ff3b3b', '#ffd21a', '#22c55e', '#2f6bff'];
    for (let i = 0; i < 12; i++) {
      const k = i / 11, px = x - 90 + k * 180, py = top + 8 + Math.sin(k * Math.PI) * -18;
      const on = (Math.floor(t * 8) + i) % 4;
      glow(ctx, cols[on], px, py, passed ? 16 : 11, passed ? 1 : 0.7);
    }
    rr(ctx, x - 70, top + 14, 140, 34, 9);
    ctx.fillStyle = lin(ctx, 0, top + 14, 0, top + 48, [[0, '#ffb04a'], [1, '#e0400f']]); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '22px "Black Han Sans", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(passed ? '잘했어!' : '절반!', x, top + 32);
  }

  RC.Friends = { friend, waiting, riders, balloon, gate };
})(RC);
