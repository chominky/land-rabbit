import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminSession } from './auth';

export async function isAdminAuthenticated(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('admin_session')?.value;
    if (!token) return false;
    return verifyAdminSession(token);
  } catch {
    return false;
  }
}

/**
 * 관리자 전용 라우트 가드.
 *
 * 인증되지 않았으면 401 응답을, 인증됐으면 null을 돌려준다.
 * 모든 /api/admin 핸들러 첫 줄에서 호출한다:
 *
 *   const denied = await requireAdmin();
 *   if (denied) return denied;
 */
export async function requireAdmin(): Promise<NextResponse | null> {
  if (await isAdminAuthenticated()) return null;
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
