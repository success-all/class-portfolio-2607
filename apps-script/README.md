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
4. 배포 → 새 배포 → 유형: 웹 앱
   - 실행 사용자: 나
   - 액세스 권한: 모든 사용자
5. 배포 후 발급되는 웹 앱 URL을 복사한다.
6. 이 저장소의 `js/config.js` 의 `APPS_SCRIPT_URL` 값을 위 URL로 교체한다.
7. 동작 확인:

   ```bash
   curl -X POST "<웹앱 URL>" -H "Content-Type: text/plain" \
     -d '{"timestamp":"2026-07-07T10:00:00.000Z","sessionId":"test","page":"home","referrer":"direct","userAgent":"curl","deviceType":"desktop","browser":"Other","screenResolution":"1920x1080","viewportSize":"1280x720","language":"ko-KR","timezone":"Asia/Seoul","galleryFilterClicks":"[]","projectClickSequence":"[]","sectionDwellMs":"{}","mouseHeatmapGrid":"{}","pageDurationMs":1000,"formStepStatus":"{}","formCompleted":false,"consentGiven":false,"leadName":"","leadEmail":"","leadProjectType":"","leadDescription":""}'
   ```

   실행 후 스프레드시트의 `Visitors` 시트에 한 행이 추가되면 정상 동작하는 것이다.

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

## 보안 참고

이 웹앱 URL을 아는 사람은 누구나 `Visitors` 시트에 행을 추가할 수 있다. URL을 공개 저장소에 커밋하지 말고, 실제 배포 시 별도 비공개 설정 파일로 관리하는 것을 권장한다.
