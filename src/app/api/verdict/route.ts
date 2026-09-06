import { NextRequest, NextResponse } from 'next/server';
import { callClaude, parseAIJson } from '@/lib/ai/claude';
import { buildVerdictSystemPrompt } from '@/lib/ai/prompts';
import { kstDateKey } from '@/lib/daily';
import { getDailyCaseId } from '@/lib/dailyCase';
import { isFileDb, loadCase, mapSupabaseToCaseData } from '@/lib/fileDb';
import { saveRecord } from '@/lib/history';
import { plausibleTokens, submitResult } from '@/lib/leaderboard';
import { checkRateLimit } from '@/lib/rateLimit';
import {
  COST_WRONG_ANSWER,
  MAX_FINAL_ATTEMPTS,
  MAX_ANSWER_LENGTH,
  RATE_LIMIT_VERDICTS_PER_MINUTE,
  WRONG_ANSWER_COOLDOWN_SECONDS,
  calculateScore,
  getRank,
} from '@/lib/gameConfig';
import { CaseData, FactResult } from '@/lib/types';

/** 데일리 순위 정보. 오늘의 사건을 클리어했을 때만 붙는다 (P4-B). */
type DailyResult = {
  dateKey: string;
  position: number;
  total: number;
  nickname: string;
  improved: boolean;
};

type AIVerdictResponse = {
  results: FactResult[];
  solved: boolean;
  accuracy: number;
  feedback: string;
};

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    const rl = checkRateLimit(`verdict:${ip}`, RATE_LIMIT_VERDICTS_PER_MINUTE);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
        { status: 429 }
      );
    }

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
  const attemptsUsed = (body.attemptsUsed as number) ?? 0;
  const questions = ((body.questions || body.previousQuestions || []) as {
    text: string;
    verdict: string;
  }[]).map((q) => ({ text: q.text, verdict: q.verdict }));

  // 단일 플레이는 진행 상황이 클라이언트에 있다. 최소한 "질문 수·오답 수로
  // 가능한 최대치"를 넘는 토큰은 잘라낸다 — 점수가 그대로 부풀지 않게 (P4-B).
  const currentTokens = plausibleTokens(
    (body.tokens as number) ?? 0,
    questions.length,
    attemptsUsed
  );

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
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  try {
    await saveRecord({
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

  const daily = aiResult.solved
    ? await recordDaily({
        caseId,
        nickname: body.nickname,
        tokensLeft: tokensAfterPenalty,
        totalQuestions: questions.length,
        attemptsUsed,
        accuracy: aiResult.accuracy,
        ip,
      })
    : undefined;

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
    daily,
  });
}

/**
 * 오늘의 사건을 클리어했으면 리더보드에 남긴다 (P4-B).
 *
 * 점수는 여기서, 서버가 계산한 값으로만 기록한다 — 클라이언트가 점수를
 * 올려 보낼 통로는 없다. 리더보드가 죽어도 채점 응답은 나가야 하므로
 * 실패는 삼킨다.
 */
async function recordDaily(input: {
  caseId: string;
  nickname: unknown;
  tokensLeft: number;
  totalQuestions: number;
  attemptsUsed: number;
  accuracy: number;
  ip: string;
}): Promise<DailyResult | undefined> {
  try {
    const dateKey = kstDateKey();
    if ((await getDailyCaseId(dateKey)) !== input.caseId) return undefined;

    const result = await submitResult({
      dateKey,
      caseId: input.caseId,
      nickname: typeof input.nickname === 'string' ? input.nickname : '',
      reportedTokensLeft: input.tokensLeft,
      totalQuestions: input.totalQuestions,
      attemptsUsed: input.attemptsUsed,
      accuracy: input.accuracy,
      ip: input.ip,
    });

    return {
      dateKey,
      position: result.position,
      total: result.total,
      nickname: result.entry.nickname,
      improved: result.improved,
    };
  } catch (err) {
    console.error('Failed to record daily leaderboard entry:', err);
    return undefined;
  }
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
