---
description: "Complete all ❌ Missing and ⚠️ Partial items in COMPLETION.md. Use when you want to systematically implement everything not yet done in the Vide project."
argument-hint: "Optional: section number or item prefix to focus on (e.g. '15' or 'PWA')"
agent: "agent"
---

# Finish All Missing & Partial Items

Read [COMPLETION.md](../COMPLETION.md) and complete every row marked ❌ or ⚠️ that is technically feasible in a local codebase (skip items that require external infrastructure, e.g. Redis, multi-server, or native binary assets like PNG icons unless the user explicitly requests them).

## Step 1 — Inventory

Parse every table in COMPLETION.md. Build a prioritised todo list:

1. **P0** — Security / broken items (❌ with security note)
2. **P1** — Core UX gaps (❌ or ⚠️ in sections 1–10, 14–16, 18–20)
3. **P2** — Advanced / nice-to-have (❌ in sections 11–13, 17)

If the user passed an argument (e.g. "15" or "PWA"), restrict the todo list to rows in that section only.

## Step 2 — Implement

Work through the todo list one item at a time:

- Mark the todo **in-progress** before touching files.
- Read the relevant file(s) before editing.
- Keep changes minimal and focused — only fix the gap described in the COMPLETION.md row.
- Do **not** refactor unrelated code.
- After each implementation verify: no new TypeScript errors in the modified file.

### Implementation hints by area

| Section | Key files |
|---------|-----------|
| Server / WebSocket | `server/index.js` |
| WebRTC / media | `hooks/useWebRTC.ts` |
| WebSocket client | `hooks/useWebSocket.ts` |
| Call screen | `app/(app)/call/page.tsx` |
| Directory | `app/(app)/directory/page.tsx` |
| Friends | `app/(app)/friends/page.tsx`, `app/api/friends/route.ts` |
| Profile | `app/(app)/profile/page.tsx`, `app/api/profile/route.ts` |
| Chat | `components/chat/ChatPanel.tsx`, `app/api/messages/route.ts` |
| Reactions | `components/call/ReactionsPanel.tsx` |
| Music | `hooks/useMusic.ts`, `components/call/MusicPlayer.tsx` |
| Watch Together | `components/call/TheatreMode.tsx`, `app/(app)/call/page.tsx` |
| PWA | `next.config.ts`, `public/manifest.json` |
| iOS | `app/(app)/call/page.tsx`, `hooks/useWebRTC.ts` |
| API routes | `app/api/**` |
| Error handling | `lib/prisma.ts`, API route catch blocks |
| Performance | individual component files |

## Step 3 — Update COMPLETION.md

After each item is implemented, update its row in COMPLETION.md:

- Change `❌` → `✅` with a concise implementation note.
- Change `⚠️` → `✅` (or keep `⚠️` only if still genuinely partial after your change).
- Update the **Summary** counts at the top accordingly.
- Add the fix to the **"Fixed This Session"** list with the format:
  `N. **\`path/to/file\`** — One-sentence description of what changed.`

## Step 4 — Report

When all feasible items are done, output a brief summary table:

| Item | Result | Notes |
|------|--------|-------|
| (description) | ✅ Done / ⚠️ Partial / ⏭️ Skipped | reason if skipped |

List any **skipped** items with the reason (e.g. "requires external service", "needs PNG asset", "blocked by missing env var").
