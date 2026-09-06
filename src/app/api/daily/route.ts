import { NextResponse } from 'next/server';
import { kstDateKey, nextResetAt } from '@/lib/daily';
import { getDailyCaseId } from '@/lib/dailyCase';
import { isFileDb, loadCase, mapSupabaseToCaseData } from '@/lib/fileDb';
import { listTop } from '@/lib/leaderboard';
import { LEADERBOARD_TOP_N } from '@/lib/gameConfig';
import type { CaseData, CasePublicDTO } from '@/lib/types';

/**
 * 오늘의 사건 (P4-B).
 *
 * 선택은 날짜 시드로만 결정되므로 서버가 몇 대든 같은 답이 나온다.
 * 응답에는 /api/cases와 같은 공개 DTO만 담는다 — truth는 절대 나가지 않는다.
 */

export const dynamic = 'force-dynamic';

async function loadCaseData(caseId: string): Promise<CaseData | null> {
  if (isFileDb()) return loadCase(caseId);

  const { createServiceClient } = await import('@/lib/supabase/server');
  const supabase = createServiceClient();
  const { data } = await supabase.from('cases').select('*').eq('id', caseId).single();
  return data ? mapSupabaseToCaseData(data) : null;
}

export async function GET() {
  const dateKey = kstDateKey();
  const resetAt = nextResetAt().toISOString();
  const caseId = await getDailyCaseId(dateKey);
  const picked = caseId ? await loadCaseData(caseId) : null;

  if (!picked) {
    return NextResponse.json({ dateKey, resetAt, case: null, entries: [] });
  }

  const dto: CasePublicDTO = {
    id: picked.id,
    title: picked.title,
    difficulty: picked.difficulty,
    brief: picked.brief,
    keyFactLabels: (picked.keyFacts ?? []).map((f) => ({
      id: f.id,
      label: f.label,
      required: f.required,
    })),
    imageCount: picked.images?.length ?? 0,
    images: picked.images ?? [],
  };

  return NextResponse.json({
    dateKey,
    resetAt,
    case: dto,
    entries: await listTop(dateKey, picked.id, LEADERBOARD_TOP_N),
  });
}
