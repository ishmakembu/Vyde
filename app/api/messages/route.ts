import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma, dbErrorResponse } from '@/lib/prisma';
import { sendMessageSchema } from '@/lib/validators';

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = sendMessageSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return NextResponse.json(
        { error: firstError?.message || 'Validation failed' },
        { status: 400 }
      );
    }

    const { callId, content, imageUrl } = parsed.data;

    const call = await prisma.callSession.findUnique({
      where: { id: callId },
      include: {
        participants: { where: { userId: session.user.id } },
      },
    });

    if (!call || call.participants.length === 0) {
      return NextResponse.json({ error: 'Not in call' }, { status: 403 });
    }

    const message = await prisma.message.create({
      data: {
        content,
        imageUrl,
        userId: session.user.id,
        callId,
      },
      include: {
        user: { select: { id: true, username: true, avatar: true, avatarColor: true } },
      },
    });

    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    console.error('Send message error:', error);
    return dbErrorResponse(error, 'Send message');
  }
}

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const callId = searchParams.get('callId');
    const cursor = searchParams.get('cursor');
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    if (!callId) {
      return NextResponse.json({ error: 'Call ID required' }, { status: 400 });
    }

    const call = await prisma.callSession.findUnique({
      where: { id: callId },
      include: {
        participants: { where: { userId: session.user.id } },
      },
    });

    if (!call || call.participants.length === 0) {
      return NextResponse.json({ error: 'Not in call' }, { status: 403 });
    }

    const messages = await prisma.message.findMany({
      where: {
        callId,
        isDeleted: false,
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      include: {
        user: { select: { id: true, username: true, avatar: true, avatarColor: true } },
      },
    });

    const hasMore = messages.length > limit;
    const items = messages.slice(0, limit);
    const nextCursor = items[items.length - 1]?.createdAt.toISOString();

    return NextResponse.json({
      messages: items.reverse(),
      nextCursor: hasMore ? nextCursor : null,
    });
  } catch (error) {
    console.error('Get messages error:', error);
    return dbErrorResponse(error, 'Get messages');
  }
}