import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const muteUserSchema = z.object({
  userId: z.string().uuid(),
});

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = muteUserSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const { userId } = parsed.data;

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        mutedUsers: { push: userId },
      },
    });

    return NextResponse.json({ muted: userId in user.mutedUsers });
  } catch (error) {
    console.error('Mute user error:', error);
    return NextResponse.json({ error: 'Failed to mute user' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { mutedUsers: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const updatedMutedUsers = user.mutedUsers.filter((id) => id !== userId);

    await prisma.user.update({
      where: { id: session.user.id },
      data: { mutedUsers: updatedMutedUsers },
    });

    return NextResponse.json({ unmuted: true });
  } catch (error) {
    console.error('Unmute user error:', error);
    return NextResponse.json({ error: 'Failed to unmute user' }, { status: 500 });
  }
}