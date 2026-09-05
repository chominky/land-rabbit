import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminGuard';
import { getFlag, setFlagStatus } from '@/lib/flags';
import { isFileDb, loadCase, mapSupabaseToCaseData, saveCase } from '@/lib/fileDb';
import type { CaseData } from '@/lib/types';

/**
 * 신고된 표현을 사건 데이터에 바로 반영한다 (P3-C).
 *
 * body: { factId: string, target: 'accept' | 'reject', text?: string, resolve?: boolean }
 *
 * text를 주지 않으면 신고된 질문(또는 최종 추리)을 그대로 쓴다.
 * 화면을 벗어나지 않고 신고 -> 반영 -> 상태 처리까지 끝낼 수 있게,
 * resolve가 true면 반영과 동시에 신고를 resolved로 넘긴다.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { factId, target, resolve } = body as {
    factId?: string;
    target?: 'accept' | 'reject';
    resolve?: boolean;
  };

  if (!factId || (target !== 'accept' && target !== 'reject')) {
    return NextResponse.json(
      { error: 'factId와 target(accept|reject)이 필요합니다.' },
      { status: 400 }
    );
  }

  const flag = await getFlag(id);
  if (!flag) return NextResponse.json({ error: 'Flag not found' }, { status: 404 });

  const text: string = (body.text ?? flag.question_text ?? flag.answer_text ?? '').trim();
  if (!text) {
    return NextResponse.json({ error: '반영할 문장이 비어 있습니다.' }, { status: 400 });
  }

  // ── 사건 로드 ──────────────────────────────────────────────────────────────
  let c: CaseData | null = null;
  if (isFileDb()) {
    c = loadCase(flag.case_id);
  } else {
    const { createServiceClient } = await import('@/lib/supabase/server');
    const supabase = createServiceClient();
    const { data } = await supabase.from('cases').select('*').eq('id', flag.case_id).single();
    if (data) c = mapSupabaseToCaseData(data);
  }
  if (!c) return NextResponse.json({ error: 'Case not found' }, { status: 404 });

  const fact = c.keyFacts.find((f) => f.id === factId);
  if (!fact) return NextResponse.json({ error: '핵심 요소를 찾지 못했습니다.' }, { status: 404 });

  const key = target === 'accept' ? 'acceptExamples' : 'rejectExamples';
  const existing = (fact[key] ?? []).filter(Boolean);
  if (existing.includes(text)) {
    return NextResponse.json({ error: '이미 등록된 예시입니다.', duplicated: true }, { status: 409 });
  }

  const keyFacts = c.keyFacts.map((f) =>
    f.id === factId ? { ...f, [key]: [...existing, text] } : f
  );

  // ── 저장 ──────────────────────────────────────────────────────────────────
  if (isFileDb()) {
    saveCase({ ...c, keyFacts });
  } else {
    const { createServiceClient } = await import('@/lib/supabase/server');
    const supabase = createServiceClient();
    const { error } = await supabase
      .from('cases')
      .update({ key_facts: keyFacts, updated_at: new Date().toISOString() })
      .eq('id', flag.case_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (resolve) {
    await setFlagStatus(id, 'resolved', `${fact.label || factId} — ${key}에 반영`);
  }

  return NextResponse.json({
    success: true,
    caseId: flag.case_id,
    factLabel: fact.label || factId,
    target,
    text,
  });
}
