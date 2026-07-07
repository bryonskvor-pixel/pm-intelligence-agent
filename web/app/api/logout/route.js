import { NextResponse } from 'next/server';
import { AUTH_COOKIE } from '../../../lib/auth.js';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 });
  return res;
}
