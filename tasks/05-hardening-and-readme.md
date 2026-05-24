# Task 05 — Hardening, Clean-Install Test & README

**Project:** Triage — smart triage + coordination layer for the Reddit modqueue
**Phase:** 5 — final. No new features. This phase makes the build submission-ready:
prove it installs and works cleanly, fix rough edges, write the README.

---

## Read first

- `triage-build-spec.md` — section 9 (submission checklist).
- `PROGRESS.md` — full current state.

---

## PREREQUISITE — two manual verifications must be recorded first

Before this task is meaningfully complete, two human-run live tests must be
confirmed and their results written into `PROGRESS.md`:

1. **Settings UI** — changing a weight and saving visibly re-ranks the queue.
2. **Two-session claim test** — mod A claims an item, mod B's board locks it live
   (or, if realtime does not propagate, claims still work via the 20s poll).

If those results are not yet in `PROGRESS.md`, note that they are still
outstanding and proceed with the rest of this task — but the README and any
realtime claims must reflect *verified* behavior only. Do not describe live
realtime coordination as confirmed if it has not been confirmed.

---

## What to do

### 1. Clean-install regression test
Treat this as a brand-new moderator installing Triage for the first time.
Install the current build fresh (a clean test subreddit if practical, otherwise a
clean board post on the dev sub) and walk the entire flow end to end:
- App installs; defaults seed; the board post can be created from the menu.
- Report several posts and comments → board ranks them correctly.
- Score breakdown expands. Report reasons de-collapse.
- Settings: change weights, save, queue re-ranks; reset works.
- Approve and Remove from the board both work.
- Claim/unclaim works; conflict is rejected.
- Reconcile job adds missed items and prunes resolved ones.
Record the result of each step. Fix anything broken. The goal is to confirm the
**zero-config install experience** the hackathon rubric explicitly rewards.

### 2. Polish pass
- Resolve or document the lingering Vite/Devvit build warning if it is quick and
  safe; if not, note why it is harmless.
- Check every UI state once more: loading, empty, error, blocked (non-mod),
  populated. No blank screens, no raw error dumps.
- Tidy obvious rough edges — alignment, spacing, copy. Do not redesign.
- Remove dead code, console noise, and any TODO stubs.

### 3. README.md
A clear README a hackathon judge will read:
- One-paragraph what-it-is and the problem it solves (modqueue triage +
  coordination).
- Install steps for a moderator.
- The mod workflow: how the board, scoring, settings, moderation, and claims are
  used day to day.
- A short "how it works" — triggers, scoring, Redis, reconcile job, realtime.
- Honest scope notes: what is verified, and the known attribution limitation
  (community vs automated reports).
- Leave clear placeholders for screenshots/the demo video link.

### 4. App listing text
Draft the text for the developer.reddit.com app listing — a tight name +
description a moderator browsing the App Directory would understand immediately.
Put it in the README or a `SUBMISSION.md` so the human can paste it.

---

## Constraints

- No new features. No refactors beyond polish.
- Every factual claim in the README must match verified behavior. If realtime
  live-propagation is not human-verified, describe claims as poll-backed and note
  realtime as best-effort — accuracy over marketing.
- type-check, tests, lint, build must all pass at the end.

---

## Definition of Done

- [ ] Clean-install regression walk completed; every step's result recorded.
- [ ] Anything broken in the walk is fixed.
- [ ] All five UI states verified clean.
- [ ] Dead code / console noise / stub TODOs removed.
- [ ] README.md written, accurate, with screenshot/video placeholders.
- [ ] App listing name + description drafted.
- [ ] type-check, tests, lint, build all pass.
- [ ] `PROGRESS.md` updated with the final state and the two manual-test results
      (or a clear note that they remain outstanding).

---

## Report back

When done, tell me:
1. The clean-install walk result — each step pass/fail.
2. Anything you fixed in this phase.
3. Whether the two manual verifications are confirmed in `PROGRESS.md` yet.
4. The drafted app listing name + description.
5. Any remaining known issue, however small.

This is the final build task. After this: the human records the demo video and
the submission writeup is finalized.
