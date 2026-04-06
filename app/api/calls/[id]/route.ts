import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const updateCallSchema = z.object({
  status: z.enum(['active', 'ended', 'missed', 'declined', 'reconnecting']).optional(),
  endedAt: z.string().datetime().optional(),
  duration: z.number().int().min(0).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const parsed = updateCallSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return NextResponse.json(
        { error: firstError?.message || 'Validation failed' },
        { status: 400 }
      );
    }

    const call = await prisma.callSession.findUnique({
      where: { id },
    });

    if (!call) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    // Only participants can update the call
    if (call.callerId !== session.user.id && call.calleeId !== session.user.id) {
      const participant = await prisma.callParticipant.findFirst({
        where: { callId: id, userId: session.user.id },
      });
      if (!participant) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const updated = await prisma.callSession.update({
      where: { id },
      data: {
        ...(parsed.data.status && { status: parsed.data.status }),
        ...(parsed.data.endedAt && { endedAt: new Date(parsed.data.endedAt) }),
        ...(parsed.data.duration !== undefined && { duration: parsed.data.duration }),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Update call error:', error);
    return NextResponse.json(
      { error: 'Failed to update call' },
      { status: 500 }
    );
  }
}
