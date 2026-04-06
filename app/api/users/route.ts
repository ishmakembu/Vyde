import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const patchUserSchema = z.object({
  status: z.string().max(100).optional(),
  statusEmoji: z.string().max(10).optional(),
  bio: z.string().max(500).optional().nullable(),
  isPrivate: z.boolean().optional(),
  showLastSeen: z.boolean().optional(),
  showReadReceipts: z.boolean().optional(),
  frameTheme: z.enum(['default', 'neon', 'fire', 'nature', 'minimal']).optional(),
  avatar: z.string().url().optional().nullable(),
  avatarColor: z.string().optional().nullable(),
});

export async function GET(request: Request) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get('cursor') || undefined;
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10) || 50, 1), 100);
    const userId = session.user.id;

    const users = await prisma.user.findMany({
      where: {
        id: { not: userId },
        OR: [
          { isPrivate: false },
          {
            friendsReceived: {
              some: { adderId: userId, status: 'accepted' },
            },
          },
          {
            friendsAdded: {
              some: { receiverId: userId, status: 'accepted' },
            },
          },
        ],
      },
      orderBy: { lastSeen: 'desc' },
      take: limit + 1,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      select: {
        id: true,
        username: true,
        avatar: true,
        avatarColor: true,
        status: true,
        statusEmoji: true,
        isPrivate: true,
        lastSeen: true,
        createdAt: true,
      },
    });

    const hasMore = users.length > limit;
    const items = users.slice(0, limit);
    const nextCursor = items[items.length - 1]?.id;

    return NextResponse.json({
      users: items,
      nextCursor: hasMore ? nextCursor : null,
    });
  } catch (error) {
    console.error('Users fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = patchUserSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return NextResponse.json(
        { error: firstError?.message || 'Validation failed' },
        { status: 400 }
      );
    }

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: parsed.data,
      select: {
        id: true,
        username: true,
        avatar: true,
        avatarColor: true,
        status: true,
        statusEmoji: true,
        bio: true,
        isPrivate: true,
        showLastSeen: true,
        showReadReceipts: true,
        frameTheme: true,
        lastSeen: true,
      },
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error('Patch user error:', error);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}