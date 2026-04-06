import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const blockUserSchema = z.object({
  userId: z.string().uuid(),
});

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = blockUserSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const { userId } = parsed.data;

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        blockedUsers: { push: userId },
      },
    });

    return NextResponse.json({ blocked: userId in user.blockedUsers });
  } catch (error) {
    console.error('Block user error:', error);
    return NextResponse.json({ error: 'Failed to block user' }, { status: 500 });
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
      select: { blockedUsers: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const updatedBlockedUsers = user.blockedUsers.filter((id) => id !== userId);

    await prisma.user.update({
      where: { id: session.user.id },
      data: { blockedUsers: updatedBlockedUsers },
    });

    return NextResponse.json({ unblocked: true });
  } catch (error) {
    console.error('Unblock user error:', error);
    return NextResponse.json({ error: 'Failed to unblock user' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { blockedUsers: true, mutedUsers: true },
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error('Get blocked users error:', error);
    return NextResponse.json({ error: 'Failed to get blocked users' }, { status: 500 });
  }
}