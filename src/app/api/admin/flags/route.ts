import { NextResponse } from 'next/server';
import { useFileDb } from '@/lib/fileDb';

export async function GET() {
  if (useFileDb()) {
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
