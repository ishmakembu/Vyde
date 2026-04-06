# Vide — Agent Guidelines

> **Stack is bleeding-edge.** Next.js 16, React 19, Tailwind v4, NextAuth v5 (beta), Zod v4, Zustand v5, Framer Motion 12. APIs differ from training data. Consult `docs/` before writing framework code.

## Build & Test

```bash
# Development (both processes required)
npm run dev:all          # Next.js :3000 + WS server :4000 concurrently
npm run dev              # Next.js only
npm run server           # Standalone WS server only (server/index.js)

# Quality
npm run lint
npm run build            # Type-check + production build

# E2E tests (requires running dev server)
npm run test:e2e         # Playwright, Chromium only, baseURL http://localhost:3000
```

**Migrations:** `npx prisma migrate dev --name <name>` — always run after schema changes.
**Prisma client:** `npx prisma generate` after any schema edit.

## Architecture

Two separate processes must run together:
- **Next.js app** (`app/`) — App Router, server components, API routes under `app/api/`
- **WS server** (`server/index.js`) — standalone Node.js/`ws` on port 4000, handles all real-time signaling

### Route groups
| Group | Auth | Purpose |
|---|---|---|
| `app/(auth)/` | Public | `/login`, `/register` |
| `app/(app)/` | Protected | All app pages; guarded at layout level via `await auth()` |
| `app/api/` | Per-route | REST endpoints; always `await auth()` first |
| `app/users/[id]/` | Public | User profile viewer |

### State ownership
| Store | Owns |
|---|---|
| `callStore` | Call lifecycle status, peer info, media toggles, PiP state |
| `chatStore` | In-call messages, typing indicators, unread count |
| `uiStore` | Online status, toast, search, active tab; `theme` is always `'dark'` |
| `offlineQueue` | Queued WS messages (persisted to `localStorage`); retries capped at 3 |

## Key Conventions

### API routes
Every route follows this exact pattern — do not deviate:
```ts
const session = await auth();
if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
const body = await request.json();
const parsed = schema.safeParse(body);
if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
// ... prisma query ...
return NextResponse.json(result, { status: 200 });
```
All Zod schemas live in `lib/validators.ts`. Add new schemas there, not inline.

### Authentication
- NextAuth v5 beta — import `{ auth, signIn, signOut }` from `@/lib/auth`, **not** from `next-auth`.
- Session callback re-fetches the full user from DB on every request — do not cache session fields locally; they are always fresh.
- Password hashing: `@node-rs/argon2` via `hashPassword()` exported from `lib/auth.ts`. Never use `bcryptjs` for new passwords (legacy dep).
- Route protection is at the layout level (`app/(app)/layout.tsx`), not middleware.

### Database
- Import `prisma` from `@/lib/prisma`. No repository layer — query directly in API routes.
- UUIDs for all IDs. `@paralleldrive/cuid2` is available for client-side ID generation (e.g., `callId` before server creates the session).
- Block/mute are `String[]` fields on `User` (IDs of blocked/muted users), not join tables.

### UI / Design System
- Dark-only glassmorphism. CSS tokens defined in `app/globals.css` as `@theme` (Tailwind) + `:root` (raw vars).
- Use `GlassPanel`, `GlassButton`, `GlassInput` from `components/ui/` — do not write raw glass styles.
- `GlassButton` variants: `default | primary | danger | active`. Use `glow` prop for CTAs.
- Framer Motion is imported as `motion` — all interactive elements use `whileHover`/`whileTap`. See `docs/framer-motion.md`.
- Tailwind v4 uses CSS-first config (`@theme` block in `globals.css`), not `tailwind.config.js`. See `docs/tailwind.md`.

### WebSocket / WebRTC signal flow
- WS hook (`useWebSocket`) connects automatically when a session exists. Do not manually manage the socket connection in pages.
- WebRTC signals (offer/answer/ICE) are bridged via `window` custom events (`webrtc:offer`, `webrtc:answer`, `webrtc:ice`) — the `useWebRTC` hook listens on `window`, not directly on the WS socket.
- Call pages must wire `onSendSignal` callback from `useWebRTC` to `wsHook.send()`.
- See `docs/webrtc.md` and `docs/websockets.md` for protocol details.

## Known Pitfalls

- **TURN server is opt-in** — `useWebRTC` reads `NEXT_PUBLIC_TURN_URL`, `NEXT_PUBLIC_TURN_USERNAME`, `NEXT_PUBLIC_TURN_CREDENTIAL` from env. Without them, STUN-only is used and calls will fail across symmetric NAT. Set these vars for production.
- **Session fields are in the JWT** — profile data is baked into the token at login and refreshed on `update()`. After a profile change, call `update()` from the client (`useSession().update()`) so the new values propagate. The session callback no longer hits the DB.
- **Tailwind v4 breaks v3 patterns** — `@apply` with compound variants, arbitrary value syntax, and JIT purge config all changed. Check `docs/tailwind.md` first.
- **NextAuth v5 beta** — `getServerSession()` is removed; use `auth()` everywhere. Import path is `next-auth/next` in v4 but `@/lib/auth` here.
- **Zod v4** — `z.string().nonempty()` is removed; use `z.string().min(1)`. `.parse()` throws `ZodError` not `Error`. Check `docs/zod.md`.

## Docs Reference

| Topic | File |
|---|---|
| Next.js 16 App Router | `docs/nextjs.md` |
| Tailwind v4 | `docs/tailwind.md` |
| NextAuth v5 | `docs/auth.md` |
| Prisma 5 | `docs/prisma.md` |
| Zod v4 | `docs/zod.md` |
| Zustand v5 | `docs/zustand.md` |
| TanStack Query v5 | `docs/react-query.md` |
| Framer Motion 12 | `docs/framer-motion.md` |
| WebRTC | `docs/webrtc.md` |
| WebSocket server | `docs/websockets.md` |
| Glassmorphism UI | `docs/ui-ux.md` |
| PWA / manifest | `docs/pwa.md` |
| TypeScript patterns | `docs/typescript.md` |
| Sentry | `docs/sentry.md` |
| Privacy controls | `docs/privacy.md` |
| Encryption | `docs/encryption.md` |
| Picture-in-Picture | `docs/pip.md` |
