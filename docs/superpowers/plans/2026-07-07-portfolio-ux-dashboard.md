# 포트폴리오 + UX 분석 대시보드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 필터링 가능한 갤러리를 가진 포트폴리오 사이트(2페이지)와, 방문자의 UX 행동(스크롤/클릭/마우스/폼 이탈/디바이스)을 Google Apps Script를 통해 Google Sheets에 로깅하고 Chart.js로 시각화하는 분석 대시보드를 구현한다.

**Architecture:** 빌드 도구 없는 정적 HTML/CSS/JS 사이트. 각 페이지는 순수 로직 모듈(UMD 패턴, Node에서도 `require` 가능)과 얇은 DOM 연동 모듈로 분리한다. Google Apps Script 프로젝트가 `doPost`(이벤트 수집)와 `doGet`(집계 JSON API) 역할을 겸하며, 집계 로직도 순수 함수로 분리해 Node에서 테스트한다.

**Tech Stack:** 순수 HTML/CSS/JS, Node.js 내장 테스트 러너(`node:test`, `node:assert/strict`), Google Apps Script(V8 런타임), Chart.js + `chartjs-chart-matrix`(CDN).

## Global Constraints

- 빌드 도구/프레임워크 없음 — 모든 JS는 `<script>` 태그로 직접 로드 (스펙: 기술 스택 결정)
- 프로젝트 콘텐츠는 더미 샘플 데이터 사용, 실제 이미지 자산 없이 CSS 플레이스홀더 박스로 대체 (스펙: 콘텐츠 결정)
- 대시보드는 같은 Apps Script 웹앱이 `doGet` JSON API 역할까지 겸한다 (스펙: 데이터 연동 결정)
- 클라이언트 로깅 전송 실패는 조용히 무시, 재시도 없음 — 방문자 경험을 방해하지 않는다 (스펙: 에러 처리)
- Apps Script POST는 CORS 프리플라이트 회피를 위해 `Content-Type: text/plain;charset=utf-8` 사용 (스펙: 데이터 흐름)
- 마우스 좌표는 원본 전송 금지, 20×20 그리드로 클라이언트에서 다운샘플링 후 카운트만 전송 (스펙: 마우스 무브먼트)
- 대시보드는 토큰 프롬프트 인증 사용 (스펙: 대시보드 보안)
- 자동화 테스트는 순수 로직 함수만 대상으로 하고, DOM 연동과 Apps Script `doGet`/`doPost` 배선은 수동 E2E로 검증 (스펙: 검증 방법)

---

## Task 1: 프로젝트 스캐폴딩 + Tracker 핵심 로직

**Files:**
- Create: `package.json`
- Create: `js/trackerLogic.js`
- Test: `tests/trackerLogic.test.js`
- Create: `js/config.js`
- Create: `js/tracker.js`

**Interfaces:**
- Produces: `TrackerLogic.toGridCell(x, y, pageWidth, pageHeight) -> number` (0~399, 20×20 그리드 셀 인덱스, row*20+col)
- Produces: `TrackerLogic.computeClickDelta(prevTimestamp, currentTimestamp) -> number|null` (prevTimestamp가 숫자가 아니면 null)
- Produces: `TrackerLogic.accumulateDwell(dwellMap, section, ms) -> object` (입력을 변경하지 않는 새 객체 반환)
- Produces: `window.Tracker.init(pageName)`, `window.Tracker.logImageClick(projectId)`, `window.Tracker.logFormStep(step, action, durationMs)` — 이후 Task 2/3에서 소비
- Produces: `window.TRACKER_CONFIG.APPS_SCRIPT_URL` (Task 4 배포 후 실제 URL로 교체할 설정값)

- [ ] **Step 1: package.json 생성**

```json
{
  "name": "class-portfolio-2607",
  "private": true,
  "version": "1.0.0",
  "scripts": {
    "test": "node --test tests/"
  }
}
```

- [ ] **Step 2: trackerLogic 실패 테스트 작성**

`tests/trackerLogic.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const TrackerLogic = require('../js/trackerLogic.js');

test('toGridCell maps top-left to cell 0', () => {
  assert.equal(TrackerLogic.toGridCell(0, 0, 2000, 2000), 0);
});

test('toGridCell maps bottom-right to last cell', () => {
  assert.equal(TrackerLogic.toGridCell(1999, 1999, 2000, 2000), 20 * 20 - 1);
});

test('toGridCell clamps coordinates beyond page bounds', () => {
  assert.equal(TrackerLogic.toGridCell(5000, 5000, 2000, 2000), 20 * 20 - 1);
});

test('computeClickDelta returns null for first click', () => {
  assert.equal(TrackerLogic.computeClickDelta(undefined, 1000), null);
});

test('computeClickDelta returns ms difference for subsequent click', () => {
  assert.equal(TrackerLogic.computeClickDelta(1000, 2500), 1500);
});

test('accumulateDwell adds ms to existing section without mutating input', () => {
  const input = { hero: 100 };
  const result = TrackerLogic.accumulateDwell(input, 'hero', 50);
  assert.equal(result.hero, 150);
  assert.equal(input.hero, 100);
});

test('accumulateDwell creates new section entry', () => {
  const result = TrackerLogic.accumulateDwell({}, 'gallery', 200);
  assert.equal(result.gallery, 200);
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npm test`
Expected: FAIL — `Cannot find module '../js/trackerLogic.js'`

- [ ] **Step 4: trackerLogic.js 구현**

`js/trackerLogic.js`:

```js
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.TrackerLogic = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  var GRID_COLS = 20;
  var GRID_ROWS = 20;

  function toGridCell(x, y, pageWidth, pageHeight) {
    var safeWidth = pageWidth > 0 ? pageWidth : 1;
    var safeHeight = pageHeight > 0 ? pageHeight : 1;
    var col = Math.min(GRID_COLS - 1, Math.max(0, Math.floor((x / safeWidth) * GRID_COLS)));
    var row = Math.min(GRID_ROWS - 1, Math.max(0, Math.floor((y / safeHeight) * GRID_ROWS)));
    return row * GRID_COLS + col;
  }

  function computeClickDelta(prevTimestamp, currentTimestamp) {
    if (typeof prevTimestamp !== 'number') return null;
    return currentTimestamp - prevTimestamp;
  }

  function accumulateDwell(dwellMap, section, ms) {
    var next = {};
    Object.keys(dwellMap).forEach(function (key) {
      next[key] = dwellMap[key];
    });
    next[section] = (next[section] || 0) + ms;
    return next;
  }

  return {
    GRID_COLS: GRID_COLS,
    GRID_ROWS: GRID_ROWS,
    toGridCell: toGridCell,
    computeClickDelta: computeClickDelta,
    accumulateDwell: accumulateDwell
  };
});
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npm test`
Expected: PASS (7 tests)

- [ ] **Step 6: config.js 생성**

`js/config.js`:

```js
window.TRACKER_CONFIG = {
  APPS_SCRIPT_URL: 'REPLACE_WITH_DEPLOYED_WEB_APP_URL'
};
```

