import { NextResponse } from 'next/server';
import { isFileDb } from '@/lib/fileDb';
import { requireAdmin } from '@/lib/adminGuard';

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  if (isFileDb()) {
    return NextResponse.json([]);
  }

  const { createServiceClient } = await import('@/lib/supabase/server');
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('flags')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}
