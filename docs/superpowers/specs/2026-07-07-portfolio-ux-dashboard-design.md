# 포트폴리오 사이트 + UX 분석 대시보드 설계

## 목표

- 정적 포트폴리오 웹사이트(2페이지)를 만들고, 방문자의 상세 UX 행동(스크롤, 클릭, 폼 이탈, 마우스 패턴, 디바이스 정보)을 로깅한다.
- 로그는 Google Apps Script를 통해 Google Sheets에 자동 적재된다.
- 수집된 데이터를 Chart.js로 시각화하는 별도의 분석 대시보드 페이지를 제공한다.

## 범위 밖

- 실제 프로젝트 콘텐츠/이미지 (더미 데이터로 대체, 추후 교체 가능한 구조로만 작성)
- 강력한 인증/암호화 (간단한 토큰 대조 수준)
- 자동화 테스트 프레임워크 (수동 E2E 검증으로 대체)
- 빌드 도구/프레임워크 (순수 정적 HTML/CSS/JS)

## 아키텍처

빌드 단계 없는 정적 사이트 + Google Apps Script 백엔드(수집 API 겸 조회 API) + Google Sheets(저장소) 구조.

```
class-portfolio-2607/
├── index.html          # Page1: 소개 + 필터링 갤러리 (웹/모바일/AI/디자인)
├── contact.html        # Page2: 3단계 문의 폼 (기본정보 → 프로젝트문의 → 완료)
├── dashboard.html       # 분석 대시보드
├── css/style.css
├── js/
│   ├── tracker.js       # 공용 UX 로깅 모듈 (index.html, contact.html에 포함)
│   ├── gallery.js       # Page1 갤러리 필터 로직
│   ├── form.js          # Page2 멀티스텝 폼 로직 + 스텝 추적 훅
│   └── dashboard.js      # 대시보드: fetch + Chart.js 렌더링
├── data/
│   └── projects.js      # 더미 프로젝트 데이터 배열
└── apps-script/
    ├── Code.gs           # doPost(이벤트 수집) / doGet(집계 JSON API)
    └── README.md          # 시트 생성, 웹앱 배포, 토큰 설정 가이드 (수동 단계)
```

### 데이터 흐름

1. 방문자가 `index.html` 또는 `contact.html`에서 행동 → `tracker.js`가 이벤트를 메모리 버퍼에 축적
2. 10초 주기 타이머 또는 페이지 이탈 시(`visibilitychange`/`pagehide` → `navigator.sendBeacon`)로 배치 전송
3. `fetch(APPS_SCRIPT_URL, {method:'POST', body: JSON.stringify(batch), headers:{'Content-Type':'text/plain;charset=utf-8'}})` — Apps Script CORS 프리플라이트 회피를 위해 text/plain 사용
4. Apps Script `doPost`가 배치의 각 이벤트를 `Events` 시트에 행으로 append
5. `dashboard.html` 로드 시 저장된 토큰으로 `GET {APPS_SCRIPT_URL}?action=summary&token=...` 호출
6. Apps Script `doGet`이 `Events` 시트 전체를 읽어 5종 집계를 계산 후 JSON 반환
7. `dashboard.js`가 Chart.js(+`chartjs-chart-matrix` CDN 플러그인)로 렌더링

## 컴포넌트

### tracker.js (공용 로깅)

- 세션ID: `sessionStorage`에 UUID 저장, 페이지 로드마다 재사용
- 수집 이벤트 타입:
  - `page_view`: 진입 시 1회, userAgent/screenW/screenH/viewport 포함
  - `scroll_dwell`: `data-section` 속성이 붙은 주요 블록들을 IntersectionObserver로 관찰, 섹션이 뷰포트에 머문 누적 ms를 페이지 이탈 시 전송
  - `image_click`: 갤러리 썸네일 클릭 시 `{projectId, order(몇 번째 클릭인지), deltaMs(직전 클릭과의 시간차)}`
  - `mouse_grid`: mousemove를 200ms throttle, 페이지를 20×20 그리드로 나눠 셀별 hover 카운트를 누적, 배치 전송 시 스냅샷 포함 (좌표 원본은 전송하지 않음 — payload 최소화 + 사실상 클라이언트 집계)
  - `form_step`: `contact.html` 전용, 각 스텝 enter/complete/abandon + 소요시간(ms)
