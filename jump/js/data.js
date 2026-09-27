'use strict';
// 모든 수치는 이 파일 한 곳에서 고친다.
// 길이 단위는 "점" (놀이 기둥 가로 폭 = 400점). 높이는 위로 갈수록 커진다.
(function (JP) {
  // 메달·미션이 쓰는 두 가지 높이 (출발 장소 고르기, 2026-09-27):
  //   climbOf: 이번 판에 실제로 오른 거리(m) = 끝 높이 - 출발 높이 (예전 기록에는 climb가 없어 끝 높이)
  //   reached: 그 높이(m)에 이번 판에 올라서 닿았는지 (그 높이나 더 위에서 출발했으면 아니다)
  const climbOf = r => (r && r.climb != null ? r.climb : r.height);
  const reached = (r, m) => r.height >= m && (r.start || 0) < m;
  JP.DATA = {
    // 놀이 기둥 가로 폭. 화면이 달라도 이 폭을 기둥 너비에 맞춰 늘린다
    WORLD: { w: 400 },
    // 1m = 50점 (보통 한 번 튀면 4m 오른다)
    METER: 50,

    // 물리는 1/120초 칸으로 쪼개 돈다 (60·90·120Hz 화면 모두 같은 결과)
    STEP: 1 / 120,

    // 주인공: 반지름, 중력, 한 번 튀는 높이, 좌우 최고 속도·가속·멈춤
    PLAYER: { r: 20, gravity: 1900, jump: 200, maxVx: 430, accel: 3400, decel: 2800 },

    // 손가락으로 끌어 움직이기 (2026-09-27, 소유자: "좌우도 손가락으로 이동할 수 있게"). 주인공이 손가락을 따라간다.
    //   start: 이만큼(화면 px) 옆으로 밀면 끌기로 바뀐다 (그 전에는 누른 쪽으로 가는 예전 방식).
    //          2026-09-27 점검: 12px는 아이 손가락이 누르다 조금만 흔들려도 끌기가 되어 22px로
    //   gain: 손가락이 간 거리 × gain만큼 주인공이 간다 · full: 남은 거리가 이 점수 이상이면 최고 속도, 가까울수록 천천히
    //   dead: 이보다 작은 방향 값은 0 (멈춤) · max: 밀린 거리 상한 (판 너비의 비율)
    DRAG: { start: 22, gain: 1.25, full: 28, dead: 0.04, max: 0.6 },

    // 카메라: 주인공이 화면 아래에서 focus 비율 높이에 오도록 따라 올라간다 (내려가지는 않는다).
    // ease: 따라가는 부드러움 (1초에 남은 거리의 몇 배), lead: 주인공이 focus보다 이만큼(화면 비율) 위로는 못 간다
    CAM: { focus: 0.42, start: 0.12, ease: 9, lead: 0.2 },

    // 발판 모양 (크기는 난이도 표 DIFFICULTY의 w)
    PLAT: { h: 16 },
    // 스프링: 아주 높이 튄다
    SPRING: { jump: 560 },
    // 구름 발판: on초 보였다가 off초 사라지기를 되풀이 (사라진 동안은 빠져나간다)
    CLOUD: { on: 2.4, off: 1.5, fade: 0.4 },
    // 부서지는 발판: 한 번 튀면 부서져 떨어진다 (fall초 동안 조각 연출)
    CRUMBLE: { fall: 0.6 },

    // ─── 난이도 (쉬움 · 보통 · 어려움) ─────────────────────────
    // 높이가 오를수록 어려워진다. warm(m)까지는 몸풀기, full(m)에서 가장 어렵다 (그 사이는 부드럽게 이어진다).
    //   warmGap·warmW : 몸풀기 구간 발판 간격 [최소, 최대]·폭. 몸풀기에는 스프링 말고 특별한 발판이 없다
    //   gap : 발판 사이 높이 간격 [처음 최소, 처음 최대, 끝 최소, 끝 최대]. 한 번 튀는 높이(200)의 0.9배보다 늘 작게
    //   w   : 발판 폭 [처음, 끝]
    //   main: 길을 이루는 발판 종류 가중치 [처음, 끝] · extra: 곁 발판 종류 가중치 · extraChance: 곁 발판이 나올 확률 [처음, 끝]
    //   moveSpeed: 움직이는 발판 속도 [처음, 끝] (점/초)
    //   mine: 가시 폭탄 {from: 처음 나오는 높이(m), chance: 줄마다 나올 확률 [처음, 끝]}. null이면 없음
    //   monster: 밟는 몬스터 {from: 처음 나오는 높이(m), chance: 줄마다 나올 확률 [처음, 끝],
    //            kinds: 종류 가중치 [처음, 끝] (MONSTER.kinds), walk: 슬라임이 발판 위를 걸어 다닐 확률 [처음, 끝]}
    //   storm: 쫓아오는 먹구름 {from: 나오는 높이(m), speed: 오르는 빠르기 m/초 [처음, 끝], ramp: 끝 빠르기가 되는 높이(m)}. null이면 없음
    //   rescues: 떨어지면 받아 주는 구조 구름 수 · itemGap: 아이템 사이 높이(m) [최소, 최대]
    //   ctl: 좌우 움직임 {maxVx 최고 속도, accel 붙는 힘, decel 멈추는 힘}
    DIFFICULTY: {
      easy: {
        id: 'easy', name: '쉬움', hint: '구조 구름 3번 · 폭탄 없음',
        warm: 30, full: 700, warmGap: [44, 66], warmW: 136,
        gap: [50, 78, 80, 124], w: [120, 102],
        main:  { normal: [80, 42], moving: [5, 22], crumble: [3, 14], spring: [9, 9] },
        extraChance: [0.55, 0.35],
        extra: { normal: [70, 35], cloud: [18, 38], crumble: [12, 27] },
        moveSpeed: [35, 85],
        mine: null,
        monster: { from: 35, chance: [0.22, 0.4], kinds: { slime: [5, 3], balloon: [3, 3], bird: [0, 2] }, walk: [0.3, 0.6] },
        storm: null,
        rescues: 3, itemGap: [40, 70],
        ctl: { maxVx: 400, accel: 2900, decel: 3000 },
      },
      normal: {
        id: 'normal', name: '보통', hint: '가시 폭탄 · 떨어지면 끝',
        warm: 15, full: 550, warmGap: [52, 82], warmW: 104,
        gap: [58, 96, 108, 160], w: [90, 78],
        main:  { normal: [72, 28], moving: [8, 30], crumble: [4, 22], spring: [7, 8] },
        extraChance: [0.45, 0.2],
        extra: { normal: [60, 20], cloud: [25, 50], crumble: [15, 30] },
        moveSpeed: [50, 145],
        mine: { from: 45, chance: [0.06, 0.34] },
        monster: { from: 20, chance: [0.24, 0.44], kinds: { slime: [5, 3], balloon: [3, 3], bird: [1, 3] }, walk: [0.4, 0.8] },
        storm: { from: 12, speed: [1.5, 3.2], ramp: 400 },
        rescues: 0, itemGap: [55, 95],
        ctl: { maxVx: 430, accel: 3400, decel: 2800 },
      },
      hard: {
        id: 'hard', name: '어려움', hint: '좁고 빠른 발판 · 폭탄 일찍',
        warm: 5, full: 320, warmGap: [66, 100], warmW: 86,
        gap: [72, 118, 128, 172], w: [78, 66],
        main:  { normal: [52, 18], moving: [16, 34], crumble: [12, 28], spring: [6, 7] },
        extraChance: [0.32, 0.14],
        extra: { normal: [45, 15], cloud: [30, 50], crumble: [25, 35] },
        moveSpeed: [85, 175],
        mine: { from: 15, chance: [0.14, 0.42] },
        monster: { from: 10, chance: [0.26, 0.46], kinds: { slime: [4, 3], balloon: [3, 3], bird: [2, 4] }, walk: [0.5, 0.9] },
        storm: { from: 6, speed: [1.9, 3.4], ramp: 250 },
        rescues: 0, itemGap: [70, 120],
        ctl: { maxVx: 470, accel: 3700, decel: 3100 },
      },
    },
    DIFF_ORDER: ['easy', 'normal', 'hard'],

    // 별: 줄마다 나올 확률, 점수, 가끔 세로로 줄지어 여러 개
    STAR: { chance: 0.4, points: 10, r: 14, lineChance: 0.15, line: 4 },

    // 아이템: 처음 나오는 높이(m) (다음까지 간격은 난이도 itemGap). 이름표를 달고 나타난다
    ITEM: {
      first: 25, r: 18,
      kinds: {
        rocket: { name: '로켓', color: '#ff9f43', w: 1 },        // 잠깐 쭉 날아오른다
        shield: { name: '방패 방울', color: '#7fd3ff', w: 1 },   // 한 번 지켜 준다 (가시 폭탄·떨어짐)
      },
    },
    ROCKET: { time: 2.2, speed: 1300, after: 700 },

    // 가시 폭탄 (보통·어려움): 크기, 발판에서 가로로 떨어뜨리는 거리. 나오는 높이·확률은 난이도 mine
    MINE: { r: 15, clear: 105 },

    // 밟는 몬스터 (2026-09-27): 위에서 내려와 밟으면 꾹 눌리고 크게 튀어 오른다 (한 번 튀는 높이 × stomp).
    //   옆이나 아래에서 닿으면: 쉬움은 살짝 밀려나고(push 점/초, "앗") 다치지 않는다, 보통·어려움은 가시 폭탄처럼 끝 (방패·로켓이면 괜찮다).
    //   r: 몸 반지름 · points: 밟으면 받는 점수(콤보 배율) · pad: 몬스터가 발판 위 튀는 길에서 떨어져 있는 거리
    //     (길 발판 가운데에서 가로로 pad, 주인공 몸 + 몬스터 몸 + 여유) · top: 주인공 가운데가 몬스터 가운데보다 이만큼(몸 반지름 배율) 위면 "밟기"
    //   roof: 몬스터 윗면에서 이 높이(점) 안에 덮는 발판이 없게 (위에서 밟을 수 있게)
    //   seat: 앉을 곁 발판이 있을 때 슬라임이 나올 확률 (곁 발판이 길 발판보다 seatBelow점 넘게 낮을 때만) · perch: 앉을 곁 발판이 없을 때 두 줄 사이에 놓는 작은 받침 발판 폭
    //   hurt: 옆·아래로 부딪혔다고 치는 몬스터 몸 배율 (밟기는 몸 전체, 부딪힘은 조금 안쪽만: 아이에게 너그럽게)
    //   kinds: slime 발판 위에 앉는 슬라임(가끔 걸어 다님) · balloon 발판 사이에 둥둥 뜬 풍선 괴물 · bird 옆으로 오가는 작은 로봇 새
    //     (range: 오가는 거리 점, speed: 점/초, float: 위아래 둥실 점)
    MONSTER: {
      r: 17, stomp: 1.5, points: 15, push: 150, cool: 0.6, pad: 54, top: 0.15, hurt: 0.7, seat: 0.7, seatBelow: 6, perch: 64, roof: 60,
      kinds: {
        slime:   { name: '통통 슬라임', color: '#7dff6a', top: '#eaffc2', speed: 40 },
        balloon: { name: '풍선 괴물',   color: '#ff7ad9', top: '#ffd6f4', range: 26, speed: 22, float: 6 },
        bird:    { name: '로봇 새',     color: '#ffb13d', top: '#fff0c2', range: 50, speed: 60, float: 4 },
      },
    },

    // 쫓아오는 먹구름 (보통·어려움, 2026-09-27): 아래에서 올라온다. 닿으면 떨어진 것과 같다 (방패 방울이 막아 주면 뒤로 물러난다).
    //   빠르기는 난이도 storm.speed, 늘 사람 닮은 봇이 오르는 평균보다 느리다 (tests/jump.test.js가 잰다).
    //   lag: 화면 아래 끝에서 이만큼(화면 높이 배율)보다 더 멀리 처지지는 않는다 (너무 멀어 잊히지 않게)
    //   rest: 로켓이 끝난 뒤·방울이 막아 준 뒤 쉬는 시간(초) · back: 방울이 막아 주면 물러나는 거리(화면 높이 배율)
    //   warn: 이만큼(m) 가까우면 HUD가 빨갛게 · hint: 처음 보일 때 "구름이 쫓아와요!" 보여 주는 시간(초)
    STORM: { lag: 0.62, rest: 2.5, back: 0.5, warn: 4, hint: 2.8 },

    // 알아서 맞춰 주는 난이도 (common/hub.js adaptMul, 0.85 ~ 1.12, 처음 두 판은 1). World.create opts.adapt로 받는다.
    //   배율 mul을 이 지수만큼 거듭제곱해 곱한다 (1보다 작으면 쉽게):
    //   ramp: 가장 어려운 높이 full을 mul^ramp로 나눔 (어려워지는 빠르기. 간격의 끝값은 그대로라 "닿지 못하는 틈이 없다"는 늘 성립)
    //   mix: 움직이는·부서지는·구름 발판 가중치 · monster: 몬스터 나올 확률 · storm: 먹구름 빠르기
    //   target: 판이 끝날 때 adaptRun에 주는 perf = 오른 높이 ÷ target (1 = 잘하는 아이의 보통 판. 아이 흉내 봇으로 정함)
    ADAPT: { ramp: 1, mix: 1.5, monster: 1.5, storm: 1, target: { easy: 500, normal: 120, hard: 60 } },

    // ─── 깜짝 선물 · 피버 타임 · 비밀 방 (2026-09-27, 소유자 "추천대로") ───────────
    // 깜짝 선물 상자: 오른 시간 every초 [최소, 최대]마다 하나, 화면 바로 위 길 발판 위에 놓인다 (블랙홀 구간·처음 안내 중에는 안 나옴).
    //   grab: 몸이 닿지 않아도 이만큼(점) 가까우면 먹는다 (너그럽게). 먹으면 반짝이 + "선물: 코인 25개!". 상(kinds 가중치): 코인 coins개 [최소, 최대] (판이 끝날 때 받는 코인에 더함) ·
    //   로켓 · 방패 방울 · 다음 판 시작 아이템 하나(가득이면 itemCoins 코인). 뽑기 느낌이 없게 모두 좋은 것만
    GIFT: { every: [60, 100], r: 20, grab: 18, coins: [15, 40], itemCoins: 20, kinds: { coins: 5, rocket: 2, shield: 2, item: 2 } },
    // 피버 타임: 이어서 더 높은 발판을 밟을 때마다(add + perCombo × 콤보, 콤보는 cap까지) · 몬스터를 밟을 때마다(stomp) 게이지가 찬다.
    //   가득 차면 time초 동안 FEVER: 별 점수 × starMul, 보이는 길 발판 위에 별이 더(spawn 확률), 새로 생기는 줄에도 별이 더(extra 확률).
    //   피버 중에는 게이지가 차지 않는다
    FEVER: { time: 10, add: 0.018, perCombo: 0.004, cap: 10, stomp: 0.1, starMul: 2, spawn: 0.8, extra: 0.6 },
    // 비밀 방: every m [최소, 최대]마다 길 발판(보통 발판) 위에 빛나는 구름 문. 닿으면 time초 동안 별과 스프링이 가득한 조용한 방.
    //   방 안에서는 떨어지지 않고(바닥에서 튄다), 높이·먹구름·블랙홀이 멈춘다. 끝나면 "비밀 방 끝!" 하고 문 자리로 돌아와 한 번 튄다.
    //   first: 처음 문이 나올 수 있는 높이(m) · stars: 방 안 별 수 · springs: 방 안 스프링 수 · r: 문에 닿는 거리
    ROOM: { every: [200, 300], first: 90, time: 20, stars: 30, springs: 3, r: 26 },

    // 한 번 더! (2026-09-27 점검): 판이 끝나면 한 판에 한 번, 공짜로 이어 하기를 묻는다 (보통·어려움, 쉬움은 구조 구름을 다 쓴 뒤).
    //   ask: 묻는 시간(초, 이 동안 안 누르면 그만) · safe: 이어 한 뒤 지켜 주는 시간(초): 떨어지면 다시 구조 구름, 폭탄·몬스터는 톡 터지고,
    //   먹구름은 back(화면 높이 배율)만큼 물러나 이 시간 동안 쉰다 · wait: 화면이 뜬 뒤 이만큼(초)은 누름을 무시 (잘못 누르기 방지)
    CONTINUE: { ask: 5, safe: 3, back: 0.9, wait: 0.6 },

    // 출발 장소 고르기 (2026-09-27 점검): 한 번이라도 올라서 닿은 곳은 다음 판부터 거기서 출발할 수 있다 (records.js places).
    //   at: 출발 높이(m) · zone: 그림 고르기용 구역 id. 높이에서 출발하면 발사대에서 짧게 로켓(rocket초, 로켓 횟수에는 안 셈)을 타고 올라간다.
    //   몸풀기(warm)는 출발 높이부터 다시 센다. 코인은 출발 높이 아래 몫을 받지 않고, 장소 메달은 올라서 닿아야 받는다
    STARTS: [
      { id: 'ground', name: '땅',       at: 0,   color: '#ffb36b' },
      { id: 'cloud',  name: '구름 위',   at: 100, color: '#bfe9ff' },
      { id: 'space',  name: '우주',     at: 250, color: '#b388ff' },
      { id: 'exo',    name: '외계 행성', at: 700, color: '#7dffcf' },
    ],
    WARP: { rocket: 0.9 },

    // 구조 구름·방패 방울이 던져 올리는 높이 (화면 높이 배율, 상한 520점)
    RESCUE: { jump: 0.75, max: 520 },

    // ─── 높이 구역 ─────────────────────────────────────────────
    // 오를수록 배경이 바뀐다 (from m부터). mix: 발판·별 섞임을 살짝 바꾼다 (가중치 배율 · 별 확률 더하기)
    // sky/glow/far: 그리기 색 (render.js가 구역마다 미리 그려 둔다), stars: 배경 별 밝기 0 ~ 1, clouds: 구름 층 진하기 0 ~ 1
    // 2026-09-27 외계 행성 여덟이 명왕성 다음(700m)에 이어지면서, 700m 구역은 "외계 행성", 별나라(은하)는 그 위 1100m로 옮겼다.
    // 700m 구역의 발판 섞임은 예전 별나라 그대로라 700m까지의 놀이는 바뀌지 않는다
    ZONES: [
      { id: 'sky',   name: '하늘',    from: 0,   color: '#ffb36b', banner: '',
        sky: ['#1a3570', '#3d5fa8', '#e08a64'], glow: ['#ffb070', '#6a8ae0'], stars: 0.08, clouds: 1, mix: {} },
      { id: 'cloud', name: '구름 위', from: 100, color: '#bfe9ff', banner: '구름 위 도착!',
        sky: ['#10265e', '#2c56a8', '#8fc2f0'], glow: ['#bfe6ff', '#5d7bff'], stars: 0.15, clouds: 0.85, mix: { cloud: 1.5 } },
      { id: 'space', name: '우주',    from: 250, color: '#b388ff', banner: '우주 도착!',
        sky: ['#05070f', '#0d1633', '#1c1446'], glow: ['#3a2a8a', '#0d6a8a'], stars: 0.85, clouds: 0, mix: { moving: 1.3, star: 0.05, monster: 1.2 } },
      { id: 'exo',   name: '외계 행성', from: 700, color: '#7dffcf', banner: '외계 행성 도착!',
        sky: ['#060414', '#140c34', '#241046'], glow: ['#6affc8', '#9a7dff'], stars: 0.9, clouds: 0, mix: { spring: 1.3, star: 0.12, monster: 1.3 } },
      { id: 'stars', name: '별나라',  from: 1100, color: '#ffe66d', banner: '별나라 도착!',
        sky: ['#0b0418', '#2a0c42', '#40104a'], glow: ['#ff5ec8', '#ffe66d'], stars: 1, clouds: 0, mix: { spring: 1.3, star: 0.12, monster: 1.3 } },
    ],
    // 구역이 바뀔 때 배경이 섞여 넘어가는 높이 (m, 경계 앞쪽). 행성 사이는 PLANET_FADE
    ZONE_FADE: 25,

    // ─── 땅에서 우주까지 (2026-09-27, 소유자: "땅에서 시작해 구름·대기권을 지나 우주로") ───
    // 그림과 배너만 바뀌는 여정 (놀이 규칙은 위 ZONES 그대로). 높이는 m.
    //   legs: 지나갈 때 배너를 한 번 띄우는 곳 (world.js가 fx 'leg'로 알린다). 100m 구름 위·250m 우주는 ZONES 배너가 맡는다
    //   ground: 땅(동네 지붕·발사대)이 보이는 높이 · cloud: 구름 층 [아래, 위] (그 사이에서는 앞에도 구름이 흘러 지나간다)
    //   high: 어두워지는 높은 하늘(성층권) 시작 · edge: 대기권 끝 빛나는 선 높이 · scenes: 배경 장면(하늘색) 추가
    //   deco: 배경 소품 {kind, at(m), side(-1 왼쪽·1 오른쪽), size} (새·열기구·연·비행기·기상 풍선·인공위성·달)
    SKY: {
      ground: 12,
      cloud: [70, 104],
      edge: 232,
      legs: [
        { id: 'cloudIn', at: 70,  banner: '구름 속으로 쏙!', sub: '구름을 뚫고 올라가요', color: '#e8f4ff' },
        { id: 'high',    at: 150, banner: '높은 하늘!',     sub: '비행기보다 높이 왔어요', color: '#7fb2ff' },
        { id: 'edge',    at: 232, banner: '대기권 돌파!',   sub: '하늘 끝을 지나 곧 우주예요', color: '#6ad8ff' },
      ],
      scenes: [
        { id: 'high', name: '높은 하늘', from: 150, color: '#7fb2ff', sky: ['#030a26', '#0a2360', '#2d5fb8'], glow: ['#3d7bff', '#6ad8ff'], stars: 0.3, clouds: 0 },
        { id: 'edge', name: '대기권 끝', from: 212, color: '#6ad8ff', sky: ['#02030c', '#060d2a', '#0b2a6a'], glow: ['#1a5aff', '#6ad8ff'], stars: 0.6, clouds: 0 },
      ],
      deco: [
        { kind: 'kite',     at: 16,  side: -1, size: 1 },
        { kind: 'birds',    at: 28,  side: 1,  size: 1 },
        { kind: 'balloon',  at: 44,  side: -1, size: 1 },
        { kind: 'birds',    at: 58,  side: -1, size: 0.8 },
        { kind: 'plane',    at: 168, side: 1,  size: 0.8 },
        { kind: 'wballoon', at: 196, side: -1, size: 1 },
        { kind: 'sat',      at: 240, side: -1, size: 0.9 },
        { kind: 'moon',     at: 262, side: -1, size: 0.6 },
      ],
    },

    // ─── 태양계 여행 (2026-09-27, 소유자: "다른 게임도 우주배경 반영", 뿅뿅 우주선과 같은 행성) ───
    // 우주 구역(250m)부터 50m마다 행성 하나씩 지나 오른다: 수성 250 · 금성 300 · 지구 350 · 화성 400 · 목성 450 ·
    // 토성 500 · 천왕성 550 · 해왕성 600 · 명왕성 650, 그 뒤 외계 행성 여덟(700 ~ 1050, EXO_PLANETS), 1100m부터 별나라(은하).
    // 50m 간격: 쉬움 아이 흉내 봇이 한 판에 평균 450 ~ 500m를 올라 행성 너덧 개를 보고, 쉬움이 가장 어려워지는 700m에서 외계 행성에 닿는다.
    //   at: 도착 높이(m) · side: 행성이 떠 가는 쪽(기둥 왼쪽·오른쪽 번갈아) · size: 크기 배율
    //   line: 도착 배너 재미 한 줄 (배우는 사실이 아님. 공용 도감 WORLDS.SOLAR_WEATHER의 line을 쓰고, 도감이 없을 때만 여기 글)
    //   sky: 그 행성 구간 하늘 [위, 가운데, 아래] · glow: 하늘 빛 덩어리 두 색 (render.js가 한 번 그려 둔다)
    PLANETS: [
      { id: 'mercury', name: '수성',   at: 250, side: 1,  size: 0.8,  color: '#d8d0c4', line: '뜨거운 불씨가 날려요',
        sky: ['#07070a', '#2a1e12', '#3a2a14'], glow: ['#ffb070', '#5a4630'] },
      { id: 'venus',   name: '금성',   at: 300, side: -1, size: 0.95, color: '#ffcf6b', line: '노란 안개가 뭉게뭉게',
        sky: ['#0b0804', '#3a2206', '#5a3a0c'], glow: ['#ffcf6b', '#8a5a14'] },
      { id: 'earth',   name: '지구',   at: 350, side: 1,  size: 1,    color: '#6fc3ff', line: '우리 집! 시원한 빗방울',
        sky: ['#040810', '#0b2a3a', '#0d3a6b'], glow: ['#3d9bff', '#1a6a8a'] },
      { id: 'mars',    name: '화성',   at: 400, side: -1, size: 0.85, color: '#ff7a4d', line: '빨간 모래바람이 쌩쌩',
        sky: ['#0a0506', '#2a0f16', '#5a1a0c'], glow: ['#ff7a4d', '#6a1a2a'] },
      { id: 'jupiter', name: '목성',   at: 450, side: 1,  size: 1.35, color: '#f0b98a', line: '번쩍번쩍 큰 폭풍',
        sky: ['#08060a', '#2a1a2a', '#4a2a1a'], glow: ['#f0b98a', '#6a3a2a'] },
      { id: 'saturn',  name: '토성',   at: 500, side: -1, size: 0.9,  color: '#f3d58c', line: '반짝이 고리가 빙글빙글',
        sky: ['#07060a', '#1f1a2e', '#4a3a14'], glow: ['#f3d58c', '#4a3a6a'] },
      { id: 'uranus',  name: '천왕성', at: 550, side: 1,  size: 0.95, color: '#9ef0f0', line: '데굴데굴 얼음 행성',
        sky: ['#040a0c', '#0b2a3a', '#0e4a50'], glow: ['#9ef0f0', '#1a5a6a'] },
      { id: 'neptune', name: '해왕성', at: 600, side: -1, size: 0.95, color: '#5b8cff', line: '쌩쌩 눈보라',
        sky: ['#03050e', '#0a1a4a', '#0f2a7a'], glow: ['#5b8cff', '#2a3a9a'] },
      { id: 'pluto',   name: '명왕성', at: 650, side: 1,  size: 0.55, color: '#e8d2b8', line: '소복소복 하트 눈 행성',
        sky: ['#05050a', '#10141e', '#1a1a2a'], glow: ['#e8d2b8', '#3a3a5a'] },
    ],
    PLANET_FADE: 14,
    // 외계 행성 여덟 (2026-09-27, 소유자: "얼음 행성이면 눈, 불의 행성이면 그에 맞게"). 이름·한 줄·색·날씨는 공용 도감
    // common/worlds.js (WORLDS.EXO)에서 가져와 아래에서 PLANETS 뒤에 붙인다. 여기에는 높이·쪽·크기만.
    EXO_PLANETS: [
      { id: 'frost',  at: 700,  side: -1, size: 1 },
      { id: 'lava',   at: 750,  side: 1,  size: 0.95 },
      { id: 'ocean',  at: 800,  side: -1, size: 1.05 },
      { id: 'glass',  at: 850,  side: 1,  size: 1.1 },
      { id: 'gem',    at: 900,  side: -1, size: 0.85 },
      { id: 'twin',   at: 950,  side: 1,  size: 1 },
      { id: 'shroom', at: 1000, side: -1, size: 0.95 },
      { id: 'rogue',  at: 1050, side: 1,  size: 1 },
    ],
    // 행성 날씨 (그리기 전용, 놀이에는 영향 없음): 입자 수 상한 max (움직임 줄이기면 calm배), 카메라가 오를 때 입자가
    // 화면에서 흘러내리는 정도 depth (1 = 발판과 같은 빠르기), 행성 도착 앞뒤 fade m 동안 입자 수가 부드럽게 바뀐다
    WEATHER: { max: 72, calm: 0.4, calmSpeed: 0.45, depth: 0.35, fade: 12 },

    // ─── 블랙홀 구간 (2026-09-27) ────────────────────────────────
    // 가끔 len(m) 동안 기둥 한쪽에 블랙홀이 나타나 주인공을 그쪽으로 살짝 끈다 (좌우로 늘 pull 점/초씩 밀림).
    // 끄는 힘은 늘 좌우 최고 속도보다 훨씬 작아 언제나 빠져나올 수 있고, "닿지 못하는 틈이 없다"도 끄는 힘을 빼고 잰다 (테스트).
    // 로켓 중에는 끌리지 않는다. 두 구간 사이는 늘 gap(m) [최소, 최대]만큼 떨어져 있어 연달아 오지 않는다.
    //   first: 난이도별 처음 나올 수 있는 높이(m) (쉬움은 300m 전에는 없다) · pull: 난이도별 끄는 힘(점/초)
    BLACKHOLE: { len: 30, gap: [110, 200], first: { easy: 300, normal: 180, hard: 130 }, pull: { easy: 28, normal: 44, hard: 60 } },

    // 높이 눈금: 작은 눈금 10m, 빛나는 선 50m, 100m마다 큰 축하
    MILE: { tick: 10, line: 50, big: 100 },

    // 콤보: 이어서 더 높은 발판을 밟은 수. show번부터 칩으로 보이고,
    // step번마다 별 점수 배율이 add씩 오른다 (max까지)
    COMBO: { show: 3, step: 4, add: 0.25, max: 2 },

    // 메달. check(run, rec): run = 이번 판 기록, rec = 평생 기록. tier: 1 동 · 2 은 · 3 금.
    // 높이 메달은 이번 판에 오른 거리(climbOf), 장소 메달은 그곳에 올라서 닿았을 때만(reached). 출발 장소에서 시작해 얻지 않는다
    MEDALS: [
      { id: 'h50',      tier: 1, name: '첫 50m',        desc: '한 판에 50m',                  check: r => climbOf(r) >= 50 },
      { id: 'h150',     tier: 2, name: '하늘 150',      desc: '한 판에 150m',                 check: r => climbOf(r) >= 150 },
      { id: 'h400',     tier: 3, name: '우주 400',      desc: '한 판에 400m',                 check: r => climbOf(r) >= 400 },
      { id: 'n100',     tier: 3, name: '용감한 100',    desc: '보통·어려움으로 100m',         check: r => (r.diff ? r.diff !== 'easy' : !r.easy) && climbOf(r) >= 100 },
      { id: 'star20',   tier: 1, name: '별 20',         desc: '한 판에 별 20개',              check: r => r.stars >= 20 },
      { id: 'star60',   tier: 2, name: '별 60',         desc: '한 판에 별 60개',              check: r => r.stars >= 60 },
      { id: 'spring5',  tier: 1, name: '통통 스프링',   desc: '한 판에 스프링 5번',           check: r => r.springs >= 5 },
      { id: 'rocket',   tier: 1, name: '로켓 발사',     desc: '로켓 타기',                    check: r => r.rockets >= 1 },
      { id: 'shield',   tier: 2, name: '방울 덕분에',   desc: '방패 방울로 살아남기',         check: r => r.saves >= 1 },
      { id: 'combo10',  tier: 2, name: '계단 10',       desc: '10번 연속 더 높은 발판',      check: r => r.maxCombo >= 10 },
      { id: 'games10',  tier: 1, name: '단골',          desc: '10판 하기',                    check: (r, R) => R.total.games >= 10 },
      { id: 'stars500', tier: 2, name: '별 500',        desc: '모두 합쳐 별 500개',           check: (r, R) => R.total.stars >= 500 },
      // 2026-09-27 높이 구역·콤보와 함께
      { id: 'cloudz',   tier: 1, name: '구름 위 도착',  desc: '100m 구름 위까지',             check: r => reached(r, 100) },
      { id: 'spacez',   tier: 2, name: '우주 도착',     desc: '250m 우주까지',                check: r => reached(r, 250) },
      // 2026-09-27 태양계 여행으로 별나라가 500m에서 700m(명왕성 다음)로 옮겨 갔다. 이미 딴 메달은 그대로.
      // 같은 날 700m에 외계 행성이 들어와 별나라는 1100m로 한 번 더 옮겼다. 이 메달(700m)은 이름만 "외계 행성 도착"으로
      { id: 'starz',    tier: 3, name: '외계 행성 도착', desc: '700m 외계 행성까지',           check: r => reached(r, 700) },
      { id: 'galaxy',   tier: 3, name: '별나라 도착',   desc: '1100m 별나라까지',             check: r => reached(r, 1100) },
      { id: 'combo20',  tier: 3, name: '콤보 20',       desc: '콤보 20 만들기',               check: r => r.maxCombo >= 20 },
      { id: 'hard100',  tier: 3, name: '어려움 100',    desc: '어려움으로 100m',              check: r => r.diff === 'hard' && climbOf(r) >= 100 },
      // 2026-09-27 밟는 몬스터와 함께
      { id: 'stomp20',  tier: 2, name: '꾹꾹 20',       desc: '모두 합쳐 몬스터 20마리 밟기', check: (r, R) => (R.total.stomps || 0) >= 20 },
    ],

    // ─── 코인 · 상점 · 미션 (shop.js) ───────────────────────────
    // 코인은 네 게임이 같이 쓰는 별코인 지갑(common/hub.js)에 들어간다.
    // 판이 끝나면 = 오른 거리 ÷ perMeter + 별 ÷ perStars + 올라서 도착한 구역 보너스(출발 구역 다음부터 zone[구역 번호]까지 더함).
    // 그 합에 난이도 배율(level: 보통·어려움이 더 많이), 그 뒤 코인 보너스 강화만큼 더, 끝으로 논 시간 perSec초마다 1코인 (배율 없음).
    // 출발 장소를 골라 높이에서 시작하면 출발 높이 아래 몫(높이·구역)은 받지 않는다.
    // 2026-09-27 점검: 아이 흉내 봇이 보통·어려움에서 한 판(16초 안팎)에 6 ~ 9코인이라 level 1.6·2.2 → 2·2.6, 시간 코인을 더해
    //   1분에 받는 코인이 쉬움과 비슷하게. 짧은 판은 결과 화면을 보는 시간이 더 들어가므로, tryTime초 넘게 논 판에는 도전 코인 tryCoins개 (배율 없음)
    //   (tests/jumpshop.test.js가 잰다)
    COINS: { perMeter: 20, perStars: 6, zone: [0, 4, 8, 12, 16], level: { easy: 1, normal: 2, hard: 2.6 }, perSec: 10, tryCoins: 4, tryTime: 8 },

    // 캐릭터 다섯 (2026-09-27 소유자 요청: 게임마다 고를 수 있는 캐릭터 5종).
    // 모두 한 가지씩 작은 장점이 있고 단점은 없다. 저마다 다른 쪽이 좋아서 어느 하나가 모든 면에서 앞서지 않는다.
    // 장점은 늘 기본(통통 로봇)보다 같거나 좋은 쪽이라 "닿지 못하는 틈이 없다"가 모든 캐릭터에 그대로 성립한다.
    //   trait: world.js create의 opts.char가 읽는 배율·값 (없는 칸은 기본)
    //     magnet : 별을 먹는 거리 배율 (몸과 별 반지름 합에 곱함)
    //     jump   : 한 번 튀는 높이 배율 (스프링은 그대로)
    //     speed  : 좌우 최고 속도 배율 · accel: 붙는 힘 배율
    //     fall   : 내려올 때 중력 배율 (1보다 작으면 천천히 내려온다. 오를 때는 그대로라 튀는 높이는 같다)
    //     rocket : 로켓 시간 배율 · spring: 스프링 높이 배율
    //   look: 그리기 모양 (render.js drawChar) · glow: 둘레 빛 r,g,b · body: 광택 몸 [밝은 곳, 가운데, 어두운 곳] · rim: 아래 반사광
    CHARS: [
      { id: 'robot',   name: '통통 로봇',   price: 0,    look: 'robot',   trait: { magnet: 1.7 },
        desc: '별 자석이 있어 별을 멀리서도 먹어요', short: '별을 멀리서도 쏙',
        body: ['#effdff', '#5ee7ff', '#1b5fd0'], rim: '255,90,170', glow: '94,231,255' },
      { id: 'frog',    name: '개구리',      price: 300,  look: 'frog',    trait: { jump: 1.1 },
        desc: '뒷다리가 튼튼해 조금 더 높이 뛰어요', short: '더 높이 점프',
        body: ['#f2ffe0', '#6cf25a', '#157a2c'], rim: '255,230,109', glow: '108,242,90' },
      { id: 'rabbit',  name: '토끼',        price: 500,  look: 'rabbit',  trait: { speed: 1.14, accel: 1.14, decel: 1.14 },
        desc: '재빨라서 왼쪽·오른쪽으로 더 빨리 가요', short: '옆으로 더 빨리',
        body: ['#ffffff', '#ffd6ec', '#c0608f'], rim: '255,120,190', glow: '255,160,215' },
      { id: 'penguin', name: '펭귄',        price: 800,  look: 'penguin', trait: { fall: 0.8 },
        desc: '날개를 파닥여 천천히 내려와요', short: '천천히 내려오기',
        body: ['#8fa6d8', '#2a3a6e', '#0b1230'], rim: '94,231,255', glow: '127,180,255' },
      { id: 'alien',   name: '꼬마 외계인', price: 1200, look: 'alien',   trait: { rocket: 1.35, spring: 1.15 },
        desc: '제트팩 덕분에 로켓·스프링이 더 세요', short: '로켓·스프링 더 세게',
        body: ['#f6e6ff', '#c07bff', '#5a1fa8'], rim: '94,255,200', glow: '192,123,255' },
    ],
    // 예전 꾸미기(2026-09-27 하루 쓴 SKINS) 저장본 옮기기: 가진 꾸미기를 값이 같은 캐릭터로, 맞는 것이 없으면 값만큼 코인을 한 번 돌려준다
    OLD_SKINS: {
      basic: { to: 'robot' }, mint: { to: 'frog' }, bolt: { to: 'rabbit' }, helmet: { to: 'penguin' }, gold: { to: 'alien' },
      berry: { refund: 150 },
    },

    // 강화 (5단계, 한 번 사면 모든 판에). per: 한 단계 효과 (world.js create의 upgrades가 읽는다)
    UPGRADES: [
      { id: 'speed',  icon: '⇄', name: '좌우 속도',     desc: '옆으로 조금 더 빨리 가요',             per: 0.04, prices: [100, 200, 350, 550, 800] },
      { id: 'rocket', icon: '▲', name: '로켓 시간',     desc: '로켓이 조금 더 오래 날아요',        per: 0.12, prices: [120, 250, 400, 650, 950] },
      { id: 'coin',   icon: '¢', name: '별 코인 보너스', desc: '판이 끝날 때 코인을 조금 더 받아요',         per: 0.1,  prices: [150, 300, 550, 900, 1200] },
      { id: 'cloud',  icon: '☁', name: '구조 구름',     desc: '쉬움에서 구조 구름이 하나 더 와요', per: 1,    prices: [150, 300, 500, 750, 1000] },
    ],
    UPGRADE_MAX: 5,

    // 시작 아이템: 사 두면 다음 판 시작할 때 하나씩 자동으로 쓴다. max: 쌓아 둘 수 있는 개수, give: World.create loadout 칸
    START_ITEMS: [
      { id: 'rocketStart', give: 'rocket', icon: '▲', name: '로켓 출발', desc: '시작하자마자 로켓으로 쭉 날아오른다', price: 120, max: 3 },
      { id: 'shieldStart', give: 'shield', icon: '◯', name: '방패 방울', desc: '방패 방울을 두르고 시작한다',         price: 80,  max: 3 },
    ],

    // 미션: 늘 3개. kind 'life' = 여러 판 누적, 'run' = 한 판 안에서. stat: 판 요약(shop.js runOf)의 칸 이름.
    // diff: 그 난이도로 할 때만 (그 난이도를 한 번이라도 해 봤을 때만 나온다). 다 채우면 받기 → reward 코인, 새 미션으로
    MISSIONS: [
      { id: 'hsum1000', kind: 'life', stat: 'height',   goal: 1000, reward: 120, text: '모두 합쳐 1,000m 오르기 (누적)' },
      { id: 'star200',  kind: 'life', stat: 'stars',    goal: 200,  reward: 100, text: '별 200개 모으기 (누적)' },
      { id: 'spring20', kind: 'life', stat: 'springs',  goal: 20,   reward: 90,  text: '스프링 20번 밟기 (누적)' },
      { id: 'rocket3',  kind: 'life', stat: 'rockets',  goal: 3,    reward: 80,  text: '로켓 3번 타기 (누적)' },
      { id: 'save3',    kind: 'life', stat: 'saves',    goal: 3,    reward: 100, text: '방패 방울로 3번 살아남기 (누적)' },
      { id: 'crumb30',  kind: 'life', stat: 'crumbles', goal: 30,   reward: 80,  text: '금 간 발판 30번 밟기 (누적)' },
      { id: 'bnc300',   kind: 'life', stat: 'bounces',  goal: 300,  reward: 90,  text: '발판 300번 밟기 (누적)' },
      { id: 'games5',   kind: 'life', stat: 'games',    goal: 5,    reward: 70,  text: '5판 하기 (누적)' },
      { id: 'stomp15',  kind: 'life', stat: 'stomps',   goal: 15,   reward: 90,  text: '몬스터 15마리 밟기 (누적)' },
      { id: 'h100',     kind: 'run',  stat: 'height',   goal: 100,  reward: 80,  text: '한 판에 100m 오르기' },
      { id: 'h250',     kind: 'run',  stat: 'height',   goal: 250,  reward: 150, text: '한 판에 250m (우주 도착)' },
      { id: 'h500',     kind: 'run',  stat: 'height',   goal: 500,  reward: 250, text: '한 판에 500m (토성 도착)' },
      { id: 'star30',   kind: 'run',  stat: 'stars',    goal: 30,   reward: 100, text: '한 판에 별 30개' },
      { id: 'stomp5',   kind: 'run',  stat: 'stomps',   goal: 5,    reward: 110, text: '한 판에 몬스터 5마리 밟기' },
      { id: 'combo12',  kind: 'run',  stat: 'maxCombo', goal: 12,   reward: 120, text: '한 판에 콤보 12' },
      { id: 't120',     kind: 'run',  stat: 'time',     goal: 120,  reward: 100, text: '한 판에 2분 동안 오르기' },
      { id: 'n150',     kind: 'run',  stat: 'height',   goal: 150,  reward: 150, text: '보통으로 150m', diff: 'normal' },
      { id: 'x80',      kind: 'run',  stat: 'height',   goal: 80,   reward: 180, text: '어려움으로 80m', diff: 'hard' },
    ],
    MISSION_SLOTS: 3,

    // 연출 (그리기 전용, 규칙에는 영향 없음)
    FX: { starSparks: 12, springSparks: 18, dust: 6, maxParticles: 160, shake: 7, flash: 0.3 },

    // 처음 몇 초 조작 안내를 보여 준다 (처음 해 보는 판은 양쪽을 다 눌러 볼 때까지 큰 안내)
    HINT_TIME: 4,
    // 누르는 자리 화살표 크기 (반지름, 화면 px). 2026-09-27 소유자: "화살표는 화면에 아주 작게" (예전 옆자리 최대 70·기둥 안 26 ~ 44)
    PAD: { size: 17, max: 20 },
  };

  // 외계 행성을 태양계 행성 뒤에 붙인다 (공용 도감이 없으면 태양계 아홉만)
  const WX = (typeof WORLDS !== 'undefined' && WORLDS && WORLDS.exo) ? WORLDS : null;
  if (WX) {
    for (const e of JP.DATA.EXO_PLANETS) {
      const X = WX.exo(e.id);
      if (!X) continue;
      JP.DATA.PLANETS.push({ id: e.id, name: X.name, at: e.at, side: e.side, size: e.size, color: X.color, line: X.line,
        sky: X.sky, glow: X.glow, body: X.body, accent: X.accent, exo: true });
    }
  }
  // 태양계 행성 도착 한 줄: 공용 도감의 재미 문구 (도감이 없으면 위 글 그대로)
  if (WX && WX.SOLAR_WEATHER) for (const P of JP.DATA.PLANETS) { const q = WX.SOLAR_WEATHER[P.id]; if (q && q.line) P.line = q.line; }
  // 행성마다 날씨 (WORLDS.weatherOf). 없으면 null
  JP.DATA.weatherOf = id => (WX && WX.weatherOf ? WX.weatherOf(id) : null);
})(JP);
