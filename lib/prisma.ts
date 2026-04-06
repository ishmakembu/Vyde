import { PrismaClient } from '@prisma/client';
import { NextResponse } from 'next/server';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function buildDatabaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url) return url;
  try {
    const u = new URL(url);
    // Limit pool size for cloud DB (Aiven free tier) to prevent P1001 exhaustion
    if (!u.searchParams.has('connection_limit')) u.searchParams.set('connection_limit', '5');
    if (!u.searchParams.has('pool_timeout')) u.searchParams.set('pool_timeout', '10');
    if (!u.searchParams.has('connect_timeout')) u.searchParams.set('connect_timeout', '10');
    return u.toString();
  } catch {
    return url;
  }
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: buildDatabaseUrl() } },
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/** Returns true when an error looks like a database connectivity failure. */
export function isDbConnectionError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes('ECONNREFUSED') ||
    msg.includes('connect') ||
    msg.includes('Can\'t reach database') ||
    msg.includes('Connection refused') ||
    msg.includes('timed out')
  );
}

/** Returns a 503 or 500 NextResponse based on whether the DB is unreachable. */
export function dbErrorResponse(error: unknown, label = 'Operation'): NextResponse {
  const status = isDbConnectionError(error) ? 503 : 500;
  const message = status === 503 ? 'Service temporarily unavailable' : `${label} failed`;
  return NextResponse.json({ error: message }, { status });
}