'use strict';
// 우주 여행 도감: 네 게임이 함께 쓰는 행성 이름·색·날씨 (2026-09-27, 소유자: "얼음 행성이면 눈이 오고 불의 행성이면 그에 맞게").
// DOM을 쓰지 않는다 (tests/worlds.test.js). 그림은 각 게임 render가 제 시점(위에서·옆에서·앞으로)에 맞게 그린다.
//
// 1) SOLAR_WEATHER: 이미 있는 태양계 행성 아홉(수금지화목토천해명)에 붙는 날씨
// 2) EXO: 명왕성 다음에 이어지는 외계 행성 여덟. 실제 발견된 외계 행성에서 모티프를 따왔다
//    (NASA Exoplanet Travel Bureau 포스터, 위키백과 행성 종류 목록 참고). 이름은 아이 말로 바꿨다.
//
// 날씨 종류(kind)와 뜻. 게임은 이 목록만 알면 된다:
//   snow    눈송이가 천천히 흔들리며 내린다 (얼음 행성)
//   ember   불씨가 아래에서 위로 떠오르며 깜빡인다 (불·용암 행성)
//   rain    빗줄기가 곧게 떨어진다 (바다 행성)
//   glass   파란 유리 조각 비가 옆으로 비스듬히 날린다 (유리비 행성)
//   sparkle 반짝이 가루가 제자리에서 빛났다 꺼진다 (보석 행성)
//   sand    모래 알갱이가 옆으로 빠르게 흐른다 (사막·모래바람)
//   bubble  동그란 방울이 아래에서 위로 흔들리며 오른다 (바다·젤리)
//   spore   빛나는 씨앗이 둥둥 떠다닌다 (버섯 숲)
//   bolt    멀리서 번개가 가끔 번쩍 (폭풍). 움직임 줄이기면 번쩍임 없이 구름빛만
//   aurora  하늘에 오로라 띠가 천천히 일렁인다 (떠돌이 행성·극지)
//   haze    노란 안개가 천천히 흘러간다 (금성)
// amount: 0 ~ 1 (1이면 게임이 정한 최대 입자 수), wind: 옆 바람 -1 ~ 1 (+ 오른쪽), color: 입자 색 두 개
var WORLDS = (typeof WORLDS !== 'undefined' && WORLDS) || {};
(function (W) {
  const SOLAR_WEATHER = {
    mercury: { kind: 'ember',   amount: 0.35, wind: 0,    color: ['#ffb36b', '#ff6a3d'], line: '뜨거운 불씨가 날려요' },
    venus:   { kind: 'haze',    amount: 0.6,  wind: 0.3,  color: ['#ffe08a', '#e0b050'], line: '노란 구름 안개' },
    earth:   { kind: 'rain',    amount: 0.25, wind: 0.1,  color: ['#9fd8ff', '#ffffff'], line: '시원한 빗방울' },
    mars:    { kind: 'sand',    amount: 0.5,  wind: 0.8,  color: ['#ff9a6b', '#c9583a'], line: '빨간 모래바람' },
    jupiter: { kind: 'bolt',    amount: 0.5,  wind: 0.4,  color: ['#fff3c4', '#f0b98a'], line: '번쩍번쩍 큰 폭풍' },
    saturn:  { kind: 'sparkle', amount: 0.4,  wind: 0,    color: ['#fff1c2', '#f3d58c'], line: '고리 얼음이 반짝' },
    uranus:  { kind: 'snow',    amount: 0.5,  wind: -0.3, color: ['#e8ffff', '#9ef0f0'], line: '옆으로 도는 얼음 행성' },
    neptune: { kind: 'snow',    amount: 0.8,  wind: 0.9,  color: ['#dfe9ff', '#8fb0ff'], line: '쌩쌩 눈보라' },
    pluto:   { kind: 'snow',    amount: 0.4,  wind: 0,    color: ['#ffffff', '#f3dcc8'], line: '조용히 내리는 눈' },
  };

  // 외계 행성 여덟. sky: 하늘 [위, 가운데, 아래] · glow: 빛 덩어리 두 색 · body: 행성 몸 [밝은, 어두운] · accent: 무늬·테 색
  // look: 행성 모양 힌트 (각 게임 그림 담당이 참고) · ref: 모티프
  const EXO = [
    { id: 'frost',   name: '꽁꽁 얼음 행성', line: '온 세상이 눈과 얼음',
      color: '#bff4ff', sky: ['#0a1e3a', '#1f4f7a', '#8fd6ff'], glow: ['#bff4ff', '#6aa8ff'],
      body: ['#f2fcff', '#8fc9e8'], accent: '#ffffff', look: '하얀 얼음 행성, 금 간 푸른 얼음 무늬, 극지 흰 모자',
      weather: { kind: 'snow', amount: 1, wind: 0.2, color: ['#ffffff', '#cdefff'] }, ref: '눈덩이 행성(snowball planet)' },
    { id: 'lava',    name: '부글부글 용암 행성', line: '용암 바다가 부글부글',
      color: '#ff7a3d', sky: ['#1a0505', '#5a1208', '#c2410c'], glow: ['#ff7a3d', '#ffd23d'],
      body: ['#3a1a14', '#140806'], accent: '#ff8a2a', look: '검은 바위 행성, 빛나는 주황 용암 갈라짐',
      weather: { kind: 'ember', amount: 1, wind: 0.1, color: ['#ffd23d', '#ff5a1f'] }, ref: '용암 행성 Kepler-10b · 55 Cancri e' },
    { id: 'ocean',   name: '출렁출렁 바다 행성', line: '온통 바다, 비가 내려요',
      color: '#3dd6ff', sky: ['#031a2e', '#0b4a6e', '#1fa3c4'], glow: ['#3dd6ff', '#2a6cff'],
      body: ['#2fb6ff', '#0a4f9a'], accent: '#e8fbff', look: '파란 물 행성, 흰 소용돌이 구름',
      weather: { kind: 'rain', amount: 0.9, wind: 0.15, color: ['#bfefff', '#ffffff'] }, ref: '바다 행성 Kepler-22b · GJ 1214 b' },
    { id: 'glass',   name: '쨍그랑 유리비 행성', line: '파란 유리 비가 옆으로 쌩',
      color: '#5b8cff', sky: ['#050b2a', '#12246a', '#2f5bd0'], glow: ['#5b8cff', '#9fd8ff'],
      body: ['#3a6cff', '#10205a'], accent: '#bfe0ff', look: '짙은 파랑 가스 행성, 옆으로 흐르는 줄무늬',
      weather: { kind: 'glass', amount: 0.9, wind: 1, color: ['#dff3ff', '#7fb2ff'] }, ref: '유리비 행성 HD 189733 b' },
    { id: 'gem',     name: '반짝반짝 보석 행성', line: '땅속이 다이아몬드',
      color: '#e6b3ff', sky: ['#12061f', '#3a1560', '#7a3fb0'], glow: ['#e6b3ff', '#6af0ff'],
      body: ['#d9c2ff', '#5a3a8a'], accent: '#ffffff', look: '보랏빛 행성, 각진 보석 면이 번쩍',
      weather: { kind: 'sparkle', amount: 1, wind: 0, color: ['#ffffff', '#b3f0ff'] }, ref: '다이아몬드 행성 55 Cancri e' },
    { id: 'twin',    name: '해님 둘 사막 행성', line: '해가 두 개, 모래바람',
      color: '#ffc46b', sky: ['#2a1206', '#8a4a1a', '#f0a050'], glow: ['#ffe08a', '#ff8a4d'],
      body: ['#f0c07a', '#9a6030'], accent: '#fff0c8', look: '모래색 행성, 모래 언덕 줄무늬. 하늘에 작은 해 두 개',
      weather: { kind: 'sand', amount: 0.9, wind: 1, color: ['#ffd89a', '#d09050'] }, ref: '해가 둘인 행성 Kepler-16b' },
    { id: 'shroom',  name: '둥실둥실 버섯 행성', line: '빛나는 버섯 숲',
      color: '#7dff9a', sky: ['#04140c', '#0d3a24', '#1f6a4a'], glow: ['#7dff9a', '#ff7ae0'],
      body: ['#4fd68a', '#1a5a3a'], accent: '#ff9ae8', look: '초록 행성, 분홍·하늘색 빛 점무늬 (상상 행성)',
      weather: { kind: 'spore', amount: 0.9, wind: 0.2, color: ['#b3ffc8', '#ff9ae8'] }, ref: '상상 행성 (빛 버섯 숲)' },
    { id: 'rogue',   name: '깜깜 떠돌이 행성', line: '해 없이 떠도는 밤 행성',
      color: '#9a7dff', sky: ['#020208', '#0a0a24', '#141040'], glow: ['#6affc8', '#9a7dff'],
      body: ['#3a3a5a', '#101020'], accent: '#6affc8', look: '어두운 행성, 테두리만 오로라 빛',
      weather: { kind: 'aurora', amount: 1, wind: 0, color: ['#6affc8', '#b37dff'] }, ref: '떠돌이 행성(rogue planet)' },
  ];

  const KINDS = ['snow', 'ember', 'rain', 'glass', 'sparkle', 'sand', 'bubble', 'spore', 'bolt', 'aurora', 'haze'];

  // 이 행성(태양계 id 또는 외계 id)의 날씨. 없으면 null
  function weatherOf(id) {
    if (SOLAR_WEATHER[id]) return SOLAR_WEATHER[id];
    const e = EXO.find(p => p.id === id);
    return e ? e.weather : null;
  }
  function exo(id) { return EXO.find(p => p.id === id) || null; }

  W.SOLAR_WEATHER = SOLAR_WEATHER;
  W.EXO = EXO;
  W.KINDS = KINDS;
  W.weatherOf = weatherOf;
  W.exo = exo;
})(WORLDS);
if (typeof module !== 'undefined') module.exports = WORLDS;
