# 게임 모음

| 폴더 | 게임 |
|---|---|
| [`game/`](game/) | **뿅뿅 우주선** (옛 이름 N-GUN) · 대포가 늘어나는 우주선 슈팅 (아래 설명) |
| [`snake/`](snake/) | **냠냠 뱀** (옛 이름 N-SNAKE) · 화면을 밀어 구슬을 먹는 뱀 게임 ([기획서](snake/PLAN.md)) |
| [`archive/robocar/`](archive/robocar/) | **뚝딱 로봇카** · 보류 (2026-09-27). 첫 화면에서 뺐고, 코드와 테스트는 그대로 보관 |

저장소 첫 화면(`index.html`)에서 둘 중 하나를 고른다.

## 뿅뿅 우주선 (`game/`)

총열이 N개로 늘어나는 총을 들고 몰려오는 적을 웨이브 단위로 버티는 아레나 슈팅 게임.
웨이브를 넘길 때마다 카드 3장 중 1장을 골라 총을 키운다. 5웨이브마다 보스.

- 게임 본체: [`game/`](game/) · 기획서: [`game/PLAN.md`](game/PLAN.md)
- 모바일(폰·태블릿) 우선. 크롬에서 열고 메뉴 → **홈 화면에 추가**하면 앱처럼 전체 화면으로 실행된다.
- 설치·빌드 없음. `game/index.html`을 브라우저로 열면 바로 실행된다.
- GitHub Pages를 켜면 저장소 주소 첫 화면(`index.html`)이 `game/`으로 넘겨 준다.

## 조작

| 동작 | PC | 모바일 |
|---|---|---|
| 이동 | WASD / 방향키 | 화면 왼쪽 드래그 |
| 조준 | 마우스 (F: 자동 조준 전환) | 화면 오른쪽 드래그 (떼면 자동) |
| 사격 | 자동 | 자동 |
| 대시 | Space / Shift / 오른쪽 클릭 | 대시 버튼 |
| 카드 | 클릭 또는 1·2·3 | 탭 |
| 일시정지 · 소리 | P / Esc · M | 왼쪽 위 버튼 |

시작 화면에서 난이도(쉬움·보통·어려움)와 음악·효과음 켜기/끄기를 고른다. 최고 기록은 난이도별로 따로 저장된다.

## 테스트

```
node tests/sim.test.js       # 뿅뿅 우주선 규칙
node tests/snake.test.js     # 냠냠 뱀 규칙
node tests/flow.test.js      # 두 게임 화면 흐름 (Playwright 크로미움, 없으면 건너뜀)
# 보류 중인 뚝딱 로봇카: node archive/robocar/tests/robocar.test.js · park.test.js · flow.test.js
```

게임 규칙(`game/js/world.js`)을 브라우저 없이 수천 프레임 돌려서 웨이브 진행·카드·보스·게임 오버·관통·도탄을 확인한다.

## 밸런스 조정

수치는 전부 `game/js/data.js` 한 파일에 있다 (적 체력·속도, 웨이브 규모, 카드 효과).

## 인터넷 주소로 열기 (GitHub Pages)

태블릿에서 앱으로 설치하고 인터넷 없이 하려면 https 주소가 필요하다. 한 번만 켜 두면 된다.

1. github.com/km-jang/n-gun 에서 위쪽 **Settings** 누르기
2. 왼쪽 메뉴 **Pages** 누르기
3. **Branch**에서 `main`, 폴더 `/ (root)` 고르고 **Save**
4. 1~2분 뒤 같은 화면 위쪽에 주소가 뜬다: `https://km-jang.github.io/n-gun/`
5. 태블릿 크롬에서 그 주소 → 게임 고르기 → 크롬 메뉴(⋮) → **홈 화면에 추가**

main에 합친 것만 이 주소에 나온다.

## 소리 출처

소리 파일(`game/sounds/`, 보류 중인 `archive/robocar/sounds/`)은 Kenney(kenney.nl)의 무료 스타터 키트에서 가져왔다 (MIT 라이선스, 각 폴더 `LICENSE.md`).

## 이전 작업물

방치형 클리커 "sudo make AGI"와 함께 있던 문서는 2026-09-24 재기획 때 모두 폐기했다.
git 기록에는 남아 있다.
