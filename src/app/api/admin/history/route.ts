import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminGuard';
import { loadHistory } from '@/lib/fileDb';

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const history = loadHistory();
  return NextResponse.json(history);
}
