import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma, dbErrorResponse } from '@/lib/prisma';
import { z } from 'zod';

const updateProfileSchema = z.object({
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

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
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
        createdAt: true,
        lastSeen: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error('Get profile error:', error);
    return dbErrorResponse(error, 'Get profile');
  }
}

export async function PUT(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = updateProfileSchema.safeParse(body);

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
      },
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error('Update profile error:', error);
    return dbErrorResponse(error, 'Update profile');
  }
}