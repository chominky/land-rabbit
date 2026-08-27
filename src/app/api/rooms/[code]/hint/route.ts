import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { COST_HINT } from '@/lib/gameConfig';
import { CaseData } from '@/lib/types';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const body = await request.json();
  const { playerId, hintLevel } = body;

  const supabase = createServiceClient();

  const { data: room } = await supabase
    .from('rooms')
    .select('*')
    .eq('code', code.toUpperCase())
    .single();

  if (!room || room.status !== 'playing') {
    return NextResponse.json({ error: 'Room not found or not playing' }, { status: 404 });
  }

  const caseSnapshot = room.case_snapshot as unknown as CaseData;
  const hints = caseSnapshot.hints || [];

  if (hintLevel < 0 || hintLevel >= hints.length) {
    return NextResponse.json({ error: 'Invalid hint level' }, { status: 400 });
  }

  // Deduct tokens
  if (room.mode === 'coop') {
    const { data: result } = await supabase.rpc('deduct_shared_tokens', {
      p_room_id: room.id,
      p_cost: COST_HINT,
    });
    if (result === -1) {
      return NextResponse.json({ error: '토큰이 부족합니다.' }, { status: 400 });
    }
  } else {
    const { data: result } = await supabase.rpc('deduct_player_tokens', {
      p_player_id: playerId,
      p_cost: COST_HINT,
    });
    if (result === -1) {
      return NextResponse.json({ error: '토큰이 부족합니다.' }, { status: 400 });
    }
  }

  // Log event
  await supabase.from('room_events').insert({
    room_id: room.id,
    type: 'hint_purchased',
    payload: { playerId, hintLevel, hint: hints[hintLevel] },
  });

  return NextResponse.json({ hint: hints[hintLevel] });
}