- 전송 실패는 조용히 무시 (재시도 없음, 사용자 경험에 영향 주지 않음)

### gallery.js

- 더미 프로젝트 데이터(`data/projects.js`, 8~12개, 카테고리: 웹/모바일/AI/디자인)를 렌더링
- 카테고리 버튼 클릭 시 CSS class 토글로 필터링
- 썸네일은 실제 이미지 대신 그라디언트 CSS 박스 + 프로젝트명 (이미지 자산 없이 클릭 추적 가능한 요소로 충분)

### form.js

- 3단계: 기본정보(이름/이메일/연락처) → 프로젝트문의(유형/예산/설명) → 완료
- 스텝 전환 시 `tracker.js`의 `form_step` 이벤트 호출 (enter/complete), `beforeunload` 시 미완료 스텝을 abandon으로 기록

### apps-script/Code.gs

- `doPost(e)`: JSON 배치 파싱 → `Events` 시트에 각 이벤트를 한 행씩 append (컬럼: timestamp, sessionId, page, eventType, dataJson, userAgent, screenW, screenH)
- `doGet(e)`:
  - `token` 파라미터를 Script Properties의 `DASHBOARD_TOKEN`과 대조, 불일치 시 `{error:"unauthorized"}` 반환
  - `Events` 시트 전체를 읽어 5종 집계 계산:
    1. 섹션별 스크롤 누적 체류시간 합계
    2. 이미지별 클릭 수 + 평균 클릭 간격 + 클릭 순서 히스토그램
    3. 폼 스텝별 진입수/완료수/이탈률(%) + 평균 소요시간
    4. 20×20 마우스 그리드 카운트 합산 (세션 전체 합산)
    5. userAgent 문자열 기반 간단 분류(모바일/데스크톱, 브라우저 종류) 후 카운트
  - 결과를 JSON으로 반환
- try/catch로 감싸 에러 시 `{error: message}` JSON 반환 (500 대신 200 + error 필드, GAS 특성상 이 방식이 클라이언트에서 다루기 쉬움)

### dashboard.html / dashboard.js

- 최초 로드 시 `prompt()`로 토큰 입력 → `sessionStorage`에 저장 후 API 호출에 사용
- 5개 차트 렌더링:
  1. 막대: 섹션별 체류시간
  2. 막대: 이미지별 클릭 수 (+ 평균 간격은 텍스트 라벨 또는 툴팁)
  3. 막대: 폼 스텝별 이탈률/소요시간
  4. 매트릭스 히트맵(`chartjs-chart-matrix`): 마우스 관심영역
  5. 도넛: 디바이스/브라우저 분포
- 에러 시 배너 표시 + 재시도 버튼, 토큰 오류 시 재입력 프롬프트

## 에러 처리

- 클라이언트: 모든 전송 로직 try/catch, 실패 시 조용히 드롭 (사용자 경험 최우선)
- Apps Script: try/catch로 감싸 JSON 에러 응답, `Logger.log`로 서버측 기록
- 대시보드: fetch 실패/인증 실패를 사용자에게 명확히 표시, 재시도 버튼 제공

## 검증 (수동 E2E, 자동화 테스트 없음)

1. Apps Script 배포 후 `curl`로 `doPost`/`doGet` 직접 호출해 시트 반영 및 JSON 응답 확인
2. 로컬 정적 서버로 `index.html` 열어 스크롤/필터/갤러리 클릭 후 시트에 이벤트 행 생성 확인
3. `contact.html`에서 폼을 끝까지 완료 + 별도 세션에서 중간 이탈, 두 경우 모두 로그 확인
4. `dashboard.html`에서 올바른/틀린 토큰 입력 각각 테스트, 5개 차트가 시트 데이터와 일치하게 렌더링되는지 확인

## 수동 단계 (코드로 대체 불가)

- Google Sheets 생성 및 Apps Script 프로젝트 연결
- Apps Script를 웹앱으로 배포(권한 승인 포함)하고 웹앱 URL 발급
- Script Properties에 `DASHBOARD_TOKEN` 설정
- 발급받은 웹앱 URL을 `js/tracker.js`, `js/dashboard.js`의 설정값에 반영

→ `apps-script/README.md`에 단계별 가이드 작성 예정
