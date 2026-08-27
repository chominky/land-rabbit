import { NextRequest, NextResponse } from 'next/server';
import { useFileDb, loadCase, saveCase, deleteCase as fileDeleteCase } from '@/lib/fileDb';

// Get single case (admin - includes truth)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (useFileDb()) {
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
  const { id } = await params;
  const body = await request.json();

  if (useFileDb()) {
    const existing = loadCase(id);
    if (!existing) return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    // Map snake_case fields from the editor to camelCase for fileDb
    const mapped: Record<string, unknown> = { ...body };
    if (mapped.key_facts) { mapped.keyFacts = mapped.key_facts; delete mapped.key_facts; }
    if (mapped.red_herrings) { mapped.redHerrings = mapped.red_herrings; delete mapped.red_herrings; }
    if (mapped.image_meta) { mapped.imageMeta = mapped.image_meta; delete mapped.image_meta; }
    const updated = { ...existing, ...mapped };
    saveCase(updated);
    return NextResponse.json(updated);
  }

  const { createServiceClient } = await import('@/lib/supabase/server');
  const supabase = createServiceClient();
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
  const { id } = await params;

  if (useFileDb()) {
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
