'use server';

import { hashPassword } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { registerSchema } from '@/lib/validators';

export async function registerAction(formData: {
  username: string;
  password: string;
  avatarColor?: string;
}) {
  try {
    const parsed = registerSchema.safeParse(formData);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return { error: firstError?.message || 'Validation failed' };
    }

    const existingUser = await prisma.user.findUnique({
      where: { username: parsed.data.username },
    });

    if (existingUser) {
      return { error: 'Username is already taken' };
    }

    const passwordHash = await hashPassword(parsed.data.password);

    const user = await prisma.user.create({
      data: {
        username: parsed.data.username,
        passwordHash,
        avatarColor: parsed.data.avatarColor || null,
      },
    });

    return { success: true, userId: user.id };
  } catch (error) {
    console.error('Registration error:', error);
    return { error: 'Something went wrong. Please try again.' };
  }
}
