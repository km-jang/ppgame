'use strict';
// 모든 수치는 이 파일 한 곳에서 고친다.
(function (SN) {
  SN.DATA = {
    // 판 크기(칸). 가로 화면은 넓게, 세로 화면(폰)은 돌려서 쓴다
    BOARD: { land: [32, 20], port: [20, 32] },

    // 쉬움 (아이도 하기 편하게, 처음 켰을 때 기본): 칸이 크고 느리며, 판 끝에 닿으면 반대편에서 나온다.
    // 방향 버튼을 누를 때까지 출발하지 않는다
    EASY: { board: { land: [24, 15], port: [15, 24] }, base: 5.5, perGrow: 0.08, max: 9, stageMul: 0.7 },

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
    ],
    MISSION_SLOTS: 3,

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
