import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminGuard';
import { callClaude, parseAIJson } from '@/lib/ai/claude';
import { buildBriefLeakCheckPrompt } from '@/lib/ai/prompts';
import { isFileDb, loadCase, mapSupabaseToCaseData } from '@/lib/fileDb';
import type { CaseData } from '@/lib/types';

/**
 * 개요(brief)가 전말(truth)을 누설하는지 AI로 확인한다 (P3-B).
 *
 * 편집 중인 값을 그대로 검사할 수 있게 body의 brief/truth를 우선 쓰고,
 * 없으면 저장된 사건에서 읽는다.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  let brief: string | undefined = body.brief;
  let truth: string | undefined = body.truth;

  if (!brief || !truth) {
    let c: CaseData | null = null;
    if (isFileDb()) {
      c = loadCase(id);
    } else {
      const { createServiceClient } = await import('@/lib/supabase/server');
      const supabase = createServiceClient();
      const { data } = await supabase.from('cases').select('*').eq('id', id).single();
      if (data) c = mapSupabaseToCaseData(data);
    }
    if (!c) return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    brief = brief || c.brief;
    truth = truth || c.truth;
  }

  if (!brief?.trim() || !truth?.trim()) {
    return NextResponse.json(
      { error: '개요와 전말을 모두 입력해야 검사할 수 있습니다.' },
      { status: 400 }
    );
  }

  try {
    const raw = await callClaude(buildBriefLeakCheckPrompt(brief, truth), '검사해줘');
    const result = parseAIJson<{ leaked: boolean; reason: string }>(raw);
    return NextResponse.json({ leaked: !!result.leaked, reason: result.reason ?? '' });
  } catch (err) {
    return NextResponse.json(
      { error: '누설 검사를 실행하지 못했습니다.', details: String(err) },
      { status: 500 }
    );
  }
}
