import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * GET /api/auth/ws-token
 * Returns a short-lived (60 s) HMAC-SHA256 token the WebSocket server uses
 * to authenticate the user:online message without sharing the full session JWT.
 *
 * Token format: `{userId}.{expiry}.{hmac}` — all URL-safe characters.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const secret = process.env.AUTH_SECRET ?? '';
  const expiry = Math.floor(Date.now() / 1000) + 60; // 60-second validity
  const payload = `${session.user.id}.${expiry}`;
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const token = `${payload}.${hmac}`;

  return NextResponse.json({ token }, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
