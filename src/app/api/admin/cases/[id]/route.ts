import { NextRequest, NextResponse } from 'next/server';
import { isFileDb, loadCase, saveCase, deleteCase as fileDeleteCase, mapSupabaseToCaseData } from '@/lib/fileDb';
import { requireAdmin } from '@/lib/adminGuard';
import { publishBlockersForCase } from '@/lib/caseValidation';
import type { CaseData } from '@/lib/types';

// Get single case (admin - includes truth)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;

  if (isFileDb()) {
    const c = loadCase(id);
    if (!c) return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    return NextResponse.json(c);
  }

  const { createServiceClient } = await import('@/lib/supabase/server');
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('cases')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }

  return NextResponse.json(data);
}

// Update case
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  const body = await request.json();

  if (isFileDb()) {
    const existing = loadCase(id);
    if (!existing) return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    // Map snake_case fields from the editor to camelCase for fileDb
    const mapped: Record<string, unknown> = { ...body };
    if (mapped.key_facts) { mapped.keyFacts = mapped.key_facts; delete mapped.key_facts; }
    if (mapped.red_herrings) { mapped.redHerrings = mapped.red_herrings; delete mapped.red_herrings; }
    if (mapped.image_meta) { mapped.imageMeta = mapped.image_meta; delete mapped.image_meta; }
    const updated = { ...existing, ...mapped } as CaseData;

    // 발행 조건은 서버에서도 막는다 — 사건 목록의 발행 토글로 우회할 수 있다.
    if (updated.status === 'published') {
      const blockers = publishBlockersForCase(updated);
      if (blockers.length > 0) {
        return NextResponse.json(
          { error: '발행 조건을 충족하지 않습니다.', blockers },
          { status: 400 }
        );
      }
    }

    saveCase(updated);
    return NextResponse.json(updated);
  }

  const { createServiceClient } = await import('@/lib/supabase/server');
  const supabase = createServiceClient();

  if (body.status === 'published') {
    const { data: current } = await supabase.from('cases').select('*').eq('id', id).single();
    if (!current) return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    // 이번 요청의 변경분을 얹은 최종 상태로 검사한다.
    const merged = mapSupabaseToCaseData({ ...current, ...body });
    const blockers = publishBlockersForCase(merged);
    if (blockers.length > 0) {
      return NextResponse.json(
        { error: '발행 조건을 충족하지 않습니다.', blockers },
        { status: 400 }
      );
    }
  }

  const { data, error } = await supabase
    .from('cases')
    .update({
      ...body,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// Delete case
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;

  if (isFileDb()) {
    fileDeleteCase(id);
    return NextResponse.json({ success: true });
  }

  const { createServiceClient } = await import('@/lib/supabase/server');
  const supabase = createServiceClient();
  const { error } = await supabase.from('cases').delete().eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
