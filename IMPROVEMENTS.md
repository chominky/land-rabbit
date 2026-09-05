# 육지토끼고기 개선 구현 지시서

> 이 문서는 Claude(Claude Code)가 순서대로 따라 구현하기 위한 작업 명세다.
> 각 작업은 **목표 / 대상 파일 / 구현 단계 / 완료 기준(AC)**으로 구성된다.
> 한 번에 하나의 작업(또는 하나의 Phase)만 완료하고, 완료 기준을 스스로 검증한 뒤 다음으로 넘어간다.

---

## 0. 시작 전 필독 (제약사항)

- **이 저장소의 Next.js는 학습 데이터와 다르다.** 코드 작성 전 `node_modules/next/dist/docs/`에서 관련 가이드를 먼저 읽는다 (App Router, route handlers, metadata 등). `AGENTS.md` 참고.
- 스택: **Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 + Supabase + Anthropic Claude(`claude-sonnet-4-6`)**.
- 데이터 계층은 이중이다:
  - **단일 플레이**: `localStorage` (`yesno_saves` 키, `SinglePlayerState` 타입) — 서버 저장 없음.
  - **멀티플레이 방**: Supabase Realtime (`rooms`, `room_players`, `room_questions`, `room_events`).
  - **사건/히스토리 원본**: `USE_FILE_DB=true`이거나 Supabase 미설정 시 `data/cases/*.json` + `data/history.json` (`src/lib/fileDb.ts`). Supabase 설정 시 DB. **두 경로 모두 항상 함께 수정**한다.
- 새 스키마가 필요하면 `supabase/schema.sql`에 반영하고, 파일 DB 폴백도 함께 구현한다.
- 색상·타입·게임설정 상수: `src/lib/gameConfig.ts`, `src/lib/types.ts`.
- 작업 후 `npm run lint`와 (판정 로직 변경 시) `npm run test:judge`를 통과시킨다.
- 커밋은 사용자가 요청할 때만. Phase 단위로 작은 커밋을 권장하되 지시가 있을 때 수행.

---

## 우선순위 요약

| Phase | 내용 | 근거 |
|---|---|---|
| **P0** | 끊어진 메뉴 복구, 미완성 기능 정리 | 지금 404/혼란을 유발하는 버그성 문제 |
| **P1** | 디자인 토큰 시스템화 → 모바일 반응형 → 라이트/다크 테마 | 이후 모든 UI 작업의 토대 |
| **P2** | 입력·피드백 개선, 접근성, 온보딩, 결과 화면 강화 | 플레이어 경험 직접 개선 |
| **P3** | 관리자: 통계 대시보드, 사건 생성 UX, 신고 워크플로우, 골든셋 QA UI | 운영 효율 |
| **P4** | 토큰/점수 밸런싱, 데일리 챌린지/리더보드, 사운드/햅틱 | 게임성 확장 |

> P1의 "디자인 토큰"은 다른 UI 작업의 전제다. **반드시 P1-A를 먼저** 끝낸다.

---

# P0 — 버그성 문제 정리

## P0-A. 끊어진 홈 메뉴 복구 (`/history`, `/settings`)

**목표**: `src/app/page.tsx`의 메뉴가 `/history`, `/settings`로 이동하지만 해당 라우트가 없어 404가 난다. 두 페이지를 신설한다.

**대상 파일**
- 신규: `src/app/history/page.tsx`
- 신규: `src/app/settings/page.tsx`
- 참고: `src/app/page.tsx`(menuItems), `src/lib/types.ts`(`SinglePlayerState`), `src/app/cases/page.tsx`(localStorage 로딩 패턴)

**구현 단계**
1. `/history`: `localStorage`의 `yesno_saves`(`Record<caseId, SinglePlayerState>`)를 읽어 **내 개인 플레이 기록**을 카드/리스트로 표시.
   - 각 항목: 사건 제목(= `/api/cases`에서 매칭), 클리어 여부, 랭크/점수, 남은 토큰, 질문 수, 마지막 플레이. 클리어한 사건은 결과 재열람 링크(`/play/[caseId]`) 제공.
   - 저장 없음 상태의 빈 화면(empty state) 포함.
