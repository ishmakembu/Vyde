'use client';

export default function OfflinePage() {
  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center gap-6 px-6 text-center"
      style={{ background: 'var(--bg-void)' }}
    >
      {/* Icon */}
      <div className="w-20 h-20 rounded-full bg-[var(--bg-surface)] flex items-center justify-center border border-[var(--border-glass)]">
        <svg
          className="w-10 h-10 text-[var(--text-secondary)]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M3 3l18 18M8.111 8.111A5.99 5.99 0 006 12c0 3.314 2.686 6 6 6a5.99 5.99 0 003.889-1.389M10.586 4.343A6 6 0 0118 12a5.97 5.97 0 01-1 3.293M1 1l22 22"
          />
        </svg>
      </div>

      {/* Heading */}
      <div>
        <h1 className="text-xl font-bold text-white mb-2">You&apos;re offline</h1>
        <p className="text-sm text-[var(--text-secondary)] max-w-xs leading-relaxed">
          Vide needs an internet connection to make and receive calls. Check your network and try again.
        </p>
      </div>

      {/* Retry */}
      <button
        onClick={() => window.location.reload()}
        className="px-6 py-2.5 rounded-full bg-[var(--cyan)] text-[var(--bg-void)] text-sm font-bold hover:opacity-90 active:scale-95 transition-all"
      >
        Try again
      </button>
    </div>
  );
}
