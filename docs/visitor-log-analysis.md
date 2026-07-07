# Portfolio Visitor Log Analysis

## Purpose

`portfolio-visitor-log - Visitors.csv` is the visitor behavior dataset for the portfolio homepage. It is intended to support later homepage improvement work by capturing page context, device/browser metadata, interaction sequences, dwell time, heatmap activity, and contact form conversion signals.

## Google Sheets Columns

| # | Column | Description |
|---:|---|---|
| 1 | `timestamp` | 전송 시각 (ISO 문자열) |
| 2 | `sessionId` | 세션 ID |
| 3 | `page` | 방문 페이지 (`home` / `contact`) |
| 4 | `referrer` | 유입 경로 |
| 5 | `userAgent` | User-Agent 원문 |
| 6 | `deviceType` | `mobile` / `desktop` |
| 7 | `browser` | `Chrome` / `Firefox` / `Safari` / `Edge` / `Other` |
| 8 | `screenResolution` | 화면 해상도 |
| 9 | `viewportSize` | 뷰포트 크기 |
| 10 | `language` | 브라우저 언어 |
| 11 | `timezone` | 타임존 |
| 12 | `galleryFilterClicks` | 갤러리 필터 클릭 순서 (JSON 배열) |
| 13 | `projectClickSequence` | 프로젝트 클릭 순서와 간격 (JSON 배열) |
| 14 | `sectionDwellMs` | 섹션별 체류시간 ms (JSON 객체) |
| 15 | `mouseHeatmapGrid` | 마우스 20x20 그리드 카운트 (JSON 객체) |
| 16 | `pageDurationMs` | 총 페이지 체류시간(ms) |
| 17 | `formStepStatus` | 폼 단계별 상태/소요시간 (JSON 객체) |
| 18 | `formCompleted` | 폼 완료 여부 |
| 19 | `consentGiven` | 개인정보 수집 동의 여부 |
| 20 | `leadName` | 이름 (동의 시만) |
| 21 | `leadEmail` | 이메일 (동의 시만) |
| 22 | `leadProjectType` | 문의 유형 (동의 시만) |
| 23 | `leadDescription` | 문의 내용 (동의 시만) |

## Dataset Snapshot

- Source file: `portfolio-visitor-log - Visitors.csv`
- Total rows: 36 data rows
- Columns: 23
- Test rows: 4 rows (`sessionId` starts with `test`)
- Real rows after excluding test rows: 32 rows
- Real unique sessions: 2 sessions
- Real pageviews after `pageDurationMs` reset segmentation: 4 pageviews
- Observed real date range: `2026-07-07T04:00:38.202Z` to `2026-07-07T04:06:52.871Z`
- Observed page: `home` only

## Data Quality Notes

- The dataset is small and should be treated as an instrumentation smoke test, not a statistically meaningful user sample.
- `galleryFilterClicks`, `projectClickSequence`, `sectionDwellMs`, and `mouseHeatmapGrid` are cumulative snapshots. Summing all rows directly will overcount user behavior.
- `pageDurationMs` resets within the same `sessionId`, so one `sessionId` can contain multiple pageview-like segments.
- 2 non-test-adjacent rows have major metadata missing in the full dataset. These are test rows and were excluded from behavior analysis.
- Lead fields are 100% empty in this dataset, consistent with no consent or form completion.

## Real Traffic Summary

The real traffic is concentrated in 2 desktop Edge sessions from Korean language and `Asia/Seoul` timezone visitors. All observed visits are to the `home` page.

### Pageview Duration

Using duration reset segmentation, there are 4 real pageviews:

| Pageview | Duration |
|---:|---:|
| 1 | 1,285,595 ms (21m 25.6s) |
| 2 | 219,547 ms (3m 39.5s) |
| 3 | 112,546 ms (1m 52.5s) |
| 4 | 27,248 ms (27.2s) |

Summary:

- Total observed pageview time: 1,644,936 ms (27m 24.9s)
- Median pageview duration: 166,046.5 ms (2m 46.0s)
- Mean pageview duration: 411,234 ms (6m 51.2s), inflated by the longest pageview

## Behavior Analysis

### Gallery Filter Interest

Final pageview snapshots show these filter click totals:

| Filter | Clicks |
|---|---:|
| `web` | 8 |
| `mobile` | 7 |
| `ai` | 7 |
| `design` | 7 |
| `all` | 5 |

Interpretation:

- Users explored multiple filters rather than staying on the default `all` view.
- `web`, `mobile`, `ai`, and `design` are all relevant entry points. `web` is slightly ahead, but the sample is too small to rank interests confidently.
- `all` was clicked repeatedly, which may indicate users use it as a reset control after exploring categories.

