import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { generateRoomCode } from '@/lib/roomCode';
import { INITIAL_TOKENS, MAX_PLAYERS } from '@/lib/gameConfig';
import { CaseData } from '@/lib/types';
import { useFileDb, loadCase } from '@/lib/fileDb';

// Create room
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { caseId, nickname, mode = 'coop' } = body;

    if (!caseId || !nickname) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    if (!['coop', 'versus'].includes(mode)) {
      return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Verify case exists and is published
    let caseData: CaseData | null = null;
    if (useFileDb()) {
      caseData = loadCase(caseId);
      if (caseData && caseData.status !== 'published') caseData = null;
    } else {
      const { data } = await supabase
        .from('cases')
        .select('*')
        .eq('id', caseId)
        .eq('status', 'published')
        .single();
      if (data) caseData = data as unknown as CaseData;
    }

    if (!caseData) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    // Generate unique room code
    let code: string;
    let attempts = 0;
    do {
      code = generateRoomCode();
      const { data: existing } = await supabase
        .from('rooms')
        .select('id')
        .eq('code', code)
        .single();
      if (!existing) break;
      attempts++;
    } while (attempts < 10);

    if (attempts >= 10) {
      return NextResponse.json(
        { error: 'Failed to generate room code' },
        { status: 500 }
      );
    }

    // Create room with case snapshot (truth never goes to client)
    const c = caseData;
    const caseSnapshot = {
      id: c.id,
      title: c.title,
      difficulty: c.difficulty,
      tags: c.tags,
      brief: c.brief,
      truth: c.truth,
      images: c.images,
      imageMeta: c.imageMeta,
      keyFacts: c.keyFacts,
      redHerrings: c.redHerrings,
      hints: c.hints,
    };

    // Create room first without host_player_id
    const { data: room, error: roomErr } = await supabase
      .from('rooms')
      .insert({
        code,
        case_id: caseId,
        mode,
        status: 'lobby',
        shared_tokens: INITIAL_TOKENS,
        revealed_image_count: 1,
        total_questions: 0,
        case_snapshot: caseSnapshot,
      })
      .select()
      .single();

    if (roomErr || !room) {
      return NextResponse.json(
        { error: 'Failed to create room' },
        { status: 500 }
      );
    }

    // Create host player
    const { data: player, error: playerErr } = await supabase
      .from('room_players')
      .insert({
        room_id: room.id,
        nickname,
        is_host: true,
        is_spectator: false,
        tokens: INITIAL_TOKENS,
      })
      .select()
      .single();

    if (playerErr || !player) {
      return NextResponse.json(
        { error: 'Failed to create player' },
        { status: 500 }
      );
    }

    // Update room with host_player_id
    await supabase
      .from('rooms')
      .update({ host_player_id: player.id })
      .eq('id', room.id);

    return NextResponse.json({
      roomCode: code,
      roomId: room.id,
      playerId: player.id,
    });
  } catch (err) {
    console.error('Create room error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// Join room
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { roomCode, nickname } = body;

    if (!roomCode || !nickname) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { data: room } = await supabase
      .from('rooms')
      .select('*')
      .eq('code', roomCode.toUpperCase())
      .single();

    if (!room) {
      return NextResponse.json(
        { error: '존재하지 않는 방 코드입니다.' },
        { status: 404 }
      );
    }

    // Count current players (non-spectators)
    const { data: players } = await supabase
      .from('room_players')
      .select('id, nickname')
      .eq('room_id', room.id)
      .eq('is_spectator', false);

    const isSpectator =
      room.status === 'playing' || (players?.length || 0) >= MAX_PLAYERS;

    // Handle duplicate nicknames
    const allPlayers = await supabase
      .from('room_players')
      .select('nickname')
      .eq('room_id', room.id);

    let finalNickname = nickname;
    const existingNames = allPlayers.data?.map((p) => p.nickname) || [];
    if (existingNames.includes(finalNickname)) {
      let counter = 2;
      while (existingNames.includes(`${nickname}${counter}`)) counter++;
      finalNickname = `${nickname}${counter}`;
    }

    const { data: player, error: playerErr } = await supabase
      .from('room_players')
      .insert({
        room_id: room.id,
        nickname: finalNickname,
        is_host: false,
        is_spectator: isSpectator,
        tokens: INITIAL_TOKENS,
      })
      .select()
      .single();

    if (playerErr || !player) {
      return NextResponse.json(
        { error: 'Failed to join room' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      roomId: room.id,
      playerId: player.id,
      nickname: finalNickname,
      isSpectator: isSpectator,
      roomStatus: room.status,
    });
  } catch (err) {
    console.error('Join room error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
