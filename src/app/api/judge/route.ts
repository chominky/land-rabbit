import { NextRequest, NextResponse } from 'next/server';
import { callClaude, parseAIJson } from '@/lib/ai/claude';
import { buildJudgeSystemPrompt } from '@/lib/ai/prompts';
import { normalizeQuestion } from '@/lib/roomCode';
import { checkRateLimit } from '@/lib/rateLimit';
import { useFileDb, loadCase } from '@/lib/fileDb';
import {
  COST_QUESTION,
  INITIAL_TOKENS,
  AUTO_UNLOCK_INTERVAL,
  MAX_QUESTION_LENGTH,
  RATE_LIMIT_QUESTIONS_PER_MINUTE,
} from '@/lib/gameConfig';
import { CaseData, Verdict } from '@/lib/types';

type AIJudgeResponse = {
  verdict: Verdict;
  comment: string;
  revealedFacts: string[];
};

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    const rl = checkRateLimit(`judge:${ip}`, RATE_LIMIT_QUESTIONS_PER_MINUTE);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { caseId, question, playerId, roomCode } = body;

    if (!caseId || !question) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const trimmed = question.trim();
    if (!trimmed || trimmed.length > MAX_QUESTION_LENGTH) {
      return NextResponse.json(
        { error: `질문은 1~${MAX_QUESTION_LENGTH}자여야 합니다.` },
        { status: 400 }
      );
    }

    // === SINGLE PLAYER MODE (no roomCode) ===
    if (!roomCode) {
      return handleSinglePlayer(caseId, trimmed, body);
    }

    // === MULTIPLAYER MODE ===
    const { createServiceClient } = await import('@/lib/supabase/server');
    const supabase = createServiceClient();
    return handleMultiplayer(supabase, caseId, trimmed, playerId, roomCode);
  } catch (err) {
    console.error('Judge error:', err);
    return NextResponse.json(
      { error: '판정을 불러오지 못했습니다.' },
      { status: 500 }
    );
  }
}

