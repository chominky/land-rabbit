import { NextRequest, NextResponse } from 'next/server';
import { CasePublicDTO } from '@/lib/types';
import { isFileDb, loadCase } from '@/lib/fileDb';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (isFileDb()) {
    const c = loadCase(id);
    if (!c || c.status !== 'published') {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }
    const dto: CasePublicDTO = {
      id: c.id,
      title: c.title,
      difficulty: c.difficulty,
      brief: c.brief,
      keyFactLabels: (c.keyFacts || []).map((f) => ({
        id: f.id, label: f.label, required: f.required,
      })),
      imageCount: c.images?.length || 0,
      images: c.images || [],
    };
    return NextResponse.json(dto);
  }

  const { createServiceClient } = await import('@/lib/supabase/server');
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('cases')
    .select('id, title, difficulty, brief, key_facts, images, status')
    .eq('id', id)
    .eq('status', 'published')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }

  const dto: CasePublicDTO = {
    id: data.id,
    title: data.title,
    difficulty: data.difficulty,
    brief: data.brief,
    keyFactLabels: (data.key_facts as Array<{ id: string; label: string; required: boolean }>).map(
      (f) => ({ id: f.id, label: f.label, required: f.required })
    ),
    imageCount: (data.images as string[])?.length || 0,
    images: (data.images as string[]) || [],
  };

  return NextResponse.json(dto);
}
