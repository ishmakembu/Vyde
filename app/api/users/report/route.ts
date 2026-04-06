import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const reportUserSchema = z.object({
  reportedId: z.string().uuid(),
  reason: z.enum(['harassment', 'spam', 'inappropriate', 'other']),
  description: z.string().max(500).optional(),
  callId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = reportUserSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return NextResponse.json(
        { error: firstError?.message || 'Validation failed' },
        { status: 400 }
      );
    }

    const { reportedId, reason, description, callId } = parsed.data;

    const existingReport = await prisma.report.findFirst({
      where: {
        reporterId: session.user.id,
        reportedId,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });

    if (existingReport) {
      return NextResponse.json(
        { error: 'You have already reported this user today' },
        { status: 429 }
      );
    }

    const report = await prisma.report.create({
      data: {
        reporterId: session.user.id,
        reportedId,
        reason,
        description,
        callId,
      },
    });

    return NextResponse.json(report, { status: 201 });
  } catch (error) {
    console.error('Report user error:', error);
    return NextResponse.json({ error: 'Failed to submit report' }, { status: 500 });
  }
}