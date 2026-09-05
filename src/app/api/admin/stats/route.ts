import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminGuard';
import { isFileDb } from '@/lib/fileDb';
import { loadRecords, summarize } from '@/lib/history';

/** 사건별 신고 수. 파일 DB 모드에는 신고 저장소가 없어 빈 맵을 돌려준다. */
async function loadFlagCounts(): Promise<Record<string, number>> {
  if (isFileDb()) return {};
  try {
    const { createServiceClient } = await import('@/lib/supabase/server');
    const supabase = createServiceClient();
    const { data } = await supabase.from('flags').select('case_id');
    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      const id = (row as { case_id: string | null }).case_id;
      if (!id) continue;
      counts[id] = (counts[id] ?? 0) + 1;
    }
    return counts;
  } catch {
    return {};
  }
}

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const [records, flagCounts] = await Promise.all([loadRecords(), loadFlagCounts()]);
  return NextResponse.json({
    ...summarize(records, flagCounts),
    source: isFileDb() ? 'file' : 'supabase',
  });
}
