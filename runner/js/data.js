'use strict';
// 모든 수치는 이 파일 한 곳에서 고친다.
// 단위: 거리 m, 시간 초, 줄(lane)은 0·1·2 (왼쪽부터)
(function (RN) {
  // ─── 난이도 세 단계 (시작 화면에서 고르고 이 기기에 기억: runner.diff) ───
  // hearts: 하트 수 · inv: 부딪힌 뒤 깜빡이는(무적) 시간
  // speed: 초당 m. warm초 동안은 base 그대로(몸풀기), 그 뒤 ramp초에 걸쳐 max까지 부드럽게(처음·끝이 완만한 곡선) 오른다
  // gap: 장애물 줄 사이 간격(초). 몸풀기 끝에서 start, 다 빨라졌을 때 end (그 사이는 같은 곡선으로 옮겨 간다)
  // warmRows: 몸풀기 동안 줄 모양 · rows: 줄 모양 가중치, start에서 end로 옮겨 간다
  //   one 운석 하나 · two 운석 둘 · mover 옆으로 미끄러지는 운석 · stars 별만
  //   gate 레이저 문(바닥, 점프) · bar 위쪽 막대(떠 있음, 미끄러지기)
  //   mg 운석+문 · mb 운석+막대 · gg 문 둘 · bb 막대 둘 · gb 문+막대
  //   g3 레이저 벽(세 줄 모두 문, 점프해야 지나감) · b3 막대 벽(세 줄 모두 막대, 미끄러져야 지나감)
  //   mgb 운석+문+막대 (빈 줄 없음: 점프나 미끄러지기 중 하나)
  //   (벽 줄이 있어서 옆으로만 피해서는 멀리 못 간다: 쉬움부터 상하좌우 네 방향을 다 쓴다)
  // starLine: 장애물 줄에 별 한 줄이 붙을 확률
  // item: first초 뒤 처음, 그 뒤 gap초마다 안전한 줄에 하나. w: 종류별 가중치 (heart 0이면 하트 아이템 없음)
  // bh: 블랙홀 구간에서 옆으로 끌어당기기. every초마다(범위) warn초 동안 화살표로 알리고, 반대로 밀지 않으면 한 줄 끌려간다.
  //     끌려갈 줄에 safe초 안에 닿는 장애물이 있으면 끌지 않는다 (안전한 줄 약속)
  // pirate: 우주 해적선. first초(범위) 뒤 처음, 그 뒤 every초마다 (처음 1분·처음 안내·블랙홀 구간에는 없음).
  //     warn초 동안 한 줄을 빛내 알린 뒤 beam초 동안 레이저. 쏘는 사이 shot초 · bombs: 한 번에 떨어뜨리는 폭탄 수 (뛰어넘는다)
  const DIFFICULTY = {
    easy: {
      id: 'easy', name: '쉬움', desc: '천천히 · 하트 3개',
      hearts: 3, inv: 2.4,
      speed: { base: 13, max: 22, warm: 20, ramp: 220 },
      gap: { start: [1.8, 2.4], end: [1.25, 1.7] },
      warmRows: [{ k: 'one', w: 5 }, { k: 'stars', w: 3 }],
      rows: {
        start: { one: 5, two: 1, gate: 2, bar: 2, mg: 0, mb: 0, gg: 0, bb: 0, gb: 0, g3: 1, b3: 1, mgb: 0, mover: 0, stars: 3 },
        end:   { one: 3, two: 3, gate: 1.5, bar: 1.5, mg: 1.5, mb: 1.5, gg: 0.5, bb: 0.5, gb: 1, g3: 1.2, b3: 1.2, mgb: 0.6, mover: 0, stars: 2 },
      },
      starLine: 0.85,
      item: { first: 7, gap: [9, 14], w: { shield: 3, magnet: 3, boost: 2, heart: 1.5 } },
      bh: { every: [4.5, 6.5], warn: 1.5, safe: 1.3, first: 2 },
      pirate: { first: [80, 115], every: [90, 130], warn: 1.3, beam: 0.45, shot: [2.8, 3.6], bombs: 2 },
    },
    normal: {
      id: 'normal', name: '보통', desc: '빠르게 · 하트 2개',
      hearts: 2, inv: 1.8,
      speed: { base: 16, max: 32, warm: 10, ramp: 110 },
      gap: { start: [1.15, 1.55], end: [0.78, 1.0] },
      rows: {
        start: { one: 3, two: 3, gate: 1, bar: 1, mg: 1.5, mb: 1.5, gg: 0.5, bb: 0.5, gb: 1, g3: 1, b3: 1, mgb: 1, mover: 1.5, stars: 1 },
        end:   { one: 1, two: 4, gate: 0.5, bar: 0.5, mg: 2, mb: 2, gg: 1, bb: 1, gb: 1.5, g3: 1, b3: 1, mgb: 2, mover: 4, stars: 1 },
      },
      starLine: 0.65,
      item: { first: 8, gap: [11, 17], w: { shield: 3, magnet: 3, boost: 2, heart: 0.8 } },
      bh: { every: [3.2, 4.5], warn: 1.1, safe: 1.0, first: 1.5 },
      pirate: { first: [62, 85], every: [55, 85], warn: 0.95, beam: 0.45, shot: [2.1, 2.9], bombs: 3 },
    },
    hard: {
      id: 'hard', name: '어려움', desc: '아주 빠르게 · 하트 1개',
      hearts: 1, inv: 1.4,
      speed: { base: 21, max: 40, warm: 0, ramp: 70 },
      gap: { start: [0.96, 1.33], end: [0.68, 0.92] },
      rows: {
        start: { one: 2, two: 3, gate: 1, bar: 1, mg: 2, mb: 2, gg: 1, bb: 1, gb: 1.5, g3: 1, b3: 1, mgb: 1, mover: 2, stars: 1 },
        end:   { one: 2, two: 3, gate: 1, bar: 1, mg: 2, mb: 2, gg: 1, bb: 1, gb: 2, g3: 1, b3: 1, mgb: 2, mover: 4, stars: 1 },
      },
      starLine: 0.55,
      item: { first: 9, gap: [12, 18], w: { shield: 4, magnet: 2, boost: 2, heart: 0 } },
      bh: { every: [2.4, 3.4], warn: 0.85, safe: 0.8, first: 1 },
      pirate: { first: [60, 75], every: [40, 65], warn: 0.75, beam: 0.45, shot: [1.7, 2.4], bombs: 4 },
    },
  };
  const DIFF_ORDER = ['easy', 'normal', 'hard'];

  // ─── 우주 여행: 달린 거리(m)에 따라 행성을 차례로 지나간다 (그리기는 render.js PLANET_ART) ───
  // leg m마다 다음 곳에 도착한다. 수성 → … → 명왕성(3,000m) → 외계 행성 여덟(common/worlds.js EXO, 3,375 ~ 6,000m)
  // → 은하 너머(6,375m) → 다시 수성(2바퀴째, 6,750m). worlds.js가 없으면(불러오지 못하면) 외계 행성 없이 태양계만 돈다
  // weather: 그곳 날씨 (worlds.js SOLAR_WEATHER · EXO[].weather, 그림 전용. 은하 너머는 null)
  // 기념 아치(250m마다)와 짝수 번째 도착(750·1,500·2,250·3,000m)이 겹쳐서 그 아치에는 행성 이름도 적힌다
  // line: 도착할 때 이름 아래에 뜨는 한 줄 (아이 눈높이, 재미 한 줄. 배우는 사실은 넣지 않는다: 소유자 결정 "학습 요소 없음").
  //   태양계 행성은 도감(worlds.js SOLAR_WEATHER[id].line)의 날씨 한 줄을 쓰고, 도감이 없을 때만 여기 적은 줄
  const ROUTE = { leg: 375 };
  const WX = typeof WORLDS !== 'undefined' && WORLDS && WORLDS.EXO ? WORLDS : null;   // common/worlds.js (hub.js 다음에 불러온다)
  const ZONES = [
    { id: 'mercury', name: '수성',   line: '뜨거운 불씨가 날려요' },
    { id: 'venus',   name: '금성',   line: '노란 안개가 뭉게뭉게' },
    { id: 'earth',   name: '지구',   line: '우리 집! 시원한 빗방울' },
    { id: 'mars',    name: '화성',   line: '빨간 모래바람이 쌩쌩' },
    { id: 'jupiter', name: '목성',   line: '번쩍번쩍 큰 폭풍' },
    { id: 'saturn',  name: '토성',   line: '반짝이 고리가 빙글빙글' },
    { id: 'uranus',  name: '천왕성', line: '데굴데굴 얼음 행성' },
    { id: 'neptune', name: '해왕성', line: '쌩쌩 눈보라' },
    { id: 'pluto',   name: '명왕성', line: '소복소복 하트 눈 행성' },
  ].map(z => Object.assign(z, { line: (WX && WX.SOLAR_WEATHER && WX.SOLAR_WEATHER[z.id] && WX.SOLAR_WEATHER[z.id].line) || z.line })).concat(WX ? WX.EXO.map(e => ({ id: e.id, name: e.name, line: e.line, exo: true })) : [],
    [{ id: 'beyond',  name: '은하 너머', line: '반짝이는 금빛 은하 소용돌이' }])
    .map((z, i) => Object.assign(z, { at: i * ROUTE.leg, weather: (WX && WX.weatherOf(z.id)) || null }));   // at: 첫 바퀴에서 도착하는 거리

  // ─── 블랙홀 구간: 지구 다음 행성부터, 행성 구간마다 chance 확률로 한 번 (두 구간 연달아 없음, 처음 안내 중에는 없음) ───
  // len m 동안 하늘이 블랙홀로 바뀌고 옆으로 끌어당긴다 (세기는 난이도의 bh). from: 이 번째 곳(0 수성)부터
  // pad: 구간이 행성 구간 앞뒤 끝에서 떨어져 있는 거리(m)
  const BLACKHOLE = { chance: 0.15, from: 3, len: [150, 250], pad: [50, 40], bonus: 30 };

  // ─── 우주 해적선 추격전 (빈도·세기는 난이도의 pirate) ───
  // dur초 동안 뒤 하늘에 떠서 레이저를 쏘고 폭탄을 떨어뜨린다. 버티면 "해적선을 따돌렸어요!" + bonus점 + shower초 동안 별 소나기.
  // minT: 판 시작 뒤 이만큼(초)은 안 나온다 · retry: 조건이 안 맞으면 이만큼 뒤 다시 본다 · firstShot: 나타나고 첫 레이저까지
  // gapMul: 해적선이 있는 동안 장애물 줄 간격 배율 (넉넉하게) · clearPad: 레이저를 피할 옆 줄은 경고+레이저 시간보다 이만큼 더 비어 있어야 한다
  // bombAhead: 폭탄은 이만큼(초) 앞에 떨어진다 · bombGap: 폭탄 앞뒤 이만큼(초) 안에는 같은 줄에 다른 장애물이 없다
  const PIRATE = { dur: 10, minT: 60, retry: 0.3, firstShot: 1.6, gapMul: 1.3, clearPad: 0.25, bombAhead: 3, bombGap: 0.7, bonus: 60, shower: 2.2 };

  // ─── 알아서 맞춰 주는 난이도 (놀이 본부 HUB.adaptMul: 0.85 ~ 1.12, 처음 두 판은 1) ───
  // mul이 1보다 크면 살짝 어렵게, 작으면 살짝 쉽게. 쉬움·보통·어려움 안에서만 조금 움직인다 (world.js adaptCfg)
  //   speed: 최고 속도 배율 = 1 + (mul-1) × speed · ramp: 빨라지는 시간 ÷ (1 + (mul-1) × ramp) · gap: 줄 간격 × (1 - (mul-1) × gap)
  //   mix: 어려운 줄 모양 가중치 × mul^mix (쉬운 줄은 ÷) · pirate: 해적선 간격 ÷ (1 + (mul-1) × pirate)
  // target: 판이 끝날 때 성적 = 달린 거리 ÷ target (1 = 그 난이도에서 보통 잘하는 아이. 서툰 아이 로봇과 사람 같은 로봇 평균 거리의 사이 값:
  //         쉬움 5,600 ~ 9,000m · 보통 800 ~ 2,600m · 어려움 360 ~ 1,120m)
  // ─── 깜짝 선물 상자 (네 게임 공통 기획, 2026-09-27 소유자 승인 "추천대로") ───
  // 가끔(first초 뒤 처음, 그 뒤 every초마다) 빛나는 선물 상자가 한 줄에 떠 온다. 해적선·블랙홀·처음 안내 중에는 없다.
  // 놓는 곳 (variant 가중치): lane 빈 줄 바닥 · jump 레이저 문 위 또는 빈 줄 높이 떠서 (뛰어야 먹는다) · slide 위쪽 막대 밑 (미끄러져야 먹는다).
  //   문·막대 줄에 놓을 때도 그 줄에 빈 줄이 따로 있을 때만 (선물 때문에 부딪힐 수밖에 없는 일은 없다)
  // bhPad: 블랙홀 구간 앞뒤 이만큼(m) 안에는 놓지 않는다
  // 선물 (reward 가중치, 뽑기 느낌 없이 늘 좋은 것 하나): coins 코인(coins 범위, 판이 끝날 때 받는 코인에 더해진다) ·
  //   power 바로 쓰는 아이템(powers 중 하나, 방패가 이미 있으면 방패는 빼고) · item 다음 판 시작 아이템(items 중 하나, 가득이면 fullCoins 코인으로)
  const GIFT = {
    first: [35, 55], every: [60, 100], bhPad: 30,
    variant: { lane: 5, jump: 2, slide: 2 }, y: 0.8, jumpY: 1.9, slideY: 0.3,
    reward: { coins: 5, power: 3, item: 2 }, coins: [15, 40],
    powers: ['shield', 'magnet', 'boost'], items: ['sshield', 'sboost', 'sheart'], fullCoins: 20,
  };

  // ─── 피버 타임 ───
  // 별을 이어 먹고(star, 연속 chainFrom개부터는 chain을 더), 별 한 줄을 다 먹고(perfect), 아슬아슬하게 비키면(near) 게이지가 찬다 (0 → 1).
  // 가득 차면 dur초 동안 피버: 별 점수 mul배, 빈 줄마다 별 한 줄 더, 처음 rain초 동안은 비어 있는 줄에 별이 쏟아진다(rainEvery초마다).
  // 피버 중에는 게이지가 안 찬다. 처음 안내 중에는 안 찬다. 게이지는 줄지 않는다 (아이 기준: 잃는 것 없음)
  const FEVER = { star: 0.003, chain: 0.003, chainFrom: 3, perfect: 0.035, near: 0.04, dur: 10, mul: 2, rain: 3.5, rainEvery: 0.14 };

  // ─── 워프 관문 ───
  // 행성 구간(ROUTE.leg m)마다 chance 확률로 하나. from번째 구간(0 수성)부터, 구간 안 pos m 지점 뒤 첫 줄의 빈 줄에 빛나는 고리 문이 선다.
  // slack m 안에 놓을 줄이 없으면 그 구간은 건너뛴다. 해적선·블랙홀·처음 안내 중에는 없고, 날아갈 길(dist m + clear m) 안에 블랙홀이 있어도 없다.
  // 지나가면 dur초 동안 워프 터널(장애물 없음, 안전) → dist m 앞으로 (거리에 들어간다) + bonus점. 나와서 clear m 동안은 장애물이 없다.
  // 놓쳐도 아무 일 없다
  const WARP = { chance: 0.8, from: 1, pos: [110, 230], slack: 90, dist: 200, dur: 2, clear: 45, bonus: 50 };

  const ADAPT = { min: 0.85, max: 1.12, speed: 0.3, ramp: 0.6, gap: 0.45, mix: 1, pirate: 1,
    hardRows: ['two', 'mg', 'mb', 'gg', 'bb', 'gb', 'g3', 'b3', 'mgb', 'mover'], easyRows: ['one', 'stars', 'gate', 'bar'],
    target: { easy: 6000, normal: 2400, hard: 600 } };

  // ─── 한 번 더! (2026-09-27 소유자 승인: 점검 권고 공통 항목) ───
  // 하트가 다하면 한 판에 max번 "한 번 더!"를 물어본다 (돈 0원, 광고 없음). ask초 동안 기다리고(둥근 시계), 안 누르면 그만.
  // 이어 하면: 부딪힌 자리에서 하트 hearts개, inv초 동안 깜빡(무적), 앞 clear m 안의 장애물을 치우고, wait초 준비한 뒤 출발.
  // guard: 결과 화면·한 번 더 화면이 뜬 뒤 이만큼(초)은 누르기를 받지 않는다 (부딪힌 뒤에도 계속 누르는 아이 손가락)
  const CONTINUE = { max: 1, ask: 5, hearts: 1, inv: 3, clear: 45, wait: 0.9, show: 0.7, guard: 0.6 };

    RN.DATA = {
    // 규칙은 1/120초 칸으로 돈다 (60·90·120Hz 화면에서 결과가 같게)
    TICK: 1 / 120,
    LANES: 3,

    DIFFICULTY, DIFF_ORDER, ZONES, ROUTE, BLACKHOLE, PIRATE, ADAPT, GIFT, FEVER, WARP, CONTINUE,

    // 앞쪽 이만큼(m)까지 물체를 미리 만들어 둔다 (지평선 끝). 뒤로 behind m 지나면 지운다
    // actGap: 빈 줄이 없는 줄(벽) 다음 줄까지 적어도 이만큼(초) 띄운다 (점프·미끄러지기 뒤 숨 돌리기)
    VIEW: 90,
    GEN: { behind: 4, minGap: 14, actGap: 0.85 },

    // 시작: 잠깐 READY 뒤 출발, 첫 줄은 firstRow m 앞
    START: { wait: 1.2, firstRow: 55 },

    // 옛 이름 (쉬움·보통 두 단계였을 때). 읽기 전용으로 남겨 둔다
    get EASY() { return DIFFICULTY.easy; },
    get NORMAL() { return DIFFICULTY.normal; },

    // 우주선: 줄 바꾸기 시간(laneT초, 처음 빠르고 끝이 부드러운 곡선), 점프 높이(m)·체공 시간(초),
    // 착지 직전 점프 기억(초). 점프는 빨리 오르고 꼭대기에서 잠깐 머문다(arc: 1보다 작을수록 둥실)
    // 부딪힘 판정: 옆으로 hitW 줄 안, 앞뒤로 hitZ m 안
    // 미끄러지기(아래로 밀기): slideT초 동안 바닥에 납작 붙는다. 떠 있을 때 누르면 dropV(초당 m)로 빠르게 내려와서 미끄러진다.
    // 미끄러지는 중에 점프하면 바로 뛴다
    PLAYER: { laneT: 0.17, jumpH: 1.7, jumpT: 0.6, arc: 0.6, buffer: 0.15, hitW: 0.55, hitZ: 0.9, slideT: 0.7, dropV: 14 },

    // 장애물: 운석은 너무 커서 점프로 못 넘는다. 레이저 문(바닥)은 gateH m보다 높이 뛰면 지나간다.
    // 위쪽 막대는 barLo~barHi m 높이에 떠 있어서 미끄러져야 밑으로 지나간다 (뛰면 머리를 콩)
    // 움직이는 운석: moverAt m 앞까지 오면 옆 줄로 moverSpeed(초당 줄)만큼 미끄러진다
    OBST: { meteorR: 1.15, gateH: 0.6, barLo: 0.62, barHi: 1.15, moverAt: 40, moverSpeed: 1.6 },

    // 별: 하나에 value점. chainGap초 안에 이어 먹으면 소리가 한 계단씩 오른다
    // 한 줄을 모두 먹으면 "완벽!" perfect점
    STAR: { value: 10, chainGap: 0.55, lineN: 5, rainEvery: 0.1, perfect: 20 },

    // 기념 아치: every m마다 거리 숫자가 적힌 빛나는 문을 지나간다 (bonus점)
    MILESTONE: { every: 250, bonus: 50 },

    // 아슬아슬: 운석·레이저 문이 있던 줄에서 window초 안에 옆 줄로 비켜 지나가면 bonus점.
    // 위험하게 기다릴수록 이득이 되지 않게 점수는 작고, cool초에 한 번만
    NEAR: { window: 0.7, bonus: 5, cool: 1.2, side: 1.3 },

    // 아이템 모양·효과 (나오는 빈도는 난이도의 item)
    ITEM: {
      kinds: {
        shield: { name: '방패',   color: '#5ee7ff', time: 0 },   // 한 번 부딪혀도 괜찮다
        magnet: { name: '자석',   color: '#ff5fa8', time: 7 },   // 모든 줄의 별을 끌어온다
        boost:  { name: '부스트', color: '#ffe66d', time: 4 },   // 아주 빠르게, 부딪혀도 부순다, 별 비
        heart:  { name: '하트',   color: '#ff6b8a', time: 0 },   // 하트 하나 채우기 (가득이면 안 나온다)
      },
      magnetRange: 16, boostMul: 1.7,
    },

    // 방패가 깨졌을 때·부스트가 끝났을 때·불사조가 다시 살아났을 때 잠깐 깜빡이는 시간 (부딪힌 뒤 시간은 난이도의 inv)
    HIT: { shieldInv: 1.0, boostGrace: 1.0, revive: 2.5, get inv() { return DIFFICULTY.easy.inv; } },

    // 처음 안내: 옆으로 밀기 → 레이저 문이 오면 위로 밀기 → 위쪽 막대가 오면 아래로 밀기.
    // 안내 동안은 늘 가장 쉬운 속도(쉬움 출발 속도)이고, 길에는 별 줄과 안내용 문·막대만 나온다 (진짜 운석·벽 없음, 하트를 잃을 일 없음).
    // 안내용 문·막대가 slowSec초(쉬움 출발 속도로 잰) 앞에 오면 slow배로 느려지고, 지금 속도로 showSec초 앞에 오면 글자가 뜬다.
    // 글자가 떴을 때(또는 느려지는 동안) 밀면 알맞은 때까지 기다렸다가 뛰거나 미끄러진다(assist: 문까지 이만큼 × 체공 시간 남았을 때).
    // 안내용 문·막대는 앞뒤 hitZ m 안에서만 부딪힌다 (보통 판보다 좁게: 느린 속도에서도 뛸 틈이 줄지 않게).
    // 옆으로 밀기 단계는 laneSec초 안에 안 밀면 다음 단계로. 한 단계에서 tries번 놓치면 다음 단계로 (마지막이면 끝).
    // 이 기기에서 안내를 maxRuns판 시작했으면 다 못 마쳐도 더 나오지 않는다 (util.js Prefs)
    TUTORIAL: { slow: 0.55, slowSec: 2.4, showSec: 1.2, assist: 0.45, hitZ: 0.3, tries: 3, laneSec: 7, maxRuns: 2 },

    // 메달. check(run, rec): run = 이번 판 기록, rec = 평생 기록 (main.js가 판이 끝날 때·게임 중에 확인)
    // tier: 1 동 · 2 은 · 3 금
    MEDALS: [
      { id: 'd500',    tier: 1, name: '첫 비행',     desc: '한 판에 500m',                 check: r => r.dist >= 500 },
      { id: 'd1500',   tier: 2, name: '먼 우주',     desc: '한 판에 1,500m',               check: r => r.dist >= 1500 },
      // d3000: 명왕성 메달(3,000m)과 똑같아서 목표를 바꿈 (id는 그대로라 예전에 딴 메달은 남는다): 여행의 끝 은하 너머
      { id: 'd3000',   tier: 3, name: '은하 너머까지', desc: '한 판에 은하 너머 도착 (' + ZONES[ZONES.length - 1].at.toLocaleString() + 'm)', check: r => r.dist >= ZONES[ZONES.length - 1].at },
      { id: 's50',     tier: 1, name: '별 50',       desc: '한 판에 별 50개',              check: r => r.stars >= 50 },
      { id: 's150',    tier: 2, name: '별 150',      desc: '한 판에 별 150개',             check: r => r.stars >= 150 },
      { id: 'gate10',  tier: 1, name: '폴짝폴짝',    desc: '한 판에 레이저 문 10번 넘기',  check: r => r.gates >= 10 },
      { id: 'shield',  tier: 1, name: '튼튼 방패',   desc: '방패로 운석 막기',             check: r => r.blocks >= 1 },
      { id: 'boost3',  tier: 2, name: '슝슝슝',      desc: '한 판에 부스트 3번',           check: r => r.boosts >= 3 },
      { id: 'clean',   tier: 3, name: '무사고 비행', desc: '안 부딪히고 1,000m',           check: r => r.hits === 0 && r.blocks === 0 && r.dist >= 1000 },
      { id: 'normal',  tier: 2, name: '보통도 거뜬', desc: '보통이나 어려움으로 1,000m',   check: r => r.diff !== 'easy' && r.dist >= 1000 },
      { id: 'hard',    tier: 3, name: '어려움 정복', desc: '어려움으로 1,000m',            check: r => r.diff === 'hard' && r.dist >= 1000 },
      { id: 'nebula',  tier: 2, name: '화성 탐험가', desc: '한 판에 화성 도착',            check: r => r.zone >= 3 },   // 옛 이름 성운 탐험가 (id 그대로)
      { id: 'near10',  tier: 1, name: '아슬아슬',    desc: '한 판에 운석 옆을 아슬아슬 10번 스치기', check: r => r.nears >= 10 },
      { id: 'perfect5', tier: 1, name: '완벽한 별길', desc: '한 판에 별 한 줄 다 먹기 5번', check: r => r.perfects >= 5 },
      { id: 'games10', tier: 1, name: '단골 조종사', desc: '10판 하기',                    check: (r, R) => R.total.games >= 10 },
      { id: 'stars1k', tier: 2, name: '별 부자',     desc: '모두 합쳐 별 1,000개',         check: (r, R) => R.total.stars >= 1000 },
      { id: 'pluto',   tier: 3, name: '명왕성 탐험가', desc: '한 판에 명왕성 도착 (3,000m)', check: r => r.zone >= 8 },
      { id: 'bhole',   tier: 2, name: '블랙홀 탈출', desc: '블랙홀 구간을 끝까지 지나기',   check: r => r.bhs >= 1 },
      { id: 'pirate',  tier: 2, name: '해적 따돌리기', desc: '우주 해적선을 따돌리기',       check: r => r.pirates >= 1 },
      { id: 'slide10', tier: 1, name: '쏙쏙 미끄럼', desc: '한 판에 위쪽 막대 10번 미끄러져 지나기', check: r => r.bars >= 10 },
    ],

    // 연출 (그리기 전용, 규칙에는 영향 없음). 부딪힘은 분명하지만 무섭지 않게: 흔들림·번쩍임은 작게
    FX: { starSparks: 8, hitSparks: 26, smashSparks: 24, maxParticles: 160, shake: 10, flash: 0.22, zoneFade: 2.2, banner: 2.6 },
    // 행성 날씨 (그리기 전용): 날씨 입자는 max개까지 (worlds.js amount 1일 때), 움직임 줄이기면 calm배 개수·calmSpeed배 빠르기.
    // fade: 행성이 바뀔 때 날씨가 바뀌는 시간(초) · boltEvery: 번개 사이 (초, 범위) · bolt: 번개 빛이 남는 시간(초)
    WEATHER: { max: 90, calm: 0.4, calmSpeed: 0.45, fade: 2.2, boltEvery: [2.8, 5.5], bolt: 0.35 },

    // 밀기 판정: 짧은 변 길이의 3% 또는 18px 중 큰 값 이상 움직이면 줄 바꾸기·점프
    SWIPE: { min: 18, ratio: 0.03 },

    // 처음 몇 초 조작 안내를 보여 준다 (처음 한 번 나오는 안내가 끝난 뒤의 판에서)
    HINT_TIME: 5,
  };
})(RN);

