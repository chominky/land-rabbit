import { NextRequest, NextResponse } from 'next/server';
import { useFileDb, loadCase, mapSupabaseToCaseData } from '@/lib/fileDb';
import { callClaude, parseAIJson } from '@/lib/ai/claude';
import { buildJudgeSystemPrompt, buildVerdictSystemPrompt } from '@/lib/ai/prompts';
import { CaseData, Verdict, FactResult } from '@/lib/types';

// Test judge or verdict
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { type, input } = body; // type: 'judge' | 'verdict'

  let c: CaseData | null = null;

  if (useFileDb()) {
    c = loadCase(id);
  } else {
    const { createServiceClient } = await import('@/lib/supabase/server');
    const supabase = createServiceClient();
    const { data: caseData } = await supabase
      .from('cases')
      .select('*')
      .eq('id', id)
      .single();
    if (caseData) c = mapSupabaseToCaseData(caseData);
  }

  if (!c) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }

  if (type === 'judge') {
    const systemPrompt = buildJudgeSystemPrompt(
      c.truth,
      c.brief,
      c.keyFacts,
      c.imageMeta || []
    );

    try {
      const raw = await callClaude(systemPrompt, input);
      const result = parseAIJson<{ verdict: Verdict; comment: string; revealedFacts: string[] }>(raw);
      return NextResponse.json(result);
    } catch (err) {
      return NextResponse.json({ error: 'AI call failed', details: String(err) }, { status: 500 });
    }
  }

  if (type === 'verdict') {
    const systemPrompt = buildVerdictSystemPrompt(c.truth, c.keyFacts);

    try {
      const raw = await callClaude(systemPrompt, `[플레이어의 최종 추리]\n${input}`);
      const result = parseAIJson<{ results: FactResult[]; solved: boolean; accuracy: number; feedback: string }>(raw);

      // Verify evidence
      result.results = result.results.map((r: FactResult) => {
        if ((r.status === 'hit' || r.status === 'partial') && r.evidence) {
          const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
          if (!norm(input).includes(norm(r.evidence))) {
            return { ...r, status: 'miss' as const };
          }
        }
        if ((r.status === 'hit' || r.status === 'partial') && !r.evidence) {
          return { ...r, status: 'miss' as const };
        }
        return r;
      });

      // Re-check solved
      const required = c.keyFacts.filter((f) => f.required);
      result.solved = required.every((f) => {
        const fr = result.results.find((r: FactResult) => r.id === f.id);
        return fr?.status === 'hit';
      });

      return NextResponse.json(result);
    } catch (err) {
      return NextResponse.json({ error: 'AI call failed', details: String(err) }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
}
