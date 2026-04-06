import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { hash, verify } from '@node-rs/argon2';
import { prisma } from './prisma';
import { loginSchema } from './validators';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      username: string;
      status?: string | null;
      statusEmoji?: string | null;
      avatar?: string | null;
      avatarColor?: string | null;
      bio?: string | null;
      isPrivate: boolean;
      frameTheme: string;
      showLastSeen: boolean;
      showReadReceipts: boolean;
      createdAt: string;
    };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  adapter: PrismaAdapter(prisma),
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          return null;
        }

        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { username: parsed.data.username },
        });

        if (!user) {
          return null;
        }

        const isValid = await verify(user.passwordHash, parsed.data.password);
        if (!isValid) {
          return null;
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { lastSeen: new Date() },
        });

        return {
          id: user.id,
          name: user.username,
          email: null,
          image: user.avatar,
        };
      },
    }),
  ],
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60,
  },
  callbacks: {
    async jwt({ token, user, trigger, session: updatedSession }) {
      if (user) {
        // Initial sign-in: hydrate all profile fields into the token (one DB fetch here,
        // zero DB fetches on every subsequent session() call).
        const dbUser = await prisma.user.findUnique({ where: { id: user.id as string } });
        if (dbUser) {
          token.id = dbUser.id;
          token.username = dbUser.username;
          token.status = dbUser.status;
          token.statusEmoji = dbUser.statusEmoji;
          token.avatar = dbUser.avatar;
          token.avatarColor = dbUser.avatarColor;
          token.bio = dbUser.bio;
          token.isPrivate = dbUser.isPrivate;
          token.frameTheme = dbUser.frameTheme;
          token.showLastSeen = dbUser.showLastSeen;
          token.showReadReceipts = dbUser.showReadReceipts;
          token.createdAt = dbUser.createdAt.toISOString();
        }
      }
      if (trigger === 'update') {
        // Profile updated: re-fetch fresh fields from DB to refresh the token.
        const dbUser = await prisma.user.findUnique({ where: { id: token.id as string } });
        if (dbUser) {
          token.username = dbUser.username;
          token.status = dbUser.status;
          token.statusEmoji = dbUser.statusEmoji;
          token.avatar = dbUser.avatar;
          token.avatarColor = dbUser.avatarColor;
          token.bio = dbUser.bio;
          token.isPrivate = dbUser.isPrivate;
          token.frameTheme = dbUser.frameTheme;
          token.showLastSeen = dbUser.showLastSeen;
          token.showReadReceipts = dbUser.showReadReceipts;
        }
      }
      return token;
    },
    async session({ session, token }) {
      // No DB query — all fields come from the JWT token.
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.username = token.username as string;
        session.user.status = (token.status as string | null | undefined) ?? null;
        session.user.statusEmoji = (token.statusEmoji as string | null | undefined) ?? null;
        session.user.avatar = (token.avatar as string | null | undefined) ?? null;
        session.user.avatarColor = (token.avatarColor as string | null | undefined) ?? null;
        session.user.bio = (token.bio as string | null | undefined) ?? null;
        session.user.isPrivate = token.isPrivate as boolean;
        session.user.frameTheme = token.frameTheme as string;
        session.user.showLastSeen = token.showLastSeen as boolean;
        session.user.showReadReceipts = token.showReadReceipts as boolean;
        session.user.createdAt = (token.createdAt as string | undefined) ?? new Date(0).toISOString();
      }
      return session;
    },
  },
  secret: process.env.AUTH_SECRET,
});

export async function hashPassword(password: string): Promise<string> {
  return hash(password, {
    memoryCost: 19456,
    timeCost: 2,
    outputLen: 32,
    parallelism: 1,
  });
}