2. `/settings`: 다음을 localStorage(`yesno_settings`)에 저장/복원.
   - 테마(라이트/다크, P1-C에서 실제 연결), 사운드/햅틱 on/off(P4-D에서 연결), 저장 데이터 초기화 버튼(`yesno_saves` 삭제, 확인 모달).
   - 지금은 각 토글의 UI와 저장만 구현하고, 실제 효과 연결은 해당 Phase에서 마무리한다(TODO 주석 명시).
3. 두 페이지 모두 `/cases`의 상단 헤더(뒤로가기 + 타이틀) 패턴을 재사용해 일관성 유지.

**완료 기준(AC)**
- 홈에서 `기록`, `설정` 클릭 시 404 없이 렌더된다.
- 저장이 있을 때/없을 때 모두 정상 표시.
- 설정 값이 새로고침 후에도 유지된다.

## P0-B. 미완성 기능 정리 (versus 모드 등)

**목표**: 완성도 낮은 경로를 축소해 유지보수 부담과 사용자 혼란을 줄인다.

**구현 단계**
1. 먼저 **조사**: `RoomMode = 'coop' | 'versus'`(`src/lib/types.ts`)를 검색해 versus 분기가 실제로 완결되어 있는지 확인한다. (`src/app/room/[code]/page.tsx`, `src/app/room/create/page.tsx`, `src/app/api/rooms/**`)
2. 판단:
   - versus가 **미완성**이면: 방 생성 UI에서 versus 선택지를 숨기고(코드는 남기되 비활성/주석), 서버는 versus 요청을 거부하거나 coop으로 처리. "추후 지원 예정" 문구.
   - versus가 **완성**이면: 제거하지 말고 P0-B는 스킵하되, 발견한 결함만 목록으로 보고.
3. 미사용 export/데드코드(`grep`로 참조 0건 확인 후)를 제거. **삭제 전 반드시 참조 검색으로 확인**하고, 애매하면 남긴다.

**완료 기준(AC)**
- 사용자가 도달 가능한 모든 방 모드가 실제로 끝까지 동작한다.
- 숨기거나 제거한 항목을 변경 요약에 명시한다.

---

# P1 — 디자인 기반 (UI)

## P1-A. 디자인 토큰 시스템화 ★선행 필수

**목표**: 전 파일에 하드코딩된 hex(`#0b0d11`, `#12151c`, `#181c25`, `#2a2e38`, `#e8e6e3`, `#8b8d93`, `#5a5c63`, `#c8a24e`, 판정색 `#3a7d44`/`#8b3a3a` 등)를 **CSS 변수 + Tailwind 테마 토큰**으로 통합한다.

**대상 파일**
- `src/app/globals.css` (토큰 정의)
- 색상을 쓰는 전 컴포넌트: `src/app/page.tsx`, `src/app/cases/page.tsx`, `src/app/play/[caseId]/page.tsx`, `src/app/room/[code]/page.tsx`, `src/app/room/create/page.tsx`, `src/app/admin/**`
- `src/lib/gameConfig.ts` 또는 신규 `src/lib/theme.ts`(판정색·랭크색 매핑을 토큰명으로)

