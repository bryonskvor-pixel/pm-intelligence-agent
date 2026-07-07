// Solo-use password gate (web deployment step 3). No user accounts, no session store — a single
// shared password compared against process.env.SITE_PASSWORD, and a fixed proof-of-auth token
// (HMAC of a constant string under a server-only secret) carried in a cookie so the plaintext
// password never sits in the browser after login. This is deliberately the "password or
// env-var-based check" the architecture doc calls sufficient for solo use — no multi-user
// complexity to get wrong.
import crypto from 'node:crypto';

export const AUTH_COOKIE = 'pm_auth';
const TOKEN_MESSAGE = 'pm-intelligence-agent-authenticated';

function requireSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET is not set — cannot compute the auth token.');
  return secret;
}

export function computeAuthToken() {
  return crypto.createHmac('sha256', requireSecret()).update(TOKEN_MESSAGE).digest('hex');
}

export function isValidAuthToken(token) {
  if (!token) return false;
  const expected = Buffer.from(computeAuthToken());
  const actual = Buffer.from(String(token));
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

export function isValidPassword(candidate) {
  const expected = process.env.SITE_PASSWORD;
  if (!expected || typeof candidate !== 'string') return false;
  const expectedBuf = Buffer.from(expected);
  const candidateBuf = Buffer.from(candidate);
  if (expectedBuf.length !== candidateBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, candidateBuf);
}
