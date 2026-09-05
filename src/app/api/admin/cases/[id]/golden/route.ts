import { NextRequest, NextResponse } from 'next/server';
import { isFileDb } from '@/lib/fileDb';
import fs from 'fs';
import path from 'path';
import { requireAdmin } from '@/lib/adminGuard';

const GOLDEN_DIR = path.join(process.cwd(), 'tests', 'golden');

type GoldenTest = {
  id: string;
  case_id: string;
  question: string;
  expected_verdict: string;
  created_at?: string;
};

function loadGoldenTests(caseId: string): GoldenTest[] {
  const filePath = path.join(GOLDEN_DIR, `${caseId}.json`);
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveGoldenTests(caseId: string, tests: GoldenTest[]): void {
  if (!fs.existsSync(GOLDEN_DIR)) {
    fs.mkdirSync(GOLDEN_DIR, { recursive: true });
  }
  fs.writeFileSync(path.join(GOLDEN_DIR, `${caseId}.json`), JSON.stringify(tests, null, 2), 'utf-8');
}

// Get golden tests for a case
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;

  if (isFileDb()) {
    return NextResponse.json(loadGoldenTests(id));
  }

  const { createServiceClient } = await import('@/lib/supabase/server');
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('case_golden_tests')
    .select('*')
    .eq('case_id', id)
    .order('created_at');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

// Add golden test
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  const body = await request.json();
  const { question, expected_verdict } = body;

  if (isFileDb()) {
    const tests = loadGoldenTests(id);
    const newTest: GoldenTest = {
      id: `gt_${Date.now()}`,
      case_id: id,
      question,
      expected_verdict,
      created_at: new Date().toISOString(),
    };
    tests.push(newTest);
    saveGoldenTests(id, tests);
    return NextResponse.json(newTest, { status: 201 });
  }

  const { createServiceClient } = await import('@/lib/supabase/server');
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('case_golden_tests')
    .insert({ case_id: id, question, expected_verdict })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

// Delete golden test
export async function DELETE(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const testId = searchParams.get('testId');

  if (!testId) {
    return NextResponse.json({ error: 'testId required' }, { status: 400 });
  }

  if (isFileDb()) {
    // Search all golden test files
    try {
      const files = fs.readdirSync(GOLDEN_DIR).filter((f) => f.endsWith('.json'));
      for (const file of files) {
        const caseId = file.replace('.json', '');
        const tests = loadGoldenTests(caseId);
        const filtered = tests.filter((t) => t.id !== testId);
        if (filtered.length !== tests.length) {
          saveGoldenTests(caseId, filtered);
          break;
        }
      }
    } catch { /* ignore */ }
    return NextResponse.json({ success: true });
  }

  const { createServiceClient } = await import('@/lib/supabase/server');
  const supabase = createServiceClient();
  await supabase.from('case_golden_tests').delete().eq('id', testId);

  return NextResponse.json({ success: true });
}
