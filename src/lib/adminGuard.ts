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
