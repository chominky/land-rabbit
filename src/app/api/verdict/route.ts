import { NextRequest, NextResponse } from 'next/server';
import { callClaude, parseAIJson } from '@/lib/ai/claude';
import { buildVerdictSystemPrompt } from '@/lib/ai/prompts';
import { isFileDb, loadCase, saveGameRecord, mapSupabaseToCaseData } from '@/lib/fileDb';
import {
  COST_WRONG_ANSWER,
  MAX_FINAL_ATTEMPTS,
  MAX_ANSWER_LENGTH,
  WRONG_ANSWER_COOLDOWN_SECONDS,
  calculateScore,
  getRank,
} from '@/lib/gameConfig';
import { CaseData, FactResult } from '@/lib/types';

type AIVerdictResponse = {
  results: FactResult[];
  solved: boolean;
  accuracy: number;
  feedback: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { caseId, answer, playerId, roomCode } = body;

    if (!caseId || !answer) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const trimmed = answer.trim();
    if (!trimmed || trimmed.length > MAX_ANSWER_LENGTH) {
      return NextResponse.json(
        { error: `답변은 1~${MAX_ANSWER_LENGTH}자여야 합니다.` },
        { status: 400 }
      );
    }

    if (!roomCode) {
      return handleSingleVerdict(caseId, trimmed, body, request);
    }

    return handleMultiVerdict(caseId, trimmed, playerId, roomCode);
  } catch (err) {
    console.error('Verdict error:', err);
    return NextResponse.json(
      { error: '채점을 불러오지 못했습니다.' },
      { status: 500 }
    );
  }
}