**구현 단계**
1. `globals.css`의 `@theme`(Tailwind v4 방식 — **docs 확인**)에 시맨틱 토큰 정의:
   - 배경: `--color-bg`(#0b0d11), `--color-surface`(#12151c), `--color-surface-2`(#181c25)
   - 테두리: `--color-border`(#2a2e38)
   - 텍스트: `--color-text`(#e8e6e3), `--color-text-muted`(#8b8d93), `--color-text-dim`(#5a5c63)
   - 강조: `--color-accent`(#c8a24e), `--color-accent-soft`(rgba 형태)
   - 판정: `--color-yes`(#3a7d44), `--color-no`(#8b3a3a), `--color-maybe`(#8b7a3a), `--color-neutral`(#4a4c53), `--color-danger`(#c0392b)
   - 랭크: S/A/B/C/D 색
2. 매핑 표를 이 문서 하단 부록에 기록하고, **인라인 `style={{...}}`과 하드코딩 클래스(`bg-[#...]`)를 토큰 클래스(`bg-surface`, `text-accent` 등)로 치환**한다. 파일별로 나눠 진행하고 매번 시각 회귀를 눈으로 확인.
3. 판정색/랭크색은 `src/lib/theme.ts`에 `VERDICT_TOKEN`, `RANK_TOKEN` 맵으로 중앙화하고 각 페이지가 이를 import.

**완료 기준(AC)**
- `grep -rn "#c8a24e\|#0b0d11\|bg-\[#" src/app`가 (의도적 예외 외) 0건에 수렴.
- 화면이 이전과 시각적으로 동일하다(리팩터링이지 리디자인 아님).
- `npm run lint` 통과.

## P1-B. 모바일 반응형 최적화

**목표**: 플레이/방 화면을 모바일에서 제대로 쓰게 만든다.

**대상 파일**: `src/app/play/[caseId]/page.tsx`, `src/app/room/[code]/page.tsx`, `src/app/cases/page.tsx`

**구현 단계**
1. **플레이 화면**(`play/[caseId]`): 현재 `lg:flex-row` 2-column. 모바일에서는:
   - 좌측 케이스 패널(삽화/토큰/힌트/핵심요소)을 **접이식(collapsible) 상단 요약 + 시트/탭**으로. 로그와 입력이 화면 대부분을 차지하게.
   - 입력창을 `sticky bottom-0`로 고정하고 iOS 키보드에 가리지 않게 `env(safe-area-inset-bottom)`와 `dvh` 사용(README 스모크 체크리스트 항목).
   - 삽화 그리드는 모바일 2열 유지하되 탭 시 전체화면 오버레이(이미 있음) 확인.
2. **방 화면**(`room/[code]`, 1500줄): 플레이어 목록/로그/입력/투표 영역을 모바일에서 탭 또는 세로 스택으로 재배치. 관전자 잠금 UI가 좁은 화면에서도 명확하게.
3. 최소 폭 320px, 대표 폭 375/390px에서 가로 스크롤이 생기지 않도록 점검.

**완료 기준(AC)**
- 375px 폭에서 플레이·방 화면 모두 가로 스크롤 없음, 입력창이 키보드에 가리지 않음.
- 데스크톱 레이아웃은 회귀 없음.

## P1-C. 라이트/다크 테마

**목표**: 다크(현재) 외 라이트 테마 추가 + 설정에서 토글. **P1-A 완료 후에만 진행.**

**구현 단계**
1. `globals.css`에서 토큰을 `:root`(라이트) / `.dark` 또는 `[data-theme="dark"]`(다크)로 분기. 기본값과 대비비(WCAG AA) 확보.
2. `src/app/layout.tsx`에서 초기 테마를 결정(설정값 → 없으면 `prefers-color-scheme`). **FOUC 방지**를 위해 `<head>`에 인라인 스크립트로 첫 페인트 전 `data-theme` 적용.
3. `/settings`(P0-A)의 테마 토글을 실제 `data-theme` 전환 + `yesno_settings`에 저장하도록 연결.

**완료 기준(AC)**
- 라이트/다크 전환이 즉시 반영되고 새로고침 시 유지, 초기 로드 시 깜빡임 없음.
- 두 테마 모두 주요 화면에서 텍스트 대비 AA 충족.

---

# P2 — 플레이어 경험 (UX)

## P2-A. 입력·피드백 개선

**목표**: 거친 상호작용(`alert()` 남용 등)을 다듬는다.

**대상 파일**: `src/app/play/[caseId]/page.tsx`(주 대상), `src/app/room/[code]/page.tsx`, `src/app/page.tsx`

**구현 단계**
1. **토스트 시스템 도입**: 경량 토스트 컴포넌트(`src/components/Toast.tsx` + context/provider)를 만들고, `play` 페이지의 `alert(...)` 호출(오류, "이미 물어본 질문", 오답 피드백, 공유 복사 등)을 토스트로 교체.
2. **판정 대기 상태**: 질문 전송 중 로그 하단에 스켈레톤/타이핑 인디케이터(판정 도장이 찍히기 전 placeholder) 표시. 현재는 버튼만 `...`로 바뀜.
3. **추천 질문 프롬프트**: 질문이 0개일 때 빈 상태(현재 "질문을 시작하세요")에 예시 질문 칩 2~3개를 두고, 클릭 시 입력창에 채움(전송은 사용자가). 스포일러 없는 일반형("피해자는 남성인가요?" 류).
4. **오류 재시도 UI**: 네트워크 실패 시 토스트 + "다시 시도" 액션. 힌트 구매 실패의 토큰 환불 로직(이미 존재)은 유지.

**완료 기준(AC)**
- 플레이 중 `alert()` 사용 0건(코드 검색으로 확인).
- 전송~판정 사이 명확한 로딩 피드백이 보인다.

## P2-B. 접근성(a11y)

**목표**: 키보드/스크린리더 사용자 대응.

**구현 단계**
1. **모달 포커스 트랩**: 방 참가 모달(`page.tsx`), 최종추리/힌트/삽화 오버레이(`play`)에 포커스 트랩 + `Esc` 닫기 + 열릴 때 첫 요소 포커스 + 닫힐 때 트리거로 포커스 복귀. 공용 `src/components/Modal.tsx`로 추출 권장.
2. **aria**: 판정 도장(YES/NO 등)에 `aria-label`(색만으로 구분되지 않게), 진행 바에 `role="progressbar"` + `aria-valuenow`, 토큰 카운트에 `aria-live="polite"`.
3. **키보드**: 홈 화살표 네비는 이미 있음 — 삽화 그리드/버튼도 Tab 순서와 포커스 링(토큰 색)이 보이게. `outline` 제거된 곳 복구.
4. **색 대비**: `#5a5c63`(dim) 텍스트가 배경 대비 AA 미달일 수 있으니 P1-A 토큰에서 보정.

**완료 기준(AC)**
- 마우스 없이 홈→케이스→플레이→최종추리 전 과정을 키보드만으로 완주 가능.
- 모달에서 Tab이 바깥으로 새지 않고 Esc로 닫힌다.

## P2-C. 온보딩 / 튜토리얼

**목표**: 첫 플레이어에게 규칙을 알려준다.

**구현 단계**
1. 첫 방문 판정: `localStorage`의 `yesno_onboarded` 플래그.
2. `/play`에 처음 진입 시(또는 홈에 "규칙 보기") 오버레이/코치마크로 핵심 규칙 3~4단계 안내:
   - 예/아니오로 답할 수 있는 질문만 가능, 토큰(=질문 횟수) 소비, 힌트·미리보기 비용, 최종추리 방식·오답 페널티, 삽화 잠금 해제.
3. "다시 보지 않기" 체크 → 플래그 저장. `/settings`에 "튜토리얼 다시 보기" 버튼 추가.

**완료 기준(AC)**
- 첫 플레이 시 1회 노출, 이후 미노출, 설정에서 재열람 가능.

## P2-D. 결과 화면 강화

**목표**: 클리어/실패 순간의 만족감과 공유성.

**대상 파일**: `src/app/play/[caseId]/page.tsx`의 결과 화면 블록(현재 `showResult`)

**구현 단계**
1. **랭크 공개 연출**: 랭크(S~D) 등장 애니메이션(스케일/페이드, `prefers-reduced-motion` 존중). S랭크는 강조 효과.
2. **공유 이미지 카드**: `<canvas>`로 사건 제목·랭크·점수·남은 질문·핵심요소 채점 요약을 담은 카드 이미지를 생성해 다운로드/복사. 현재는 텍스트만 클립보드 복사.
3. **공유 링크**: 결과 텍스트에 게임 URL 포함. Web Share API 사용 가능 시 네이티브 공유, 아니면 클립보드 폴백.
4. 실패 시에도 "사건 전말"과 핵심요소 채점(hit/partial/miss)을 명확히 보여줘 학습되게(이미 truth 노출 있음 — 시각 정리만).

**완료 기준(AC)**
- 클리어 시 랭크 연출이 재생되고(감소 모션 설정 시 생략), 이미지 카드 저장/공유가 동작한다.

---

# P3 — 관리자 기능

## P3-A. 통계 대시보드

**목표**: 현재 링크 카드뿐인 `/admin`(`src/app/admin/page.tsx`)에 실사용 지표를 얹는다.

**대상 파일**: `src/app/admin/page.tsx`, 신규 `src/app/api/admin/stats/route.ts`, `src/lib/fileDb.ts`(집계 헬퍼)

**구현 단계**
1. 집계 소스: 파일 DB는 `data/history.json`(`GameRecord[]`), Supabase는 히스토리 테이블. 두 경로 모두 지원.
2. `/api/admin/stats`(관리자 가드 `src/lib/adminGuard.ts` 적용)에서 집계 반환:
   - 전체: 총 플레이 수, 전체 클리어율, 평균 점수, 평균 질문 수.
   - 사건별: 플레이 수, 클리어율, 평균 남은 토큰, 평균 정확도, 신고 수(관리자 케이스 목록의 `flag_count` 재사용).
   - 랭크 분포(S~D 카운트).
3. 대시보드 상단에 요약 카드(4개) + 사건별 테이블(정렬 가능하면 좋음). 차트가 필요하면 **의존성 추가 없이** 간단한 막대(div width%)로 구현.

**완료 기준(AC)**
- `/admin`에서 실데이터 기반 요약·사건별 지표가 보인다.
- 히스토리가 비어도 0값으로 안전하게 렌더.

## P3-B. 사건 생성 UX 강화

**목표**: `src/app/admin/cases/[id]/page.tsx`(735줄 폼)의 생성/편집을 덜 실수하게.

**구현 단계**
1. **단계별 섹션 + 진행 표시**: 기본정보 → 개요/전말 → 핵심요소 → 삽화 → 힌트/오답유도. 섹션별 완료 체크.
2. **실시간 유효성 검사**(README의 발행 조건 반영):
   - `keyFacts`의 `acceptExamples`가 3개 이상인지, `mustConvey` 비어있지 않은지, `required` 최소 1개, 힌트 3단계 모두 채워졌는지, 삽화 2~4장인지.
   - 위반 시 발행(publish) 버튼 비활성 + 사유 표시.
3. **brief 누설 자동검사 연동**: `buildBriefLeakCheckPrompt`(`src/lib/ai/prompts.ts`)가 이미 있으므로, 저장/발행 전 "누설 검사 실행" 버튼 → 결과(leaked/이유) 인라인 표시. (전용 API 필요 시 `src/app/api/admin/cases/[id]/leakcheck/route.ts` 신설)
4. **삽화 업로드 미리보기**: 경로 입력 대신(또는 병행) 파일 선택 시 썸네일 미리보기. Supabase Storage `case-images` 버킷 연동이 이미 전제됨(README) — 업로드 경로 확인 후 연결, 파일 DB 모드에서는 `public/cases/<id>/` 경로 안내.

**완료 기준(AC)**
- 유효성 미달 사건은 발행 불가하고 사유가 보인다.
- 누설 검사 결과를 폼 안에서 확인할 수 있다.

## P3-C. 신고 처리 워크플로우

**목표**: `/admin/flags`(`src/app/admin/flags/page.tsx`)를 "확인"에서 "조치"까지 잇는다.

**대상 파일**: `src/app/admin/flags/page.tsx`, `src/app/api/admin/flags/route.ts`, `src/app/api/admin/cases/[id]/route.ts`

**구현 단계**
1. 신고 항목에 원 질문·판정·해당 사건 링크 표시(일부 있으면 보강).
2. **원클릭 반영**: 신고된 질문을 특정 `keyFact`의 `acceptExamples` 또는 `rejectExamples`에 바로 추가하는 액션. 대상 팩트 선택 드롭다운 → 저장 시 해당 사건 JSON/DB의 `keyFacts` 갱신.
3. **상태 관리**: 신고에 `resolved`/`dismissed` 상태를 추가(스키마·파일 DB 동시). 처리한 신고는 목록에서 필터링.
4. 반영 후 "판정 재테스트" 링크(`/admin/cases/[id]/test`)로 유도.

**완료 기준(AC)**
- 신고 → 팩트 예시 반영 → 상태 처리까지 화면 이탈 없이 수행.
- 반영 결과가 실제 사건 데이터에 저장된다.

## P3-D. 골든셋 / 판정 QA UI

**목표**: CLI 전용인 회귀 테스트(`npm run test:judge`, `scripts/test-judge.ts`, `tests/golden/*.json`)를 웹에서 다루게.

**대상 파일**: `src/app/admin/cases/[id]/test/page.tsx`, `src/app/api/admin/cases/[id]/golden/route.ts`(존재), 신규 실행 API 필요 시 추가

**구현 단계**
1. **골든셋 편집 UI**: 해당 사건의 골든 케이스(질문→기대 판정) 목록을 조회/추가/삭제. `golden` API가 이미 있으므로 그 계약을 우선 확인 후 UI 연결.
2. **웹 실행**: 골든셋을 현재 판정 프롬프트로 돌려 통과율을 표시하는 실행 버튼. `scripts/test-judge.ts`의 로직을 서버 route(`.../test/route.ts` 존재)로 재사용/이관해 결과(케이스별 pass/fail, 실제 판정 vs 기대)를 표로.
3. 통과율 90% 미만이면 경고 배지(README 기준과 일치).
4. 신고 워크플로우(P3-C)에서 만든 케이스를 골든셋에 바로 추가하는 연결 고려.

**완료 기준(AC)**
- 관리자가 웹에서 골든셋을 편집하고 판정 통과율을 확인할 수 있다.
- CLI `npm run test:judge`와 결과가 일치한다.

---

# P4 — 게임성 확장

## P4-A. 토큰 / 점수 밸런싱 재검토

**목표**: 상수를 감이 아니라 데이터로 조정한다. **P3-A(통계) 이후 진행.**

**대상 파일**: `src/lib/gameConfig.ts`

**구현 단계**
1. P3-A 통계에서 사건별 평균 남은 토큰·클리어율·평균 정확도를 확보.
2. 다음 상수를 검토·조정: `INITIAL_TOKENS`(50), `COST_HINT`(5), `COST_PREVIEW`(10), `COST_WRONG_ANSWER`(5), `SCORE_TOKEN_MULTIPLIER`(16), `SCORE_ACCURACY_MULTIPLIER`(2), `RANK_THRESHOLDS`(S850/A700/B500/C300), `AUTO_UNLOCK_INTERVAL`(15).
   - 예: 평균 남은 토큰이 지나치게 높으면 S 임계값 상향 또는 초기 토큰 하향. 클리어율이 너무 낮으면 힌트 비용 하향.
3. **밸런스 변경은 반드시 수치 근거를 커밋 메시지/PR에 기록**. 상수 의미가 헷갈리지 않게 주석 보강.
4. 난이도별 초기 토큰 차등이 필요하면 `difficulty` 기반 함수로 확장(선택).

**완료 기준(AC)**
- 변경한 상수마다 근거 데이터가 문서화된다.
- 점수/랭크 계산이 여전히 `MAX_SCORE` 상한을 지킨다.

## P4-B. 데일리 챌린지 / 리더보드

**목표**: 재방문·경쟁 동기 부여.

**대상 파일**: `supabase/schema.sql`(+파일 DB 폴백), 신규 `src/app/api/daily/route.ts`, `src/app/api/leaderboard/route.ts`, 신규 `src/app/daily/page.tsx` 또는 홈 통합

**구현 단계**
1. **데일리 사건 선택**: 날짜 시드로 발행된 사건 중 하나를 결정론적으로 선택(같은 날 모두 동일). 시간대는 KST 기준 자정 리셋.
2. **리더보드 저장**: 데일리 클리어 결과(닉네임/점수/남은토큰/시간)를 서버에 기록. `leaderboard` 테이블 신설(Supabase) + 파일 DB 폴백. 익명 남용 방지를 위해 `src/lib/rateLimit.ts` 재사용.
3. **표시**: 오늘의 사건 카드 + Top N 리더보드. 개인 최고 기록 강조.
4. 단일 플레이는 localStorage 기반이라 서버 신뢰가 약하므로, 리더보드 제출은 **서버 재검증**(제출된 질문 로그로 점수 재계산) 또는 최소한 값 범위 검증을 둔다. 부정 입력 방어를 명시.

**완료 기준(AC)**
- 같은 날 모든 사용자가 같은 데일리 사건을 본다.
- 클리어 시 리더보드에 반영되고 Top N이 표시된다.
- 명백히 조작된 점수는 거부된다.

## P4-C. 사운드 / 햅틱 피드백

**목표**: 판정·클리어·오답 등 순간의 감각 피드백. **P0-A 설정 토글과 연결.**

**구현 단계**
1. 짧은 효과음 에셋을 `public/sfx/`에 추가(판정 도장, 클리어 팡파레, 오답, 토큰 부족 경고). 라이선스 프리 사용.
2. `src/lib/sound.ts`: 사운드 재생 유틸(사전 로드, 음소거 설정 존중, 연타 디바운스).
3. 모바일 햅틱: `navigator.vibrate` 지원 시 판정/오답에 짧은 진동.
4. `/settings`(P0-A)의 사운드·햅틱 토글과 `yesno_settings`를 실제로 연결. 기본값은 사운드 on/햅틱 on이되 사용자가 끌 수 있게.
5. **자동재생 정책 대응**: 첫 사용자 상호작용 이후에만 오디오 컨텍스트 활성화.

**완료 기준(AC)**
- 설정에서 끄면 소리·진동이 나지 않는다.
- 브라우저 자동재생 차단으로 인한 콘솔 에러가 없다.

---

## 부록 A. 색상 토큰 매핑표 (P1-A 완료)

원시 값은 `src/app/globals.css`의 `:root`에만 존재한다. 컴포넌트는
Tailwind 토큰 클래스 또는 `src/lib/theme.ts`의 `T.*` / `alpha()` / `VERDICT_TOKEN` / `RANK_TOKEN`만 쓴다.

| 기존 값 | CSS 변수 | Tailwind 클래스 | `T.*` | 용도 |
|---|---|---|---|---|
| `#0b0d11` | `--bg` | `bg-bg` | `T.bg` | 최하단 배경 |
| `#12151c` | `--surface` | `bg-surface` | `T.surface` | 헤더/카드 배경 |
| `#181c25` | `--surface-2` | `bg-surface-2` | `T.surface2` | 패널/입력 배경 |
| `#1e2230` | `--surface-3` | `bg-surface-3` | `T.surface3` | hover/부상 표면 |
| `#0f1219` | `--bg-deep` | `bg-bg-deep` | `T.bgDeep` | 관리자 폼 인셋 |
| `#1a1d24` | `--surface-inset` | `bg-surface-inset` | `T.surfaceInset` | 삽화 플레이스홀더 |
| `#2a2e38` | `--border` | `border-border` | `T.border` | 테두리/구분선 |
| `#3a3e4a`, `#3a3d45` | `--border-strong` | `border-border-strong` | `T.borderStrong` | 강한 테두리/드래그 핸들 |
| `#e8e6e3` | `--fg` | `text-fg` | `T.fg` | 본문 텍스트 |
| `#8b8d93` | `--muted` | `text-muted` | `T.muted` | 보조 텍스트 |
| `#5a5c63` | `--dim` | `text-dim` | `T.dim` | 흐린 텍스트 |
| `#c8a24e` | `--accent` | `text-accent` / `bg-accent` | `T.accent` | 강조/브랜드 |
| `#8b7040` | `--accent-mid` | `text-accent-mid` | `T.accentMid` | 강조 중간톤 |
| `#8b7235` | `--accent-dim` | `text-accent-dim` | `T.accentDim` | 강조 흐린톤 |
| `#5a4820` | `--accent-deep` | `text-accent-deep` | `T.accentDeep` | 강조 어두운톤 |
| `#3a7d44` | `--yes` | `bg-yes` | `T.yes` | 판정 YES |
| `#8b3a3a` | `--no` | `bg-no` | `T.no` | 판정 NO |
| `#8b7a3a` | `--maybe` | `bg-maybe` | `T.maybe` | 판정 MAYBE |
| `#4a4c53` | `--neutral` | `bg-neutral` | `T.neutral` | IRRELEVANT/INVALID |
| `#c0392b` | `--danger` | `text-danger` | `T.danger` | 경고/오답 |
| `#f87171` | `--danger-fg` | `text-danger-fg` | `T.dangerFg` | 오류 텍스트(관리자) |
| `#e07070` | `--danger-soft` | `text-danger-soft` | `T.dangerSoft` | 오류 텍스트(방) |
| `#1a0d0d` | `--danger-surface` | `bg-danger-surface` | `T.dangerSurface` | 오류 배너 배경 |
| `#4ade80` | `--success` | `text-success` | `T.success` | 발행됨/통과 |
| `#fbbf24` | `--warning` | `text-warning` | `T.warning` | 경고 배지 |
| `#818cf8` | `--info` | `text-info` | `T.info` | 정보/보조 액션 |
| `#1a3050` | `--info-surface` | `bg-info-surface` | `T.infoSurface` | 정보 배경 |
| `#5a7090` | `--info-border` | `border-info-border` | `T.infoBorder` | 정보 테두리 |
| `#6b7280` | `--gray` | `text-gray` | `T.gray` | 초안/무효 상태 |
| `#fff` | `--on-solid` | `text-on-solid` | `T.onSolid` | 단색 버튼 위 텍스트 |
| `rgba(0,0,0,.8/.9)` | `--scrim`, `--scrim-strong` | — | `T.scrim`, `T.scrimStrong` | 모달 스크림 |
| 랭크 S~D | `--rank-s`…`--rank-d` | `text-rank-s` … | `RANK_TOKEN` | 랭크 색 |

**관리자 팔레트**: `#e8eaf0` / `#8b92a0` / `#5a6070` / `#1a1e28`은 별도 토큰을 만들지 않고,
`[data-scope="admin"]`(`src/app/admin/layout.tsx`가 부여) 안에서 `--fg` / `--muted` / `--dim` / `--surface-3`을
덮어쓰는 방식으로 통일했다. 관리자 화면 컴포넌트는 본편과 완전히 같은 토큰명을 쓴다.

**알파 합성**: 기존 `${AMBER}22` / `#c8a24e33` 같은 hex+알파는 `alpha(T.accent, 0.13)` 또는
`color-mix(in srgb, var(--accent) 20%, transparent)`로 바뀌었다. Tailwind 쪽은 `bg-accent/10` 같은
불투명도 수식어가 그대로 동작한다(`color-mix`로 컴파일됨).

**P1-C에서 조정한 값**: `--dim`은 원래 `#5a5c63`(다크 배경 대비 2.91:1)이라 WCAG AA에 미달했다.
다크 `#82858d`(5.27:1), 관리자 다크 `#7b8294`(5.06:1)로 올렸다 — P2-B 4번 항목을 여기서 처리한 것이라
"시각적으로 동일"이라는 P1-A 기준에서 의도적으로 벗어난 유일한 변경이다.

**남겨둔 것**: 관리자 화면의 상태색 `rgba(220,38,38,…)`(빨강), `rgba(34,197,94,…)`(초록),
`rgba(99,102,241,…)`(인디고), `rgba(234,179,8,…)`(노랑), `rgba(107,114,128,…)`(회색)은
반투명 오버레이라 두 테마 모두에서 읽히므로 그대로 두었다. 필요해지면 상태 토큰으로 승격한다.

## 부록 B. 작업 원칙

- **한 Phase = 한 목적**. 리팩터링(P1-A)과 기능 추가를 한 커밋에 섞지 않는다.
- 데이터 스키마 변경 시 **Supabase(`supabase/schema.sql`) + 파일 DB(`src/lib/fileDb.ts`) 양쪽** 반영.
- 새 컴포넌트는 `src/components/`에 모으고 재사용(Modal, Toast 등).
- 각 작업 후 `npm run lint` 통과, 판정 관련은 `npm run test:judge`로 회귀 확인.
- 삭제·비활성화 전 `grep`으로 참조 확인, 애매하면 남기고 보고.
- 커밋/푸시는 사용자가 명시적으로 요청할 때만 수행한다.
