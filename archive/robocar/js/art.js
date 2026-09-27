'use strict';
// 그림 공용 도구: 색 계산, 둥근 사각형, 발광 스프라이트 캐시.
(function (RC) {
  const TAU = Math.PI * 2;
  const INK = '#0d1322';

  function hex2rgb(h) {
    if (h[0] !== '#') { const m = h.match(/\d+/g); return m ? m.slice(0, 3).map(Number) : [0, 0, 0]; }
    const n = parseInt(h.slice(1), 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  }
  const toHex = (r, g, b) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  // k>1 밝게, k<1 어둡게
  function shade(h, k) {
    const [r, g, b] = hex2rgb(h);
    if (k >= 1) { const t = k - 1; return toHex(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t); }
    return toHex(r * k, g * k, b * k);
  }
  function mix(a, b, t) {
    const A = hex2rgb(a), B = hex2rgb(b);
    return toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
  }
  function rgba(h, a) { const [r, g, b] = hex2rgb(h); return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'; }

  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function poly(ctx, pts, ox, oy) {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i += 2) {
      if (i === 0) ctx.moveTo(ox + pts[i], oy + pts[i + 1]); else ctx.lineTo(ox + pts[i], oy + pts[i + 1]);
    }
    ctx.closePath();
  }
  function lin(ctx, x0, y0, x1, y1, stops) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    for (const [o, c] of stops) g.addColorStop(o, c);
    return g;
  }
  function rad(ctx, x, y, r0, r1, stops) {
    const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
    for (const [o, c] of stops) g.addColorStop(o, c);
    return g;
  }

  // 발광 스프라이트: 색별·크기별로 한 번만 만든다
  const glowCache = {};
  function glow(ctx, color, x, y, r, alpha) {
    const R = Math.max(4, Math.round(r));
    const key = color + R;
    let c = glowCache[key];
    if (!c) {
      c = document.createElement('canvas');
      c.width = c.height = R * 2;
      const g = c.getContext('2d');
      const [cr, cg, cb] = hex2rgb(color);
      const grad = g.createRadialGradient(R, R, 0, R, R, R);
      grad.addColorStop(0, 'rgba(' + cr + ',' + cg + ',' + cb + ',0.9)');
      grad.addColorStop(0.35, 'rgba(' + cr + ',' + cg + ',' + cb + ',0.35)');
      grad.addColorStop(1, 'rgba(' + cr + ',' + cg + ',' + cb + ',0)');
      g.fillStyle = grad; g.fillRect(0, 0, R * 2, R * 2);
      glowCache[key] = c;
    }
    const op = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = ga * (alpha == null ? 1 : alpha);
    ctx.drawImage(c, x - R, y - R);
    ctx.globalCompositeOperation = op; ctx.globalAlpha = ga;
  }

  // 부드러운 원 (연기·먼지용, 보통 합성)
  const softCache = {};
  function soft(ctx, color, x, y, r, alpha) {
    const R = Math.max(4, Math.round(r));
    const key = color + R;
    let c = softCache[key];
    if (!c) {
      c = document.createElement('canvas'); c.width = c.height = R * 2;
      const g = c.getContext('2d');
      const [cr, cg, cb] = hex2rgb(color);
      const grad = g.createRadialGradient(R, R, 0, R, R, R);
      grad.addColorStop(0, 'rgba(' + cr + ',' + cg + ',' + cb + ',0.85)');
      grad.addColorStop(0.6, 'rgba(' + cr + ',' + cg + ',' + cb + ',0.4)');
      grad.addColorStop(1, 'rgba(' + cr + ',' + cg + ',' + cb + ',0)');
      g.fillStyle = grad; g.fillRect(0, 0, R * 2, R * 2);
      softCache[key] = c;
    }
    const ga = ctx.globalAlpha;
    ctx.globalAlpha = ga * (alpha == null ? 1 : alpha);
    ctx.drawImage(c, x - R, y - R);
    ctx.globalAlpha = ga;
  }
  const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

  // 금속 광택 그라디언트 (위에서 아래로)
  function chrome(ctx, y0, y1) {
    return lin(ctx, 0, y0, 0, y1, [[0, '#ffffff'], [0.35, '#c9d2df'], [0.5, '#7c889c'], [0.62, '#aeb8c8'], [1, '#eef2f7']]);
  }
  function gunmetal(ctx, y0, y1) {
    return lin(ctx, 0, y0, 0, y1, [[0, '#5d6679'], [0.45, '#3a4150'], [1, '#232833']]);
  }
  // 차 도장: 위쪽은 빛을 받아 밝고 아래로 갈수록 어둡다
  function paint(ctx, color, y0, y1) {
    return lin(ctx, 0, y0, 0, y1, [[0, shade(color, 1.35)], [0.28, shade(color, 1.06)], [0.62, color], [1, shade(color, 0.52)]]);
  }

  RC.Art = { TAU, INK, shade, mix, rgba, hex2rgb, rr, poly, lin, rad, glow, soft, smooth, chrome, gunmetal, paint };
})(RC);
