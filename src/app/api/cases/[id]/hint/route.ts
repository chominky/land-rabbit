import { NextRequest, NextResponse } from 'next/server';
import { isFileDb, loadCase } from '@/lib/fileDb';
import { CaseData } from '@/lib/types';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { hintLevel } = body;

  let hints: string[] = [];

  if (isFileDb()) {
    const c = loadCase(id);
    if (!c) return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    hints = c.hints || [];
  } else {
    const { createServiceClient } = await import('@/lib/supabase/server');
    const supabase = createServiceClient();
    const { data: caseData } = await supabase
      .from('cases')
      .select('hints')
      .eq('id', id)
      .single();
    if (!caseData) return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    hints = (caseData as unknown as CaseData).hints || [];
  }

  if (hintLevel < 0 || hintLevel >= hints.length) {
    return NextResponse.json({ error: 'Invalid hint level' }, { status: 400 });
  }

  return NextResponse.json({ hint: hints[hintLevel] });
}
