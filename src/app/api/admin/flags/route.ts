import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminGuard';
import { FlagStatus, listFlags } from '@/lib/flags';

export async function GET(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const status = request.nextUrl.searchParams.get('status') as FlagStatus | 'all' | null;
  const flags = await listFlags(status ?? 'open');
  return NextResponse.json(flags);
}
