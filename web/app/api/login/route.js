import { NextResponse } from 'next/server';
import { AUTH_COOKIE, computeAuthToken, isValidPassword } from '../../../lib/auth.js';

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected JSON body with a "password" field.' }, { status: 400 });
  }

  if (!isValidPassword(body?.password)) {
    return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, computeAuthToken(), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
