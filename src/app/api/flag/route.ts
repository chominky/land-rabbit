import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { caseId, questionText, verdict } = body;

  const supabase = createServiceClient();

  await supabase.from('flags').insert({
    case_id: caseId,
    question_text: questionText,
    verdict_or_status: verdict,
    type: 'judge',
  });

  return NextResponse.json({ success: true });
}
