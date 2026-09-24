'use strict';
// 수집 카드 그림. 게임 속 로봇카를 그대로 그려서 카드로 만든다 (그림 파일 없음).
(function (RC) {
  const A = RC.Art, D = RC.DATA;
  const { TAU, rr, lin, glow } = A;
  const W = 300, H = 420;

  function frame(g, R) {
    rr(g, 4, 4, W - 8, H - 8, 22);
    g.fillStyle = lin(g, 0, 0, W, H, [[0, A.shade(R.c1, 1.5)], [0.5, R.c1], [1, A.shade(R.c1, 0.5)]]); g.fill();
    rr(g, 14, 14, W - 28, H - 28, 16);
    const bg = g.createRadialGradient(W / 2, H * 0.42, 10, W / 2, H * 0.42, H * 0.7);
    bg.addColorStop(0, A.shade(R.c1, 0.9)); bg.addColorStop(0.5, R.c2); bg.addColorStop(1, '#05070d');
    g.fillStyle = bg; g.fill();
    // 빛살
    g.save(); rr(g, 14, 14, W - 28, H - 28, 16); g.clip();
    g.translate(W / 2, H * 0.42); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 16; i++) { g.rotate(TAU / 16); g.fillStyle = 'rgba(255,255,255,0.05)'; g.beginPath(); g.moveTo(0, 0); g.lineTo(260, -26); g.lineTo(260, 26); g.fill(); }
    g.restore();
    // 육각 무늬
    g.save(); rr(g, 14, 14, W - 28, H - 28, 16); g.clip();
    g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 1.5;
    for (let y = 0; y < H; y += 26) for (let x = (y / 26 % 2) * 15; x < W; x += 30) { g.beginPath(); for (let k = 0; k < 6; k++) { const a = k * TAU / 6; g.lineTo(x + Math.cos(a) * 9, y + Math.sin(a) * 9); } g.closePath(); g.stroke(); }
    g.restore();
  }

  function subject(g, card, t) {
    const cfg = Object.assign({ color: null }, card.cfg);
    if (card.form === 'robot') {
      g.save(); g.translate(W / 2, 318); g.scale(1.25, 1.25); g.translate(-W / 2, -318);
      RC.Car.drawRobot(g, cfg, W / 2, 318, { t: t || 0.4 });
      g.restore();
    } else {
      g.save(); g.translate(W / 2, 290); g.scale(1.45, 1.45); g.translate(-W / 2, -290);
      RC.Car.drawCar(g, cfg, W / 2, 290, { t: t || 0.4, thrust: cfg.gear === 'jet', glide: cfg.gear === 'wing' });
      g.restore();
    }
  }

  // 카드 한 장을 캔버스에 그린다. locked면 검은 그림자 + 물음표
  function render(cv, card, locked) {
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const R = D.RARITY[card.rarity];
    g.clearRect(0, 0, W, H);
    frame(g, locked ? D.RARITY[1] : R);
    if (locked) {
      const off = document.createElement('canvas'); off.width = W; off.height = H;
      const o = off.getContext('2d');
      subject(o, card);
      o.globalCompositeOperation = 'source-in'; o.fillStyle = '#070b16'; o.fillRect(0, 0, W, H);
      g.globalAlpha = 0.85; g.drawImage(off, 0, 0); g.globalAlpha = 1;
      g.fillStyle = 'rgba(255,255,255,0.85)'; g.font = '96px "Black Han Sans", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('?', W / 2, 190);
    } else {
      glow(g, R.c1, W / 2, 230, 150, 0.45);
      subject(g, card);
    }
    // 이름표
    rr(g, 26, H - 92, W - 52, 62, 12); g.fillStyle = 'rgba(5,8,16,0.85)'; g.fill();
    g.lineWidth = 2; g.strokeStyle = locked ? 'rgba(255,255,255,0.2)' : R.c1; g.stroke();
    g.fillStyle = '#ffffff'; g.font = '26px "Black Han Sans", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(locked ? '???' : card.name, W / 2, H - 70);
    // 등급 별
    for (let i = 0; i < 3; i++) {
      const x = W / 2 - 24 + i * 24, y = H - 44, on = i < card.rarity && !locked;
      g.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 4 : 9; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.closePath();
      g.fillStyle = on ? '#ffcf3a' : 'rgba(255,255,255,0.18)'; g.fill();
    }
    // 등급 라벨
    rr(g, 24, 24, 70, 28, 14); g.fillStyle = locked ? 'rgba(255,255,255,0.15)' : R.c1; g.fill();
    g.fillStyle = card.rarity === 3 && !locked ? '#3a2400' : '#ffffff'; g.font = '16px "Black Han Sans", sans-serif';
    g.fillText(locked ? '잠김' : R.name, 59, 39);
    return cv;
  }

  RC.Cards = { render, W, H };
})(RC);