- [ ] **Step 7: tracker.js DOM 연동 구현**

`js/tracker.js`:

```js
(function () {
  var BATCH_INTERVAL_MS = 10000;
  var buffer = [];
  var lastClickTimestamp = null;
  var dwellMap = {};
  var mouseGrid = {};
  var sessionId = getOrCreateSessionId();
  var currentPage = null;

  function getOrCreateSessionId() {
    var existing = sessionStorage.getItem('ux_session_id');
    if (existing) return existing;
    var id = 'sess-' + Date.now() + '-' + Math.random().toString(16).slice(2);
    sessionStorage.setItem('ux_session_id', id);
    return id;
  }

  function pushEvent(eventType, data) {
    buffer.push({
      timestamp: Date.now(),
      sessionId: sessionId,
      page: currentPage,
      eventType: eventType,
      data: data || {},
      userAgent: navigator.userAgent,
      screenW: window.innerWidth,
      screenH: window.innerHeight
    });
  }

  function flush(useBeacon) {
    if (buffer.length === 0) return;
    var payload = buffer;
    buffer = [];
    var url = window.TRACKER_CONFIG && window.TRACKER_CONFIG.APPS_SCRIPT_URL;
    if (!url) return;
    try {
      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([JSON.stringify(payload)], { type: 'text/plain;charset=utf-8' }));
      } else {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload)
        }).catch(function () {});
      }
    } catch (err) {
      // Swallow logging failures; never break the page for the visitor.
    }
  }

  function setupScrollDwell() {
    var sections = document.querySelectorAll('[data-section]');
    var visible = {};
    var lastTick = Date.now();

    function tick() {
      var now = Date.now();
      var elapsed = now - lastTick;
      lastTick = now;
      Object.keys(visible).forEach(function (section) {
        if (visible[section]) {
          dwellMap = TrackerLogic.accumulateDwell(dwellMap, section, elapsed);
        }
      });
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var section = entry.target.getAttribute('data-section');
        visible[section] = entry.isIntersecting;
      });
    }, { threshold: 0.3 });

    sections.forEach(function (section) {
      observer.observe(section);
    });

    setInterval(tick, 1000);
  }

  function setupMouseTracking() {
    var lastMove = 0;
    document.addEventListener('mousemove', function (e) {
      var now = Date.now();
      if (now - lastMove < 200) return;
      lastMove = now;
      var cellId = TrackerLogic.toGridCell(e.pageX, e.pageY, document.documentElement.scrollWidth, document.documentElement.scrollHeight);
      mouseGrid[cellId] = (mouseGrid[cellId] || 0) + 1;
    });
  }

  function logImageClick(projectId) {
    var now = Date.now();
    var deltaMs = TrackerLogic.computeClickDelta(lastClickTimestamp, now);
    lastClickTimestamp = now;
    pushEvent('image_click', { projectId: projectId, deltaMs: deltaMs });
  }

  function logFormStep(step, action, durationMs) {
    pushEvent('form_step', { step: step, action: action, durationMs: durationMs });
  }

  function flushDwellAndMouse() {
    Object.keys(dwellMap).forEach(function (section) {
      pushEvent('scroll_dwell', { section: section, ms: dwellMap[section] });
    });
    dwellMap = {};
    if (Object.keys(mouseGrid).length > 0) {
      pushEvent('mouse_grid', { grid: mouseGrid });
      mouseGrid = {};
    }
  }

  function init(pageName) {
    currentPage = pageName;
    pushEvent('page_view', {});
    setupScrollDwell();
    setupMouseTracking();
    setInterval(function () {
      flushDwellAndMouse();
      flush(false);
    }, BATCH_INTERVAL_MS);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') {
        flushDwellAndMouse();
        flush(true);
      }
    });
  }

  window.Tracker = {
    init: init,
    logImageClick: logImageClick,
    logFormStep: logFormStep
  };
})();
```

- [ ] **Step 8: 커밋**

```bash
git add package.json js/trackerLogic.js js/config.js js/tracker.js tests/trackerLogic.test.js
git commit -m "feat: add tracker core logic and DOM wiring"
```

---

## Task 2: Page 1 — 소개 + 필터링 갤러리

**Files:**
- Create: `data/projects.js`
- Create: `js/galleryLogic.js`
- Test: `tests/galleryLogic.test.js`
- Create: `js/gallery.js`
- Create: `index.html`
- Create: `css/style.css`

**Interfaces:**
- Consumes: `window.Tracker.init(pageName)`, `window.Tracker.logImageClick(projectId)` (Task 1)
- Produces: `GalleryLogic.filterProjects(projects, category) -> array` (Task 6 통합 검증에서 재사용 가능)
- Produces: `window.PROJECTS` (더미 프로젝트 배열)

- [ ] **Step 1: galleryLogic 실패 테스트 작성**

`tests/galleryLogic.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const GalleryLogic = require('../js/galleryLogic.js');

const PROJECTS = [
  { id: 'p1', category: 'web' },
  { id: 'p2', category: 'ai' },
  { id: 'p3', category: 'web' }
];

test('filterProjects returns all projects for "all"', () => {
  const result = GalleryLogic.filterProjects(PROJECTS, 'all');
  assert.equal(result.length, 3);
});

test('filterProjects returns only matching category', () => {
  const result = GalleryLogic.filterProjects(PROJECTS, 'web');
  assert.deepEqual(result.map((p) => p.id), ['p1', 'p3']);
});

test('filterProjects returns empty array for no matches', () => {
  const result = GalleryLogic.filterProjects(PROJECTS, 'design');
  assert.deepEqual(result, []);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test`
Expected: FAIL — `Cannot find module '../js/galleryLogic.js'`

- [ ] **Step 3: galleryLogic.js 구현**

`js/galleryLogic.js`:

