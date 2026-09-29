'use strict';
// 슥슥 우주 다리 수치 · 판 · 캐릭터 · 펜 · 미션 · 메달. 밸런스와 판 추가는 이 파일만 고친다.
// 판 좌표는 논리 크기 1280×800 (y는 아래로), 화면에 맞춰 통째로 늘리고 남는 곳은 배경으로 채운다.
(function (BR) {
  const D = {};

  D.VIEW = { w: 1280, h: 800 };

  // 물리 (px 단위. 물리 엔진 안에서는 scale로 나눈 미터)
  D.PHYS = {
    scale: 40,            // 40px = 1m
    gravity: 14,          // m/초² (지구 9.8보다 조금 세게: 아이가 기다리지 않게)
    ballR: 34, ballDensity: 1, ballFriction: 0.6, ballBounce: 0.06,
    lineHalf: 7,          // 그린 선 굵기의 반 (px)
    lineDensity: 2, lineFriction: 0.8, dotFriction: 0.2,
    dotR: 13,             // 톡 눌러 만드는 구슬
    step: 10,             // 선 점 사이 최소 간격 (px)
    smooth: 2,            // 손 떨림 다듬기 횟수
    maxPts: 400,
    groundFriction: 0.8, iceFriction: 0.02,
    boxDensity: 0.6, plankDensity: 0.3, plankHalf: 9, seesawLimit: 0.45,
    goalR: 74,            // 공 가운데가 친구 앞 이 거리 안에 오면 만났다
    stillV: 8, stuckSec: 3,   // 이보다 느리게 이 시간 멈춰 있으면 "막혔나요?"
    fallShow: 0.9,        // 떨어진 뒤 다시 시작까지 (초)
  };

  // 잉크와 별: 판마다 정답 선 길이(sol)로 정한다. 별 3개 = 정답의 par3배 이하, 별 2개 = par2배 이하, 잉크 전체 = ink배
  D.INK = { par3: 1.45, par2: 2.2, ink: 3.4, min: 700 };

  D.PLANETS = [
    { id: 'moon', name: '달', sky: 'moon', open: 0, color: '#cfd6ea' },
    { id: 'mars', name: '화성', sky: 'mars', open: 5, color: '#ff8a5c' },   // open: 달에서 깬 판 수
  ];

  // ─── 판 ────────────────────────────────────────────────────
  // ground: [{top:[[x,y]...] 윗면 왼쪽→오른쪽, ice?}] (아래는 화면 밖까지 채운다) · rocks: [[x,y,r]] · boxes: [{x,y,w,h}]
  // seesaws: [{x,y,w}] 가운데가 받침 · springs: [{x,y,w,power,kick?}]
  // ball: 공 가운데 · goal: 외계인 친구가 서 있는 발 자리 · push: 첫 선을 그리면 공이 출발하는 빠르기 [vx, vy] (px/초)
  // sol: 정답 선 (테스트가 그려서 풀리는지 확인한다, 힌트 점선) · say: 친구 말풍선 · tip: 처음 판 안내
  const LV = [];
  const add = (planet, o) => { o.planet = planet; o.n = LV.filter(l => l.planet === planet).length + 1; o.id = planet + '-' + o.n; LV.push(o); };

  // ── 달 ──
  add('moon', { name: '첫 다리', say: '여기야!', tip: '손가락으로 쭉! 다리를 그려 봐요',
    ground: [{ top: [[0, 400], [220, 430], [410, 470]] }, { top: [[830, 540], [1280, 540]] }],
    ball: [150, 386], goal: [1060, 540],
    sol: [[[360, 448], [600, 488], [880, 526]]] });
  add('moon', { name: '넓은 골짜기', say: '건너와!',
    ground: [{ top: [[0, 340], [260, 390], [360, 424]] }, { top: [[930, 520], [1280, 520]] }],
    ball: [120, 330], goal: [1110, 520],
    sol: [[[320, 398], [640, 458], [980, 506]]] });
  add('moon', { name: '떨어지는 공', say: '받아 줘!',
    ground: [{ top: [[360, 440], [440, 440]] }, { top: [[800, 620], [1280, 620]] }],
    ball: [540, 120], goal: [1070, 620],
    sol: [[[372, 426], [440, 428], [600, 510], [860, 606]]] });
  add('moon', { name: '두 골짜기', say: '한 번에 쭉!',
    ground: [{ top: [[0, 380], [300, 470]] }, { top: [[560, 560], [650, 560]] }, { top: [[920, 600], [1280, 600]] }],
    ball: [110, 380], goal: [1110, 600],
    sol: [[[270, 452], [600, 530], [970, 586]]] });
  add('moon', { name: '오르막', say: '위로 올라와!',
    ground: [{ top: [[0, 260], [480, 560], [700, 560]] }, { top: [[700, 460], [1280, 460]] }],
    ball: [90, 270], goal: [1040, 460],
    sol: [[[400, 496], [560, 470], [700, 448], [800, 446]]] });
  add('moon', { name: '구멍 두 개', say: '구멍 조심!',
    ground: [{ top: [[0, 520], [330, 520]] }, { top: [[470, 520], [650, 520]] }, { top: [[790, 520], [1280, 520]] }],
    ball: [110, 486], push: [360, 0], goal: [1080, 520],
    sol: [[[290, 506], [560, 506], [830, 506]]] });
  add('moon', { name: '바위 넘기', say: '바위를 넘어!',
    ground: [{ top: [[0, 400], [300, 420]] }, { top: [[300, 560], [1280, 560]] }], rocks: [[620, 620, 150]],
    ball: [110, 384], push: [260, 0], goal: [1130, 560],
    sol: [[[250, 404], [430, 440], [620, 456], [820, 500], [1000, 548]]] });
  add('moon', { name: '톡 밀기', say: '살짝 밀어 줘!', tip: '톡 누르면 작은 구슬이 생겨요',
    ground: [{ top: [[0, 380], [330, 380], [700, 560], [1280, 560]] }],
    ball: [296, 346], goal: [1080, 560],
    sol: [[[276, 240], [277, 241]]] });
  add('moon', { name: '떨어지고 건너기', say: '거의 다 왔어!',
    ground: [{ top: [[0, 480], [160, 480], [420, 570]] }, { top: [[860, 600], [1280, 600]] }],
    ball: [260, 120], goal: [1080, 600],
    sol: [[[380, 546], [640, 578], [900, 586]]] });
  add('moon', { name: '골짜기와 언덕', say: '달 대장 판!',
    ground: [{ top: [[0, 280], [240, 350], [380, 410]] }, { top: [[840, 470], [1280, 470]] }],
    ball: [100, 270], goal: [1080, 470],
    sol: [[[320, 382], [480, 500], [640, 530], [780, 478], [920, 454]]] });

  // ── 화성 ──
  add('mars', { name: '스프링 첫 만남', say: '통 튕겨 와!',
    ground: [{ top: [[0, 360], [250, 410], [380, 450]] }, { top: [[720, 560], [880, 560]] }, { top: [[1000, 360], [1280, 360]] }, { top: [[1240, 0], [1280, 0]] }],
    springs: [{ x: 810, y: 550, w: 110, power: 600, kick: 190 }],
    ball: [110, 350], goal: [1130, 360],
    sol: [[[340, 432], [560, 500], [760, 546]]] });
  add('mars', { name: '시소 다리', say: '시소를 타고 와!', tip: '시소에 올라타면 기울어져요',
    ground: [{ top: [[0, 360], [300, 430]] }, { poly: [[620, 560], [660, 560], [660, 900], [620, 900]] }, { top: [[905, 650], [1280, 650]] }],
    seesaws: [{ x: 640, y: 540, w: 560, a: -0.3 }],
    ball: [90, 350], goal: [1130, 650],
    sol: [[[240, 414], [300, 422], [500, 470], [710, 500]]] });
  add('mars', { name: '미끄러운 얼음', say: '쌩쌩 달려와!',
    ground: [{ top: [[0, 320], [520, 470]], ice: true }, { top: [[1000, 540], [1280, 540]] }],
    ball: [90, 318], goal: [1160, 540],
    sol: [[[470, 458], [760, 500], [1040, 526]]] });
  add('mars', { name: '상자 디딤돌', say: '상자를 밟고!',
    ground: [{ top: [[0, 360], [260, 460]] }, { top: [[500, 780], [760, 780]] }, { top: [[1000, 520], [1280, 520]] }],
    boxes: [{ x: 630, y: 640, w: 120, h: 280 }],
    ball: [100, 360], goal: [1120, 520],
    sol: [[[230, 446], [630, 486], [1040, 506]]] });
  add('mars', { name: '두 번 튕기기', say: '높이 높이!',
    ground: [{ top: [[0, 320], [300, 460]] }, { top: [[520, 660], [690, 660]] }, { top: [[800, 500], [920, 500]] }, { top: [[1040, 300], [1280, 300]] }, { top: [[1240, 0], [1280, 0]] }],
    springs: [{ x: 620, y: 650, w: 110, power: 600, kick: 150 }, { x: 870, y: 490, w: 90, power: 620, kick: 150 }],
    ball: [90, 330], goal: [1150, 300],
    sol: [[[190, 398], [300, 446], [400, 520], [560, 644]]] });
  add('mars', { name: '바위 사이', say: '바위 사이로!',
    ground: [{ top: [[0, 500], [1280, 500]] }], rocks: [[470, 550, 110], [800, 550, 110]],
    ball: [120, 466], push: [560, 0], goal: [1120, 500],
    sol: [[[270, 490], [470, 424], [640, 418], [800, 424], [1000, 490]]] });
  add('mars', { name: '얼음 오르막', say: '미끄러져 올라와!',
    ground: [{ top: [[0, 200], [460, 560], [620, 560]], ice: true }, { top: [[620, 440], [1280, 440]] }],
    ball: [80, 200], goal: [1060, 440],
    sol: [[[370, 470], [520, 450], [620, 428], [730, 426]]] });
  add('mars', { name: '바위 받침', say: '바위를 딛고 와!',
    ground: [{ top: [[0, 280], [340, 420]], ice: true }, { top: [[940, 600], [1280, 600]] }],
    rocks: [[640, 650, 90]],
    ball: [70, 270], goal: [1130, 600],
    sol: [[[320, 406], [640, 548], [980, 586]]] });
  add('mars', { name: '스프링 다리', say: '다리 놓고 통!',
    ground: [{ top: [[0, 380], [240, 460]] }, { top: [[560, 700], [720, 700]] }, { top: [[1000, 380], [1280, 380]] }, { top: [[1240, 0], [1280, 0]] }],
    springs: [{ x: 640, y: 690, w: 110, power: 720, kick: 230 }],
    ball: [100, 380], goal: [1130, 380],
    sol: [[[210, 430], [300, 468], [460, 580], [600, 680]]] });
  add('mars', { name: '화성 대장', say: '화성 대장 판!',
    ground: [{ top: [[0, 300], [300, 380]], ice: true }, { top: [[660, 520], [760, 520]] }, { top: [[1020, 580], [1280, 580]] }],
    rocks: [[710, 540, 50]],
    ball: [90, 290], goal: [1150, 580],
    sol: [[[270, 364], [500, 430], [700, 470], [900, 520], [1060, 566]]] });

  // 정답 선 길이로 잉크·별 기준을 정한다 (판에 ink·par를 적으면 그 값)
  const pathLen = s => { let l = 0; for (let i = 1; i < s.length; i++) l += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]); return Math.max(l, D.PHYS.dotR * 2); };
  for (const l of LV) {
    l.solLen = l.sol.reduce((a, s) => a + pathLen(s), 0);
    if (!l.par) l.par = [Math.round(l.solLen * D.INK.par3), Math.round(l.solLen * D.INK.par2)];
    if (!l.ink) l.ink = Math.max(D.INK.min, Math.round(l.solLen * D.INK.ink));
  }
  D.LEVELS = LV;
  D.levelById = id => LV.find(l => l.id === id) || null;
  D.levelsOf = planet => LV.filter(l => l.planet === planet);

  // ─── 캐릭터 · 펜 (상점) ─────────────────────────────────────
  // 모양만 다르다 (물리는 같아서 판마다 공평). col: [빛, 가운데, 그림자] · ui: 화면 글자 색 · spot: 몸 무늬 색 · deco: 꾸밈
  D.CHARS = [
    { id: 'roll', name: '데굴이', desc: '반짝 별무늬 파란 공', price: 0, col: ['#eaffff', '#5ee7ff', '#1478b8'], spot: '#ffe66d', ui: '#5ee7ff', deco: 'stars' },
    { id: 'sun', name: '해님이', desc: '햇빛처럼 따뜻한 노란 공', price: 250, col: ['#fffbe0', '#ffc93d', '#c96a10'], spot: '#ffffff', ui: '#ffd23f', deco: 'rays' },
    { id: 'berry', name: '딸기 젤리', desc: '말랑말랑 분홍 젤리 공', price: 400, col: ['#fff0f8', '#ff7ac8', '#b0306e'], spot: '#fff6a8', ui: '#ff8fd0', deco: 'seeds' },
  ];
  // 펜: 그린 선 색. c: [빛 번짐, 가운데, 속 빛, 짙은 테두리]
  D.PENS = [
    { id: 'cyan', name: '파란 빛', price: 0, c: ['rgba(94,231,255,0.22)', '#5ee7ff', '#f0ffff', '#0e5a8a'] },
    { id: 'pink', name: '분홍 빛', price: 150, c: ['rgba(255,94,200,0.22)', '#ff5ec8', '#ffe0f4', '#8a1a6a'] },
    { id: 'gold', name: '황금 빛', price: 250, c: ['rgba(255,210,63,0.24)', '#ffd23f', '#fffbe0', '#8a5a00'] },
    { id: 'rainbow', name: '무지개', price: 500, rainbow: true, c: ['rgba(200,160,255,0.22)', '#b37dff', '#ffffff', '#4a2a8a'] },
  ];

  // ─── 코인 ─────────────────────────────────────────────────
  // 처음 깬 판: base + 별마다 perStar · 다시 깬 판: again + 별마다 againStar · 별이 늘면 늘어난 별마다 better
  D.COINS = { base: 20, perStar: 10, again: 4, againStar: 2, better: 10 };

  // ─── 미션 (상점과 같은 짜임, 세 개씩) ─────────────────────────
  // stat: 판 요약(shop.runOf) 값 · kind 'life' = 여러 판 더하기
  D.MISSION_SLOTS = 3;
  D.MISSION_STARTER = 4;
  D.MISSIONS = [
    { id: 'clear3', stat: 'clears', goal: 3, kind: 'life', text: '3판 깨기', reward: 40, starter: true },
    { id: 'lines15', stat: 'lines', goal: 15, kind: 'life', text: '선 15개 그리기', reward: 40, starter: true },
    { id: 'three2', stat: 'three', goal: 2, kind: 'life', text: '별 3개로 2판 깨기', reward: 60, starter: true },
    { id: 'clear10', stat: 'clears', goal: 10, kind: 'life', text: '10판 깨기', reward: 100 },
    { id: 'three6', stat: 'three', goal: 6, kind: 'life', text: '별 3개로 6판 깨기', reward: 140 },
    { id: 'lines50', stat: 'lines', goal: 50, kind: 'life', text: '선 50개 그리기', reward: 90 },
    { id: 'one5', stat: 'oneLine', goal: 5, kind: 'life', text: '선 하나로 5판 깨기', reward: 80 },
    { id: 'mars3', stat: 'marsClears', goal: 3, kind: 'life', text: '화성에서 3판 깨기', reward: 70 },
    { id: 'dots10', stat: 'dots', goal: 10, kind: 'life', text: '톡! 구슬 10개 만들기', reward: 50 },
    { id: 'spring3', stat: 'springs', goal: 3, kind: 'life', text: '스프링 3번 타기', reward: 60 },
  ];

  // ─── 메달 (기록 장부로 판정: rec = {levels:{id:{stars}}, total:{clears, three, lines, dots, springs, seesaw, oneLine, tiny}}) ───
  const cleared = (rec, planet) => LV.filter(l => (!planet || l.planet === planet) && rec.levels[l.id] && rec.levels[l.id].stars > 0).length;
  const starSum = rec => LV.reduce((a, l) => a + ((rec.levels[l.id] && rec.levels[l.id].stars) || 0), 0);
  const threeCount = rec => LV.filter(l => rec.levels[l.id] && rec.levels[l.id].stars >= 3).length;
  D.MEDALS = [
    { id: 'first', tier: 1, name: '첫 다리', desc: '한 판 깨기', check: r => cleared(r) >= 1 },
    { id: 'moon5', tier: 1, name: '달 탐험', desc: '달에서 5판 깨기', check: r => cleared(r, 'moon') >= 5 },
    { id: 'moon10', tier: 2, name: '달 정복', desc: '달 10판 모두 깨기', check: r => cleared(r, 'moon') >= 10 },
    { id: 'mars5', tier: 2, name: '화성 도착', desc: '화성에서 5판 깨기', check: r => cleared(r, 'mars') >= 5 },
    { id: 'mars10', tier: 3, name: '화성 정복', desc: '화성 10판 모두 깨기', check: r => cleared(r, 'mars') >= 10 },
    { id: 'three5', tier: 1, name: '반짝 별 셋', desc: '별 3개로 5판', check: r => threeCount(r) >= 5 },
    { id: 'three20', tier: 3, name: '별 부자', desc: '모든 판 별 3개', check: r => threeCount(r) >= LV.length },
    { id: 'stars30', tier: 2, name: '별 30개', desc: '별 30개 모으기', check: r => starSum(r) >= 30 },
    { id: 'spring', tier: 1, name: '통통 스프링', desc: '스프링 타고 친구 만나기', check: r => r.total.springClears >= 1 },
    { id: 'seesaw', tier: 1, name: '시소 친구', desc: '시소 판 깨기', check: r => r.total.seesaw >= 1 },
    { id: 'dot', tier: 1, name: '톡 박사', desc: '톡 구슬로 판 깨기', check: r => r.total.dotClears >= 1 },
    { id: 'one10', tier: 2, name: '한 번에 쭉', desc: '선 하나로 10판 깨기', check: r => r.total.oneLine >= 10 },
    { id: 'lines100', tier: 2, name: '그림 대장', desc: '선 100개 그리기', check: r => r.total.lines >= 100 },
    { id: 'tiny', tier: 3, name: '잉크 아끼기', desc: '잉크를 아주 조금만 써서 깨기', check: r => r.total.tiny >= 1 },
  ];
  D.TINY = 1.05;   // 정답 선 길이의 이 배 이하로 깨면 '잉크 아끼기'
  D.cleared = cleared; D.starSum = starSum; D.threeCount = threeCount;

  BR.DATA = D;
})(BR);
