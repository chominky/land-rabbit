import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { COST_PREVIEW } from '@/lib/gameConfig';
import { CaseData } from '@/lib/types';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const body = await request.json();
  const { playerId } = body;

  const supabase = createServiceClient();

  const { data: room } = await supabase
    .from('rooms')
    .select('*')
    .eq('code', code.toUpperCase())
    .single();

  if (!room || room.status !== 'playing') {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  const caseSnapshot = room.case_snapshot as unknown as CaseData;
  const totalImages = caseSnapshot.images?.length || 0;

  if (room.revealed_image_count >= totalImages) {
    return NextResponse.json({ error: '공개할 단서가 없습니다.' }, { status: 400 });
  }

  // Deduct tokens
  if (room.mode === 'coop') {
    const { data: result } = await supabase.rpc('deduct_shared_tokens', {
      p_room_id: room.id,
      p_cost: COST_PREVIEW,
    });
    if (result === -1) {
      return NextResponse.json({ error: '질문이 부족합니다.' }, { status: 400 });
    }
  } else {
    const { data: result } = await supabase.rpc('deduct_player_tokens', {
      p_player_id: playerId,
      p_cost: COST_PREVIEW,
    });
    if (result === -1) {
      return NextResponse.json({ error: '질문이 부족합니다.' }, { status: 400 });
    }
  }

  // Unlock next image
  const newCount = room.revealed_image_count + 1;
  await supabase
    .from('rooms')
    .update({ revealed_image_count: newCount })
    .eq('id', room.id);

  // Log event
  await supabase.from('room_events').insert({
    room_id: room.id,
    type: 'image_unlocked',
    payload: { imageIndex: newCount - 1, trigger: 'purchase', playerId },
  });

  return NextResponse.json({
    revealedImageCount: newCount,
    imageUnlocked: true,
  });
}