// ═══ 상점 · 미션 (2026-09-27, 소유자: "미션·상점·기록을 모든 게임에", 코인은 네 게임이 함께 쓰는 지갑) ═══
(function (RN) {
  // 캐릭터 5종 (2026-09-27, 소유자: "각 게임마다 캐릭터를 고를 수 있게 5종, 다양하게").
  // 모양이 확 다르고, 작은 특기가 하나씩 있다. 특기는 돕기만 하고 손해는 없다 (서로 다른 쪽을 도와서 어느 하나가 다 낫지 않게).
  // 그리기: render.js drawCharBody (shape). 특기 숫자: trait (world.js create가 읽는다)
  //   perfectMul: 완벽한 별길 보너스 배율 · magnet: 자석 시간 +초 · magnetRange: 자석이 끌어오는 거리(m)
  //   heart: 하트 +개 (쉬움·보통) · hardShield: 어려움에서는 방패를 두르고 출발
  //   laneT: 줄 바꾸기 시간(초, 작을수록 빠름) · nearMul: 아슬아슬 보너스 배율
  //   boost: 부스트 시간 +초 · revive: 한 판에 이만큼 다시 살아난다
  // body: [밝은 곳, 가운데, 어두운 곳] · accent: 무늬 색 · flame: 엔진 불꽃·몸 밑 빛 (r,g,b) · core: 조종석 빛 · ui: 상점 카드 색
  const CHARS = [
    { id: 'jet', name: '슝슝 제트', price: 0, shape: 'jet', ui: '#5ee7ff',
      body: ['#d9fbff', '#5ee7ff', '#1a9ec0'], accent: '#ff2e88', flame: '255,46,136', core: '#5ee7ff',
      look: '청록 날개, 분홍 불꽃', desc: '별 한 줄을 다 먹으면 보너스 점수가 더 많아요',
      trait: { perfectMul: 1.5 } },
    { id: 'ufo', name: '비행접시', price: 300, shape: 'ufo', ui: '#b6ff5c',
      body: ['#ffffff', '#c9d3e6', '#56607a'], accent: '#b6ff5c', flame: '182,255,92', core: '#b6ff5c',
      look: '둥근 접시, 연두 유리 지붕, 도는 불빛', desc: '자석이 더 오래, 더 멀리서 별을 끌어와요',
      trait: { magnet: 3, magnetRange: 24 } },
    { id: 'whale', name: '우주 고래', price: 500, shape: 'whale', ui: '#7aa6ff',
      body: ['#e0ecff', '#5b8cff', '#2a3fa8'], accent: '#bff8ff', flame: '120,220,255', core: '#bff8ff',
      look: '꼬리를 흔드는 파란 고래, 물빛 반짝이', desc: '하트 하나 더 (어려움에서는 방패를 두르고 출발)',
      trait: { heart: 1, hardShield: true } },
    { id: 'fox', name: '번개 여우', price: 800, shape: 'fox', ui: '#ff9a3d',
      body: ['#ffe6cc', '#ff8a2a', '#a8420c'], accent: '#ffe66d', flame: '255,236,140', core: '#ffe66d',
      look: '귀 날개가 쫑긋한 주황 여우', desc: '줄 바꾸기가 빨라요, 아슬아슬 점수 두 배',
      trait: { laneT: 0.13, nearMul: 2 } },
    { id: 'phoenix', name: '불사조', price: 1200, shape: 'phoenix', ui: '#ff5a7a',
      body: ['#fff0c0', '#ff4f6a', '#8a0f3c'], accent: '#ffd24a', flame: '255,150,40', core: '#ffe66d',
      look: '불꽃 날개를 펄럭이는 새', desc: '부스트가 더 길고, 한 판에 한 번 다시 살아나요',
      trait: { boost: 1.5, revive: 1 } },
  ];
  // 옛 꾸미기(모양만 달랐던 우주선 6종)를 가진 저장본 옮기기: to = 이 캐릭터를 준다, refund = 값을 한 번 돌려준다
  const OLD_SKINS = {
    basic: { to: 'jet' }, bolt: { to: 'fox' }, whale: { to: 'whale' }, phoenix: { to: 'phoenix' },
    comet: { refund: 500 }, gold: { refund: 1200 },
  };

  // 강화 (5단계). per: 한 단계 효과. prices: 단계별 값 (1단계부터). world.js create(opts.up)가 읽는다
  const UPGRADES = [
    { id: 'magnet', icon: 'magnet', name: '자석 시간',   desc: '자석이 조금 더 오래 가요',           per: 1,    prices: [100, 200, 350, 550, 800] },
    { id: 'shield', icon: 'shield', name: '방패 여유',   desc: '방패가 막은 뒤 조금 더 오래 안전해요', per: 0.4,  prices: [100, 200, 350, 550, 800] },
    { id: 'boost',  icon: 'boost',  name: '부스트 시간', desc: '부스트가 조금 더 오래 가요',         per: 0.6,  prices: [120, 250, 450, 700, 1000] },
    { id: 'coin',   icon: 'star',   name: '별 코인 보너스', desc: '판이 끝날 때 코인을 조금 더 받아요', per: 0.1,  prices: [150, 300, 550, 900, 1200] },
  ];
  const UPGRADE_MAX = 5;

  // 시작 아이템: 사 두면 다음 판 시작할 때 하나씩 자동으로 쓴다. max: 쌓아 둘 수 있는 개수
  // give: 판에 주는 것 (world.js create opts.loadout의 칸). 하트는 하트가 하나뿐인 어려움에서는 쓰지 않고 남겨 둔다
  const START_ITEMS = [
    { id: 'sshield', give: 'shield', icon: 'shield', name: '방패 출발',   desc: '방패를 두르고 출발',     price: 80,  max: 3 },
    { id: 'sboost',  give: 'boost',  icon: 'boost',  name: '부스트 출발', desc: '출발하자마자 부스트',     price: 120, max: 3 },
    { id: 'sheart',  give: 'heart',  icon: 'heart',  name: '하트 +1',     desc: '하트 하나 더 (쉬움·보통)', price: 100, max: 3, not: ['hard'] },
  ];

  // 판이 끝날 때 받는 코인 = 거리 ÷ perDist + 별 ÷ perStar + 기념 아치 × perArch + 도착한 행성 수 × perZone,
  // 난이도 배율(diffMul)을 곱하고, 그 뒤 별 코인 보너스 강화만큼 더. 보통 한 판(500~1,000m) 20~60개
  const COINS = { perDist: 40, perStar: 4, perArch: 2, perZone: 5, diffMul: { easy: 1, normal: 1.2, hard: 1.5 } };

  // 미션: 늘 3개. kind 'life' = 여러 판 누적, 'run' = 한 판 안에서. stat: 판 요약(shop.js runOf)의 칸 이름
  // text: 아이가 읽고 알 수 있게 (여러 판 합치는지·한 판인지는 화면 숫자 옆에 따로 적는다).
  // starter: 처음 며칠(판이 STARTER판보다 적을 때)에는 이 쉬운 미션들만 고른다
  const MISSIONS = [
    { id: 'st300',  kind: 'life', stat: 'stars',    goal: 300,  reward: 100, text: '별 300개 모으기', starter: true },
    { id: 'gt30',   kind: 'life', stat: 'gates',    goal: 30,   reward: 100, text: '레이저 문 30번 뛰어넘기' },
    { id: 'd5k',    kind: 'life', stat: 'dist',     goal: 5000, reward: 120, text: '모두 합쳐 5,000m 달리기' },
    { id: 'it15',   kind: 'life', stat: 'items',    goal: 15,   reward: 90,  text: '아이템 구슬 15개 줍기', starter: true },
    { id: 'nm15',   kind: 'life', stat: 'nears',    goal: 15,   reward: 90,  text: '운석 옆을 아슬아슬 15번 스치기' },
    { id: 'pf10',   kind: 'life', stat: 'perfects', goal: 10,   reward: 100, text: '별 한 줄을 다 먹기 10번' },
    { id: 'bs5',    kind: 'life', stat: 'boosts',   goal: 5,    reward: 80,  text: '노란 번개(부스트) 5번 먹기' },
    { id: 'g5',     kind: 'life', stat: 'games',    goal: 5,    reward: 60,  text: '5판 달리기', starter: true },
    { id: 'r1000',  kind: 'run',  stat: 'dist',     goal: 1000, reward: 120, text: '한 판에 1,000m 달리기' },
    { id: 'rs80',   kind: 'run',  stat: 'stars',    goal: 80,   reward: 120, text: '한 판에 별 80개' },
    { id: 'rg8',    kind: 'run',  stat: 'gates',    goal: 8,    reward: 100, text: '한 판에 레이저 문 8번 뛰어넘기' },
    { id: 'rice',   kind: 'run',  stat: 'zone',     goal: 2,    reward: 90,  text: '한 판에 지구까지 가기', starter: true },
    { id: 'rneb',   kind: 'run',  stat: 'zone',     goal: 4,    reward: 180, text: '한 판에 목성까지 가기' },
    { id: 'rclean', kind: 'run',  stat: 'clean',    goal: 600,  reward: 150, text: '한 판에 안 부딪히고 600m' },
    { id: 'rnm5',   kind: 'run',  stat: 'nears',    goal: 5,    reward: 100, text: '한 판에 운석 옆을 아슬아슬 5번 스치기' },
    { id: 'br20',   kind: 'life', stat: 'bars',     goal: 20,   reward: 100, text: '보라 막대 밑으로 20번 쏙 지나기' },
    { id: 'rsl10',  kind: 'run',  stat: 'slides',   goal: 10,   reward: 100, text: '한 판에 아래로 밀어 미끄러지기 10번' },
    { id: 'rpir1',  kind: 'run',  stat: 'pirates',  goal: 1,    reward: 120, text: '한 판에 우주 해적선 따돌리기' },
  ];
  const MISSION_SLOTS = 3;
  const MISSION_STARTER = 5;   // 이만큼 판을 하기 전에는 starter 미션만

  Object.assign(RN.DATA, { CHARS, OLD_SKINS, SKINS: CHARS, UPGRADES, UPGRADE_MAX, START_ITEMS, COINS, MISSIONS, MISSION_SLOTS, MISSION_STARTER });
})(RN);