### Project Click Sequence

Final pageview snapshots show these project click totals:

| Project ID | Clicks |
|---|---:|
| `p2` | 6 |
| `p3` | 5 |
| `p1` | 4 |
| `p4` | 3 |
| `p5` | 1 |
| `p6` | 1 |
| `p7` | 1 |

Interaction timing:

- Counted non-null project click intervals: 17
- Median interval between project clicks: 3,451 ms
- Average interval: 77,438 ms, heavily skewed by one long interval of 1,228,358 ms

Interpretation:

- `p2`, `p3`, and `p1` are the strongest early attention projects in this small sample.
- Project clicks often happen within a few seconds of each other, which suggests scanning/comparing behavior rather than deep reading after every click.
- The long interval implies at least one pageview was left open or the user paused before resuming interaction.

### Section Dwell Time

Segmented final snapshots show this total section dwell distribution:

| Section | Dwell Time | Share |
|---|---:|---:|
| `gallery` | 1,643,015 ms | 34.3% |
| `hero` | 1,640,014 ms | 34.3% |
| `footer` | 1,500,997 ms | 31.4% |

Interpretation:

- The current instrumentation reports very similar dwell time for `hero` and `gallery`, and a high footer dwell share.
- This may be real if sections are simultaneously counted while visible, but it may also indicate that dwell tracking is accumulating time for multiple observed sections at once.
- The section dwell metric should be validated before using it for layout decisions.

### Mouse Heatmap

Segmented final snapshots show:

- Total mouse grid events: 316
- Active cells: 152 out of 400
- Top cells: `125`, `104`, `122`, `124`, `219`, `179`, `189`, `82`, `83`, `102`

Interpretation:

- Mouse movement is spread across many cells, suggesting broad page scanning.
- Several top cells cluster around mid-page grid indices, likely corresponding to gallery/project interaction zones.
- The dataset stores numeric grid IDs only. For design decisions, the analysis will be stronger if grid IDs are mapped back to `(row, col)` and overlaid on the page layout.

### Form Conversion

| Metric | Result |
|---|---:|
| Form completed | 0 |
| Consent given | 0 |
| Lead fields populated | 0 |

Interpretation:

- No lead conversion occurred in this sample.
- Since only `home` page traffic appears, it is unclear whether users reached the contact form or whether the form tracking simply did not receive events.
- `formStepStatus` is empty in the analyzed real rows, so the current dataset cannot diagnose form friction.

## Homepage Improvement Insights

1. Make the gallery/project area the primary optimization target.

   The strongest observed behavior is filter exploration and project clicking. The homepage should make project comparison fast: clear category chips, visible project titles, short outcome labels, and obvious project detail affordances.

2. Prioritize `web`, `mobile`, `ai`, and `design` as top-level portfolio filters.

   All four filters received repeated clicks. Keep these labels visible and avoid hiding them behind a menu on desktop. Treat `all` as a reset state, not necessarily the main discovery mode.

3. Review the order and presentation of projects `p2`, `p3`, and `p1`.

   These received the most clicks. If they are flagship projects, keep them prominent. If not, inspect whether their thumbnails/titles are disproportionately attracting clicks while better business-value projects are being missed.

4. Add stronger conversion bridges from gallery to contact.

   Users interacted with projects but did not complete the form. Add contextual CTAs near project cards and after project detail views, such as "Discuss a similar project" or "Request this type of work", linked to the contact flow.

5. Validate section dwell instrumentation before acting on it.

   Hero, gallery, and footer dwell times are too close to each other across long visits. Confirm whether time is counted only for the dominant visible section or for every section intersecting the viewport.

6. Improve analytics granularity for future decisions.

   Add pageview ID, event type, and sequence number. Keep cumulative snapshots if useful, but also store append-only events or final-only summaries to avoid overcounting.

7. Add contact journey tracking.

   Track CTA clicks, contact page visits, first form focus, each form step, validation errors, consent checkbox changes, and submit attempts. Without these, the dataset can show that conversion did not happen but cannot explain why.

## Recommended Next Instrumentation Changes

- Add `pageviewId` so reloads or duration resets inside one `sessionId` are separable.
- Add `eventType` such as `heartbeat`, `visibilitychange`, `pagehide`, `form_step`, and `submit`.
- Add `isFinalSnapshot` for unload/final beacon rows.
- Store `projectClickSequence.projectId` and `deltaMs` consistently, and add project title/category at collection time or in a joinable project metadata table.
- Convert heatmap grid IDs to row/column during analysis or store both `gridId` and `row`, `col`.
- Track viewport scroll depth and currently visible dominant section.
- Store `ctaClickSequence` for homepage-to-contact conversion analysis.

