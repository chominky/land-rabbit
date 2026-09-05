import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminGuard';
import { addGolden, deleteGolden, listGolden, updateGolden } from '@/lib/golden';
import type { Verdict } from '@/lib/types';

// 사건의 골든셋 조회
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  return NextResponse.json(await listGolden(id));
}

// 골든 케이스 추가
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  const { question, expected_verdict } = await request.json();

  if (!question?.trim()) {
    return NextResponse.json({ error: 'question이 필요합니다.' }, { status: 400 });
  }

  const test = await addGolden(id, question.trim(), expected_verdict as Verdict);
  return NextResponse.json(test, { status: 201 });
}

// 기대 판정 수정
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  const { testId, expected_verdict } = await request.json();

  if (!testId) {
    return NextResponse.json({ error: 'testId가 필요합니다.' }, { status: 400 });
  }

  const ok = await updateGolden(id, testId, expected_verdict as Verdict);
  if (!ok) return NextResponse.json({ error: 'Golden test not found' }, { status: 404 });

  return NextResponse.json({ success: true });
}

// 골든 케이스 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  const testId = request.nextUrl.searchParams.get('testId');

  if (!testId) {
    return NextResponse.json({ error: 'testId required' }, { status: 400 });
  }

  await deleteGolden(id, testId);
  return NextResponse.json({ success: true });
}
