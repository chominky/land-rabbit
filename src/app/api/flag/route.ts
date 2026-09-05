import { NextRequest, NextResponse } from 'next/server';
import { addFlag } from '@/lib/flags';

// 플레이어가 판정을 신고한다. 파일 DB / Supabase 양쪽에 저장된다.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { caseId, questionText, verdict } = body;

  if (!caseId || !verdict) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  await addFlag({
    case_id: caseId,
    question_text: questionText ?? null,
    answer_text: null,
    verdict_or_status: String(verdict),
    evidence: null,
    ai_response: null,
    type: 'judge',
  });

  return NextResponse.json({ success: true });
}