async function handleSinglePlayer(
  caseId: string,
  question: string,
  body: Record<string, unknown>
) {
  // Load case from file or Supabase
  let c: CaseData | null = null;

  if (useFileDb()) {
    c = loadCase(caseId);
  } else {
    const { createServiceClient } = await import('@/lib/supabase/server');
    const supabase = createServiceClient();
    const { data: caseData } = await supabase
      .from('cases')
      .select('*')
      .eq('id', caseId)
      .single();
    if (caseData) c = caseData as unknown as CaseData;
  }

  if (!c) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }

  // Check duplicate from client-sent history
  const previousQuestions = (body.previousQuestions || []) as {
    text: string;
    verdict: string;
    comment: string;
    revealedFacts: string[];
  }[];
  const normalized = normalizeQuestion(question);
  const cached = previousQuestions.find(
    (q) => normalizeQuestion(q.text) === normalized
  );
  if (cached) {
    return NextResponse.json({
      verdict: cached.verdict,
      comment: '이미 물어본 질문입니다.',
      revealedFacts: cached.revealedFacts || [],
      cached: true,
    });
  }

  // Get current state from body
  const currentTokens = (body.tokens as number) ?? INITIAL_TOKENS;
  if (currentTokens < COST_QUESTION) {
    return NextResponse.json(
      { error: '토큰이 소진되었습니다.' },
      { status: 400 }
    );
  }

  // For single player, tokens are tracked client-side but we validate server-side
  const tokensAfter = currentTokens - COST_QUESTION;

  // AI call
  const revealedCount = (body.revealedImageCount as number) ?? 1;
  const revealedMeta = (c.imageMeta || []).filter(
    (m) => m.index < revealedCount
  );

  const systemPrompt = buildJudgeSystemPrompt(
    c.truth,
    c.brief,
    c.keyFacts,
    revealedMeta
  );

  let aiResult: AIJudgeResponse;
  try {
    const raw = await callClaude(systemPrompt, question);
    aiResult = parseAIJson<AIJudgeResponse>(raw);
  } catch {
    // Refund on failure
    return NextResponse.json(
      {
        error: '판정을 불러오지 못했습니다.',
        tokensLeft: currentTokens,
        refunded: true,
      },
      { status: 500 }
    );
  }

  // Validate verdict
  const validVerdicts: Verdict[] = [
    'YES',
    'NO',
    'MAYBE',
    'IRRELEVANT',
    'INVALID',
  ];
  if (!validVerdicts.includes(aiResult.verdict)) {
    aiResult.verdict = 'INVALID';
  }

  // INVALID = no token cost
  const finalTokens =
    aiResult.verdict === 'INVALID' ? currentTokens : tokensAfter;

  // Check image auto-unlock
  const totalQ = ((body.totalQuestions as number) ?? 0) + 1;
  const totalImages = c.images?.length ?? 0;
  let imageUnlocked = false;
  let newRevealedCount = revealedCount;

  if (
    totalQ % AUTO_UNLOCK_INTERVAL === 0 &&
    newRevealedCount < totalImages
  ) {
    newRevealedCount++;
    imageUnlocked = true;
  }

  // Filter revealedFacts to only valid keyFact ids
  const validIds = c.keyFacts.map((f) => f.id);
  const revealedFacts = (aiResult.revealedFacts || []).filter((id) =>
    validIds.includes(id)
  );

  // Only reveal facts on YES or NO
  const finalRevealedFacts =
    aiResult.verdict === 'YES' || aiResult.verdict === 'NO'
      ? revealedFacts
      : [];

  return NextResponse.json({
    verdict: aiResult.verdict,
    comment: aiResult.comment || '',
    revealedFacts: finalRevealedFacts,
    tokensLeft: finalTokens,
    imageUnlocked,
    revealedImageCount: newRevealedCount,
    totalQuestions: totalQ,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleMultiplayer(
  supabase: any,
  caseId: string,
  question: string,
  playerId: string,
  roomCode: string
) {
  // Get room
  const { data: room } = await supabase
    .from('rooms')
    .select('*')
    .eq('code', roomCode)
    .single();

  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  if (room.status !== 'playing') {
    return NextResponse.json(
      { error: '게임이 진행 중이 아닙니다.' },
      { status: 400 }
    );
  }

  // Verify player
  const { data: player } = await supabase
    .from('room_players')
    .select('*')
    .eq('id', playerId)
    .eq('room_id', room.id)
    .single();

  if (!player) {
    return NextResponse.json({ error: 'Player not found' }, { status: 404 });
  }

  if (player.is_spectator) {
    return NextResponse.json(
      { error: '관전자는 질문할 수 없습니다.' },
      { status: 403 }
    );
  }

  // Check cooldown
  if (player.cooldown_until && new Date(player.cooldown_until) > new Date()) {
    return NextResponse.json(
      { error: '오답 패널티로 질문이 제한됩니다.' },
      { status: 403 }
    );
  }

  // Versus mode: turn check
  if (room.mode === 'versus' && room.turn_player_id !== playerId) {
    return NextResponse.json(
      { error: '현재 당신의 턴이 아닙니다.' },
      { status: 403 }
    );
  }

  // Check duplicate in room questions
  const { data: prevQuestions } = await supabase
    .from('room_questions')
    .select('text, verdict, comment, revealed_facts')
    .eq('room_id', room.id);

  const normalized = normalizeQuestion(question);
  const cached = prevQuestions?.find(
    (q: { text: string }) => normalizeQuestion(q.text) === normalized
  );
  if (cached) {
    return NextResponse.json({
      verdict: cached.verdict,
      comment: '이미 물어본 질문입니다.',
      revealedFacts: cached.revealed_facts || [],
      cached: true,
    });
  }

  // Atomic token deduction
  let tokensLeft: number;
  if (room.mode === 'coop') {
    const { data: result } = await supabase.rpc('deduct_shared_tokens', {
      p_room_id: room.id,
      p_cost: COST_QUESTION,
    });
    if (result === -1) {
      return NextResponse.json(
        { error: '토큰이 소진되었습니다.' },
        { status: 400 }
      );
    }
    tokensLeft = result;
  } else {
    const { data: result } = await supabase.rpc('deduct_player_tokens', {
      p_player_id: playerId,
      p_cost: COST_QUESTION,
    });
    if (result === -1) {
      return NextResponse.json(
        { error: '토큰이 소진되었습니다.' },
        { status: 400 }
      );
    }
    tokensLeft = result;
  }

  // Load case from snapshot
  const caseSnapshot = room.case_snapshot as unknown as CaseData;
  if (!caseSnapshot) {
    return NextResponse.json({ error: 'Case data missing' }, { status: 500 });
  }

  const revealedMeta = (caseSnapshot.imageMeta || []).filter(
    (m: { index: number }) => m.index < room.revealed_image_count
  );

  const systemPrompt = buildJudgeSystemPrompt(
    caseSnapshot.truth,
    caseSnapshot.brief,
    caseSnapshot.keyFacts,
    revealedMeta
  );

  let aiResult: AIJudgeResponse;
  try {
    const raw = await callClaude(systemPrompt, question);
    aiResult = parseAIJson<AIJudgeResponse>(raw);
  } catch {
    // Refund on failure
    if (room.mode === 'coop') {
      await supabase.rpc('refund_shared_tokens', {
        p_room_id: room.id,
        p_amount: COST_QUESTION,
      });
    } else {
      await supabase.rpc('refund_player_tokens', {
        p_player_id: playerId,
        p_amount: COST_QUESTION,
      });
    }
    return NextResponse.json(
      { error: '판정을 불러오지 못했습니다.' },
      { status: 500 }
    );
  }

  const validVerdicts: Verdict[] = [
    'YES',
    'NO',
    'MAYBE',
    'IRRELEVANT',
    'INVALID',
  ];
  if (!validVerdicts.includes(aiResult.verdict)) {
    aiResult.verdict = 'INVALID';
  }

  // INVALID = refund
  if (aiResult.verdict === 'INVALID') {
    if (room.mode === 'coop') {
      await supabase.rpc('refund_shared_tokens', {
        p_room_id: room.id,
        p_amount: COST_QUESTION,
      });
      tokensLeft += COST_QUESTION;
    } else {
      await supabase.rpc('refund_player_tokens', {
        p_player_id: playerId,
        p_amount: COST_QUESTION,
      });
      tokensLeft += COST_QUESTION;
    }
  }

  // Filter revealedFacts
  const validIds = caseSnapshot.keyFacts.map((f: { id: string }) => f.id);
  const revealedFacts =
    aiResult.verdict === 'YES' || aiResult.verdict === 'NO'
      ? (aiResult.revealedFacts || []).filter((id: string) =>
          validIds.includes(id)
        )
      : [];

  // Increment question count and check auto-unlock
  const { data: qResult } = await supabase.rpc('increment_questions', {
    p_room_id: room.id,
  });

  const imageUnlocked = qResult?.imageUnlocked || false;

  // Save question to room_questions
  await supabase.from('room_questions').insert({
    room_id: room.id,
    player_id: playerId,
    text: question,
    verdict: aiResult.verdict,
    comment: aiResult.comment || '',
    revealed_facts: revealedFacts,
  });

  // Save image unlock event
  if (imageUnlocked) {
    await supabase.from('room_events').insert({
      room_id: room.id,
      type: 'image_unlocked',
      payload: {
        imageIndex: qResult.revealedImageCount - 1,
        trigger: 'auto',
      },
    });
  }

  // Advance turn in versus mode
  if (room.mode === 'versus') {
    const { data: players } = await supabase
      .from('room_players')
      .select('id')
      .eq('room_id', room.id)
      .eq('is_spectator', false)
      .order('joined_at');

    if (players && players.length > 0) {
      const currentIdx = players.findIndex((p: { id: string }) => p.id === playerId);
      const nextIdx = (currentIdx + 1) % players.length;
      await supabase
        .from('rooms')
        .update({
          turn_player_id: players[nextIdx].id,
          turn_deadline: new Date(
            Date.now() + 60_000
          ).toISOString(),
        })
        .eq('id', room.id);
    }
  }

  return NextResponse.json({
    verdict: aiResult.verdict,
    comment: aiResult.comment || '',
    revealedFacts,
    tokensLeft,
    imageUnlocked,
    totalQuestions: qResult?.totalQuestions,
    revealedImageCount: qResult?.revealedImageCount,
  });
}
