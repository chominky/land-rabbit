import { NextResponse } from 'next/server';
import { CasePublicDTO } from '@/lib/types';
import { isFileDb, loadPublishedCases } from '@/lib/fileDb';

export async function GET() {
  if (isFileDb()) {
    const cases = loadPublishedCases();
    const dtos: CasePublicDTO[] = cases.map((c) => ({
      id: c.id,
      title: c.title,
      difficulty: c.difficulty,
      brief: c.brief,
      keyFactLabels: (c.keyFacts || []).map((f) => ({
        id: f.id, label: f.label, required: f.required,
      })),
      imageCount: c.images?.length || 0,
      images: c.images || [],
    }));
    return NextResponse.json(dtos);
  }

  // Supabase path
  const { createServiceClient } = await import('@/lib/supabase/server');
  const supabase = createServiceClient();
  const isProduction = process.env.NODE_ENV === 'production';

  let query = supabase
    .from('cases')
    .select('id, title, difficulty, brief, key_facts, images, status')
    .eq('status', 'published');

  if (isProduction) {
    query = query.not('id', 'like', '_%');
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const cases: CasePublicDTO[] = (data || []).map((c) => ({
    id: c.id,
    title: c.title,
    difficulty: c.difficulty,
    brief: c.brief,
    keyFactLabels: (c.key_facts as Array<{ id: string; label: string; required: boolean }>).map(
      (f) => ({ id: f.id, label: f.label, required: f.required })
    ),
    imageCount: (c.images as string[])?.length || 0,
    images: (c.images as string[]) || [],
  }));

  return NextResponse.json(cases);
}
