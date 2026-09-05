# Land Rabbit

AI가 판정하는 바다거북스프(수평사고 추리) 웹게임

## 기술 스택

- **Next.js 16** (App Router) + TypeScript + Tailwind CSS
- **Supabase** — Postgres, Realtime, Storage
- **Anthropic Claude** (`claude-sonnet-4-6`) — AI 판정/채점
- lucide-react (아이콘)

## 설치

```bash
npm install
cp .env.example .env.local
# .env.local에 실제 값을 채워 넣으세요
```

## 환경변수

| 변수 | 설명 |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API 키 |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon 키 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role 키 |
| `ADMIN_PASSWORD` | 관리자 로그인 비밀번호 |
| `ADMIN_SESSION_SECRET` | 세션 서명 시크릿 (32자 이상) |

## Supabase 세팅

1. Supabase 프로젝트를 생성합니다
2. `supabase/schema.sql`을 SQL Editor에서 실행합니다
3. Storage에서 `case-images` 버킷을 **비공개**로 생성합니다
4. Realtime을 활성화합니다 (rooms, room_players, room_questions, room_events 테이블)

## 사건 데이터 시딩

```bash
npm run seed
```

`/data/cases/*.json` 파일을 DB에 삽입합니다.

## 관리자 화면으로 사건 등록하기

1. `/admin/login`에서 `ADMIN_PASSWORD`로 로그인
2. `/admin/cases`에서 [새 사건 만들기] 클릭
3. 다음 항목을 입력:
   - 기본 정보: ID(slug), 제목, 난이도, 태그
   - 사건 개요(brief): 플레이어에게 공개되는 2~4문장
   - 사건 전말(truth): 서버 전용, 절대 노출되지 않음
   - 핵심 요소(keyFacts): label, detail, mustConvey, acceptExamples(3개+), rejectExamples, required
   - 삽화: 2~4장 경로 지정
   - 힌트: 3단계 (약한 순서 -> 강한 순서)
   - 오답 유도 방향(redHerrings)
4. 저장 후 `/admin/cases/[id]/test`에서 판정 테스트
5. 유효성 검사 통과 시 상태를 'published'로 전환

## 판정 테스트

```bash
npm run test:judge
```

골든셋 기반 판정 회귀 테스트를 실행합니다. 90% 미만이면 실패입니다.

## 개발 서버

```bash
npm run dev
```

## 수동 스모크 체크리스트

- [ ] 혼자서 `_test-turtle-soup`를 끝까지 풀어 결과 화면까지 도달
- [ ] 방을 만들어 코드로 다른 창에서 입장 -> 협동 모드로 클리어
- [ ] 토큰 50개를 모두 소진시켜 게임 오버 화면 확인
- [ ] 모바일 화면 폭에서 입력창이 키보드에 가리지 않는지 확인
- [ ] 삽화 파일을 전부 지운 상태에서도 플레이스홀더로 진행 가능한지 확인
- [ ] 신고 버튼이 `flagged`를 기록하고 관리자 페이지에서 조회되는지 확인
- [ ] 관리자 화면에서 사건을 처음부터 하나 만들어 발행하고, 그 사건으로 클리어까지 도달
- [ ] 관전자로 입장해 로그와 삽화는 보이되 입력창/힌트/투표가 잠겨 있는지 확인
