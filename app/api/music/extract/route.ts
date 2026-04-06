import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { z } from 'zod';

const schema = z.object({
  url: z.string().url().max(2048),
});

const ALLOWED_HOSTNAMES = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'soundcloud.com',
  'www.soundcloud.com',
  'on.soundcloud.com',
]);

function isAllowedUrl(raw: string): boolean {
  try {
    const { hostname } = new URL(raw);
    return ALLOWED_HOSTNAMES.has(hostname);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: result.error.flatten() },
      { status: 422 },
    );
  }

  const { url } = result.data;

  if (!isAllowedUrl(url)) {
    return NextResponse.json(
      { error: 'URL must be from YouTube or SoundCloud' },
      { status: 422 },
    );
  }

  // ------------------------------------------------------------------
  // Option 1: Proxy to external music extraction microservice
  // ------------------------------------------------------------------
  const extractServiceUrl = process.env.MUSIC_EXTRACT_URL;
  if (extractServiceUrl) {
    let res: Response;
    try {
      res = await fetch(extractServiceUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      return NextResponse.json(
        { error: 'Music extraction service is unreachable' },
        { status: 502 },
      );
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return NextResponse.json(
        { error: 'Extraction service returned an error', detail: text.slice(0, 200) },
        { status: 502 },
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  }

  // ------------------------------------------------------------------
  // Option 2: Local yt-dlp subprocess (requires yt-dlp in PATH)
  // Only available in Node.js runtime (not Edge).
  // ------------------------------------------------------------------
  try {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);

    // Fetch JSON metadata (title, duration, thumbnail, direct audio URL)
    const { stdout, stderr } = await execFileAsync(
      'yt-dlp',
      [
        '--no-playlist',
        '--match-filter', 'duration <= 600', // max 10 minutes
        '-f', 'bestaudio[acodec=opus]/bestaudio[acodec=mp4a]/bestaudio',
        '--no-warnings',
        '-j',
        url,
      ],
      { timeout: 30_000 },
    );

    if (stderr) {
      // yt-dlp writes non-fatal warnings to stderr; only treat as error
      // if stdout is empty (no JSON produced)
      if (!stdout.trim()) {
        return NextResponse.json(
          { error: 'yt-dlp returned no data', detail: stderr.slice(0, 200) },
          { status: 502 },
        );
      }
    }

    const meta = JSON.parse(stdout.trim()) as {
      url?: string;
      urls?: string;
      title?: string;
      duration?: number;
      thumbnail?: string;
    };

    const streamUrl = meta.url ?? meta.urls;
    if (!streamUrl) {
      return NextResponse.json(
        { error: 'yt-dlp did not return a stream URL' },
        { status: 502 },
      );
    }

    return NextResponse.json({
      streamUrl,
      title: meta.title ?? 'Unknown',
      duration: meta.duration ?? 0,
      thumbnailUrl: meta.thumbnail ?? null,
    });
  } catch (err) {
    const isNotFound =
      err instanceof Error &&
      (err.message.includes('not found') || err.message.includes('ENOENT'));

    if (isNotFound) {
      return NextResponse.json(
        {
          error:
            'Music extraction unavailable. ' +
            'Set MUSIC_EXTRACT_URL to point to your extraction microservice, ' +
            'or ensure yt-dlp is installed on the server.',
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { error: 'Extraction failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
