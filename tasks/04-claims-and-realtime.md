# Task 04 — Coordination Layer: Claims & Realtime (Part 2 — the differentiator)

**Project:** Triage — smart triage + coordination layer for the Reddit modqueue
**Phase:** 4 of build. This is Part 2 — the feature that makes Triage unique to
Devvit and is the strongest reason the concept can place. Part 1 is already a
complete shippable product, so everything here is upside built on a solid base.

---

## Objective

Let multiple moderators work the same queue without colliding. A mod can **claim**
an item; every other mod viewing the board sees that claim **instantly** via
realtime. Claimed cards lock for others. Stale claims auto-release. An active-mods
strip shows who is working.

---

## Read first

- `triage-build-spec.md` — section 2 (Part 2 scope + the hard cut line), section 6
  (claim/unclaim flow), section 7 (UX).
- `PROGRESS.md` — confirmed APIs and current contract.

---

## SCOPE & CUT LINE — read this first

Build in this order. Each item must fully work before starting the next:

1. **Claim / unclaim** — backend + UI. (must ship)
2. **Realtime propagation** — other boards update live. (must ship)
3. **Stale-claim auto-release.** (must ship — small)
4. **Active-mods presence strip.** (cuttable)
5. **Auto-split queue across active mods.** (cuttable — do not start unless 1–4
   are solid and time is genuinely comfortable)

If time gets tight, ship 1–3 and cut 4–5 cleanly. A working claim system with
live updates is the differentiator. A half-built auto-split is worth nothing.
**Never leave a partially-built feature in the submission.**

---

## What to do

### 1. Claim / unclaim
- Add `claimedBy` and `claimedAt` to the `TriageItem` (already in the spec type —
  wire them through Redis read/write).
- `/api/claim` and `/api/unclaim` endpoints: take a thingId, set/clear claim
  fields for the current viewer.
- **Reject a conflicting claim**: if an item is already claimed by someone else
  and not stale, return a clear "already claimed by u/x" response. Last-write-wins
  is not acceptable here — check before writing.
- UI: a **Claim** button on each card. When claimed, the card shows a claim badge
  ("u/x is reviewing") and, for everyone except the claimer, the action buttons
  lock/dim. The claimer gets an **Unclaim** button.

### 2. Realtime propagation
- Confirm the current Devvit realtime API — how the server publishes and how the
  client subscribes (channel naming, hooks/handlers). Check current docs; note
  exactly what you used in `PROGRESS.md`.
- Server publishes on channel `triage_live` for: claim, unclaim, item resolved,
  item added/updated.
- The board subscribes and updates in place — a claim by another mod appears
  within ~1–2s **without waiting for the 20s poll**. Keep the poll as a safety
  net; realtime is the primary path.

### 3. Stale-claim auto-release
- A claim older than a threshold (default ~10 min — make it a constant) is
  treated as expired: the item is claimable again.
- The existing reconcile job is the natural place to clear expired claims and
  publish an unclaim event for each. Confirm and wire it there.

### 4. Active-mods presence strip (cuttable)
- Show which moderators currently have the board open. Simplest viable approach:
  on board load and periodically, the client pings a `/api/heartbeat` endpoint
  that records `triage:presence:{username}` with a short TTL; the board reads the
  set of non-expired presence keys and renders avatars/names.
- Keep it simple. If the realtime API offers presence natively, prefer that.

### 5. Auto-split (cuttable — only if 1–4 solid and time comfortable)
- A "Divvy up" action assigns the top-N unclaimed items round-robin across
  currently-active mods (claims them on each mod's behalf). Publish all the
  resulting claim events. If there is any doubt about time, skip this entirely.

---

## Constraints

- Verify the realtime API and any presence API against current official Devvit
  docs. Do not assume — note what you used in `PROGRESS.md`.
- Conflicting claims must be rejected server-side with a check-before-write.
- Realtime must not break the board if a message is malformed or dropped — the
  20s poll remains the safety net. Handle realtime errors gracefully.
- Respect the cut line. Do not start a cuttable item unless the prior items fully
  work. Do not leave anything half-built.
- TypeScript strict.

---

## Definition of Done

- [ ] Claim/unclaim endpoints work; conflicting claims rejected server-side.
- [ ] Claim UI: Claim/Unclaim buttons, claim badge, locked actions for non-claimers.
- [ ] Realtime: a claim on one board appears on another within ~1–2s.
- [ ] Stale claims auto-release via the reconcile job.
- [ ] (If built) active-mods strip works. (If built) auto-split works.
- [ ] Anything cut is cut cleanly — no dead code, no half-feature in the UI.
- [ ] Verified live with TWO browser sessions / two mod views on
      `r/triage_tool_dev`: mod A claims an item, mod B sees it lock live; mod A
      unclaims, mod B sees it free up.
- [ ] type-check, tests, lint, build all pass. `PROGRESS.md` updated, including
      exactly which cuttable items were built vs cut.

---

## Report back

When done, tell me:
1. The realtime API used (publish + subscribe mechanism, channel setup).
2. Which cuttable items (4, 5) you built vs cut, and why.
3. Confirmation of the two-session live test: claim locks/frees across boards.
4. How conflicting claims are rejected.
5. Any spec assumption that turned out wrong.

This completes the feature build. Do not start anything else. Stop and report —
the next phase is testing, the demo video, and the submission writeup.