async function handleSingleVerdict(
  caseId: string,
  answer: string,
  body: Record<string, unknown>,
  request: NextRequest
) {
  let c: CaseData | null = null;

  if (isFileDb()) {
    c = loadCase(caseId);
  } else {
    const { createServiceClient } = await import('@/lib/supabase/server');
    const supabase = createServiceClient();
    const { data: caseData } = await supabase
      .from('cases')
      .select('*')
      .eq('id', caseId)
      .single();
    if (caseData) c = mapSupabaseToCaseData(caseData);
  }

  if (!c) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }
  const currentTokens = (body.tokens as number) ?? 0;
  const attemptsUsed = (body.attemptsUsed as number) ?? 0;

  if (attemptsUsed >= MAX_FINAL_ATTEMPTS) {
    return NextResponse.json(
      { error: '최종 추리 시도 횟수를 초과했습니다.' },
      { status: 400 }
    );
  }

  const systemPrompt = buildVerdictSystemPrompt(c.truth, c.keyFacts);
  let aiResult: AIVerdictResponse;

  try {
    const raw = await callClaude(systemPrompt, `[플레이어의 최종 추리]\n${answer}`);
    aiResult = parseAIJson<AIVerdictResponse>(raw);
  } catch {
    return NextResponse.json(
      { error: '채점을 불러오지 못했습니다.' },
      { status: 500 }
    );
  }

  // Evidence verification: check that evidence actually exists in the answer
  aiResult.results = verifyEvidence(aiResult.results, answer);

  // Re-evaluate solved based on verified results
  const requiredFacts = c.keyFacts.filter((f) => f.required);
  const allRequiredHit = requiredFacts.every((f) => {
    const r = aiResult.results.find((res) => res.id === f.id);
    return r?.status === 'hit';
  });
  aiResult.solved = allRequiredHit;

  // Calculate accuracy
  const totalFacts = c.keyFacts.length;
  const hitCount = aiResult.results.filter((r) => r.status === 'hit').length;
  const partialCount = aiResult.results.filter(
    (r) => r.status === 'partial'
  ).length;
  aiResult.accuracy = Math.round(
    ((hitCount + partialCount * 0.3) / totalFacts) * 100
  );

  const tokensAfterPenalty = aiResult.solved
    ? currentTokens
    : Math.max(0, currentTokens - COST_WRONG_ANSWER);

  const score = aiResult.solved
    ? calculateScore(tokensAfterPenalty, aiResult.accuracy)
    : 0;
  const rank = aiResult.solved ? getRank(score) : 'D';

  // If solved or game over, include truth
  const gameOver =
    !aiResult.solved &&
    (attemptsUsed + 1 >= MAX_FINAL_ATTEMPTS || tokensAfterPenalty <= 0);

  // Save game record on every final answer submission
  try {
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    const questions = ((body.questions || body.previousQuestions || []) as { text: string; verdict: string }[])
      .map((q) => ({ text: q.text, verdict: q.verdict }));
    saveGameRecord({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      caseId,
      caseTitle: c.title,
      ip,
      solved: aiResult.solved,
      score: aiResult.solved ? score : undefined,
      rank: aiResult.solved ? rank : 'D',
      accuracy: aiResult.accuracy,
      tokensLeft: tokensAfterPenalty,
      totalQuestions: questions.length,
      questions,
      finalAnswer: answer,
      finishedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Failed to save game record:', err);
  }

  return NextResponse.json({
    results: aiResult.results,
    solved: aiResult.solved,
    accuracy: aiResult.accuracy,
    feedback: aiResult.feedback,
    tokensLeft: tokensAfterPenalty,
    score: aiResult.solved ? score : undefined,
    rank: aiResult.solved ? rank : gameOver ? 'D' : undefined,
    truth: aiResult.solved || gameOver ? c.truth : undefined,
    gameOver,
  });
}

async function handleMultiVerdict(
  caseId: string,
  answer: string,
  playerId: string,
  roomCode: string
) {
  const { createServiceClient } = await import('@/lib/supabase/server');
  const supabase = createServiceClient();

  const { data: room } = await supabase
    .from('rooms')
    .select('*')
    .eq('code', roomCode)
    .single();

  if (!room || room.status !== 'playing') {
    return NextResponse.json({ error: 'Room not found or not playing' }, { status: 404 });
  }

  const { data: player } = await supabase
    .from('room_players')
    .select('*')
    .eq('id', playerId)
    .eq('room_id', room.id)
    .single();

  if (!player || player.is_spectator) {
    return NextResponse.json({ error: 'Not a player' }, { status: 403 });
  }

  if (player.attempts_used >= MAX_FINAL_ATTEMPTS) {
    return NextResponse.json(
      { error: '최종 추리 시도 횟수를 초과했습니다.' },
      { status: 400 }
    );
  }

  if (player.solved_at) {
    return NextResponse.json(
      { error: '이미 정답을 맞히셨습니다.' },
      { status: 400 }
    );
  }

  const caseSnapshot = room.case_snapshot as unknown as CaseData;
  const systemPrompt = buildVerdictSystemPrompt(
    caseSnapshot.truth,
    caseSnapshot.keyFacts
  );

  let aiResult: AIVerdictResponse;
  try {
    const raw = await callClaude(systemPrompt, `[플레이어의 최종 추리]\n${answer}`);
    aiResult = parseAIJson<AIVerdictResponse>(raw);
  } catch {
    return NextResponse.json(
      { error: '채점을 불러오지 못했습니다.' },
      { status: 500 }
    );
  }

  aiResult.results = verifyEvidence(aiResult.results, answer);

  const requiredFacts = caseSnapshot.keyFacts.filter(
    (f: { required: boolean }) => f.required
  );
  const allRequiredHit = requiredFacts.every(
    (f: { id: string }) => {
      const r = aiResult.results.find((res) => res.id === f.id);
      return r?.status === 'hit';
    }
  );
  aiResult.solved = allRequiredHit;

  // Update player
  const updates: Record<string, unknown> = {
    attempts_used: player.attempts_used + 1,
  };

  if (aiResult.solved) {
    // Count already solved players for ranking
    const { data: solvedPlayers } = await supabase
      .from('room_players')
      .select('id')
      .eq('room_id', room.id)
      .not('solved_at', 'is', null);

    const currentRank = (solvedPlayers?.length || 0) + 1;
    const tokens =
      room.mode === 'coop' ? room.shared_tokens : player.tokens;
    const totalFacts = caseSnapshot.keyFacts.length;
    const hitCount = aiResult.results.filter(
      (r: FactResult) => r.status === 'hit'
    ).length;
    const accuracy = Math.round((hitCount / totalFacts) * 100);
    const score = calculateScore(tokens, accuracy);

    updates.solved_at = new Date().toISOString();
    updates.rank = currentRank;
    updates.score = score;
  } else {
    // Wrong answer: deduct tokens + cooldown
    if (room.mode === 'coop') {
      await supabase.rpc('deduct_shared_tokens', {
        p_room_id: room.id,
        p_cost: COST_WRONG_ANSWER,
      });
    } else {
      await supabase.rpc('deduct_player_tokens', {
        p_player_id: playerId,
        p_cost: COST_WRONG_ANSWER,
      });
    }
    updates.cooldown_until = new Date(
      Date.now() + WRONG_ANSWER_COOLDOWN_SECONDS * 1000
    ).toISOString();
  }

  await supabase
    .from('room_players')
    .update(updates)
    .eq('id', playerId);

  // Log event
  await supabase.from('room_events').insert({
    room_id: room.id,
    type: aiResult.solved ? 'player_solved' : 'wrong_answer',
    payload: {
      playerId,
      nickname: player.nickname,
      solved: aiResult.solved,
      accuracy: aiResult.accuracy,
      answer,
      feedback: aiResult.feedback,
    },
  });

  // Flag partial results for admin review
  const hasPartial = aiResult.results.some(
    (r: FactResult) => r.status === 'partial'
  );
  if (hasPartial && !aiResult.solved) {
    await supabase.from('flags').insert({
      case_id: caseId,
      room_id: room.id,
      answer_text: answer,
      verdict_or_status: 'partial',
      ai_response: aiResult as unknown as Record<string, unknown>,
      type: 'verdict',
    });
  }

  // Check if game should end
  const { data: allPlayers } = await supabase
    .from('room_players')
    .select('*')
    .eq('room_id', room.id)
    .eq('is_spectator', false);

  const allDone = allPlayers?.every(
    (p: { solved_at: string | null; attempts_used: number; tokens: number }) =>
      p.solved_at ||
      p.attempts_used >= MAX_FINAL_ATTEMPTS ||
      (room.mode === 'versus' && p.tokens <= 0)
  );

  const sharedTokensOut =
    room.mode === 'coop' && room.shared_tokens <= 0;

  if (allDone || sharedTokensOut) {
    await supabase
      .from('rooms')
      .update({ status: 'finished' })
      .eq('id', room.id);
  }

  const tokens =
    room.mode === 'coop' ? room.shared_tokens : player.tokens;

  return NextResponse.json({
    results: aiResult.results,
    solved: aiResult.solved,
    accuracy: aiResult.accuracy,
    feedback: aiResult.feedback,
    tokensLeft:
      aiResult.solved
        ? tokens
        : tokens - (aiResult.solved ? 0 : COST_WRONG_ANSWER),
    score: aiResult.solved ? (updates.score as number) : undefined,
    rank: aiResult.solved ? getRank(updates.score as number) : undefined,
    truth: aiResult.solved ? caseSnapshot.truth : undefined,
  });
}

function verifyEvidence(results: FactResult[], answer: string): FactResult[] {
  return results.map((r) => {
    if (r.status === 'hit' || r.status === 'partial') {
      if (!r.evidence || r.evidence.trim() === '') {
        return { ...r, status: 'miss' as const, evidence: '' };
      }
      // Normalize whitespace for comparison
      const normalizedEvidence = r.evidence.replace(/\s+/g, ' ').trim();
      const normalizedAnswer = answer.replace(/\s+/g, ' ').trim();
      if (!normalizedAnswer.includes(normalizedEvidence)) {
        return { ...r, status: 'miss' as const };
      }
    }
    return r;
  });
}
