# 포트폴리오 사이트 + 방문자 로깅

순수 HTML/CSS/JS 정적 사이트(빌드 도구 없음) + Google Apps Script를 통한 방문자 행동 로깅.

- 배포 사이트: https://success-all.github.io/class-portfolio-2607/
- 저장소: https://github.com/success-all/class-portfolio-2607

## 페이지 구성

- `index.html` — 소개 + 필터링 가능한 프로젝트 갤러리 (웹/모바일/AI/디자인, 더미 데이터 `data/projects.js`)
- `contact.html` — 3단계 문의 폼 (기본정보 → 프로젝트문의 → 완료), 1단계에 개인정보 수집 동의 체크박스 포함

## 방문자 로깅

`js/tracker.js`가 다음 정보를 수집해 한 행(row) 단위로 Apps Script 웹앱에 전송한다 (전송 시점: 필터/카드 클릭 직후, 폼 단계 전환 직후, 그리고 페이지 이탈 시).

- 기본 방문 정보: 시각, 세션ID, 페이지, 유입 경로
- 디바이스/환경: User-Agent, 디바이스 타입, 브라우저, 화면/뷰포트 크기, 언어, 타임존
- 행동 로그: 갤러리 필터 클릭, 프로젝트 카드 클릭(순서·간격·정확한 좌표), 섹션별 스크롤 체류시간, 20x20 마우스 히트맵 그리드
- 폼 관련: 단계별 진입/완료/이탈 상태와 소요시간, 완료 여부, 개인정보 동의 여부, (동의 시에만) 이름/이메일/문의유형/문의내용

**한 행 = 한 이벤트.** 각 행은 직전 전송 이후 새로 발생한 것만 담으므로(이전 값 재포함 없음), 여러 행을 그대로 합산해도 과대집계되지 않는다 — 전송할 때마다 클릭/스크롤/마우스 누적값이 초기화된다. 다만 폼 완료 여부·동의 여부·리드 정보(이름/이메일 등)는 예외로, 한 번 정해지면 계속 유지되는 상태값이라 매 행에 반복 포함된다.

전체 24개 컬럼 정의는 [`apps-script/README.md`](apps-script/README.md)에 순서대로 정리되어 있다.

## 저장/배포 구조

- 데이터 저장소: Google Sheets 파일 `portfolio-visitor-log`의 `Visitors` 시트
- 수집/조회 API: Google Apps Script 웹앱 (`apps-script/Code.gs`) — `doPost`가 시트에 행을 추가하며, 공유 토큰(`INGEST_TOKEN`) 검증을 거친다
- 웹앱 URL과 토큰은 `js/config.js`에 있으며, 정적 사이트 특성상 배포 즉시 누구나 페이지 소스로 볼 수 있다 (보안 근거는 `apps-script/README.md`의 "보안 참고" 절 참고)

## 로컬 실행

```bash
npx serve .
# 또는
python -m http.server 8000
```

`index.html`, `contact.html`을 브라우저로 열어 확인한다.

## Apps Script 배포/변경 시 필수 절차

Apps Script 코드(`apps-script/Code.gs`)를 수정한 뒤에는 반드시:

1. Apps Script 편집기에 최신 코드를 붙여넣는다 (기존 내용 전체 삭제 후 새로 붙여넣기 권장 — 이어붙이면 중복 코드로 인한 구문 오류가 날 수 있다)
2. **배포 → 배포 관리 → 기존 배포 수정(연필) → 버전: 새 버전 → 배포**로 같은 URL을 유지한 채 코드만 갱신한다 ("새 배포"를 누르면 URL이 바뀌어 `js/config.js`도 다시 고쳐야 한다)
3. 시트 컬럼이 추가된 경우, 이미 만들어진 `Visitors` 시트라면 헤더 행에 새 컬럼명을 수동으로 추가한다 (코드는 시트가 처음 생성될 때만 헤더를 자동으로 채운다)

자세한 최초 배포 절차는 [`apps-script/README.md`](apps-script/README.md) 참고.

## 개발 이력 / 문서

- 이 사이트는 원래 UX 분석 대시보드(Chart.js) + 상세 이벤트 로그까지 포함한 더 큰 설계로 시작했다가, 진행 중 정적 2페이지 + 방문자 로깅으로 범위가 축소되었다. 폐기된 원래 설계는 `docs/superpowers/specs/`, `docs/superpowers/plans/`에 참고용으로 남아있다 (현재 구현과 다름).
- 개발 중 발생한 이슈와 해결 과정은 [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md) 참고.
