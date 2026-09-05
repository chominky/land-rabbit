import { NextRequest, NextResponse } from 'next/server';
import { isFileDb, loadAllCases, loadCase, saveCase } from '@/lib/fileDb';
import { CaseData } from '@/lib/types';
import { requireAdmin } from '@/lib/adminGuard';

// List all cases (admin)
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  if (isFileDb()) {
    const cases = loadAllCases();
    return NextResponse.json(cases);
  }

  const { createServiceClient } = await import('@/lib/supabase/server');
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('cases')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

// Create new case
export async function POST(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await request.json();
  const { id, title } = body;

  if (!id || !title) {
    return NextResponse.json({ error: 'ID and title required' }, { status: 400 });
  }

  if (isFileDb()) {
    const existing = loadCase(id);
    if (existing) {
      return NextResponse.json({ error: 'Case ID already exists' }, { status: 409 });
    }
    const newCase: CaseData = {
      id,
      title,
      difficulty: body.difficulty || 1,
      brief: body.brief || '',
      truth: body.truth || '',
      images: body.images || [],
      imageMeta: body.imageMeta || body.image_meta || [],
      keyFacts: body.keyFacts || body.key_facts || [],
      redHerrings: body.redHerrings || body.red_herrings || [],
      hints: body.hints || [],
      status: body.status || 'draft',
    };
    saveCase(newCase);
    return NextResponse.json(newCase, { status: 201 });
  }

  const { createServiceClient } = await import('@/lib/supabase/server');
  const supabase = createServiceClient();

  const { data: existing } = await supabase.from('cases').select('id').eq('id', id).single();
  if (existing) {
    return NextResponse.json({ error: 'Case ID already exists' }, { status: 409 });
  }

  const { data, error } = await supabase
    .from('cases')
    .insert({
      id,
      title,
      difficulty: body.difficulty || 1,
      brief: body.brief || '',
      truth: body.truth || '',
      images: body.images || [],
      image_meta: body.image_meta || [],
      key_facts: body.key_facts || [],
      red_herrings: body.red_herrings || [],
      hints: body.hints || [],
      status: body.status || 'draft',
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
