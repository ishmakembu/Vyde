import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const markReadSchema = z.object({
  callId: z.string(),
  messageIds: z.array(z.string()).optional(),
});

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = markReadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const { callId, messageIds } = parsed.data;
    const userId = session.user.id;

    const call = await prisma.callSession.findUnique({
      where: { id: callId },
      include: { participants: true },
    });

    if (!call) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    const isParticipant = call.participants.some((p) => p.userId === userId);
    if (!isParticipant) {
      return NextResponse.json({ error: 'Not a participant' }, { status: 403 });
    }

    if (messageIds && messageIds.length > 0) {
      await prisma.message.updateMany({
        where: {
          id: { in: messageIds },
          callId,
          userId: { not: userId },
        },
        data: { readAt: new Date() },
      });
    } else {
      const unreadMessages = await prisma.message.findMany({
        where: {
          callId,
          userId: { not: userId },
          readAt: null,
        },
        select: { id: true },
      });

      if (unreadMessages.length > 0) {
        await prisma.message.updateMany({
          where: {
            id: { in: unreadMessages.map((m) => m.id) },
          },
          data: { readAt: new Date() },
        });
      }
    }

    return NextResponse.json({ markedRead: true });
  } catch (error) {
    console.error('Mark read error:', error);
    return NextResponse.json({ error: 'Failed to mark as read' }, { status: 500 });
  }
}