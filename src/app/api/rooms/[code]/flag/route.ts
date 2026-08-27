import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const body = await request.json();
  const { questionId } = body;

  const supabase = createServiceClient();

  const { data: room } = await supabase
    .from('rooms')
    .select('id, case_id')
    .eq('code', code.toUpperCase())
    .single();

  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  // Mark question as flagged
  await supabase
    .from('room_questions')
    .update({ flagged: true })
    .eq('id', questionId);

  // Get question data for flag record
  const { data: question } = await supabase
    .from('room_questions')
    .select('*')
    .eq('id', questionId)
    .single();

  if (question) {
    await supabase.from('flags').insert({
      case_id: room.case_id,
      room_id: room.id,
      question_id: questionId,
      question_text: question.text,
      verdict_or_status: question.verdict,
      type: 'judge',
    });

    // Increment flag count on case (best effort)
    const { data: caseRow } = await supabase
      .from('cases')
      .select('flag_count')
      .eq('id', room.case_id)
      .single();
    if (caseRow) {
      await supabase
        .from('cases')
        .update({ flag_count: (caseRow.flag_count || 0) + 1 })
        .eq('id', room.case_id);
    }
  }

  return NextResponse.json({ success: true });
}
