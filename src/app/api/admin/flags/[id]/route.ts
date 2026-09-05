import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminGuard';
import { FlagStatus, setFlagStatus } from '@/lib/flags';

const VALID: FlagStatus[] = ['open', 'resolved', 'dismissed'];

// 신고 처리 상태 변경
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const status = body.status as FlagStatus;

  if (!VALID.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const ok = await setFlagStatus(id, status, body.note);
  if (!ok) return NextResponse.json({ error: 'Flag not found' }, { status: 404 });

  return NextResponse.json({ success: true, status });
}
