import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminGuard';
import { callClaude, parseAIJson } from '@/lib/ai/claude';
import { buildJudgeSystemPrompt } from '@/lib/ai/prompts';
import { isFileDb, loadCase, mapSupabaseToCaseData } from '@/lib/fileDb';
import { GoldenRunResult, listGolden, summarizeRun } from '@/lib/golden';
import type { CaseData, Verdict } from '@/lib/types';

/**
 * 골든셋 전체를 현재 판정 프롬프트로 돌린다 (P3-D).
 *
 * 관리자 화면과 `npm run test:judge`가 **이 한 곳**을 호출한다.
 * 실행 로직이 둘로 갈라져 있으면 "CLI와 웹 결과가 일치한다"를 보장할 수 없다.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;

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

  const tests = await listGolden(id);
  const systemPrompt = buildJudgeSystemPrompt(c.truth, c.brief, c.keyFacts, c.imageMeta || []);

  const results: GoldenRunResult[] = [];
  for (const t of tests) {
    let actual: Verdict | 'ERROR' = 'ERROR';
    let comment: string | undefined;
    try {
      const raw = await callClaude(systemPrompt, t.question);
      const parsed = parseAIJson<{ verdict: Verdict; comment: string }>(raw);
      actual = parsed.verdict;
      comment = parsed.comment;
    } catch {
      actual = 'ERROR';
    }
    results.push({
      id: t.id,
      question: t.question,
      expected: t.expected_verdict,
      actual,
      comment,
      pass: actual === t.expected_verdict,
    });
  }

  return NextResponse.json(summarizeRun(id, results));
}
