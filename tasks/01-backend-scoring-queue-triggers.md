# Task 01 — Backend: Scoring Engine, Redis Queue & Triggers

**Project:** Triage — smart triage + coordination layer for the Reddit modqueue
**Phase:** 1 of build. Backend only. No client UI work in this task.

---

## Objective

Turn the proven pipeline from Task 00 into a real ranked backend. After this task,
every reported post **and comment** lands in a Redis sorted set ranked by a
transparent `triageScore`, mod actions resolve items, and `/api/queue` returns the
fully ranked list with complete item data. The client still renders whatever it
renders — UI is the next task.

---

## Read first

- `triage-build-spec.md` — sections 4 (data model), 5 (scoring engine), 6 (event flow).
- `PROGRESS.md` — the confirmed Devvit APIs from Task 00. Reuse them; don't re-derive.

---

## Confirmed APIs from Task 00 (use these)

- Triggers configured in `devvit.json` as `triggers.onPostReport` → endpoint path.
  Handler types `OnPostReportRequest`, `TriggerResponse` from `@devvit/web/shared`.
- Redis from `@devvit/web/server`: `redis.hSet(key, fieldValues)`,
  `redis.hGetAll(key)`, `redis.zAdd(key, { member, score })`,
  `redis.zRange(key, start, stop, { by: "rank", reverse: true })`.
- Reddit client: `import { reddit } from '@devvit/web/server'`.
- Server is Hono; `/api/queue` endpoint already exists.

---

## What to do

### 1. Shared types (`src/shared/types.ts`)
Implement `TriageItem` and `ScoreBreakdown` exactly per spec section 4. This is
the contract every later task depends on — get it right.

### 2. Scoring engine (`src/server/scoring.ts`)
Pure, deterministic functions — no Redis, no I/O. Implement `triageScore` per spec
section 5: weighted sum of `humanReportBoost`, `reportVolume` (log-scaled),
`reasonSeverity` (configurable severity map), `authorRisk`, `staleness`. Return both
the total and a `ScoreBreakdown` with each component's contribution.
Hardcode the spec's default weights for now as named constants (settings UI is a
later task). **Write unit tests** covering: human vs automod, multiple reports,
high vs low severity, author with prior removals, an aged item.

### 3. Redis queue layer (`src/server/queue.ts`)
- `upsertItem(...)`: read existing `triage:item:{thingId}` hash if present, merge in
  the new report, recompute score via `scoring.ts`, write the hash back, and
  `zAdd` the thingId to `triage:queue` with the new score.
- `resolveItem(thingId)`: remove from `triage:queue` and delete the item hash.
- `getRankedQueue()`: `zRange` the sorted set (reverse, by rank) → hydrate each
  thingId's full `TriageItem` from its hash → return the array.
- `bumpAuthorRemoval(username)`: increment `triage:author:{username}` removal count.
- **Confirm the exact method names for removing a sorted-set member and deleting a
  key** (`zRem`, `del`, or whatever current Devvit Redis exposes) from the docs —
  do not assume. Note what you used in `PROGRESS.md`.

### 4. Triggers (`src/server/triggers.ts`)
- **Extend `onPostReport`** (already wired): on fire, accumulate into the item —
  `reportCount++`, push the report reason, increment `humanReports` or
  `automodReports`, then `upsertItem`.
- **Add `onCommentReport`** — same logic for comments (`kind: 'comment'`, store a
  `bodyPreview`). Confirm the exact trigger name and request type from docs.
- **Add `onModAction`** — if the action resolves an item (approve/remove/spam on a
  post or comment): call `resolveItem`. If it is a removal: also call
  `bumpAuthorRemoval` for that author. Confirm the trigger name, request type, and
  the action-name strings from docs.

### 5. Report-reason handling — INVESTIGATE, then implement
The "de-collapse spam reports" feature depends on what the report payload exposes.
Two things to determine from the docs / payload types:
- Does the report trigger payload carry the **report reason** for that report? If
  yes, accumulate distinct reasons with counts on the item across trigger fires.
- How do you tell a **human report from an AutoModerator report**? (Check the
  payload for a reporter field / flag.) The human-vs-automod split drives the
  single biggest scoring signal — it must be correct.
Document your findings in `PROGRESS.md`. If a piece genuinely isn't available from
the trigger payload, note it — the modqueue reconcile job in a later task can
backfill it. Do not silently guess.

### 6. `/api/queue` endpoint
Return `getRankedQueue()` — the real ranked list of full `TriageItem` objects,
highest score first.

---

## Constraints

- Verify any API not already confirmed in `PROGRESS.md` against current official
  docs. Do not trust memory for method names.
- `scoring.ts` stays pure and fully unit-tested — it is the part most likely to
  have subtle bugs and the easiest to test in isolation.
- Do NOT build client UI, the settings page, claims, realtime, or the scheduler.
  Those are Tasks 02–04. Backend only.
- TypeScript strict. No `any` on the `TriageItem` path.

---

## Definition of Done

- [ ] `TriageItem` + `ScoreBreakdown` implemented per spec section 4.
- [ ] `scoring.ts` implemented, pure, with passing unit tests.
- [ ] `queue.ts` implemented: upsert, resolve, getRankedQueue, bumpAuthorRemoval.
- [ ] `onPostReport`, `onCommentReport`, `onModAction` all wired and handled.
- [ ] Report-reason + human/automod detection investigated and documented.
- [ ] `/api/queue` returns the real ranked list.
- [ ] Verified live: reporting multiple posts/comments produces a correctly
      *ranked* `/api/queue` response; a mod action removes the item from it.
- [ ] `PROGRESS.md` updated: new confirmed APIs, report-reason findings, blockers.

---

## Report back

When done, tell me:
1. Whether the report payload exposes report reasons and the human/automod
   distinction — and how you implemented it.
2. The exact Redis method names you used for sorted-set removal and key deletion.
3. Confirmation that `/api/queue` returns a correctly ranked list, with a short
   example (a few items + their scores) from a live test.
4. Any spec assumption that turned out wrong.

Do not proceed to Task 02. Stop and report.
