'use strict';
// 공통 그림 도구: 다섯 게임이 함께 쓸 수 있는 시각 효과 묶음 (2026-11-07, 소유자 지시: 시각 품질 끌어올리기 1단계).
// 그림만 만든다. 게임 규칙·점수·물리 판정은 읽지도 바꾸지도 않는다.
// 일반 <script>로 불러온다. 캔버스가 없는 곳(node 테스트)에서는 그림 함수가 null을 돌려주거나 조용히 아무것도 안 하고,
// 그림과 상관없는 계산(SpringScaler의 비율, ParticleEmitter의 움직임)은 그대로 돈다.
//
// 이 파일을 아직 어느 게임도 불러오지 않는다. 게임에 붙일 때는
//   1) 그 게임 index.html에서 ../common/sound.js 다음에 <script src="../common/vfx.js"></script>
//   2) 그 게임 sw.js의 FILES에 '../common/vfx.js'를 넣고 VERSION을 올린다 (안 넣으면 인터넷 없이 안 열린다)
//
// 쓰는 법
//   VFX.createGlossySphere(radius, color, opt)  유리 광택 구슬 그림(보이지 않는 캔버스)을 한 번 만들어 돌려준다. 같은 값이면 저장해 둔 것을 준다
//   VFX.createGlossCap(radius, opt)             광택 겹만 담은 덮개 (도는 무늬 위에 덮어 반사광을 빛 쪽에 고정)
//   VFX.drawSphere(ctx, sprite, x, y, opt)      만든 구슬을 (x, y) 중심에 그린다. opt.scaleX·scaleY로 젤리처럼 찌그러뜨릴 수 있다
//   VFX.drawEnergyLine(ctx, points, opt)        3겹 네온 선 (빛 번짐 · 색 · 하얀 심). shadowBlur를 쓰지 않고 가산 혼합만 쓴다
//   new VFX.SpringScaler(opt)                   부딪히면 납작해졌다가 띠용 돌아오는 탄성 비율 계산기
//   new VFX.ParticleEmitter(opt)                중력을 받아 포물선으로 튀고 작아지며 사라지는 빛 알갱이
//   VFX.calm()                                  기기가 움직임 줄이기를 켰는가 (켜면 흔들림과 알갱이 수를 줄인다)
//   VFX.clearCache()                            미리 그려 둔 그림을 모두 버린다 (화면 크기가 크게 바뀌었을 때)
//
// 색은 '#4af' · '#44aaff' · 'rgb(68,170,255)' · 'rgba(...)' · [68,170,255] 모두 받는다.
var VFX = (typeof VFX !== 'undefined' && VFX) || {};
(function (V) {
  const W = typeof window !== 'undefined' ? window : null;
  const D = typeof document !== 'undefined' ? document : null;
  const TAU = Math.PI * 2;

  // 움직임 줄이기: 처음 한 번 읽고, 바뀌면 따라간다
  let calmNow = false;
  try {
    if (W && W.matchMedia) {
      const mq = W.matchMedia('(prefers-reduced-motion: reduce)');
      calmNow = !!mq.matches;
      const on = e => { calmNow = !!e.matches; };
      if (mq.addEventListener) mq.addEventListener('change', on); else if (mq.addListener) mq.addListener(on);
    }
  } catch (e) { calmNow = false; }
  const calm = () => calmNow;

  // ---------------------------------------------------------------------------------------------
  // 색 계산
  // ---------------------------------------------------------------------------------------------
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;

  function parse(c) {
    if (Array.isArray(c)) return [c[0] | 0, c[1] | 0, c[2] | 0];
    let s = String(c == null ? '#fff' : c).trim();
    if (s[0] === '#') {
      s = s.slice(1);
      if (s.length === 3 || s.length === 4) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
      const n = parseInt(s.slice(0, 6), 16);
      if (!isNaN(n)) return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    const m = s.match(/rgba?\(([^)]+)\)/i);
    if (m) {
      const p = m[1].split(',').map(x => parseFloat(x));
      return [clamp(p[0] | 0, 0, 255), clamp(p[1] | 0, 0, 255), clamp(p[2] | 0, 0, 255)];
    }
    return [255, 255, 255];
  }
  const rgba = (c, a) => 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + clamp(a, 0, 1).toFixed(3) + ')';
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const WHITE = [255, 255, 255], BLACK = [0, 0, 0];
  const lighten = (c, t) => mix(c, WHITE, t);
  const darken = (c, t) => mix(c, BLACK, t);
  // 어두운 쪽은 검정 대신 남색 쪽으로 기울인다 (우주 배경에서 탁해 보이지 않게)
  const deep = (c, t) => mix(c, [6, 8, 26], t);
  // 채도를 조금 올린 빛 색 (반사광·빛 번짐용)
  function vivid(c, t) {
    const g = (c[0] + c[1] + c[2]) / 3;
    return [clamp(g + (c[0] - g) * (1 + t), 0, 255), clamp(g + (c[1] - g) * (1 + t), 0, 255), clamp(g + (c[2] - g) * (1 + t), 0, 255)];
  }

  // ---------------------------------------------------------------------------------------------
  // 보이지 않는 캔버스와 저장소
  // ---------------------------------------------------------------------------------------------
  function makeCanvas(w, h) {
    w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
    if (D && D.createElement) {
      const c = D.createElement('canvas');
      c.width = w; c.height = h;
      return c;
    }
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    return null;
  }
  // 고해상도 배율: 화면 배율을 따르되 너무 크지 않게 (태블릿 메모리 보호)
  function resOf(opt) {
    if (opt && opt.res) return clamp(opt.res, 1, 4);
    const dpr = W && W.devicePixelRatio ? W.devicePixelRatio : 1;
    return clamp(Math.ceil(dpr * 1.25 * 4) / 4, 1, 3);
  }

  const CACHE = new Map();
  const CACHE_MAX = 160;
  function cacheGet(key) {
    const v = CACHE.get(key);
    if (v) { CACHE.delete(key); CACHE.set(key, v); } // 최근에 쓴 것을 뒤로
    return v;
  }
  function cachePut(key, v) {
    CACHE.set(key, v);
    while (CACHE.size > CACHE_MAX) CACHE.delete(CACHE.keys().next().value);
    return v;
  }
  function clearCache() { CACHE.clear(); }

  // 유리 광택 겹만 그린다 (구슬 위에 덮는 용도로 따로도 쓴다). cx·cy 중심, R 반지름(그림 픽셀), lx·ly 빛 방향, ang 빛 각도
  function paintGloss(g, cx, cy, R, lx, ly, ang, glossK) {
    // (4) 유리 광택: 왼쪽 위 30% 지점, 빛 방향으로 기운 흰 타원. 넓고 부드러운 겹 + 선명한 심 + 아주 작은 반짝점
    const hx = cx + lx * R * 0.43, hy = cy + ly * R * 0.43; // 중심에서 반지름의 약 30% (대각선 0.43 = 가로세로 각 0.3)
    const tilt = ang + Math.PI / 2;
    g.save();
    g.beginPath(); g.arc(cx, cy, R * 0.985, 0, TAU); g.clip();
    g.translate(hx, hy);
    g.rotate(tilt);
    // 넓은 겹
    g.save();
    g.scale(1, 0.58);
    let sp = g.createRadialGradient(0, 0, 0, 0, 0, R * 0.52);
    sp.addColorStop(0, 'rgba(255,255,255,' + (0.62 * glossK).toFixed(3) + ')');
    sp.addColorStop(0.5, 'rgba(255,255,255,' + (0.22 * glossK).toFixed(3) + ')');
    sp.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sp;
    g.beginPath(); g.arc(0, 0, R * 0.52, 0, TAU); g.fill();
    g.restore();
    // 선명한 심: 가장자리가 빨리 끊기는 타원이라 유리처럼 또렷하다
    g.save();
    g.scale(1, 0.5);
    sp = g.createRadialGradient(0, 0, 0, 0, 0, R * 0.3);
    sp.addColorStop(0, 'rgba(255,255,255,' + Math.min(1, 0.98 * glossK).toFixed(3) + ')');
    sp.addColorStop(0.62, 'rgba(255,255,255,' + Math.min(1, 0.9 * glossK).toFixed(3) + ')');
    sp.addColorStop(0.86, 'rgba(255,255,255,' + (0.25 * glossK).toFixed(3) + ')');
    sp.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sp;
    g.beginPath(); g.arc(0, 0, R * 0.3, 0, TAU); g.fill();
    g.restore();
    g.restore();
    // 반짝점: 광택 중심보다 조금 바깥쪽의 아주 작은 흰 점
    const px = cx + lx * R * 0.6, py = cy + ly * R * 0.6;
    const dot = g.createRadialGradient(px, py, 0, px, py, R * 0.09);
    dot.addColorStop(0, 'rgba(255,255,255,' + Math.min(1, glossK).toFixed(3) + ')');
    dot.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = dot;
    g.beginPath(); g.arc(px, py, R * 0.09, 0, TAU); g.fill();

    // 창문 반사: 광택 맞은편 아래쪽 안쪽의 가는 초승달 (유리 구슬의 두 번째 반사)
    g.save();
    g.beginPath(); g.arc(cx, cy, R * 0.9, 0, TAU); g.clip();
    g.globalCompositeOperation = 'lighter';
    const wx = cx - lx * R * 0.62, wy = cy - ly * R * 0.62;
    g.translate(wx, wy);
    g.rotate(tilt);
    g.scale(1, 0.26);
    const wr = g.createRadialGradient(0, 0, 0, 0, 0, R * 0.36);
    wr.addColorStop(0, 'rgba(255,255,255,' + (0.3 * glossK).toFixed(3) + ')');
    wr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = wr;
    g.beginPath(); g.arc(0, 0, R * 0.36, 0, TAU); g.fill();
    g.restore();
  }

  // ---------------------------------------------------------------------------------------------
  // 1. 유리 광택 구슬 (createGlossySphere)
  // ---------------------------------------------------------------------------------------------
  // 네 겹: (1) 바닥 그림자 (2) 입체 몸통 (3) 아래 테두리 반사광 (4) 왼쪽 위 유리 광택.
  // 몸통 안에는 유리처럼 보이게 하는 장치 셋을 더한다: 가장자리가 짙어지는 두께감, 빛이 유리를 지나 반대편(오른쪽 아래)에 모이는 속빛,
  // 광택 맞은편의 작은 창문 반사. 테두리 선은 긋지 않는다 (두꺼운 외곽선 금지).
  //
  // opt
  //   shadow   그림자 진하기 0~1 (기본 0.55, 0이면 그림자 없음)
  //   glow     구슬 바깥 빛 번짐 0~1 (기본 0.35, 어두운 배경에서 떠 보이게)
  //   rim      아래 반사광 세기 0~1.5 (기본 1)
  //   rimColor 반사광 색 (기본: 몸통 색을 밝고 선명하게)
  //   gloss    광택 세기 0~1.2 (기본 1)
  //   glass    유리 투명감 0~1 (기본 0.7, 높을수록 속빛이 밝고 가장자리가 짙다)
  //   light    빛이 오는 방향 각도 (라디안, 기본 왼쪽 위 -2.36)
  //   res      그림 배율 (기본: 화면 배율 기준 1~3)
  // 돌려주는 것: { canvas, radius, pad, res, size }  size는 화면 단위(CSS 픽셀) 한 변 길이
  function createGlossySphere(radius, color, opt) {
    opt = opt || {};
    const r = Math.max(1, +radius || 1);
    const base = parse(color);
    const shadowK = opt.shadow == null ? 0.55 : clamp(opt.shadow, 0, 1);
    const glowK = opt.glow == null ? 0.35 : clamp(opt.glow, 0, 1);
    const rimK = opt.rim == null ? 1 : clamp(opt.rim, 0, 1.5);
    const glossK = opt.gloss == null ? 1 : clamp(opt.gloss, 0, 1.2);
    const glassK = opt.glass == null ? 0.7 : clamp(opt.glass, 0, 1);
    const ang = opt.light == null ? -2.36 : +opt.light;
    const res = resOf(opt);
    const rimC = opt.rimColor ? parse(opt.rimColor) : vivid(lighten(base, 0.35), 0.35);
    const key = ['sph', r.toFixed(2), base.join('.'), shadowK, glowK, rimK, rimC.map(v => v | 0).join('.'), glossK, glassK, ang.toFixed(3), res].join('|');
    const hit = cacheGet(key);
    if (hit) return hit;

    // 그림자와 빛 번짐이 들어갈 여백
    const pad = Math.ceil(r * Math.max(0.65, glowK > 0 ? 0.55 + glowK * 0.5 : 0.65));
    const size = (r + pad) * 2;
    const R = r * res, P = pad * res, S = Math.ceil(size * res);
    const cv = makeCanvas(S, S);
    if (!cv) return null;
    const g = cv.getContext('2d');
    const cx = S / 2, cy = S / 2;
    const lx = Math.cos(ang), ly = Math.sin(ang); // 빛 방향 (왼쪽 위면 lx, ly 둘 다 음수)

    // (0) 바깥 빛 번짐: 어두운 우주에서 구슬이 은은하게 떠 보이게 (가산 혼합)
    if (glowK > 0) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      const gl = g.createRadialGradient(cx, cy, R * 0.85, cx, cy, R + P * 0.95);
      const gc = vivid(base, 0.4);
      gl.addColorStop(0, rgba(gc, 0.32 * glowK));
      gl.addColorStop(0.35, rgba(gc, 0.13 * glowK));
      gl.addColorStop(1, rgba(gc, 0));
      g.fillStyle = gl;
      g.fillRect(0, 0, S, S);
      g.restore();
    }

    // (1) 바닥 그림자: 빛 반대편 아래로 납작한 타원 두 겹 (넓고 흐린 것 + 좁고 진한 닿음 그림자)
    if (shadowK > 0) {
      const sx = cx - lx * R * 0.22, sy = cy + R * 0.78;
      g.save();
      g.translate(sx, sy);
      g.scale(1, 0.32);
      let sg = g.createRadialGradient(0, 0, 0, 0, 0, R * 1.25);
      sg.addColorStop(0, 'rgba(0,0,8,' + (0.5 * shadowK).toFixed(3) + ')');
      sg.addColorStop(0.55, 'rgba(0,0,8,' + (0.22 * shadowK).toFixed(3) + ')');
      sg.addColorStop(1, 'rgba(0,0,8,0)');
      g.fillStyle = sg;
      g.beginPath(); g.arc(0, 0, R * 1.25, 0, TAU); g.fill();
      sg = g.createRadialGradient(0, 0, 0, 0, 0, R * 0.62);
      sg.addColorStop(0, 'rgba(0,0,6,' + (0.55 * shadowK).toFixed(3) + ')');
      sg.addColorStop(1, 'rgba(0,0,6,0)');
      g.fillStyle = sg;
      g.beginPath(); g.arc(0, 0, R * 0.62, 0, TAU); g.fill();
      g.restore();
    }

    // (2) 몸통: 빛 쪽으로 치우친 중심에서 가장자리로 어두워지는 방사형 그라데이션
    g.save();
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.closePath();
    g.clip();
    const fx = cx + lx * R * 0.42, fy = cy + ly * R * 0.42;
    const body = g.createRadialGradient(fx, fy, R * 0.04, cx, cy, R * 1.02);
    body.addColorStop(0, rgba(lighten(base, 0.55), 1));
    body.addColorStop(0.18, rgba(lighten(base, 0.22), 1));
    body.addColorStop(0.48, rgba(base, 1));
    body.addColorStop(0.78, rgba(deep(base, 0.42), 1));
    body.addColorStop(1, rgba(deep(base, 0.72), 1));
    g.fillStyle = body;
    g.fillRect(cx - R, cy - R, R * 2, R * 2);

    // 두께감: 유리 가장자리가 빛을 덜 통과해 짙어지는 고리 (가장자리만, 중심은 그대로)
    const edge = g.createRadialGradient(cx, cy, R * (0.62 + glassK * 0.12), cx, cy, R);
    edge.addColorStop(0, 'rgba(4,6,22,0)');
    edge.addColorStop(0.7, 'rgba(4,6,22,' + (0.18 + glassK * 0.16).toFixed(3) + ')');
    edge.addColorStop(1, 'rgba(4,6,22,' + (0.34 + glassK * 0.2).toFixed(3) + ')');
    g.fillStyle = edge;
    g.fillRect(cx - R, cy - R, R * 2, R * 2);

    // 속빛: 빛이 유리를 지나 반대편 안쪽에 모이는 밝은 자리 (가산 혼합)
    if (glassK > 0) {
      g.globalCompositeOperation = 'lighter';
      const qx = cx - lx * R * 0.46, qy = cy - ly * R * 0.46;
      const caus = g.createRadialGradient(qx, qy, 0, qx, qy, R * 0.72);
      const cc = vivid(lighten(base, 0.25), 0.5);
      caus.addColorStop(0, rgba(cc, 0.42 * glassK));
      caus.addColorStop(0.45, rgba(cc, 0.16 * glassK));
      caus.addColorStop(1, rgba(cc, 0));
      g.fillStyle = caus;
      g.fillRect(cx - R, cy - R, R * 2, R * 2);
      g.globalCompositeOperation = 'source-over';
    }
    g.restore();

    // (3) 반사광: 아래 테두리를 따라 얇게 빛나는 띠. 고리 모양을 따로 그리고 위쪽을 서서히 지워 아래쪽에만 남긴 뒤 가산 혼합으로 얹는다
    if (rimK > 0) {
      const rc = makeCanvas(S, S);
      if (rc) {
        const h = rc.getContext('2d');
        const ring = h.createRadialGradient(cx, cy, R * 0.7, cx, cy, R);
        ring.addColorStop(0, rgba(rimC, 0));
        ring.addColorStop(0.62, rgba(rimC, 0.1 * rimK));
        ring.addColorStop(0.9, rgba(rimC, 0.62 * Math.min(1, rimK)));
        ring.addColorStop(0.965, rgba(lighten(rimC, 0.45), 0.85 * Math.min(1, rimK)));
        ring.addColorStop(1, rgba(rimC, 0));
        h.fillStyle = ring;
        h.beginPath(); h.arc(cx, cy, R, 0, TAU); h.fill();
        // 빛 반대편(아래)만 남기기: 빛 방향 축을 따라 투명에서 불투명으로
        h.globalCompositeOperation = 'destination-in';
        const mx0 = cx + lx * R, my0 = cy + ly * R, mx1 = cx - lx * R, my1 = cy - ly * R;
        const mask = h.createLinearGradient(mx0, my0, mx1, my1);
        mask.addColorStop(0, 'rgba(0,0,0,0)');
        mask.addColorStop(0.42, 'rgba(0,0,0,0)');
        mask.addColorStop(0.72, 'rgba(0,0,0,0.55)');
        mask.addColorStop(1, 'rgba(0,0,0,1)');
        h.fillStyle = mask;
        h.fillRect(0, 0, S, S);
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.drawImage(rc, 0, 0);
        if (rimK > 1) { g.globalAlpha = rimK - 1; g.drawImage(rc, 0, 0); }
        g.restore();
      }
    }

    // (4) 유리 광택
    if (glossK > 0) paintGloss(g, cx, cy, R, lx, ly, ang, glossK);

    return cachePut(key, { canvas: cv, radius: r, pad, res, size });
  }

  // 광택 덮개: 유리 광택 겹만 담은 그림. 구슬 몸통 위에 도는 무늬를 그린 뒤 맨 위에 덮으면
  // 무늬는 굴러도 반사광은 늘 빛 쪽에 머문다. drawSphere로 그린다. opt: gloss · light · res (createGlossySphere와 같은 뜻)
  function createGlossCap(radius, opt) {
    opt = opt || {};
    const r = Math.max(1, +radius || 1);
    const glossK = opt.gloss == null ? 1 : clamp(opt.gloss, 0, 1.2);
    const ang = opt.light == null ? -2.36 : +opt.light;
    const res = resOf(opt);
    const key = ['cap', r.toFixed(2), glossK, ang.toFixed(3), res].join('|');
    const hit = cacheGet(key);
    if (hit) return hit;
    const pad = 1, size = (r + pad) * 2, S = Math.ceil(size * res);
    const cv = makeCanvas(S, S);
    if (!cv) return null;
    paintGloss(cv.getContext('2d'), S / 2, S / 2, r * res, Math.cos(ang), Math.sin(ang), ang, glossK);
    return cachePut(key, { canvas: cv, radius: r, pad, res, size });
  }

  // 구슬 그리기. opt: { scaleX, scaleY, alpha, anchor: 'center' | 'bottom', rotate }
  // anchor 'bottom'이면 구슬 바닥점(y + radius)을 고정한 채 찌그러진다 (바닥에 부딪힐 때 자연스럽다)
  function drawSphere(ctx, sp, x, y, opt) {
    if (!ctx || !sp || !sp.canvas) return;
    opt = opt || {};
    const sx = opt.scaleX == null ? 1 : opt.scaleX, sy = opt.scaleY == null ? 1 : opt.scaleY;
    const a = opt.alpha == null ? 1 : opt.alpha;
    if (a <= 0) return;
    const half = sp.size / 2;
    ctx.save();
    if (a < 1) ctx.globalAlpha *= a;
    let ox = x, oy = y;
    if (opt.anchor === 'bottom') oy = y + sp.radius * (1 - sy);
    ctx.translate(ox, oy);
    if (opt.rotate) ctx.rotate(opt.rotate);
    if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
    ctx.drawImage(sp.canvas, -half, -half, sp.size, sp.size);
    ctx.restore();
  }

  // ---------------------------------------------------------------------------------------------
  // 2. 에너지 네온 선 (drawEnergyLine)
  // ---------------------------------------------------------------------------------------------
  // 세 겹을 가산 혼합('lighter')으로 겹친다. shadowBlur는 쓰지 않는다 (태블릿에서 느리다).
  //   (1) 빛 번짐: 아주 넓고 옅은 선 두 번 (넓을수록 옅게 겹쳐 빛이 부드럽게 퍼지게)
  //   (2) 색 선: 중간 굵기의 선명한 색
  //   (3) 심: 가장 안쪽의 가는 하얀 선 (색이 살짝 섞인 흰색이라 차갑지 않다)
  // points: [{x,y}, ...] 또는 [x0,y0,x1,y1,...] (두 점 이상). 세 점 이상이면 꺾인 곳을 부드러운 곡선으로 잇는다
  // opt
  //   color   선 색 (기본 '#4cf')
  //   width   색 선 굵기 (기본 6, 화면 단위)
  //   glow    빛 번짐 배율 0~2 (기본 1)
  //   core    심 굵기 비율 (기본 0.34)
  //   alpha   전체 진하기 0~1 (기본 1)
  //   pulse   0~1 사이 숫자를 매 프레임 넣으면 빛 번짐이 숨 쉬듯 커졌다 작아진다 (예: (Math.sin(t*6)+1)/2)
  //   closed  true면 끝점을 처음 점과 잇는다
  //   smooth  false면 곡선 없이 꺾인 선 그대로
  function toPoints(points) {
    if (!points || !points.length) return [];
    if (typeof points[0] === 'number') {
      const out = [];
      for (let i = 0; i + 1 < points.length; i += 2) out.push({ x: points[i], y: points[i + 1] });
      return out;
    }
    return points;
  }
  function tracePath(ctx, pts, closed, smooth) {
    ctx.beginPath();
    const n = pts.length;
    if (n === 2 || smooth === false) {
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < n; i++) ctx.lineTo(pts[i].x, pts[i].y);
      if (closed) ctx.closePath();
      return;
    }
    // 이웃한 두 점의 가운데를 지나는 2차 곡선: 점을 그대로 지나지는 않지만 꺾임 없이 매끈하다
    if (closed) {
      const m0x = (pts[n - 1].x + pts[0].x) / 2, m0y = (pts[n - 1].y + pts[0].y) / 2;
      ctx.moveTo(m0x, m0y);
      for (let i = 0; i < n; i++) {
        const p = pts[i], q = pts[(i + 1) % n];
        ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
      }
      ctx.closePath();
      return;
    }
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < n - 1; i++) {
      const p = pts[i], q = pts[i + 1];
      ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
    }
    ctx.lineTo(pts[n - 1].x, pts[n - 1].y);
  }
  function drawEnergyLine(ctx, points, opt) {
    if (!ctx) return;
    const pts = toPoints(points);
    if (pts.length < 2) return;
    opt = opt || {};
    const col = parse(opt.color || '#4cf');
    const w = Math.max(0.5, opt.width == null ? 6 : +opt.width);
    const glowK = opt.glow == null ? 1 : clamp(opt.glow, 0, 2);
    const coreK = opt.core == null ? 0.34 : clamp(opt.core, 0.05, 0.9);
    const a = opt.alpha == null ? 1 : clamp(opt.alpha, 0, 1);
    if (a <= 0) return;
    const pulse = opt.pulse == null ? 0.5 : clamp(opt.pulse, 0, 1);
    const breathe = calm() ? 1 : 0.86 + pulse * 0.28; // 빛 번짐 굵기만 숨 쉰다
    const halo = vivid(col, 0.45);
    const coreC = lighten(col, 0.82);

    ctx.save();
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'rgba(0,0,0,0)';
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    tracePath(ctx, pts, !!opt.closed, opt.smooth);

    // (1) 빛 번짐: 넓은 것부터 좁은 것까지 옅은 선을 네 번 겹친다. 가산 혼합이라 가운데로 갈수록 저절로 밝아져
    //     띠 모양 경계 없이 부드럽게 퍼진다
    if (glowK > 0) {
      const G = [[6.4, 0.035], [4.6, 0.05], [3.3, 0.07], [2.3, 0.1]];
      for (const [k, al] of G) {
        ctx.strokeStyle = rgba(halo, al * a * Math.min(1, glowK));
        ctx.lineWidth = w * k * glowK * breathe;
        ctx.stroke();
      }
    }
    // (2) 색 선
    ctx.strokeStyle = rgba(col, 0.88 * a);
    ctx.lineWidth = w;
    ctx.stroke();
    // 색 선 안쪽을 한 번 더 밝게: 색과 심 사이가 끊겨 보이지 않게 이어 주는 얇은 겹
    ctx.strokeStyle = rgba(lighten(col, 0.4), 0.55 * a);
    ctx.lineWidth = w * 0.62;
    ctx.stroke();
    // (3) 하얀 심
    ctx.strokeStyle = rgba(coreC, 0.95 * a);
    ctx.lineWidth = Math.max(0.6, w * coreK);
    ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------------------------------------
  // 3. 젤리 탄성 계산기 (SpringScaler)
  // ---------------------------------------------------------------------------------------------
  // 찌그러짐 정도 하나(amt)를 용수철처럼 움직인다. amt 1이면 가로 1.3배·세로 0.7배(납작), -1이면 가로 0.7배·세로 1.3배(길쭉).
  // 그림에만 쓰는 값이다. 게임 규칙의 크기·충돌 판정에는 쓰지 않는다.
  // opt
  //   squash     amt 1일 때 늘어나는 비율 (기본 0.3 → 1.3배와 0.7배)
  //   stiffness  용수철 세기 (기본 320, 클수록 빨리 돌아온다)
  //   damping    멈추는 힘 (기본 13, 작을수록 여러 번 띠용띠용 흔들린다)
  //   max        amt 한계 (기본 1.2)
  // 쓰는 법
  //   const sp = new VFX.SpringScaler();
  //   부딪힐 때 sp.squash(세기 0~1)   뛰어오를 때 sp.stretch(세기 0~1)   매 프레임 sp.update(dt초)
  //   그릴 때 VFX.drawSphere(ctx, 구슬, x, y, { scaleX: sp.scaleX, scaleY: sp.scaleY, anchor: 'bottom' })
  class SpringScaler {
    constructor(opt) {
      opt = opt || {};
      this.k = opt.stiffness == null ? 320 : Math.max(1, +opt.stiffness);
      this.c = opt.damping == null ? 13 : Math.max(0, +opt.damping);
      this.squashK = opt.squash == null ? 0.3 : clamp(+opt.squash, 0, 0.6);
      this.max = opt.max == null ? 1.2 : Math.max(0.1, +opt.max);
      this.amt = 0;
      this.vel = 0;
      this.scaleX = 1;
      this.scaleY = 1;
    }
    // 세기만큼 바로 납작하게 (이미 더 납작하면 그대로 둔다)
    squash(strength) {
      const s = clamp(strength == null ? 1 : +strength, 0, this.max) * (calm() ? 0.4 : 1);
      if (s > this.amt) { this.amt = s; this.vel = 0; }
      this._apply();
      return this;
    }
    // 세기만큼 바로 길쭉하게 (뛰어오르는 순간)
    stretch(strength) {
      const s = clamp(strength == null ? 1 : +strength, 0, this.max) * (calm() ? 0.4 : 1);
      if (-s < this.amt) { this.amt = -s; this.vel = 0; }
      this._apply();
      return this;
    }
    // 지금 상태에 속도만 더한다 (살짝 출렁이게)
    kick(v) { this.vel += +v || 0; return this; }
    // 매 프레임: dt는 초 단위. 큰 dt는 잘게 나눠 계산해 튀지 않는다
    update(dt) {
      dt = clamp(+dt || 0, 0, 0.25);
      let steps = Math.ceil(dt / (1 / 240));
      const h = steps > 0 ? dt / steps : 0;
      while (steps-- > 0) {
        const acc = -this.k * this.amt - this.c * this.vel;
        this.vel += acc * h;
        this.amt += this.vel * h;
      }
      this.amt = clamp(this.amt, -this.max, this.max);
      if (Math.abs(this.amt) < 0.0005 && Math.abs(this.vel) < 0.005) { this.amt = 0; this.vel = 0; }
      this._apply();
      return this;
    }
    // 멈췄는가 (멈추면 그림을 다시 안 그려도 된다)
    get settled() { return this.amt === 0 && this.vel === 0; }
    reset() { this.amt = 0; this.vel = 0; this._apply(); return this; }
    _apply() {
      const d = this.amt * this.squashK;
      this.scaleX = 1 + d;
      this.scaleY = Math.max(0.2, 1 - d);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // 4. 불꽃과 별빛 파편 (ParticleEmitter)
  // ---------------------------------------------------------------------------------------------
  // 알갱이 모양 세 가지:
  //   'spark'  움직이는 방향으로 늘어나는 불꽃 줄 (부딪힘·폭발)
  //   'dot'    둥근 빛 알갱이 (선을 그을 때 흩날리는 가루)
  //   'star'   네 갈래로 반짝이며 도는 별빛
  // 모두 미리 그려 둔 빛 그림을 가산 혼합으로 찍는다 (알갱이마다 그라데이션을 새로 만들지 않아 빠르다).
  // 난수는 게임 규칙의 난수(Math.random이나 게임 씨앗)를 건드리지 않게 자기 난수를 쓴다.
  //
  // new VFX.ParticleEmitter({ max: 400, seed: 1 })
  // em.emit(x, y, opt)   opt: count(기본 14) · color(기본 '#ffd36b') · colors(색 여러 개 중 하나씩) · kind
  //                      speed(기본 260, 화면 단위/초) · speedJitter(기본 0.5) · angle(기본 위쪽 -PI/2) · spread(기본 2PI 사방)
  //                      gravity(기본 900) · drag(기본 1.6, 공기 저항) · life(기본 0.7초) · lifeJitter(기본 0.4)
  //                      size(기본 4) · sizeJitter(기본 0.5) · vx·vy(물체 속도를 물려받기) · floor(이 y에서 튕김) · bounce(기본 0.35)
  //                      spin(별 회전 속도) · glow(빛 번짐 배율, 기본 1)
  // em.trail(x0, y0, x1, y1, opt)   선을 따라 고르게 알갱이를 흘린다 (선 긋기용, 기본 dot·적게·약한 중력)
  // em.update(dt)        매 프레임 (초 단위)
  // em.draw(ctx)         매 프레임
  // em.count             살아 있는 알갱이 수 · em.clear() 모두 지우기
  function rng(seed) {
    let s = (seed >>> 0) || 0x9e3779b9;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 빛 알갱이 그림: 하얀 심 + 색 번짐. 64px 한 장을 크기만 바꿔 찍는다
  function dotSprite(color) {
    const c = parse(color);
    const key = 'pdot|' + c.join('.');
    const hit = cacheGet(key);
    if (hit) return hit;
    const S = 64, cv = makeCanvas(S, S);
    if (!cv) return null;
    const g = cv.getContext('2d'), m = S / 2;
    const gr = g.createRadialGradient(m, m, 0, m, m, m);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.12, rgba(lighten(c, 0.7), 0.95));
    gr.addColorStop(0.3, rgba(vivid(c, 0.3), 0.55));
    gr.addColorStop(0.62, rgba(c, 0.14));
    gr.addColorStop(1, rgba(c, 0));
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    return cachePut(key, cv);
  }
  // 별빛 그림: 가늘게 빠지는 네 갈래 빛줄기 + 작은 대각 갈래 + 가운데 빛 (가산 혼합으로 한 장에 굽는다)
  function starSprite(color) {
    const c = parse(color);
    const key = 'pstar|' + c.join('.');
    const hit = cacheGet(key);
    if (hit) return hit;
    const S = 96, cv = makeCanvas(S, S);
    if (!cv) return null;
    const g = cv.getContext('2d'), m = S / 2;
    g.globalCompositeOperation = 'lighter';
    const ray = (len, thick, alpha, rot) => {
      g.save();
      g.translate(m, m);
      g.rotate(rot);
      const lg = g.createLinearGradient(-len, 0, len, 0);
      lg.addColorStop(0, rgba(c, 0));
      lg.addColorStop(0.42, rgba(lighten(c, 0.4), alpha * 0.6));
      lg.addColorStop(0.5, 'rgba(255,255,255,' + alpha.toFixed(3) + ')');
      lg.addColorStop(0.58, rgba(lighten(c, 0.4), alpha * 0.6));
      lg.addColorStop(1, rgba(c, 0));
      g.fillStyle = lg;
      // 가운데가 굵고 끝이 뾰족한 마름모꼴 빛줄기
      g.beginPath();
      g.moveTo(-len, 0);
      g.quadraticCurveTo(0, -thick, len, 0);
      g.quadraticCurveTo(0, thick, -len, 0);
      g.fill();
      g.restore();
    };
    ray(m * 0.98, m * 0.16, 1, 0);
    ray(m * 0.98, m * 0.16, 1, Math.PI / 2);
    ray(m * 0.5, m * 0.08, 0.55, Math.PI / 4);
    ray(m * 0.5, m * 0.08, 0.55, -Math.PI / 4);
    const gr = g.createRadialGradient(m, m, 0, m, m, m * 0.42);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)');
    gr.addColorStop(0.35, rgba(lighten(c, 0.5), 0.5));
    gr.addColorStop(1, rgba(c, 0));
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    return cachePut(key, cv);
  }

  class ParticleEmitter {
    constructor(opt) {
      opt = opt || {};
      this.max = Math.max(8, opt.max == null ? 400 : opt.max | 0);
      this.rand = typeof opt.rand === 'function' ? opt.rand : rng(opt.seed == null ? 0x51ab : opt.seed);
      // 미리 만들어 두고 다시 쓴다 (매번 새로 만들지 않아 끊김이 없다)
      this.pool = [];
      for (let i = 0; i < this.max; i++) this.pool.push({ on: false });
      this.live = 0;
      this.next = 0;
    }
    get count() { return this.live; }
    clear() { for (const p of this.pool) p.on = false; this.live = 0; return this; }
    _take() {
      // 빈 칸을 찾고, 없으면 가장 오래 산 것을 다시 쓴다
      for (let n = 0; n < this.max; n++) {
        const i = (this.next + n) % this.max;
        if (!this.pool[i].on) { this.next = (i + 1) % this.max; this.live++; return this.pool[i]; }
      }
      let old = this.pool[0];
      for (const p of this.pool) if (p.age / p.life > old.age / old.life) old = p;
      return old;
    }
    emit(x, y, opt) {
      opt = opt || {};
      const R = this.rand;
      let count = opt.count == null ? 14 : Math.max(0, opt.count | 0);
      if (calm()) count = Math.ceil(count * 0.4);
      const kind = opt.kind || 'spark';
      const colors = opt.colors && opt.colors.length ? opt.colors : [opt.color || '#ffd36b'];
      const speed = opt.speed == null ? 260 : +opt.speed;
      const sj = opt.speedJitter == null ? 0.5 : clamp(opt.speedJitter, 0, 1);
      const ang = opt.angle == null ? -Math.PI / 2 : +opt.angle;
      const spread = opt.spread == null ? TAU : clamp(+opt.spread, 0, TAU);
      const life = opt.life == null ? 0.7 : Math.max(0.05, +opt.life);
      const lj = opt.lifeJitter == null ? 0.4 : clamp(opt.lifeJitter, 0, 0.9);
      const size = opt.size == null ? 4 : Math.max(0.5, +opt.size);
      const zj = opt.sizeJitter == null ? 0.5 : clamp(opt.sizeJitter, 0, 0.9);
      const baseVx = +opt.vx || 0, baseVy = +opt.vy || 0;
      for (let i = 0; i < count; i++) {
        const p = this._take();
        const a = spread >= TAU ? R() * TAU : ang + (R() - 0.5) * spread;
        const v = speed * (1 - sj + R() * sj * 2) * (calm() ? 0.6 : 1);
        p.on = true;
        p.kind = kind;
        p.x = x; p.y = y; p.px = x; p.py = y;
        p.vx = Math.cos(a) * v + baseVx;
        p.vy = Math.sin(a) * v + baseVy;
        p.g = opt.gravity == null ? 900 : +opt.gravity;
        p.drag = opt.drag == null ? 1.6 : Math.max(0, +opt.drag);
        p.life = life * (1 - lj + R() * lj * 2);
        p.age = 0;
        p.size = size * (1 - zj + R() * zj * 2);
        p.color = colors[(R() * colors.length) | 0];
        p.rot = R() * TAU;
        p.spin = (opt.spin == null ? 5 : +opt.spin) * (R() < 0.5 ? -1 : 1) * (0.5 + R());
        p.floor = opt.floor == null ? null : +opt.floor;
        p.bounce = opt.bounce == null ? 0.35 : clamp(opt.bounce, 0, 0.95);
        p.glow = opt.glow == null ? 1 : clamp(opt.glow, 0, 3);
        p.tw = R() * TAU; // 반짝임 시작점
      }
      return this;
    }
    // 선을 따라 알갱이 흘리기: gap(기본 10) 간격마다 몇 개씩, 선과 직각으로 살짝 퍼진다
    trail(x0, y0, x1, y1, opt) {
      opt = Object.assign({ kind: 'dot', count: 1, speed: 60, gravity: 260, life: 0.55, size: 3, drag: 2.4, gap: 10 }, opt || {});
      const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
      const steps = Math.max(1, Math.floor(len / Math.max(2, opt.gap)));
      const nx = len > 0 ? -dy / len : 0, ny = len > 0 ? dx / len : -1;
      for (let i = 0; i < steps; i++) {
        const t = (i + this.rand()) / steps;
        const side = this.rand() < 0.5 ? -1 : 1;
        this.emit(x0 + dx * t, y0 + dy * t, Object.assign({}, opt, { angle: Math.atan2(ny * side, nx * side), spread: 1.6 }));
      }
      return this;
    }
    update(dt) {
      dt = clamp(+dt || 0, 0, 0.1);
      if (!dt) return this;
      for (const p of this.pool) {
        if (!p.on) continue;
        p.age += dt;
        if (p.age >= p.life) { p.on = false; this.live--; continue; }
        p.px = p.x; p.py = p.y;
        const k = Math.exp(-p.drag * dt);
        p.vx *= k;
        p.vy = p.vy * k + p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.floor != null && p.y > p.floor && p.vy > 0) {
          p.y = p.floor;
          p.vy = -p.vy * p.bounce;
          p.vx *= 0.7;
        }
        p.rot += p.spin * dt;
      }
      if (this.live < 0) this.live = 0;
      return this;
    }
    draw(ctx) {
      if (!ctx || !this.live) return;
      ctx.save();
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = 'lighter';
      const base = ctx.globalAlpha;
      for (const p of this.pool) {
        if (!p.on) continue;
        const t = p.age / p.life;           // 0에서 1로
        const shrink = 1 - t * t;            // 처음엔 천천히, 끝에 빨리 작아진다
        const fade = t < 0.08 ? t / 0.08 : 1 - Math.pow((t - 0.08) / 0.92, 1.6); // 아주 잠깐 피어났다 사라진다
        const s = p.size * shrink;
        if (s <= 0.15 || fade <= 0) continue;
        if (p.kind === 'spark') {
          // 움직인 방향으로 늘린 빛 줄: 속도가 빠를수록 길다
          const sp = dotSprite(p.color);
          const vx = p.vx, vy = p.vy, v = Math.hypot(vx, vy);
          const len = Math.max(s * 2.2, Math.min(s * 9, v * 0.035)) * p.glow;
          ctx.globalAlpha = base * fade;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(Math.atan2(vy, vx));
          if (sp) ctx.drawImage(sp, -len, -s * 1.3 * p.glow, len * 2, s * 2.6 * p.glow);
          // 안쪽 하얀 심을 한 번 더 작게 (불꽃 머리가 또렷하게)
          if (sp) ctx.drawImage(sp, -len * 0.35, -s * 0.5, len * 0.7, s);
          ctx.restore();
        } else if (p.kind === 'star') {
          const sp = starSprite(p.color);
          const tw = calm() ? 1 : 0.75 + 0.25 * Math.sin(p.tw + p.age * 18); // 반짝반짝
          const d = s * 3.4 * p.glow * tw;
          ctx.globalAlpha = base * fade;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(calm() ? 0 : p.rot);
          if (sp) ctx.drawImage(sp, -d, -d, d * 2, d * 2);
          ctx.restore();
        } else {
          const sp = dotSprite(p.color);
          const d = s * 2.4 * p.glow;
          ctx.globalAlpha = base * fade;
          if (sp) ctx.drawImage(sp, p.x - d, p.y - d, d * 2, d * 2);
        }
      }
      ctx.restore();
    }
  }

  Object.assign(V, {
    createGlossySphere, createGlossCap, drawSphere, drawEnergyLine, SpringScaler, ParticleEmitter,
    calm, clearCache,
    // 다른 그림 코드에서도 쓸 수 있는 색 도구
    color: { parse, rgba, mix, lighten, darken, deep, vivid },
  });
})(VFX);
if (typeof module !== 'undefined') module.exports = VFX;
