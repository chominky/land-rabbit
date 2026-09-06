import { NextRequest, NextResponse } from 'next/server';
import { kstDateKey } from '@/lib/daily';
import { getDailyCaseId } from '@/lib/dailyCase';
import { listTop } from '@/lib/leaderboard';
import { LEADERBOARD_TOP_N } from '@/lib/gameConfig';

/**
 * 데일리 리더보드 조회 (P4-B).
 *
 * **읽기 전용이다.** 기록은 /api/verdict가 채점을 끝내면서 직접 남긴다 —
 * 점수를 받는 POST를 열어두면 그대로 조작 통로가 된다.
 * 자세한 신뢰 모델은 `src/lib/leaderboard.ts` 상단 주석 참고.
 */

export const dynamic = 'force-dynamic';

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const requestedDate = params.get('date');
  const dateKey = requestedDate && DATE_KEY_RE.test(requestedDate) ? requestedDate : kstDateKey();

  const limitParam = Number(params.get('limit'));
  const limit =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(Math.floor(limitParam), LEADERBOARD_TOP_N)
      : LEADERBOARD_TOP_N;

  // 사건을 지정하지 않으면 그날의 데일리 사건을 본다.
  const caseId = params.get('caseId') ?? (await getDailyCaseId(dateKey));

  if (!caseId) {
    return NextResponse.json({ dateKey, caseId: null, entries: [] });
  }

  const entries = await listTop(dateKey, caseId, limit);
  return NextResponse.json({ dateKey, caseId, entries });
}
