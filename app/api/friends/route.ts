import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma, dbErrorResponse } from '@/lib/prisma';
import { pushWsNotification } from '@/lib/wsNotify';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { adderId: session.user.id, status: 'accepted' },
          { receiverId: session.user.id, status: 'accepted' },
        ],
      },
      include: {
        adder: {
          select: { id: true, username: true, avatarColor: true, status: true, statusEmoji: true, lastSeen: true },
        },
        receiver: {
          select: { id: true, username: true, avatarColor: true, status: true, statusEmoji: true, lastSeen: true },
        },
      },
    });

    const friends = friendships.map((f) => {
      const friend = f.adderId === session.user.id ? f.receiver : f.adder;
      return {
        id: friend.id,
        username: friend.username,
        avatarColor: friend.avatarColor,
        status: friend.status,
        statusEmoji: friend.statusEmoji,
        lastSeen: friend.lastSeen,
      };
    });

    const pendingRequests = await prisma.friendship.findMany({
      where: {
        receiverId: session.user.id,
        status: 'pending',
      },
      include: {
        adder: {
          select: { id: true, username: true, avatarColor: true, status: true, statusEmoji: true, lastSeen: true },
        },
      },
    });

    const requests = pendingRequests.map((f) => ({
      id: f.adder.id,
      username: f.adder.username,
      avatarColor: f.adder.avatarColor,
      status: f.adder.status,
      statusEmoji: f.adder.statusEmoji,
      lastSeen: f.adder.lastSeen,
    }));

    const requestsSent = await prisma.friendship.findMany({
      where: {
        adderId: session.user.id,
        status: 'pending',
      },
      include: {
        receiver: {
          select: { id: true, username: true, avatarColor: true, status: true, statusEmoji: true, lastSeen: true },
        },
      },
    });

    const sent = requestsSent.map((f) => ({
      id: f.receiver.id,
      username: f.receiver.username,
      avatarColor: f.receiver.avatarColor,
      status: f.receiver.status,
      statusEmoji: f.receiver.statusEmoji,
      lastSeen: f.receiver.lastSeen,
    }));

    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { blockedUsers: true },
    });
    const blockedUserIds = currentUser?.blockedUsers ?? [];
    const blocked = blockedUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: blockedUserIds } },
          select: { id: true, username: true, avatarColor: true, status: true, statusEmoji: true, lastSeen: true },
        })
      : [];

    return NextResponse.json({ friends, requests, requestsSent: sent, blocked });
  } catch (error) {
    console.error('Get friends error:', error);
    return dbErrorResponse(error, 'Get friends');
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { userId, action } = body;

    if (action === 'accept') {
      await prisma.friendship.updateMany({
        where: { adderId: userId, receiverId: session.user.id, status: 'pending' },
        data: { status: 'accepted' },
      });

      // Notify the original sender that their request was accepted
      const notifData = {
        senderId: session.user.id,
        senderUsername: session.user.username,
        senderAvatar: session.user.avatar ?? null,
      };
      const notifMessage = {
        type: 'notification:new',
        payload: {
          id: `notif-${Date.now()}`,
          type: 'friend_accepted',
          title: 'Friend request accepted',
          body: `${session.user.username} accepted your friend request`,
          data: notifData,
          read: false,
          createdAt: new Date().toISOString(),
        },
      };

      // Try real-time delivery; always persist to DB so they see it offline too
      await pushWsNotification(userId, notifMessage);
      await prisma.notification.create({
        data: {
          userId,
          type: 'friend_accepted',
          title: 'Friend request accepted',
          body: `${session.user.username} accepted your friend request`,
          data: notifData,
        },
      });
    } else if (action === 'decline') {
      await prisma.friendship.deleteMany({
        where: { adderId: userId, receiverId: session.user.id, status: 'pending' },
      });
    } else if (action === 'remove') {
      await prisma.friendship.deleteMany({
        where: {
          OR: [
            { adderId: session.user.id, receiverId: userId, status: 'accepted' },
            { adderId: userId, receiverId: session.user.id, status: 'accepted' },
          ],
        },
      });
    } else if (action === 'block') {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { blockedUsers: { push: userId } },
      });
      // Also remove any existing friendship
      await prisma.friendship.deleteMany({
        where: {
          OR: [
            { adderId: session.user.id, receiverId: userId },
            { adderId: userId, receiverId: session.user.id },
          ],
        },
      });
    } else if (action === 'unblock') {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { blockedUsers: true },
      });
      const updated = (user?.blockedUsers ?? []).filter((id: string) => id !== userId);
      await prisma.user.update({
        where: { id: session.user.id },
        data: { blockedUsers: updated },
      });
    } else if (action === 'add') {
      const existing = await prisma.friendship.findFirst({
        where: {
          OR: [
            { adderId: session.user.id, receiverId: userId },
            { adderId: userId, receiverId: session.user.id },
          ],
        },
      });

      if (!existing) {
        await prisma.friendship.create({
          data: { adderId: session.user.id, receiverId: userId, status: 'pending' },
        });

        // Notify the recipient of the new request
        const notifData = {
          senderId: session.user.id,
          senderUsername: session.user.username,
          senderAvatar: session.user.avatar ?? null,
        };
        const notifMessage = {
          type: 'notification:new',
          payload: {
            id: `notif-${Date.now()}`,
            type: 'friend_request',
            title: 'Friend request',
            body: `${session.user.username} sent you a friend request`,
            data: notifData,
            read: false,
            createdAt: new Date().toISOString(),
          },
        };

        await pushWsNotification(userId, notifMessage);
        await prisma.notification.create({
          data: {
            userId,
            type: 'friend_request',
            title: 'Friend request',
            body: `${session.user.username} sent you a friend request`,
            data: notifData,
          },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Friends action error:', error);
    return dbErrorResponse(error, 'Friends action');
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { userId } = body;
    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: 'userId required' }, { status: 400 });
    }

    await prisma.friendship.deleteMany({
      where: {
        OR: [
          { adderId: session.user.id, receiverId: userId },
          { adderId: userId, receiverId: session.user.id },
        ],
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete friend error:', error);
    return dbErrorResponse(error, 'Delete friend');
  }
}

/** PATCH /api/friends — alias for POST; spec requires PATCH for accept/decline/block/unblock */
export async function PATCH(request: Request) {
  return POST(request);
}