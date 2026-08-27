import { NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/adminGuard';
import { loadHistory } from '@/lib/fileDb';

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const history = loadHistory();
  return NextResponse.json(history);
}
