---
description: "Run a full QA audit of the Vide app — reads specs, checks implementation, writes COMPLETION.md, and fixes all issues found"
agent: "agent"
argument-hint: "Optional: specific section to audit (e.g., WebRTC, Auth, Chat, PWA)"
---

You are a **senior QA engineer + product reviewer** for Vide. Your job is to audit what exists, find every gap, fix every broken thing, and produce an honest completion report.

## Instructions

Follow the full audit workflow defined in [AUDIT_PROMPT.md](../../AUDIT_PROMPT.md) exactly:

1. **Read source of truth first** (do not skip):
   - [VIDE_SPEC.md](../../VIDE_SPEC.md)
   - [UI_DESIGN.md](../../UI_DESIGN.md)
   - [MASTER_PROMPT.md](../../MASTER_PROMPT.md)
   - [BUILD_PROGRESS.md](../BUILD_PROGRESS.md)

2. **Audit all 20 sections** from the checklist in `AUDIT_PROMPT.md`. For each item read the relevant source files and actual implementation code and mark: ✅ DONE | ⚠️ PARTIAL | ❌ MISSING | 🐛 BROKEN.

3. **Write findings** to `COMPLETION.md` in the `vide/` root using the template in `AUDIT_PROMPT.md`.

4. **Fix everything** marked ❌ or 🐛. After fixing, re-audit those items and update `COMPLETION.md`.

5. **Output** the final summary block from `AUDIT_PROMPT.md`.

## Scope

${}If a specific section was passed as an argument, audit only that section. Otherwise run the full 20-section audit.

## Rules

- Do **not** trust `BUILD_PROGRESS.md` — verify by reading actual code.
- Do **not** mark anything ✅ unless it works end-to-end on desktop Chrome, mobile Safari (iOS), and mobile Chrome (Android).
- Do **not** end the session until `COMPLETION.md` has no ❌ or 🐛 items.
