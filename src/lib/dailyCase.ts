import { isDailyCandidate, kstDateKey, pickDailyCaseId } from './daily';
import { isFileDb, loadPublishedCases } from './fileDb';

/**
 * "오늘의 사건은 무엇인가"를 서버에서 답하는 곳 (P4-B).
 *
 * `daily.ts`는 fs를 건드리지 않는 순수 로직이라 클라이언트에서도 쓸 수 있다.
 * 후보 목록을 읽는 이 파일만 서버 전용이다.
 */

/** 발행됐고 데일리로 낼 수 있는 사건 id. */
export async function dailyCandidateIds(): Promise<string[]> {
  if (isFileDb()) {
    return loadPublishedCases()
      .map((c) => c.id)
      .filter(isDailyCandidate);
  }

  const { createServiceClient } = await import('./supabase/server');
  const supabase = createServiceClient();
  const { data } = await supabase.from('cases').select('id').eq('status', 'published');
  return (data ?? []).map((c) => c.id as string).filter(isDailyCandidate);
}

/** 해당 날짜(KST)의 데일리 사건 id. 후보가 없으면 null. */
export async function getDailyCaseId(dateKey = kstDateKey()): Promise<string | null> {
  return pickDailyCaseId(await dailyCandidateIds(), dateKey);
}
