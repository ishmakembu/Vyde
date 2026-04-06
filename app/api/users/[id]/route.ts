import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const { id } = await params;

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        avatar: true,
        avatarColor: true,
        status: true,
        statusEmoji: true,
        bio: true,
        isPrivate: true,
        frameTheme: true,
        showLastSeen: true,
        showReadReceipts: true,
        createdAt: true,
        lastSeen: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const isSelf = user.id === session.user.id;
    let isFriend = false;
    let friendStatus: 'none' | 'pending' | 'friends' = 'none';

    if (!isSelf) {
      const friendship = await prisma.friendship.findFirst({
        where: {
          OR: [
            { adderId: session.user.id, receiverId: user.id },
            { adderId: user.id, receiverId: session.user.id },
          ],
        },
      });

      if (friendship) {
        if (friendship.status === 'accepted') {
          isFriend = true;
          friendStatus = 'friends';
        } else if (friendship.status === 'pending') {
          if (friendship.adderId === session.user.id) {
            friendStatus = 'pending';
          } else {
            friendStatus = 'pending';
          }
        }
      }
    }

    const canView = isSelf || !user.isPrivate || isFriend;

    if (!canView) {
      return NextResponse.json({
        id: user.id,
        username: user.username,
        isPrivate: true,
        friendStatus,
        canViewProfile: false,
      });
    }

    return NextResponse.json({
      ...user,
      isFriend,
      friendStatus,
      canViewProfile: true,
    });
  } catch (error) {
    console.error('Get user error:', error);
    return NextResponse.json({ error: 'Failed to get user' }, { status: 500 });
  }
}