```js
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.GalleryLogic = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  function filterProjects(projects, category) {
    if (category === 'all') return projects.slice();
    return projects.filter(function (project) {
      return project.category === category;
    });
  }

  return { filterProjects: filterProjects };
});
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS (10 tests — Task 1의 7개 + 이번 3개)

- [ ] **Step 5: 더미 프로젝트 데이터 생성**

`data/projects.js`:

```js
window.PROJECTS = [
  { id: 'p1', title: 'AI 추천 엔진', category: 'ai', description: '사용자 행동 기반 추천 시스템 프로토타입' },
  { id: 'p2', title: '반응형 커머스 사이트', category: 'web', description: 'Next.js 기반 반응형 쇼핑몰' },
  { id: 'p3', title: '헬스케어 모바일 앱', category: 'mobile', description: 'React Native 건강관리 앱' },
  { id: 'p4', title: '브랜드 아이덴티티 디자인', category: 'design', description: '스타트업 브랜드 가이드 제작' },
  { id: 'p5', title: '실시간 챗봇 대시보드', category: 'ai', description: 'LLM 기반 상담 챗봇 관리자 화면' },
  { id: 'p6', title: '포트폴리오 랜딩페이지', category: 'web', description: '개인 포트폴리오 정적 사이트' },
  { id: 'p7', title: '배달 주문 앱', category: 'mobile', description: 'Flutter 기반 주문/배달 앱' },
  { id: 'p8', title: 'UX 리서치 리포트', category: 'design', description: '사용자 인터뷰 기반 UX 개선 제안서' },
  { id: 'p9', title: '이미지 분류 모델 데모', category: 'ai', description: 'CNN 기반 이미지 분류 웹 데모' },
  { id: 'p10', title: '사내 관리자 웹툴', category: 'web', description: '사내 데이터 관리용 대시보드' }
];
```

- [ ] **Step 6: gallery.js DOM 연동 구현**

`js/gallery.js`:

```js
(function () {
  function renderProjects(projects) {
    var grid = document.getElementById('gallery-grid');
    grid.innerHTML = '';
    projects.forEach(function (project) {
      var card = document.createElement('div');
      card.className = 'project-card';
      card.setAttribute('data-project-id', project.id);
      card.innerHTML =
        '<div class="project-thumb project-thumb--' + project.category + '"></div>' +
        '<h3>' + project.title + '</h3>' +
        '<p>' + project.description + '</p>';
      card.addEventListener('click', function () {
        if (window.Tracker) window.Tracker.logImageClick(project.id);
      });
      grid.appendChild(card);
    });
  }

  function setupFilters() {
    var buttons = document.querySelectorAll('[data-filter]');
    buttons.forEach(function (button) {
      button.addEventListener('click', function () {
        buttons.forEach(function (b) { b.classList.remove('active'); });
        button.classList.add('active');
        var category = button.getAttribute('data-filter');
        renderProjects(GalleryLogic.filterProjects(window.PROJECTS, category));
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    setupFilters();
    renderProjects(window.PROJECTS);
    if (window.Tracker) window.Tracker.init('home');
  });
})();
```

- [ ] **Step 7: index.html 작성**

`index.html`:

```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>포트폴리오</title>
  <link rel="stylesheet" href="css/style.css" />
</head>
<body>
  <header data-section="hero" class="hero">
    <h1>안녕하세요, 프론트엔드/AI 개발자입니다</h1>
    <p>웹, 모바일, AI, 디자인 프로젝트를 만듭니다.</p>
    <nav>
      <a href="index.html">소개</a>
      <a href="contact.html">문의하기</a>
    </nav>
  </header>

  <main data-section="gallery" class="gallery">
    <div class="filters">
      <button data-filter="all" class="active">전체</button>
      <button data-filter="web">웹</button>
      <button data-filter="mobile">모바일</button>
      <button data-filter="ai">AI</button>
      <button data-filter="design">디자인</button>
    </div>
    <div id="gallery-grid" class="gallery-grid"></div>
  </main>

  <footer data-section="footer" class="footer">
    <p>&copy; 2026 Portfolio</p>
  </footer>

  <script src="js/config.js"></script>
  <script src="js/trackerLogic.js"></script>
  <script src="js/tracker.js"></script>
  <script src="data/projects.js"></script>
  <script src="js/galleryLogic.js"></script>
  <script src="js/gallery.js"></script>
</body>
</html>
```

- [ ] **Step 8: css/style.css 작성 (기본 스타일)**

`css/style.css`:

```css
* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, "Segoe UI", sans-serif; color: #1f2937; }

.hero { padding: 4rem 2rem; background: #111827; color: white; text-align: center; }
.hero nav a { color: #93c5fd; margin: 0 0.5rem; text-decoration: none; }

.gallery { padding: 2rem; max-width: 1100px; margin: 0 auto; }
.filters { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
.filters button {
  padding: 0.5rem 1rem; border: 1px solid #d1d5db; border-radius: 999px;
  background: white; cursor: pointer;
}
.filters button.active { background: #2563eb; color: white; border-color: #2563eb; }

.gallery-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1.25rem; }
.project-card { border: 1px solid #e5e7eb; border-radius: 0.75rem; padding: 1rem; cursor: pointer; }
.project-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
.project-thumb { height: 140px; border-radius: 0.5rem; margin-bottom: 0.75rem; }
.project-thumb--web { background: linear-gradient(135deg, #60a5fa, #2563eb); }
.project-thumb--mobile { background: linear-gradient(135deg, #34d399, #059669); }
.project-thumb--ai { background: linear-gradient(135deg, #f472b6, #db2777); }
.project-thumb--design { background: linear-gradient(135deg, #fbbf24, #d97706); }

.footer { text-align: center; padding: 2rem; color: #6b7280; }

.form-container { max-width: 500px; margin: 3rem auto; padding: 0 1rem; }
.progress { display: flex; gap: 0.5rem; margin-bottom: 2rem; }
.progress-step { flex: 1; height: 6px; background: #e5e7eb; border-radius: 999px; }
.progress-step.active { background: #2563eb; }
.form-step label { display: block; margin: 0.75rem 0 0.25rem; font-weight: 600; }
.form-step input, .form-step select, .form-step textarea {
  width: 100%; padding: 0.6rem; border: 1px solid #d1d5db; border-radius: 0.4rem;
}
.form-actions { margin-top: 1.5rem; display: flex; gap: 0.75rem; justify-content: flex-end; }
.form-actions button { padding: 0.6rem 1.2rem; border-radius: 0.4rem; border: none; cursor: pointer; }
.form-actions .primary { background: #2563eb; color: white; }
.form-actions .secondary { background: #e5e7eb; }

.dashboard { max-width: 1100px; margin: 0 auto; padding: 2rem; }
.chart-card { border: 1px solid #e5e7eb; border-radius: 0.75rem; padding: 1.25rem; margin-bottom: 1.5rem; }
.error-banner {
  display: none; background: #fee2e2; color: #991b1b; padding: 0.75rem 1rem;
  border-radius: 0.5rem; margin-bottom: 1rem;
}
```

- [ ] **Step 9: 수동 검증**

Run: `npx serve .` (또는 `python -m http.server 8000`)
- 브라우저로 `http://localhost:3000/index.html` (또는 8000) 접속
- 필터 버튼(웹/모바일/AI/디자인/전체) 클릭 시 카드가 바뀌는지 확인
- 프로젝트 카드를 2~3회 클릭 후 개발자도구 콘솔에 에러가 없는지 확인 (Task 4 전까지는 `APPS_SCRIPT_URL`이 placeholder라 전송은 실패하지만 콘솔 에러 없이 조용히 무시되어야 함)

- [ ] **Step 10: 커밋**

```bash
git add data/projects.js js/galleryLogic.js js/gallery.js tests/galleryLogic.test.js index.html css/style.css
git commit -m "feat: add page1 intro and filterable gallery"
```

---

## Task 3: Page 2 — 멀티스텝 연락처 폼

**Files:**
- Create: `js/formLogic.js`
- Test: `tests/formLogic.test.js`
- Create: `js/form.js`
- Create: `contact.html`

**Interfaces:**
- Consumes: `window.Tracker.init(pageName)`, `window.Tracker.logFormStep(step, action, durationMs)` (Task 1)
- Produces: `FormLogic.clampStep`, `FormLogic.isStepValid`, `FormLogic.computeStepDuration` (이번 태스크 내부에서만 소비, 외부 태스크 의존 없음)

- [ ] **Step 1: formLogic 실패 테스트 작성**

`tests/formLogic.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const FormLogic = require('../js/formLogic.js');

test('clampStep clamps below minimum', () => {
  assert.equal(FormLogic.clampStep(0, 3), 1);
});

test('clampStep clamps above maximum', () => {
  assert.equal(FormLogic.clampStep(5, 3), 3);
});

test('isStepValid rejects step 1 without valid email', () => {
  assert.equal(FormLogic.isStepValid(1, { name: 'Kim', email: 'not-an-email' }), false);
});

test('isStepValid accepts step 1 with valid data', () => {
  assert.equal(FormLogic.isStepValid(1, { name: 'Kim', email: 'kim@example.com' }), true);
});

test('isStepValid rejects step 2 without description', () => {
  assert.equal(FormLogic.isStepValid(2, { projectType: 'web', description: '' }), false);
});

test('isStepValid accepts step 3 always', () => {
  assert.equal(FormLogic.isStepValid(3, {}), true);
});

test('computeStepDuration returns positive duration', () => {
  assert.equal(FormLogic.computeStepDuration(1000, 4000), 3000);
});

test('computeStepDuration floors negative duration to zero', () => {
  assert.equal(FormLogic.computeStepDuration(5000, 4000), 0);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test`
Expected: FAIL — `Cannot find module '../js/formLogic.js'`

- [ ] **Step 3: formLogic.js 구현**

`js/formLogic.js`:

```js
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.FormLogic = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function clampStep(step, maxStep) {
    return Math.min(maxStep, Math.max(1, step));
  }

  function isStepValid(step, formData) {
    if (step === 1) {
      return Boolean(formData.name && formData.name.trim() && EMAIL_RE.test(formData.email || ''));
    }
    if (step === 2) {
      return Boolean(formData.projectType && formData.description && formData.description.trim());
    }
    return true;
  }

  function computeStepDuration(enterTimestamp, exitTimestamp) {
    var duration = exitTimestamp - enterTimestamp;
    return duration > 0 ? duration : 0;
  }

  return { clampStep: clampStep, isStepValid: isStepValid, computeStepDuration: computeStepDuration };
});
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS (18 tests — 누적)

- [ ] **Step 5: form.js DOM 연동 구현**

`js/form.js`:

```js
(function () {
  var MAX_STEP = 3;
  var currentStep = 1;
  var stepEnterTs = Date.now();
  var formData = { name: '', email: '', projectType: '', description: '' };
  var completed = false;

  function showStep(step) {
    document.querySelectorAll('.form-step').forEach(function (el) {
      el.style.display = el.getAttribute('data-step') === String(step) ? 'block' : 'none';
    });
    document.querySelectorAll('.progress-step').forEach(function (el) {
      var stepNum = Number(el.getAttribute('data-step'));
      el.classList.toggle('active', stepNum <= step);
    });
  }

  function readFormData() {
    formData.name = document.getElementById('field-name').value;
    formData.email = document.getElementById('field-email').value;
    formData.projectType = document.getElementById('field-project-type').value;
    formData.description = document.getElementById('field-description').value;
  }

  function goToStep(nextStep) {
    var now = Date.now();
    var duration = FormLogic.computeStepDuration(stepEnterTs, now);
    if (window.Tracker) window.Tracker.logFormStep(currentStep, 'complete', duration);
    currentStep = FormLogic.clampStep(nextStep, MAX_STEP);
    stepEnterTs = Date.now();
    if (window.Tracker) window.Tracker.logFormStep(currentStep, 'enter', 0);
    showStep(currentStep);
  }

  function setupNavigation() {
    document.getElementById('btn-next-1').addEventListener('click', function () {
      readFormData();
      if (!FormLogic.isStepValid(1, formData)) {
        alert('이름과 올바른 이메일을 입력해주세요.');
        return;
      }
      goToStep(2);
    });
    document.getElementById('btn-next-2').addEventListener('click', function () {
      readFormData();
      if (!FormLogic.isStepValid(2, formData)) {
        alert('문의 유형과 설명을 입력해주세요.');
        return;
      }
      goToStep(3);
      completed = true;
    });
    document.getElementById('btn-prev-2').addEventListener('click', function () {
      goToStep(1);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (window.Tracker) {
      window.Tracker.init('contact');
      window.Tracker.logFormStep(1, 'enter', 0);
    }
    setupNavigation();
    showStep(1);
  });

  window.addEventListener('pagehide', function () {
    if (!completed && window.Tracker) {
      var duration = FormLogic.computeStepDuration(stepEnterTs, Date.now());
      window.Tracker.logFormStep(currentStep, 'abandon', duration);
    }
  });
})();
```

- [ ] **Step 6: contact.html 작성**

`contact.html`:

```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>문의하기</title>
  <link rel="stylesheet" href="css/style.css" />
</head>
<body>
  <header class="hero" data-section="contact-hero">
    <h1>프로젝트 문의하기</h1>
    <nav>
      <a href="index.html">소개</a>
      <a href="contact.html">문의하기</a>
    </nav>
  </header>

  <main class="form-container" data-section="contact-form">
    <div class="progress">
      <div class="progress-step" data-step="1"></div>
      <div class="progress-step" data-step="2"></div>
      <div class="progress-step" data-step="3"></div>
    </div>

    <section class="form-step" data-step="1">
      <h2>1단계: 기본정보</h2>
      <label for="field-name">이름</label>
      <input id="field-name" type="text" />
      <label for="field-email">이메일</label>
      <input id="field-email" type="email" />
      <div class="form-actions">
        <button id="btn-next-1" class="primary">다음</button>
      </div>
    </section>

    <section class="form-step" data-step="2">
      <h2>2단계: 프로젝트 문의</h2>
      <label for="field-project-type">문의 유형</label>
      <select id="field-project-type">
        <option value="web">웹</option>
        <option value="mobile">모바일</option>
        <option value="ai">AI</option>
        <option value="design">디자인</option>
      </select>
      <label for="field-description">프로젝트 설명</label>
      <textarea id="field-description" rows="4"></textarea>
      <div class="form-actions">
        <button id="btn-prev-2" class="secondary">이전</button>
        <button id="btn-next-2" class="primary">제출</button>
      </div>
    </section>

    <section class="form-step" data-step="3">
      <h2>완료되었습니다</h2>
      <p>문의해주셔서 감사합니다. 빠르게 연락드리겠습니다.</p>
    </section>
  </main>

  <script src="js/config.js"></script>
  <script src="js/trackerLogic.js"></script>
  <script src="js/tracker.js"></script>
  <script src="js/formLogic.js"></script>
  <script src="js/form.js"></script>
</body>
</html>
```

- [ ] **Step 7: 수동 검증**

Run: `npx serve .`
- `contact.html` 접속 후 1→2→3단계까지 정상 입력으로 완료, 콘솔 에러 없는지 확인
- 별도 탭에서 다시 접속해 1단계만 채우고 탭을 닫아 `abandon` 경로가 에러 없이 실행되는지(콘솔 확인) 점검
- 2단계에서 필수값 비우고 제출 시 alert가 뜨고 3단계로 넘어가지 않는지 확인

- [ ] **Step 8: 커밋**

```bash
git add js/formLogic.js js/form.js contact.html tests/formLogic.test.js
git commit -m "feat: add page2 multi-step contact form"
```

---

## Task 4: Google Apps Script — 이벤트 수집 + 집계 API

**Files:**
- Create: `apps-script/loadGas.js`
- Create: `apps-script/Aggregate.gs`
- Test: `tests/aggregate.test.js`
- Create: `apps-script/Code.gs`
- Create: `apps-script/README.md`

**Interfaces:**
- Consumes: 클라이언트가 전송하는 이벤트 batch shape — `{timestamp, sessionId, page, eventType, data, userAgent, screenW, screenH}` (Task 1 `tracker.js`의 `pushEvent`와 동일 필드)
- Produces: `Aggregate.parseEventRows(rows)`, `Aggregate.computeScrollSummary(events)`, `Aggregate.computeImageClickSummary(events)`, `Aggregate.computeFormFunnel(events)`, `Aggregate.computeMouseHeatmap(events)`, `Aggregate.computeDeviceBreakdown(events)` — Code.gs의 `doGet`이 소비
- Produces: 배포된 웹앱의 `doGet` 응답 shape `{scroll, imageClicks, formFunnel, mouseHeatmap, devices}` — Task 5 대시보드가 소비

- [ ] **Step 1: Node에서 .gs 파일을 로드하는 헬퍼 작성**

`apps-script/loadGas.js`:

```js
const fs = require('fs');
const path = require('path');

function loadGasModule(relativePath) {
  const code = fs.readFileSync(path.join(__dirname, relativePath), 'utf8');
  const module = { exports: {} };
  const runInSandbox = new Function('module', 'exports', code);
  runInSandbox(module, module.exports);
  return module.exports;
}

module.exports = { loadGasModule };
```

- [ ] **Step 2: Aggregate 실패 테스트 작성**

`tests/aggregate.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGasModule } = require('../apps-script/loadGas.js');
const Aggregate = loadGasModule('Aggregate.gs');

test('parseEventRows parses dataJson into an object', () => {
  const rows = [[1000, 'sess1', 'home', 'scroll_dwell', '{"section":"hero","ms":500}', 'UA', 1920, 1080]];
  const events = Aggregate.parseEventRows(rows);
  assert.equal(events[0].data.section, 'hero');
  assert.equal(events[0].data.ms, 500);
});

test('parseEventRows falls back to empty object on invalid JSON', () => {
  const rows = [[1000, 'sess1', 'home', 'scroll_dwell', 'not-json', 'UA', 1920, 1080]];
  const events = Aggregate.parseEventRows(rows);
  assert.deepEqual(events[0].data, {});
});

test('computeScrollSummary sums dwell ms per section', () => {
  const events = [
    { eventType: 'scroll_dwell', data: { section: 'hero', ms: 100 } },
    { eventType: 'scroll_dwell', data: { section: 'hero', ms: 200 } },
    { eventType: 'scroll_dwell', data: { section: 'gallery', ms: 50 } },
    { eventType: 'page_view', data: {} }
  ];
  assert.deepEqual(Aggregate.computeScrollSummary(events), { hero: 300, gallery: 50 });
});

test('computeImageClickSummary counts clicks per project and averages delta', () => {
  const events = [
    { eventType: 'image_click', data: { projectId: 'p1', deltaMs: null } },
    { eventType: 'image_click', data: { projectId: 'p1', deltaMs: 400 } },
    { eventType: 'image_click', data: { projectId: 'p2', deltaMs: 800 } }
  ];
  const result = Aggregate.computeImageClickSummary(events);
  assert.deepEqual(result.byProject, { p1: 2, p2: 1 });
  assert.equal(result.avgDeltaMs, 600);
});

test('computeFormFunnel computes dropoff rate and average duration', () => {
  const events = [
    { eventType: 'form_step', data: { step: 1, action: 'enter', durationMs: 0 } },
    { eventType: 'form_step', data: { step: 1, action: 'complete', durationMs: 3000 } },
    { eventType: 'form_step', data: { step: 2, action: 'enter', durationMs: 0 } },
    { eventType: 'form_step', data: { step: 2, action: 'abandon', durationMs: 1500 } }
  ];
  const result = Aggregate.computeFormFunnel(events);
  assert.equal(result[1].entered, 1);
  assert.equal(result[1].completed, 1);
  assert.equal(result[1].dropoffRate, 0);
  assert.equal(result[2].entered, 1);
  assert.equal(result[2].completed, 0);
  assert.equal(result[2].dropoffRate, 1);
});

test('computeMouseHeatmap sums grid counts across events into full cell list', () => {
  const events = [
    { eventType: 'mouse_grid', data: { grid: { 0: 3, 5: 2 } } },
    { eventType: 'mouse_grid', data: { grid: { 0: 1 } } }
  ];
  const result = Aggregate.computeMouseHeatmap(events);
  assert.equal(result.cells.length, 400);
  assert.equal(result.cells[0].v, 4);
  assert.equal(result.cells[5].v, 2);
  assert.equal(result.cells[1].v, 0);
});

test('computeDeviceBreakdown classifies device type and browser from user agent', () => {
  const events = [
    { eventType: 'page_view', userAgent: 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36' },
    { eventType: 'page_view', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }
  ];
  const result = Aggregate.computeDeviceBreakdown(events);
  assert.equal(result.deviceTypes.desktop, 1);
  assert.equal(result.deviceTypes.mobile, 1);
  assert.equal(result.browsers.Chrome, 1);
  assert.equal(result.browsers.Safari, 1);
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npm test`
Expected: FAIL — `ENOENT` (Aggregate.gs 없음)

- [ ] **Step 4: Aggregate.gs 구현**

`apps-script/Aggregate.gs`:

```js
function parseEventRows(rows) {
  return rows.map(function (row) {
    var data = {};
    try {
      data = JSON.parse(row[4] || '{}');
    } catch (err) {
      data = {};
    }
    return {
      timestamp: row[0],
      sessionId: row[1],
      page: row[2],
      eventType: row[3],
      data: data,
      userAgent: row[5],
      screenW: row[6],
      screenH: row[7]
    };
  });
}

function computeScrollSummary(events) {
  var totals = {};
  events.forEach(function (event) {
    if (event.eventType !== 'scroll_dwell') return;
    var section = event.data.section || 'unknown';
    var ms = event.data.ms || 0;
    totals[section] = (totals[section] || 0) + ms;
  });
  return totals;
}

function computeImageClickSummary(events) {
  var byProject = {};
  var deltaSum = 0;
  var deltaCount = 0;
  events.forEach(function (event) {
    if (event.eventType !== 'image_click') return;
    var projectId = event.data.projectId || 'unknown';
    byProject[projectId] = (byProject[projectId] || 0) + 1;
    if (typeof event.data.deltaMs === 'number') {
      deltaSum += event.data.deltaMs;
      deltaCount += 1;
    }
  });
  return {
    byProject: byProject,
    avgDeltaMs: deltaCount > 0 ? deltaSum / deltaCount : 0
  };
}

function computeFormFunnel(events) {
  var steps = {
    1: { entered: 0, completed: 0, abandoned: 0, durationSum: 0, durationCount: 0 },
    2: { entered: 0, completed: 0, abandoned: 0, durationSum: 0, durationCount: 0 },
    3: { entered: 0, completed: 0, abandoned: 0, durationSum: 0, durationCount: 0 }
  };
  events.forEach(function (event) {
    if (event.eventType !== 'form_step') return;
    var step = steps[event.data.step];
    if (!step) return;
    if (event.data.action === 'enter') step.entered += 1;
    if (event.data.action === 'complete') step.completed += 1;
    if (event.data.action === 'abandon') step.abandoned += 1;
    if (typeof event.data.durationMs === 'number') {
      step.durationSum += event.data.durationMs;
      step.durationCount += 1;
    }
  });
  var result = {};
  Object.keys(steps).forEach(function (key) {
    var s = steps[key];
    result[key] = {
      entered: s.entered,
      completed: s.completed,
      abandoned: s.abandoned,
      dropoffRate: s.entered > 0 ? (s.entered - s.completed) / s.entered : 0,
      avgDurationMs: s.durationCount > 0 ? s.durationSum / s.durationCount : 0
    };
  });
  return result;
}

function computeMouseHeatmap(events) {
  var cols = 20;
  var rows = 20;
  var totals = {};
  events.forEach(function (event) {
    if (event.eventType !== 'mouse_grid') return;
    var grid = event.data.grid || {};
    Object.keys(grid).forEach(function (cellId) {
      totals[cellId] = (totals[cellId] || 0) + grid[cellId];
    });
  });
  var cells = [];
  for (var row = 0; row < rows; row++) {
    for (var col = 0; col < cols; col++) {
      var cellId = row * cols + col;
      cells.push({ x: col, y: row, v: totals[cellId] || 0 });
    }
  }
  return { cols: cols, rows: rows, cells: cells };
}

function computeDeviceBreakdown(events) {
  var deviceTypes = { mobile: 0, desktop: 0 };
  var browsers = { Chrome: 0, Firefox: 0, Safari: 0, Edge: 0, Other: 0 };
  events.forEach(function (event) {
    if (event.eventType !== 'page_view') return;
    var ua = event.userAgent || '';
    if (/Mobi|Android/i.test(ua)) {
      deviceTypes.mobile += 1;
    } else {
      deviceTypes.desktop += 1;
    }
    if (/Edg\//.test(ua)) {
      browsers.Edge += 1;
    } else if (/Chrome\//.test(ua)) {
      browsers.Chrome += 1;
    } else if (/Firefox\//.test(ua)) {
      browsers.Firefox += 1;
    } else if (/Safari\//.test(ua)) {
      browsers.Safari += 1;
    } else {
      browsers.Other += 1;
    }
  });
  return { deviceTypes: deviceTypes, browsers: browsers };
}

if (typeof module !== 'undefined') {
  module.exports = {
    parseEventRows: parseEventRows,
    computeScrollSummary: computeScrollSummary,
    computeImageClickSummary: computeImageClickSummary,
    computeFormFunnel: computeFormFunnel,
    computeMouseHeatmap: computeMouseHeatmap,
    computeDeviceBreakdown: computeDeviceBreakdown
  };
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npm test`
Expected: PASS (25 tests — 누적)

- [ ] **Step 6: Code.gs 구현**

`apps-script/Code.gs`:

```js
var SHEET_NAME = 'Events';

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var events = Array.isArray(payload) ? payload : [payload];
    var sheet = getEventsSheet_();
    events.forEach(function (event) {
      sheet.appendRow([
        event.timestamp,
        event.sessionId,
        event.page,
        event.eventType,
        JSON.stringify(event.data || {}),
        event.userAgent || '',
        event.screenW || '',
        event.screenH || ''
      ]);
    });
    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    var token = e.parameter.token;
    var expectedToken = PropertiesService.getScriptProperties().getProperty('DASHBOARD_TOKEN');
    if (!expectedToken || token !== expectedToken) {
      return ContentService.createTextOutput(JSON.stringify({ error: 'unauthorized' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    var sheet = getEventsSheet_();
    var rows = sheet.getDataRange().getValues();
    rows.shift();
    var events = parseEventRows(rows);
    var summary = {
      scroll: computeScrollSummary(events),
      imageClicks: computeImageClickSummary(events),
      formFunnel: computeFormFunnel(events),
      mouseHeatmap: computeMouseHeatmap(events),
      devices: computeDeviceBreakdown(events)
    };
    return ContentService.createTextOutput(JSON.stringify(summary))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getEventsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['timestamp', 'sessionId', 'page', 'eventType', 'dataJson', 'userAgent', 'screenW', 'screenH']);
  }
  return sheet;
}
```

- [ ] **Step 7: 배포 가이드 작성**

`apps-script/README.md`:

```markdown
# Apps Script 배포 가이드

1. https://sheets.google.com 에서 새 스프레드시트를 만든다 (이름 예: `portfolio-ux-events`).
2. 확장 프로그램 → Apps Script 를 연다.
3. 기본 생성된 `Code.gs` 파일 내용을 이 저장소의 `apps-script/Code.gs` 내용으로 교체한다.
4. 파일 추가(+) → 스크립트 파일로 `Aggregate.gs` 를 새로 만들고 이 저장소의 `apps-script/Aggregate.gs` 내용을 붙여넣는다.
   (`apps-script/loadGas.js` 는 Node 테스트 전용이므로 Apps Script에는 올리지 않는다.)
5. 프로젝트 설정(톱니바퀴) → 스크립트 속성 에서 `DASHBOARD_TOKEN` 속성을 추가하고 원하는 비밀 토큰 값을 입력한다.
6. 배포 → 새 배포 → 유형: 웹 앱
   - 실행 사용자: 나
   - 액세스 권한: 모든 사용자
7. 배포 후 발급되는 웹 앱 URL을 복사한다.
8. 이 저장소의 `js/config.js` 의 `APPS_SCRIPT_URL` 값을 위 URL로 교체한다.
9. 동작 확인:

   \`\`\`bash
   curl -X POST "<웹앱 URL>" -H "Content-Type: text/plain" \
     -d '[{"timestamp":1700000000000,"sessionId":"test","page":"home","eventType":"page_view","data":{},"userAgent":"curl","screenW":1920,"screenH":1080}]'

   curl "<웹앱 URL>?action=summary&token=<DASHBOARD_TOKEN 값>"
   \`\`\`

   첫 번째 명령 이후 스프레드시트의 `Events` 시트에 행이 추가되어야 하고, 두 번째 명령은 집계 JSON을 반환해야 한다.
```

- [ ] **Step 8: 수동 검증**

- `apps-script/README.md` 절차대로 실제 Google 계정에 배포
- Step 9의 두 `curl` 명령 실행, 시트에 행 생성 및 JSON 응답 확인
- 틀린 토큰으로 `doGet` 호출 시 `{"error":"unauthorized"}` 반환 확인

- [ ] **Step 9: 커밋**

```bash
git add apps-script/loadGas.js apps-script/Aggregate.gs apps-script/Code.gs apps-script/README.md tests/aggregate.test.js
git commit -m "feat: add Apps Script event ingestion and summary API"
```

---

## Task 5: 분석 대시보드 (Chart.js)

**Files:**
- Create: `js/dashboardLogic.js`
- Test: `tests/dashboardLogic.test.js`
- Create: `js/dashboard.js`
- Create: `dashboard.html`

**Interfaces:**
- Consumes: Apps Script `doGet` 응답 shape `{scroll, imageClicks, formFunnel, mouseHeatmap, devices}` (Task 4)
- Produces: `DashboardLogic.buildScrollChartData`, `buildImageClickChartData`, `buildFormFunnelChartData`, `buildMouseMatrixData`, `buildDeviceChartData` — `dashboard.js`가 소비

- [ ] **Step 1: dashboardLogic 실패 테스트 작성**

`tests/dashboardLogic.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const DashboardLogic = require('../js/dashboardLogic.js');

const SAMPLE_SUMMARY = {
  scroll: { hero: 1000, gallery: 2000 },
  imageClicks: { byProject: { p1: 3, p2: 1 }, avgDeltaMs: 450 },
  formFunnel: {
    1: { entered: 10, completed: 8, abandoned: 2, dropoffRate: 0.2, avgDurationMs: 3000 },
    2: { entered: 8, completed: 5, abandoned: 3, dropoffRate: 0.375, avgDurationMs: 4000 }
  },
  mouseHeatmap: { cols: 20, rows: 20, cells: [{ x: 0, y: 0, v: 5 }] },
  devices: { deviceTypes: { mobile: 2, desktop: 3 }, browsers: { Chrome: 4, Safari: 1 } }
};

test('buildScrollChartData maps sections to labels and values', () => {
  const result = DashboardLogic.buildScrollChartData(SAMPLE_SUMMARY);
  assert.deepEqual(result.labels, ['hero', 'gallery']);
  assert.deepEqual(result.values, [1000, 2000]);
});

test('buildImageClickChartData maps project ids to click counts', () => {
  const result = DashboardLogic.buildImageClickChartData(SAMPLE_SUMMARY);
  assert.deepEqual(result.labels, ['p1', 'p2']);
  assert.deepEqual(result.values, [3, 1]);
  assert.equal(result.avgDeltaMs, 450);
});

test('buildFormFunnelChartData maps steps to dropoff rate percentages', () => {
  const result = DashboardLogic.buildFormFunnelChartData(SAMPLE_SUMMARY);
  assert.deepEqual(result.labels, ['Step 1', 'Step 2']);
  assert.deepEqual(result.dropoffRates, [20, 37.5]);
  assert.deepEqual(result.avgDurations, [3000, 4000]);
});

test('buildMouseMatrixData returns raw cell array', () => {
  const result = DashboardLogic.buildMouseMatrixData(SAMPLE_SUMMARY);
  assert.deepEqual(result, [{ x: 0, y: 0, v: 5 }]);
});

test('buildDeviceChartData maps browsers to labels and values', () => {
  const result = DashboardLogic.buildDeviceChartData(SAMPLE_SUMMARY);
  assert.deepEqual(result.labels, ['Chrome', 'Safari']);
  assert.deepEqual(result.values, [4, 1]);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test`
Expected: FAIL — `Cannot find module '../js/dashboardLogic.js'`

- [ ] **Step 3: dashboardLogic.js 구현**

`js/dashboardLogic.js`:

```js
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.DashboardLogic = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  function buildScrollChartData(summary) {
    var sections = Object.keys(summary.scroll || {});
    return {
      labels: sections,
      values: sections.map(function (section) { return summary.scroll[section]; })
    };
  }

  function buildImageClickChartData(summary) {
    var byProject = (summary.imageClicks || {}).byProject || {};
    var projectIds = Object.keys(byProject);
    return {
      labels: projectIds,
      values: projectIds.map(function (id) { return byProject[id]; }),
      avgDeltaMs: (summary.imageClicks || {}).avgDeltaMs || 0
    };
  }

  function buildFormFunnelChartData(summary) {
    var funnel = summary.formFunnel || {};
    var steps = Object.keys(funnel).sort();
    return {
      labels: steps.map(function (step) { return 'Step ' + step; }),
      dropoffRates: steps.map(function (step) { return funnel[step].dropoffRate * 100; }),
      avgDurations: steps.map(function (step) { return funnel[step].avgDurationMs; })
    };
  }

  function buildMouseMatrixData(summary) {
    var heatmap = summary.mouseHeatmap || { cells: [] };
    return heatmap.cells;
  }

  function buildDeviceChartData(summary) {
    var devices = (summary.devices || {}).browsers || {};
    var labels = Object.keys(devices);
    return {
      labels: labels,
      values: labels.map(function (label) { return devices[label]; })
    };
  }

  return {
    buildScrollChartData: buildScrollChartData,
    buildImageClickChartData: buildImageClickChartData,
    buildFormFunnelChartData: buildFormFunnelChartData,
    buildMouseMatrixData: buildMouseMatrixData,
    buildDeviceChartData: buildDeviceChartData
  };
});
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS (30 tests — 누적)

- [ ] **Step 5: dashboard.js DOM 연동 구현**

`js/dashboard.js`:

```js
(function () {
  function getToken() {
    var stored = sessionStorage.getItem('dashboard_token');
    if (stored) return stored;
    var entered = prompt('대시보드 접근 토큰을 입력하세요:');
    if (entered) sessionStorage.setItem('dashboard_token', entered);
    return entered;
  }

  function showError(message) {
    var banner = document.getElementById('error-banner');
    banner.textContent = message;
    banner.style.display = 'block';
  }

  function hideError() {
    document.getElementById('error-banner').style.display = 'none';
  }

  function renderCharts(summary) {
    var scroll = DashboardLogic.buildScrollChartData(summary);
    new Chart(document.getElementById('chart-scroll'), {
      type: 'bar',
      data: { labels: scroll.labels, datasets: [{ label: '섹션별 체류시간(ms)', data: scroll.values }] }
    });

    var clicks = DashboardLogic.buildImageClickChartData(summary);
    new Chart(document.getElementById('chart-clicks'), {
      type: 'bar',
      data: { labels: clicks.labels, datasets: [{ label: '프로젝트별 클릭 수', data: clicks.values }] }
    });

    var funnel = DashboardLogic.buildFormFunnelChartData(summary);
    new Chart(document.getElementById('chart-funnel'), {
      type: 'bar',
      data: {
        labels: funnel.labels,
        datasets: [
          { label: '이탈률(%)', data: funnel.dropoffRates },
          { label: '평균 소요시간(ms)', data: funnel.avgDurations }
        ]
      }
    });

    var mouseCells = DashboardLogic.buildMouseMatrixData(summary);
    new Chart(document.getElementById('chart-mouse'), {
      type: 'matrix',
      data: {
        datasets: [{
          label: '마우스 관심영역',
          data: mouseCells,
          width: function () { return 12; },
          height: function () { return 12; },
          backgroundColor: function (ctx) {
            var v = ctx.dataset.data[ctx.dataIndex].v;
            var alpha = Math.min(1, v / 20);
            return 'rgba(220, 38, 38, ' + alpha + ')';
          }
        }]
      },
      options: {
        scales: {
          x: { type: 'linear', min: 0, max: 20 },
          y: { type: 'linear', min: 0, max: 20 }
        }
      }
    });

    var devices = DashboardLogic.buildDeviceChartData(summary);
    new Chart(document.getElementById('chart-devices'), {
      type: 'doughnut',
      data: { labels: devices.labels, datasets: [{ data: devices.values }] }
    });
  }

  function load() {
    var token = getToken();
    if (!token) return;
    var url = window.TRACKER_CONFIG.APPS_SCRIPT_URL + '?action=summary&token=' + encodeURIComponent(token);
    fetch(url)
      .then(function (res) { return res.json(); })
      .then(function (summary) {
        if (summary.error) {
          sessionStorage.removeItem('dashboard_token');
          showError('인증 실패: 토큰을 다시 확인해주세요.');
          return;
        }
        hideError();
        renderCharts(summary);
      })
      .catch(function () {
        showError('데이터를 불러오지 못했습니다.');
      });
  }

  document.getElementById('btn-retry').addEventListener('click', load);
  load();
})();
```

- [ ] **Step 6: dashboard.html 작성**

`dashboard.html`:

```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>UX 분석 대시보드</title>
  <link rel="stylesheet" href="css/style.css" />
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
  <script src="https://cdn.jsdelivr.net/npm/chartjs-chart-matrix@2"></script>
</head>
<body>
  <main class="dashboard">
    <h1>UX 분석 대시보드</h1>
    <div id="error-banner" class="error-banner"></div>

    <div class="chart-card"><h2>섹션별 스크롤 체류시간</h2><canvas id="chart-scroll"></canvas></div>
    <div class="chart-card"><h2>프로젝트별 이미지 클릭 수</h2><canvas id="chart-clicks"></canvas></div>
    <div class="chart-card"><h2>폼 단계별 이탈률/소요시간</h2><canvas id="chart-funnel"></canvas></div>
    <div class="chart-card"><h2>마우스 관심영역 히트맵</h2><canvas id="chart-mouse"></canvas></div>
    <div class="chart-card"><h2>디바이스/브라우저 분포</h2><canvas id="chart-devices"></canvas></div>

    <button id="btn-retry">다시 불러오기</button>
  </main>

  <script src="js/config.js"></script>
  <script src="js/dashboardLogic.js"></script>
  <script src="js/dashboard.js"></script>
</body>
</html>
```

- [ ] **Step 7: 수동 검증**

Run: `npx serve .`
- `dashboard.html` 접속, 틀린 토큰 입력 시 에러 배너 노출 확인
- "다시 불러오기" 클릭 후 올바른 토큰(Task 4에서 설정한 `DASHBOARD_TOKEN`) 입력, 5개 차트가 실제 시트 데이터로 렌더링되는지 확인

- [ ] **Step 8: 커밋**

```bash
git add js/dashboardLogic.js js/dashboard.js dashboard.html tests/dashboardLogic.test.js
git commit -m "feat: add UX analytics dashboard with Chart.js"
```

---

## Task 6: 통합 + 루트 README

**Files:**
- Create: `README.md`
- Modify: `js/config.js` (실제 배포 URL로 교체 — Task 4 배포 완료 후)

**Interfaces:**
- Consumes: 없음 (통합/문서화 태스크)

- [ ] **Step 1: 루트 README.md 작성**

`README.md`:

```markdown
# 포트폴리오 + UX 분석 대시보드

## 로컬 실행

빌드 도구 없이 순수 정적 파일이므로 아무 정적 서버로 실행 가능하다.

\`\`\`bash
npx serve .
# 또는
python -m http.server 8000
\`\`\`

브라우저에서 `index.html`, `contact.html`, `dashboard.html` 을 연다.

## 단위 테스트

\`\`\`bash
npm test
\`\`\`

`js/*.js` 의 순수 로직(`trackerLogic.js`, `galleryLogic.js`, `formLogic.js`, `dashboardLogic.js`)과 `apps-script/Aggregate.gs` 의 집계 함수를 검증한다. DOM 연동 코드(`tracker.js`, `gallery.js`, `form.js`, `dashboard.js`)와 Apps Script의 `doGet`/`doPost` 는 자동화 테스트 대신 아래 수동 시나리오로 검증한다.

## Google Apps Script 배포

`apps-script/README.md` 참고. 배포 후 `js/config.js` 의 `APPS_SCRIPT_URL` 을 갱신해야 실제 로깅/대시보드가 동작한다.

## 수동 검증 체크리스트

- [ ] index.html: 필터 버튼 클릭 시 카테고리별로 갤러리가 바뀐다
- [ ] index.html: 프로젝트 카드를 여러 번 클릭한 뒤 네트워크 탭에서 batched 이벤트 전송 확인
- [ ] contact.html: 3단계를 끝까지 완료 후 시트에 `complete` 이벤트 확인
- [ ] contact.html: 2단계에서 탭을 닫아 `abandon` 이벤트가 기록되는지 확인
- [ ] dashboard.html: 잘못된 토큰 입력 시 에러 배너, 올바른 토큰 입력 시 5개 차트 렌더링 확인
```

- [ ] **Step 2: 전체 테스트 재확인**

Run: `npm test`
Expected: PASS (30 tests, 전체)

- [ ] **Step 3: 전체 수동 E2E 통합 검증**

Run: `npx serve .`
- `apps-script/README.md` 절차대로 Apps Script를 배포하고 `js/config.js`의 `APPS_SCRIPT_URL`을 실제 값으로 교체
- `README.md`의 수동 검증 체크리스트 5개 항목을 순서대로 모두 수행하고 통과 확인

- [ ] **Step 4: 커밋**

```bash
git add README.md js/config.js
git commit -m "docs: add root README and wire deployed Apps Script URL"
```
