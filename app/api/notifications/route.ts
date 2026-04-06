import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const missedCallSchema = z.object({
  calleeId: z.string().uuid(),
});

/** GET /api/notifications — fetch all notifications for the current user */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const notifications = await prisma.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return NextResponse.json({ notifications });
}

/**
 * POST /api/notifications — create a missed_call notification for an offline user.
 * Body: { calleeId: string }
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = missedCallSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { calleeId } = parsed.data;
  const callerId = session.user.id;

  if (calleeId === callerId) {
    return NextResponse.json({ error: 'Cannot notify yourself' }, { status: 400 });
  }

  const callee = await prisma.user.findUnique({ where: { id: calleeId } });
  if (!callee) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // Blocked users can't be notified
  if (callee.blockedUsers.includes(callerId)) {
    return NextResponse.json({ error: 'User unavailable' }, { status: 403 });
  }

  // Private profiles: only friends can send notifications
  if (callee.isPrivate) {
    const friendship = await prisma.friendship.findFirst({
      where: {
        status: 'accepted',
        OR: [
          { adderId: callerId, receiverId: calleeId },
          { adderId: calleeId, receiverId: callerId },
        ],
      },
    });
    if (!friendship) {
      return NextResponse.json({ error: 'User unavailable' }, { status: 403 });
    }
  }

  const notification = await prisma.notification.create({
    data: {
      userId: calleeId,
      type: 'missed_call',
      title: 'Missed call',
      body: `${session.user.username} tried to call you`,
      data: {
        callerId,
        callerUsername: session.user.username,
        callerAvatar: session.user.avatar ?? null,
      },
    },
  });

  return NextResponse.json({ notification }, { status: 201 });
}

/** PATCH /api/notifications — mark notifications as read. Body: { ids?: string[] } (omit ids to mark all) */
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as { ids?: string[] };
  const ids = Array.isArray(body.ids) && body.ids.length > 0 ? body.ids : undefined;

  await prisma.notification.updateMany({
    where: {
      userId: session.user.id,
      ...(ids ? { id: { in: ids } } : { read: false }),
    },
    data: { read: true },
  });

  return NextResponse.json({ ok: true });
}
