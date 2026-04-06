'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <h2 className="text-2xl font-semibold text-text-primary mb-2">Something went wrong</h2>
        <p className="text-text-secondary mb-4">
          An unexpected error occurred. Please try again.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => reset()}
            className="px-4 py-2 rounded-lg bg-accent text-bg-base hover:bg-accent/90 transition-colors"
          >
            Try again
          </button>
          <button
            onClick={() => router.push('/directory')}
            className="px-4 py-2 rounded-lg bg-bg-surface text-text-primary hover:bg-bg-elevated transition-colors"
          >
            Go to Directory
          </button>
        </div>
      </div>
    </div>
  );
}