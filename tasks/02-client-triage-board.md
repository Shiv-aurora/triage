# Task 02 — Client: The Triage Board UI

**Project:** Triage — smart triage + coordination layer for the Reddit modqueue
**Phase:** 2 of build. Client UI + the moderation-action endpoint. This is the
visible product — design quality is judged, so polish matters here.

---

## Objective

Build the real Triage board: a mod-only React custom post that fetches the ranked
queue from `/api/queue` and renders it as a clean, scannable list of triage cards
with score breakdowns, de-collapsed report reasons, and working quick actions
(Approve / Remove / Open). After this task, a moderator can open the board and
actually triage their queue.

---

## Read first

- `triage-build-spec.md` — section 7 (client UX notes), section 4 (`TriageItem` shape).
- `PROGRESS.md` — confirmed APIs and the Task 01 backend contract.

---

## What to do

### 1. Client data layer (`src/client/api.ts`)
Typed fetch wrappers: `getQueue()` → `TriageItem[]` from `/api/queue`, and
`moderate(thingId, action)` → calls the new `/api/moderate` endpoint (below).
Reuse the shared types from `src/shared/types.ts` — no duplicate type defs.

### 2. Moderation endpoint (`src/server/api.ts`)
Add `/api/moderate` accepting a thingId + action (`approve` | `remove`). It calls
the Reddit API to approve or remove the post/comment, then calls `resolveItem`
from `queue.ts` so the item leaves the queue. **Confirm the exact Reddit API
moderation methods** (e.g. `post.approve()` / `post.remove()` or `reddit.*`
equivalents) against current docs — note what you used in `PROGRESS.md`.

### 3. Board (`src/client/App.tsx`)
- On load, fetch the queue and render it ranked (highest score first).
- Poll `/api/queue` every ~20s to stay fresh (realtime comes in a later task — a
  simple interval poll is correct for now).
- Four explicit states, all designed — no blank screens:
  - **Loading** — a skeleton or spinner, not an empty page.
  - **Empty** — "Queue is clear" with a calm, positive treatment.
  - **Error** — a readable message + a retry button.
  - **Populated** — the ranked card list.
- After a moderation action, optimistically remove the card, then reconcile on the
  next poll.

### 4. `TriageCard` (`src/client/components/TriageCard.tsx`)
Each card shows:
- Post title, or comment body preview (`kind` decides which).
- Author, with a **risk flag** when `authorRemovalCount > 0` (e.g. "3 prior removals").
- A **human/automod badge** — visually distinct; community-reported items must
  read as higher priority at a glance. This is the core differentiator — make it
  obvious.
- `ReportReasons` (component below).
- A **score pill** showing `triageScore`.
- Age in queue, derived from `createdAt` (e.g. "12m in queue").
- Action row: **Approve**, **Remove**, **Open** (Open links to the item's
  permalink in a new tab).

### 5. `ReportReasons` (`src/client/components/ReportReasons.tsx`)
The de-collapsed reasons: list each distinct report reason with its count, and
visually separate community (`userReportReasons`) from moderator/automated
(`modReportReasons`) reports. This directly demonstrates the "spam de-collapse"
feature — it should be legible, not a wall of text.

### 6. `ScoreBreakdown` (`src/client/components/ScoreBreakdown.tsx`)
Collapsible panel inside the card. When expanded, shows each `ScoreBreakdown`
signal and its point contribution (human report boost, report volume, severity,
author risk, staleness). This transparency is a deliberate trust feature — and
judges notice it.

### 7. Mod-only gating
On board load, verify the viewer is a moderator of the subreddit. Non-mods see a
friendly "Triage is a moderator tool" message — never the queue data or actions.
Confirm the current way to check viewer mod status from docs.

---

## Design direction (this is judged — do not ship starter-default styling)

- Aim for a **dense, scannable triage console**, not a generic card grid. A mod
  scanning 40 items needs fast vertical rhythm and clear hierarchy.
- Establish a real visual hierarchy: score pill and human/automod badge are the
  loudest elements; metadata is quiet; reasons are mid-weight.
- Pick a restrained, deliberate palette — severity/priority can carry subtle
  color, but avoid a rainbow. It should look like a tool a moderator trusts.
- Consistent spacing scale, one type scale, aligned everything. Polish reads as
  competence.
- It can borrow Reddit-native familiarity but should feel like a considered
  product, not a default template. Avoid the generic-AI-app look.
- Responsive and legible at the width a custom post actually renders at.

---

## Constraints

- Verify any unconfirmed API (moderation methods, viewer mod-status check) against
  current official Devvit docs. Note them in `PROGRESS.md`.
- Reuse `src/shared/types.ts` — no duplicated or divergent types.
- Do NOT build: the settings page / weight editing, claims, realtime updates, the
  active-mods strip, the scheduler. Those are Tasks 03–04.
- TypeScript strict. Keep components small and focused per the file structure.

---

## Definition of Done

- [ ] `/api/moderate` endpoint works — approve/remove hits the Reddit API and
      resolves the item from the queue.
- [ ] Board fetches `/api/queue`, renders ranked, polls for freshness.
- [ ] Loading / empty / error / populated states all implemented and designed.
- [ ] `TriageCard` shows title/preview, author + risk flag, human/automod badge,
      reasons, score pill, age, and working actions.
- [ ] `ReportReasons` de-collapses reasons with counts, community vs mod separated.
- [ ] `ScoreBreakdown` expandable panel works.
- [ ] Mod-only gating works; non-mods see the friendly message.
- [ ] Verified live on `r/triage_tool_dev`: report a few posts/comments, open the
      board, confirm ranking is correct, expand a breakdown, and successfully
      approve/remove an item from the board.
- [ ] type-check, tests, lint, build all pass. `PROGRESS.md` updated.

---

## Report back

When done, tell me:
1. The Reddit API methods used for moderation and the viewer mod-status check.
2. Confirmation of the live test: ranking correct, actions work from the board.
3. A screenshot or clear description of how the board looks (since I'm helping
   judge polish before submission).
4. Any spec assumption that turned out wrong.

Do not proceed to Task 03. Stop and report.
