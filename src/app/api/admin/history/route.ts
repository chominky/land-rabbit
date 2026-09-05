import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminGuard';
import { loadRecords } from '@/lib/history';

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const history = await loadRecords();
  return NextResponse.json(history);
}
