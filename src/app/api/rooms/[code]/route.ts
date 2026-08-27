import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { useFileDb, loadCase } from '@/lib/fileDb';

// Get room state (public data only)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const supabase = createServiceClient();

  const { data: room } = await supabase
    .from('rooms')
    .select('id, code, case_id, mode, status, shared_tokens, revealed_image_count, total_questions, turn_player_id, host_player_id, turn_deadline')
    .eq('code', code.toUpperCase())
    .single();

  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  const { data: players } = await supabase
    .from('room_players')
    .select('id, nickname, is_host, is_spectator, tokens, attempts_used, solved_at, rank, score, cooldown_until, joined_at')
    .eq('room_id', room.id)
    .order('joined_at');

  const { data: questions } = await supabase
    .from('room_questions')
    .select('id, player_id, text, verdict, comment, revealed_facts, flagged, created_at')
    .eq('room_id', room.id)
    .order('created_at');

  // Attach nickname to questions
  const enrichedQuestions = (questions || []).map((q) => {
    const p = players?.find((pl) => pl.id === q.player_id);
    return { ...q, nickname: p?.nickname || '???' };
  });

  // Get case public info
  let casePublic = null;
  if (useFileDb()) {
    const fileCase = loadCase(room.case_id);
    if (fileCase) {
      casePublic = {
        id: fileCase.id,
        title: fileCase.title,
        difficulty: fileCase.difficulty,
        tags: fileCase.tags,
        brief: fileCase.brief,
        images: fileCase.images,
        keyFactLabels: fileCase.keyFacts.map(
          (f: { id: string; label: string; required: boolean }) => ({ id: f.id, label: f.label, required: f.required })
        ),
        imageCount: fileCase.images?.length || 0,
      };
    }
  } else {
    const { data: caseData } = await supabase
      .from('cases')
      .select('id, title, difficulty, tags, brief, key_facts, images')
      .eq('id', room.case_id)
      .single();

    if (caseData) {
      casePublic = {
        id: caseData.id,
        title: caseData.title,
        difficulty: caseData.difficulty,
        tags: caseData.tags,
        brief: caseData.brief,
        images: caseData.images as string[],
        keyFactLabels: (caseData.key_facts as Array<{ id: string; label: string; required: boolean }>).map(
          (f) => ({ id: f.id, label: f.label, required: f.required })
        ),
        imageCount: (caseData.images as string[])?.length || 0,
      };
    }
  }

  // Gather all revealed key facts from questions
  const revealedKeyFacts = new Set<string>();
  (questions || []).forEach((q) => {
    (q.revealed_facts || []).forEach((f: string) => revealedKeyFacts.add(f));
  });

  return NextResponse.json({
    room,
    players: players || [],
    questions: enrichedQuestions,
    casePublic,
    revealedKeyFacts: Array.from(revealedKeyFacts),
  });
}

// Start game / update room
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const body = await request.json();
  const { action, playerId } = body;
  const supabase = createServiceClient();

  const { data: room } = await supabase
    .from('rooms')
    .select('*')
    .eq('code', code.toUpperCase())
    .single();

  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  if (action === 'start') {
    if (room.host_player_id !== playerId) {
      return NextResponse.json({ error: 'Only host can start' }, { status: 403 });
    }

    if (room.status !== 'lobby') {
      return NextResponse.json({ error: 'Game already started' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {
      status: 'playing',
      last_activity_at: new Date().toISOString(),
    };

    // For versus mode, set first player's turn
    if (room.mode === 'versus') {
      const { data: players } = await supabase
        .from('room_players')
        .select('id')
        .eq('room_id', room.id)
        .eq('is_spectator', false)
        .order('joined_at');

      if (players && players.length > 0) {
        updates.turn_player_id = players[0].id;
        updates.turn_deadline = new Date(Date.now() + 60_000).toISOString();
      }
    }

    await supabase.from('rooms').update(updates).eq('id', room.id);

    // Increment play count (best effort)
    const { data: caseRow } = await supabase
      .from('cases')
      .select('play_count')
      .eq('id', room.case_id)
      .single();
    if (caseRow) {
      await supabase
        .from('cases')
        .update({ play_count: (caseRow.play_count || 0) + 1 })
        .eq('id', room.case_id);
    }

    return NextResponse.json({ success: true });
  }

  if (action === 'leave') {
    // Remove player
    await supabase.from('room_players').delete().eq('id', playerId);

    // Check if room is empty
    const { data: remaining } = await supabase
      .from('room_players')
      .select('id, is_spectator, joined_at')
      .eq('room_id', room.id)
      .eq('is_spectator', false)
      .order('joined_at');

    if (!remaining || remaining.length === 0) {
      // Delete room
      await supabase.from('rooms').delete().eq('id', room.id);
      return NextResponse.json({ success: true, roomDeleted: true });
    }

    // Transfer host if host left
    if (room.host_player_id === playerId) {
      const newHost = remaining[0];
      await supabase
        .from('rooms')
        .update({ host_player_id: newHost.id })
        .eq('id', room.id);
      await supabase
        .from('room_players')
        .update({ is_host: true })
        .eq('id', newHost.id);
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
