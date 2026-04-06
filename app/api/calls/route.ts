import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma, dbErrorResponse } from '@/lib/prisma';
import { z } from 'zod';

const createCallSchema = z.object({
  calleeId: z.string(),
});

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = createCallSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request' },
        { status: 400 }
      );
    }

    const { calleeId } = parsed.data;
    const callerId = session.user.id;

    const callee = await prisma.user.findUnique({
      where: { id: calleeId },
    });

    if (!callee) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if caller is blocked by callee
    if (callee.blockedUsers.includes(callerId)) {
      return NextResponse.json({ error: 'User unavailable' }, { status: 403 });
    }

    // Private users can only be called by friends
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

    const callId = `call-${Date.now()}`;
    const roomId = `room-${Date.now()}`;

    const call = await prisma.callSession.create({
      data: {
        id: callId,
        roomId,
        callerId,
        calleeId,
        status: 'ringing',
      },
      include: {
        caller: { select: { id: true, username: true, avatar: true, avatarColor: true } },
        callee: { select: { id: true, username: true, avatar: true, avatarColor: true } },
      },
    });

    return NextResponse.json(call, { status: 201 });
  } catch (error) {
    console.error('Create call error:', error);
    return dbErrorResponse(error, 'Create call');
  }
}

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get('cursor');
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const calls = await prisma.callSession.findMany({
      where: {
        OR: [
          { callerId: session.user.id },
          { calleeId: session.user.id },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      include: {
        caller: { select: { id: true, username: true, avatar: true, avatarColor: true } },
        callee: { select: { id: true, username: true, avatar: true, avatarColor: true } },
        participants: { where: { userId: session.user.id } },
      },
    });

    const hasMore = calls.length > limit;
    const items = calls.slice(0, limit);
    const nextCursor = items[items.length - 1]?.id;

    return NextResponse.json({
      calls: items,
      nextCursor: hasMore ? nextCursor : null,
    });
  } catch (error) {
    console.error('Get calls error:', error);
    return dbErrorResponse(error, 'Get calls');
  }
}