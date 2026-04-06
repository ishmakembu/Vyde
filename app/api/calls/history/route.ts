import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const calls = await prisma.callSession.findMany({
      where: {
        OR: [
          { callerId: session.user.id },
          { calleeId: session.user.id },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        caller: { select: { id: true, username: true, avatarColor: true } },
        callee: { select: { id: true, username: true, avatarColor: true } },
      },
    });

    const formattedCalls = calls.map((call) => {
      const isIncoming = call.calleeId === session.user.id;
      const peer = isIncoming ? call.caller : call.callee;
      const duration = call.duration ?? Math.floor(((call.endedAt?.getTime() || 0) - (call.startedAt?.getTime() || 0)) / 1000);

      let status: 'completed' | 'missed' | 'declined';
      if (call.status === 'ended' || call.status === 'active') {
        status = 'completed';
      } else if (call.status === 'missed') {
        status = 'missed';
      } else {
        status = 'declined';
      }

      return {
        id: call.id,
        peerId: peer.id,
        peerUsername: peer.username,
        peerAvatarColor: peer.avatarColor,
        startedAt: call.startedAt?.toISOString() || call.createdAt.toISOString(),
        endedAt: call.endedAt?.toISOString() || null,
        duration: call.duration !== null ? call.duration : duration,
        status,
        isIncoming,
      };
    });

    return NextResponse.json({ calls: formattedCalls });
  } catch (error) {
    console.error('Get call history error:', error);
    return NextResponse.json({ error: 'Failed to get call history' }, { status: 500 });
  }
}