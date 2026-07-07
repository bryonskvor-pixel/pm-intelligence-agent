// The auth gate itself (web deployment step 3): every request except /login and /api/login must
// carry a valid pm_auth cookie, or it's turned away before reaching any page or API route — a
// public open endpoint here would burn real Claude API budget per run, which is why this is
// "non-negotiable before anything is reachable" per the architecture doc.
//
// runtime: 'nodejs' (not the Edge default) so this shares the exact same crypto.timingSafeEqual
// check as app/api/login/route.js — no Edge-vs-Node Web Crypto/Node crypto divergence to reason
// about between the two places a token gets checked.
import { NextResponse } from 'next/server';
import { AUTH_COOKIE, isValidAuthToken } from './lib/auth.js';

const PUBLIC_PATHS = new Set(['/login', '/api/login']);

export function middleware(request) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const token = request.cookies.get(AUTH_COOKIE)?.value;
  if (isValidAuthToken(token)) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('from', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  runtime: 'nodejs',
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
