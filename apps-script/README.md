# Apps Script 배포 가이드

## 파일/시트 이름

- 구글 스프레드시트 파일명: `portfolio-visitor-log`
- 시트(탭) 이름: `Visitors`
- Apps Script 파일: `Code.gs` (이 폴더의 내용을 그대로 붙여넣는다)

## 배포 절차

1. https://sheets.google.com 에서 새 스프레드시트를 만들고 이름을 `portfolio-visitor-log` 로 지정한다.
2. 확장 프로그램 → Apps Script 를 연다.
3. 기본 생성된 `Code.gs` 파일 내용을 이 저장소의 `apps-script/Code.gs` 내용으로 교체한다.
   (시트 이름/컬럼은 코드 안에서 자동으로 `Visitors` 시트를 생성하고 헤더를 채우므로 시트를 미리 만들 필요는 없다.)
4. 프로젝트 설정(톱니바퀴) → 스크립트 속성 에서 `INGEST_TOKEN` 속성을 추가하고 임의의 긴 문자열(예: `openssl rand -hex 16` 결과)을 값으로 넣는다. (누구나 이 URL로 시트에 쓰레기 데이터를 넣지 못하도록 막는 최소한의 장치 — 강력한 보안은 아니다.)
5. 배포 → 새 배포 → 유형: 웹 앱
   - 실행 사용자: 나
   - 액세스 권한: 모든 사용자
6. 배포 후 발급되는 웹 앱 URL을 복사한다.
7. 이 저장소의 `js/config.js` 의 `APPS_SCRIPT_URL` 값을 위 URL로, `INGEST_TOKEN` 값을 4번에서 설정한 것과 동일한 문자열로 교체한다.
8. 동작 확인:

   ```bash
   curl -X POST "<웹앱 URL>" -H "Content-Type: text/plain" \
     -d '{"token":"<INGEST_TOKEN 값>","timestamp":"2026-07-07T10:00:00.000Z","sessionId":"test","page":"home","referrer":"direct","userAgent":"curl","deviceType":"desktop","browser":"Other","screenResolution":"1920x1080","viewportSize":"1280x720","language":"ko-KR","timezone":"Asia/Seoul","galleryFilterClicks":"[]","projectClickSequence":"[]","sectionDwellMs":"{}","mouseHeatmapGrid":"{}","pageDurationMs":1000,"formStepStatus":"{}","formCompleted":false,"consentGiven":false,"leadName":"","leadEmail":"","leadProjectType":"","leadDescription":"","clickCoordinates":"[]"}'
   ```

   실행 후 스프레드시트의 `Visitors` 시트에 한 행이 추가되면 정상 동작하는 것이다. `token`이 틀리거나 없으면 `{"error":"unauthorized"}` 가 반환되고 시트에는 아무 것도 추가되지 않는다.

   (curl로 이 URL을 직접 테스트하면 POST가 302 리다이렉트를 거치면서 `HTTP 405`로 실패하는 경우가 있었다 — GET은 정상 도달했으므로 배포/권한 자체는 문제가 아니었고, curl과 Google의 POST 리다이렉트 처리 방식 차이로 추정된다. 다만 실제 브라우저의 `fetch`/`sendBeacon`으로도 정상 동작하는지는 아직 확인되지 않았으므로, 확실한 검증은 실제 사이트에서 조작해보고 시트에 행이 쌓이는지 직접 확인하는 것이다.)

## 시트 컬럼 (순서대로)

| # | 컬럼명 | 설명 |
|---|---|---|
| 1 | timestamp | 전송 시각 (ISO 문자열) |
| 2 | sessionId | 세션 ID (재방문/이동 경로 추적용) |
| 3 | page | 방문 페이지 (`home` / `contact`) |
| 4 | referrer | 유입 경로 (`document.referrer`, 없으면 `direct`) |
| 5 | userAgent | User-Agent 원문 |
| 6 | deviceType | `mobile` / `desktop` |
| 7 | browser | `Chrome` / `Firefox` / `Safari` / `Edge` / `Other` |
| 8 | screenResolution | 화면 해상도 (예: `1920x1080`) |
| 9 | viewportSize | 뷰포트 크기 (예: `1280x720`) |
| 10 | language | `navigator.language` |
| 11 | timezone | 타임존 (예: `Asia/Seoul`) |
| 12 | galleryFilterClicks | 클릭한 갤러리 필터 순서 (JSON 배열) |
| 13 | projectClickSequence | 프로젝트 클릭 순서+간격 (JSON 배열, `{projectId, deltaMs}`) |
| 14 | sectionDwellMs | 섹션별 체류시간 ms (JSON 객체) |
| 15 | mouseHeatmapGrid | 마우스 20x20 그리드 카운트 (JSON 객체) |
| 16 | pageDurationMs | 총 페이지 체류시간(ms) |
| 17 | formStepStatus | 폼 단계별 상태/소요시간 (JSON 객체, contact 페이지만) |
| 18 | formCompleted | 폼 완료 여부 (`true`/`false`) |
| 19 | consentGiven | 개인정보 수집 동의 여부 (`true`/`false`) |
| 20 | leadName | 이름 (동의 시에만 값 존재) |
| 21 | leadEmail | 이메일 (동의 시에만 값 존재) |
| 22 | leadProjectType | 문의 유형 (동의 시에만 값 존재) |
| 23 | leadDescription | 문의 내용 (동의 시에만 값 존재) |
| 24 | clickCoordinates | 프로젝트 카드 클릭 시점의 정확한 좌표 (JSON 배열, `{x, y}`, 페이지 기준 픽셀) |

> `Visitors` 시트를 이미 만든 적이 있다면, 헤더 행(1행) 맨 끝에 `clickCoordinates` 칸을 직접 하나 추가해야 한다. 코드는 시트가 **처음 만들어질 때만** 헤더를 자동으로 채우기 때문에, 기존 시트의 헤더는 자동으로 갱신되지 않는다.

## 보안 참고

정적 사이트 특성상 브라우저 JS가 이 URL을 직접 호출해야 하므로, 배포된 사이트의 페이지 소스나 개발자도구 Network 탭을 보면 URL과 `INGEST_TOKEN` 값 모두 노출된다 — git에 커밋하는지 여부와 무관하게 배포 즉시 공개되는 정보다. `doPost`의 토큰 검증은 이 URL을 우연히 발견한 봇/무작위 요청이 시트에 쓰레기 데이터를 넣는 것을 막아주는 최소한의 장치일 뿐, 사이트 소스를 직접 들여다보는 사람을 막지는 못한다. 더 강한 보호가 필요하면 서버(예: Vercel Serverless Function 등)를 하나 두고 그 서버만 Apps Script 토큰을 알게 하는 구조로 바꿔야 한다.
