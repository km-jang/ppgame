'use strict';
// 모든 수치는 이 파일 한 곳에서 고친다.
(function (SN) {
  SN.DATA = {
    // 판 크기(칸). 가로 화면은 넓게, 세로 화면(폰)은 돌려서 쓴다
    BOARD: { land: [32, 20], port: [20, 32] },

    // 쉬움 (아이도 하기 편하게, 처음 켰을 때 기본): 칸이 크고 느리며, 판 끝에 닿으면 반대편에서 나온다.
    // 방향 버튼을 누를 때까지 출발하지 않는다
    EASY: { board: { land: [24, 15], port: [15, 24] }, base: 5.5, perGrow: 0.08, max: 9, stageMul: 0.7 },

    // 어려움 (2026-09-27, 소유자 "어려움 버튼도 추가해줘"): 보통보다 빨리 출발하고 더 빨리 빨라진다. 판 끝·라이벌 몸은 보통처럼 위험,
    // 위험 경고는 그대로 켜져 있다. goldMul: 황금 구슬 시간 배율 · itemMul: 아이템 간격 배율(클수록 드물게)
    // stageMul·stagePerGrow: 스테이지 속도 (레벨 속도 × stageMul + 길이마다)
    HARD: { base: 9, perGrow: 0.2, max: 17, stageMul: 1.15, stagePerGrow: 0.13, goldMul: 0.7, itemMul: 1.25 },
    // 난이도 세 가지 (시작 화면 단추 순서). 쉬움 = EASY, 보통 = SPEED·BOARD, 어려움 = HARD·BOARD
    DIFFS: [
      { id: 'easy',   name: '쉬움',   sub: '느리게 · 벽 통과' },
      { id: 'normal', name: '보통',   sub: '빠르게 · 벽 조심' },
      { id: 'hard',   name: '어려움', sub: '더 빠르게 · 센 라이벌' },
    ],

    // 시작: 길이 4칸, 1초 숨 고르고 출발 (그 전에 방향을 넣으면 바로 출발)
    START: { len: 4, wait: 1.0 },

    // 속도(초당 칸 수): 한 칸 길어질 때마다 조금씩 빨라지고 상한에서 멈춘다
    SPEED: { base: 8, perGrow: 0.15, max: 15, stagePerGrow: 0.1 },

    // 먹이: 일반 10점 + 길이 10칸마다 2점 보너스. 5번째마다 황금 구슬(50점 + 같은 보너스)
    // goldLife: 황금 구슬은 이 시간(초) 안에 먹어야 한다. 지나면 보통 구슬로 식는다 (무한·스테이지만)
    FOOD: { points: 10, bonusPer: 10, bonus: 2, goldEvery: 5, goldPoints: 50, goldLife: 6 },

    // 콤보: 앞 구슬을 먹고 window초 안에 또 먹으면 이어진다. 배율 = 1 + (콤보-1)/step 의 정수 부분, 최대 max
    COMBO: { window: 3.2, step: 2, max: 4 },

    // 아이템(변수): 판에 가끔 하나씩 나타나 life초 뒤 사라진다. 먹으면 time초 동안 효과
    ITEM: {
      first: 6, gapMin: 9, gapMax: 15, life: 8,
      kinds: {
        slow:   { name: '느린 시계', time: 6, color: '#7fd3ff', glyph: '◷' },   // 속도 60%
        double: { name: '점수 두 배', time: 8, color: '#ffe66d', glyph: '×2' },  // 먹이 점수 ×2
        ghost:  { name: '유령',      time: 5, color: '#c7a6ff', glyph: '◌' },   // 벽·몸 통과 (벽은 반대편으로)
        cut:    { name: '가위',      time: 0, color: '#3dff8b', glyph: '✂', points: 30 },  // 꼬리 3분의 1 자르기
      },
      slowMul: 0.6,
    },

    // 스테이지: 레벨마다 벽 모양·포털 수·목표 구슬·속도가 다르다. 12를 넘으면 모양을 다시 돌며 더 빠르게
    LEVELS: [
      { name: '첫 걸음',     goal: 8,  speed: 7,    walls: 'none' },
      { name: '기둥 숲',     goal: 10, speed: 7.5,  walls: 'pillars' },
      { name: '가운데 벽',   goal: 10, speed: 8,    walls: 'bar', items: true },
      { name: '순간 이동',   goal: 12, speed: 8,    walls: 'none', portals: 1, items: true },
      { name: '십자로',      goal: 12, speed: 8.5,  walls: 'cross', items: true },
      { name: '네 개의 방',  goal: 14, speed: 9,    walls: 'rooms', items: true },
      { name: '줄무늬',      goal: 14, speed: 9,    walls: 'stripes', portals: 1, items: true },
      { name: '상자 속',     goal: 15, speed: 9.5,  walls: 'box', items: true },
      { name: '포털 미로',   goal: 16, speed: 10,   walls: 'pillars', portals: 2, items: true },
      { name: '나선',        goal: 16, speed: 10,   walls: 'spiral', items: true },
      { name: '요새',        goal: 18, speed: 10.5, walls: 'fort', portals: 1, items: true },
      { name: '마지막 관문', goal: 20, speed: 11,   walls: 'rooms', portals: 2, items: true },
    ],
    STAGE: { loopSpeed: 0.8, clearBonus: 50, clearTime: 1.6 },

    // 메달. check(run, rec): run = 이번 판 기록, rec = 평생 기록 (main.js가 판이 끝날 때·레벨을 깰 때 확인)
    // tier: 1 동 · 2 은 · 3 금
    MEDALS: [
      { id: 'gold1',    tier: 1, name: '황금 맛',       desc: '황금 구슬 먹기',                 check: r => r.golds >= 1 },
      { id: 'len20',    tier: 1, name: '쭉쭉 20',       desc: '한 판에 길이 20',                check: r => r.maxLen >= 20 },
      { id: 'len40',    tier: 2, name: '길쭉 40',       desc: '한 판에 길이 40',                check: r => r.maxLen >= 40 },
      { id: 'len80',    tier: 3, name: '거대 뱀 80',    desc: '한 판에 길이 80',                check: r => r.maxLen >= 80 },
      { id: 'combo5',   tier: 1, name: '연속 5',        desc: '콤보 5 이어 가기',               check: r => r.maxCombo >= 5 },
      { id: 'combo10',  tier: 2, name: '연속 10',       desc: '콤보 10 이어 가기',              check: r => r.maxCombo >= 10 },
      { id: 'lvl3',     tier: 1, name: '입문',          desc: '스테이지 레벨 3 깨기',           check: (r, R) => R.stage.max >= 3 },
      { id: 'lvl6',     tier: 2, name: '숙련',          desc: '스테이지 레벨 6 깨기',           check: (r, R) => R.stage.max >= 6 },
      { id: 'lvl12',    tier: 3, name: '정복자',        desc: '스테이지 레벨 12 깨기',          check: (r, R) => R.stage.max >= 12 },
      { id: 'power4',   tier: 2, name: '아이템 수집가', desc: '한 판에 아이템 네 가지 모두',   check: r => r.powerKinds >= 4 },
      { id: 'portal10', tier: 1, name: '포털 여행자',   desc: '한 판에 포털 10번',              check: r => r.portals >= 10 },
      { id: 'ghost3',   tier: 2, name: '벽 너머',       desc: '유령일 때 벽을 3번 통과',        check: r => r.wraps >= 3 },
      { id: 'score1k',  tier: 1, name: '천 점',         desc: '무한 모드 1,000점',              check: r => r.mode === 'endless' && r.score >= 1000 },
      { id: 'score3k',  tier: 3, name: '삼천 점',       desc: '무한 모드 3,000점',              check: r => r.mode === 'endless' && r.score >= 3000 },
      { id: 'games10',  tier: 1, name: '단골',          desc: '10판 하기',                      check: (r, R) => R.total.games >= 10 },
      { id: 'orbs500',  tier: 2, name: '구슬 500',      desc: '모두 합쳐 구슬 500개',           check: (r, R) => R.total.orbs >= 500 },
      { id: 'hard20',   tier: 2, name: '어려움 길이 20', desc: '어려움으로 한 판에 길이 20',    check: r => r.diff === 'hard' && r.maxLen >= 20 },
      { id: 'rivalAll', tier: 2, name: '라이벌 통째로', desc: '라이벌을 통째로 냠냠',             check: r => r.rivalWholes >= 1 },
      { id: 'hard30',   tier: 3, name: '어려움 길이 30', desc: '어려움으로 한 판에 길이 30',    check: r => r.diff === 'hard' && r.maxLen >= 30 },
    ],

    // ─── 코인 · 상점 · 미션 (2026-09-27, shop.js) ─────────────────
    // 코인은 네 게임이 같이 쓰는 별코인 지갑(common/hub.js)에 들어간다.
    // 한 판 코인 = 점수/perScore + 황금 구슬 × perGold + 스테이지 깬 레벨 × perLevel (+ 코인 보너스 강화 %)
    // 아이가 보통 한 판 하면 20~60개쯤
    COINS: { perScore: 20, perGold: 3, perLevel: 15 },

    // 캐릭터 5종 (2026-09-27, 소유자: "캐릭터를 고를 수 있게 5종 정도, 다양하게"). 모양은 render.js가 그린다.
    // 특기는 모두 돕기만 하고 벌은 없다. 서로 다른 쪽을 도와서 어느 하나가 모든 면에서 낫지 않다.
    // trait (world.js create의 opts.char가 읽는다):
    //   speedMul: 속도 배율 · itemMul: 아이템 간격 배율(작을수록 자주) · comboPlus: 콤보 시간 +초
    //   goldPlus: 황금 구슬 시간 +초 · startGhost: 판(레벨) 시작 유령 초 · ghostMul: 유령 아이템 시간 배율
    // price 0 = 처음부터 가짐. color: 이름·카드 색
    CHARS: [
      { id: 'neon',   name: '네온 뱀',       price: 0,    color: '#5ee7ff', look: '반짝이는 청록 몸에 노란 코',
        trait: '느긋해요: 속도 6% 천천히',           traits: { speedMul: 0.94 } },
      { id: 'robot',  name: '로봇 뱀',       price: 300,  color: '#c9d6e3', look: '쇠 마디와 빛나는 눈 가리개',
        trait: '아이템이 25% 더 자주 나와요',         traits: { itemMul: 0.75 } },
      { id: 'dragon', name: '꼬마 용',       price: 500,  color: '#ff9f43', look: '작은 뿔과 날개, 꼬리에 불꽃',
        trait: '콤보가 1.2초 더 이어져요',            traits: { comboPlus: 1.2 } },
      { id: 'bug',    name: '무지개 애벌레', price: 800,  color: '#ff7ad9', look: '동글동글 무지개 마디와 더듬이',
        trait: '황금 구슬이 3초 더 오래 남아요',       traits: { goldPlus: 3 } },
      { id: 'galaxy', name: '은하 해룡',     price: 1200, color: '#c7a6ff', look: '별이 비치는 몸에 금빛 왕관',
        trait: '출발 3초 유령 · 유령 아이템 1.6배',    traits: { startGhost: 3, ghostMul: 1.6 } },
    ],
    // 예전 꾸미기(색만 바꾸던 것)를 가진 저장본: 비슷한 캐릭터로 바꿔 주고, 맞는 것이 없으면 값을 한 번 돌려준다
    OLD_SKINS: {
      rainbow: { to: 'bug' }, fire: { to: 'dragon' }, star: { to: 'galaxy' },
      ice: { refund: 900 }, gold: { refund: 1400 },
    },

    // 강화: 한 번 사면 모든 판에 계속 (5단계). per: 한 단계마다 늘어나는 양. world.js create()의 opts.up으로 들어간다
    UPGRADES: [
      { id: 'goldTime',  icon: '★',  name: '황금 시간',     desc: '황금 구슬이 1초 더 오래 남아요',       per: 1,    prices: [60, 120, 200, 320, 480] },
      { id: 'itemFreq',  icon: '◷',  name: '아이템 자주',   desc: '아이템이 8% 더 자주 나와요',           per: 0.08, prices: [80, 160, 260, 400, 600] },
      { id: 'comboTime', icon: '×',  name: '콤보 시간',     desc: '콤보가 0.4초 더 이어져요',             per: 0.4,  prices: [80, 160, 260, 400, 600] },
      { id: 'coin',      icon: '+',  name: '코인 보너스',   desc: '판마다 받는 코인 +10%',               per: 0.1,  prices: [100, 200, 350, 550, 800] },
    ],
    UPGRADE_MAX: 5,

    // 시작 아이템: 사 두면 다음 판 시작할 때 하나씩 자동으로 쓴다 (종류마다 max개까지). eff: 켜지는 아이템 효과, time: 초
    START_ITEMS: [
      { id: 'ghost',  icon: '◌',  eff: 'ghost',  time: 5,  name: '유령 시작',     desc: '처음 5초 동안 벽·몸 통과',   price: 60, max: 3 },
      { id: 'slow',   icon: '◷',  eff: 'slow',   time: 8,  name: '느린 시계 시작', desc: '처음 8초 동안 천천히',       price: 50, max: 3 },
      { id: 'double', icon: '×2', eff: 'double', time: 10, name: '점수 두 배 시작', desc: '처음 10초 동안 점수 두 배', price: 70, max: 3 },
    ],

    // 미션: 늘 3개. kind 'life' = 여러 판 누적, 'run' = 한 판 안에서. stat: 판 요약(shop.js runOf)의 칸 이름
    // 다 채우면 받기 버튼 → reward 코인, 새 미션으로 바뀜
    MISSIONS: [
      { id: 'gold5',    kind: 'life', stat: 'golds',         goal: 5,    reward: 60,  text: '황금 구슬 5개 먹기 (누적)' },
      { id: 'orbs200',  kind: 'life', stat: 'eaten',         goal: 200,  reward: 100, text: '구슬 200개 먹기 (누적)' },
      { id: 'games5',   kind: 'life', stat: 'games',         goal: 5,    reward: 60,  text: '5판 놀기 (누적)' },
      { id: 'power10',  kind: 'life', stat: 'powers',        goal: 10,   reward: 80,  text: '아이템 10개 먹기 (누적)' },
      { id: 'portal5',  kind: 'life', stat: 'portals',       goal: 5,    reward: 60,  text: '포털 5번 지나가기 (누적)' },
      { id: 'lvl6',     kind: 'life', stat: 'levelsCleared', goal: 6,    reward: 100, text: '스테이지 레벨 6번 깨기 (누적)' },
      { id: 'len25',    kind: 'run',  stat: 'maxLen',        goal: 25,   reward: 80,  text: '한 판에 길이 25' },
      { id: 'len40',    kind: 'run',  stat: 'maxLen',        goal: 40,   reward: 150, text: '한 판에 길이 40' },
      { id: 'combo8',   kind: 'run',  stat: 'maxCombo',      goal: 8,    reward: 100, text: '한 판에 콤보 8' },
      { id: 's1000',    kind: 'run',  stat: 'score',         goal: 1000, reward: 120, text: '한 판에 1,000점' },
      { id: 'item3',    kind: 'run',  stat: 'powers',        goal: 3,    reward: 80,  text: '한 판에 아이템 3개' },
      { id: 'gold3',    kind: 'run',  stat: 'golds',         goal: 3,    reward: 80,  text: '한 판에 황금 구슬 3개' },
      { id: 'stage4',   kind: 'run',  stat: 'lvlTop',        goal: 4,    reward: 120, text: '스테이지 레벨 4 깨기' },
      { id: 'normal15', kind: 'run',  stat: 'normalLen',     goal: 15,   reward: 120, text: '보통으로 한 판에 길이 15' },
      { id: 't120',     kind: 'run',  stat: 'time',          goal: 120,  reward: 100, text: '한 판에 2분 버티기' },
      { id: 'ghost2',   kind: 'run',  stat: 'wraps',         goal: 2,    reward: 80,  text: '유령으로 벽 2번 통과' },
      { id: 'bite5',    kind: 'life', stat: 'rivalBites',    goal: 5,    reward: 100, text: '라이벌 5번 냠냠 (누적)' },
      { id: 'hard12',   kind: 'run',  stat: 'hardLen',       goal: 12,   reward: 150, text: '어려움으로 한 판에 길이 12' },
      { id: 'hardt60',  kind: 'run',  stat: 'hardTime',      goal: 60,   reward: 150, text: '어려움으로 한 판에 1분 버티기' },
    ],
    MISSION_SLOTS: 3,

    // 우주 여행 배경 (2026-09-27, 소유자 "다른 게임도 우주배경 반영"): 뿅뿅 우주선처럼 판 뒤 하늘이 태양계를 지나간다.
    // 그림만 바뀌고 규칙은 그대로다 (space.js가 그린다). 무한: 내가 구슬 perOrbs개를 먹을 때마다 다음 행성
    // (수성부터, 명왕성 다음은 다시 수성 "2바퀴"). 장면이 holeFrom번째부터는 바로 앞이 블랙홀이 아닐 때 holeChance로
    // 행성 대신 블랙홀 하늘이 한 번 끼어든다 (행성 차례는 밀리지 않는다). 스테이지: 레벨마다 정해진 하늘 (stage, 12개를 돈다)
    SPACE: {
      perOrbs: 12, holeFrom: 2, holeChance: 0.22, bannerTime: 2.8,
      planets: [
        { id: 'mercury', name: '수성',   fact: '태양과 가장 가까운 행성',     color: '#c9c3bb' },
        { id: 'venus',   name: '금성',   fact: '노란 구름이 빙글빙글',         color: '#ffcf6b' },
        { id: 'earth',   name: '지구',   fact: '우리 집! 파란 바다 행성',      color: '#6fc3ff' },
        { id: 'mars',    name: '화성',   fact: '빨간 모래 행성',               color: '#ff7a4d' },
        { id: 'jupiter', name: '목성',   fact: '가장 큰 행성, 커다란 빨간 점', color: '#f0b98a' },
        { id: 'saturn',  name: '토성',   fact: '멋진 고리를 두른 행성',        color: '#f3d58c' },
        { id: 'uranus',  name: '천왕성', fact: '옆으로 누워 도는 얼음 행성',   color: '#9ef0f0' },
        { id: 'neptune', name: '해왕성', fact: '바람이 가장 센 파란 행성',     color: '#5b8cff' },
        { id: 'pluto',   name: '명왕성', fact: '작고 추운 하트 행성',          color: '#e8d2b8' },
      ],
      // 행성이 아닌 하늘
      others: {
        hole:   { name: '블랙홀',    fact: '빛도 빨려 드는 곳, 구경만 해요', color: '#c9a0ff' },
        galaxy: { name: '은하수',    fact: '별이 아주아주 많이 모인 곳',     color: '#b8c8ff' },
        core:   { name: '은하 중심', fact: '은하 한가운데 커다란 블랙홀',    color: '#ffc27a' },
      },
      stage: ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'hole', 'galaxy', 'core'],
    },

    // 라이벌 뱀 (2026-09-27, 소유자 "추천대로"): 무한 모드에서 컴퓨터가 모는 주황·보라 줄무늬 뱀(눈에 가면)이
    // 같은 구슬을 두고 겨룬다. 아이템은 먹지 않는다 (황금 구슬은 먹는다). 시작 화면에서 끄고 켤 수 있다
    RIVAL: {
      intro: 5,        // 판에서 움직인 시간이 이만큼 지나면 나온다 (초). 처음 몇 초는 혼자 연습
      appear: 1.2,     // 나오기 전 깜빡이는 예고 시간 (이때는 부딪혀도 아무 일 없다)
      len: 4,          // 처음 길이. 부딪혀 줄어도 minLen 밑으로는 안 줄어든다
      minLen: 3,
      minDist: 9,      // 나오는 자리: 몸 모든 칸이 내 머리에서 이만큼(칸) 떨어진 곳, 내게서 멀어지는 방향
      bumpStun: 2,     // 라이벌 머리가 내 몸에 부딪히면 멈칫(초)하고 bumpShrink칸 줄어든다 (내가 이긴 것)
      bumpShrink: 2,
      passStun: 1.2,   // (옛 규칙, 2026-09-27 냠냠 규칙 전: 쉬움에서 라이벌 몸을 지나가면 멈칫)
      // 라이벌 냠냠 (2026-09-27, 소유자 "뱀은 라이벌을 먹으면 늘어나게"): 내 머리가 라이벌 몸을 물면 그 칸부터 꼬리까지 먹는다.
      // 칸마다 biteGrow칸 길어지고 bitePts점 (피버·점수 두 배면 곱함). 한 번에 biteMax칸까지만 길어진다.
      // 남는 앞부분이 minLen보다 짧거나 (멈칫한) 머리를 물면 통째로 먹고, 라이벌은 respawnMin~Max초 뒤 처음 길이로 다시 나온다.
      // 머리끼리 마주 부딪히면(라이벌이 멈칫하지 않았을 때) 둘 다 잠깐 멈춘다 (나는 headHold초, 라이벌은 headStun초). 아무도 안 끝난다
      bitePts: 5, biteMax: 12, biteStun: 1.5, respawnMin: 8, respawnMax: 12, headHold: 0.45, headStun: 1.2,
      blockStun: 1,    // 갈 곳이 막히면 멈칫. 멈칫이 끝나도 막혀 있으면 사라졌다가 back초 뒤 다른 자리에서 다시
      back: 3,
      // 난이도별 (시작 화면 난이도를 따른다. opts.rivalLevel로 따로 고를 수도 있다)
      //   speed: 초당 칸 · maxLen: 이 길이까지만 자람 · react: 새 구슬을 알아채기까지(초)
      //   smart: 한 칸마다 구슬 쪽으로 갈 확률 (나머지는 그냥 앞으로) · wander: 아무 데로 꺾을 확률
      //   clumsy: 내 몸을 못 보고 부딪힐 확률 (부딪히면 라이벌만 멈칫) · keepAway: 내 머리 둘레 이 칸 안은 피한다
      //   flee: 내 머리가 fleeDist칸 안에 오면 한 칸마다 이 확률로 도망 (쉬움은 거의 안 도망 = 쉬운 먹잇감)
      levels: {
        easy:   { speed: 3.6, maxLen: 12, react: 1.2, smart: 0.55, wander: 0.12, clumsy: 0.15, keepAway: 3, flee: 0.1, fleeDist: 2 },
        normal: { speed: 6.4, maxLen: 20, react: 0.5, smart: 0.85, wander: 0.04, clumsy: 0.05, keepAway: 3, flee: 0.5, fleeDist: 3 },
        hard:   { speed: 8.6, maxLen: 26, react: 0.2, smart: 0.97, wander: 0.01, clumsy: 0,    keepAway: 2, flee: 0.9, fleeDist: 4 },
      },
    },

    // 알아서 맞춰 주는 난이도 (common/hub.js HUB.adaptMul: 처음 두 판은 1, 그 뒤 0.85~1.12).
    // 판마다 값 × 배율^지수. 배율이 1보다 크면(잘하면) 조금 어렵게, 작으면 조금 쉽게.
    // world.js create의 opts.adapt로 들어간다
    ADAPT: {
      perGrow: 1.5,     // 길어질 때 빨라지는 정도 (0.85면 0.78배, 1.12면 1.19배)
      goldLife: -1,     // 황금 구슬 시간 (잘하면 짧게)
      rivalSpeed: 1,    // 라이벌 속도
      rivalReact: -1.5, // 라이벌이 새 구슬을 알아채는 시간 (잘하면 빨리)
      rivalSmart: 1,    // 라이벌이 구슬 쪽으로 가는 확률
      // 판이 끝나면 perf = 먹은 구슬 / target 을 HUB.adaptRun에 알린다 (1 = 그 난이도에서 아이가 보통 잘한 판).
      // 봇(botDir)이 라이벌과 겨루며 3분 동안 먹는 수의 중간값은 쉬움 약 69 · 보통 약 83 · 어려움 약 61. 아이의 잘한 판은 그보다 한참 적다
      target: { easy: 22, normal: 18, hard: 14 },
    },

    // ─── 재미 셋 (2026-09-27, 소유자 "추천대로") ─────────────────
    // 깜짝 선물 상자: 무한은 움직인 시간 first초(사이 무작위) 뒤 처음, 그다음은 gap초마다. 스테이지는 stageLevels 레벨에서
    // 레벨 시작 stageAt초 뒤 한 번. life초 동안 있다가 (마지막 blink초는 깜빡) 사라진다. 내 머리에서 minDist칸 넘게 떨어진 빈 칸.
    // 라이벌은 못 먹는다. 상은 w 무게로 하나: 코인(min~max, 판 끝 코인에 더함) · 바로 켜지는 아이템 · 다음 판 시작 아이템
    // (시작 아이템이 이미 가득이면 fullCoins 코인으로)
    GIFT: {
      firstMin: 60, firstMax: 100, gapMin: 60, gapMax: 100, life: 10, blink: 3, minDist: 4,
      stageLevels: [3, 6, 9, 12], stageAt: 8, fullCoins: 20,
      rewards: [
        { kind: 'coins', w: 5, min: 15, max: 40 },
        { kind: 'power', w: 3, items: ['ghost', 'slow', 'double'] },
        { kind: 'start', w: 2, items: ['ghost', 'slow', 'double'] },
      ],
    },
    // 피버 타임: 콤보 2 이상으로 먹을 때마다 게이지 perCombo, 쉬는 동안 초당 decay씩 줄어든다. 가득 차면 time초 동안
    // 구슬 점수 ×mul, 구슬이 하나 더(보너스 구슬) 나온다. 무한·스테이지만
    FEVER: { perCombo: 0.14, decay: 0.03, time: 10, mul: 2 },
    // 거대 뱀 변신: 황금 구슬 golds개를 window초 안에 먹으면 time초 동안 거대 뱀. 스테이지 안쪽 벽을 부수고 지나가고
    // (그 레벨 동안 부서진 채), 라이벌은 겁먹고 도망간다(사라졌다가 back초 뒤 다시). 판 끝·내 몸은 그대로
    GIANT: { golds: 3, window: 12, time: 6, back: 5 },

    // 빠르게 두 번 밀어도 잃지 않게 방향을 2개까지 줄 세운다
    TURN_QUEUE: 2,

    // 연출 (그리기 전용, 규칙에는 영향 없음)
    FX: { eatSparks: 12, goldSparks: 26, deathSparks: 36, maxParticles: 200, shake: 16, flash: 0.35 },

    // 밀기 판정: 짧은 변 길이의 3% 또는 18px 중 큰 값 이상 움직이면 방향 전환
    SWIPE: { min: 18, ratio: 0.03 },

    // 처음 몇 초 조작 안내를 보여 준다
    HINT_TIME: 4,
  };
})(SN);
