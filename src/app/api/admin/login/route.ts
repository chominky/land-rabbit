import { NextRequest, NextResponse } from 'next/server';
import { createAdminSession, getSessionCookieOptions } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimit';
import { RATE_LIMIT_ADMIN_LOGIN_PER_MINUTE } from '@/lib/gameConfig';

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  const rl = checkRateLimit(`admin-login:${ip}`, RATE_LIMIT_ADMIN_LOGIN_PER_MINUTE);

  if (!rl.allowed) {
    console.warn(`Admin login rate limited: ${ip}`);
    return NextResponse.json(
      { error: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.' },
      { status: 429 }
    );
  }

  const body = await request.json();
  const { password } = body;

  if (!password || password !== process.env.ADMIN_PASSWORD) {
    console.warn(`Failed admin login attempt from ${ip}`);
    return NextResponse.json(
      { error: '비밀번호가 올바르지 않습니다.' },
      { status: 401 }
    );
  }

  const token = await createAdminSession();
  const cookieOpts = getSessionCookieOptions();

  const response = NextResponse.json({ success: true });
  response.cookies.set(cookieOpts.name, token, {
    httpOnly: cookieOpts.httpOnly,
    secure: cookieOpts.secure,
    sameSite: cookieOpts.sameSite,
    maxAge: cookieOpts.maxAge,
    path: cookieOpts.path,
  });

  return response;
}
