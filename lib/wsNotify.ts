/**
 * Push a WebSocket message directly to an online user via the WS server's
 * internal HTTP endpoint. If the user is offline the call returns { delivered: false }
 * and the caller is responsible for persisting a DB notification.
 */
export async function pushWsNotification(
  userId: string,
  message: { type: string; payload: unknown }
): Promise<boolean> {
  const wsUrl = process.env.NEXT_PUBLIC_WS_URL?.replace(/^ws/, 'http') ?? 'http://localhost:4000';
  const secret = process.env.INTERNAL_SECRET ?? process.env.AUTH_SECRET ?? '';

  try {
    const res = await fetch(`${wsUrl}/internal/notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': secret,
      },
      body: JSON.stringify({ userId, message }),
    });
    if (!res.ok) return false;
    const data = await res.json() as { delivered?: boolean };
    return data.delivered === true;
  } catch {
    // WS server unreachable — treat as offline
    return false;
  }
}
