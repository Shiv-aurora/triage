# Task 03 — Settings & Reconcile Job (completes Part 1)

**Project:** Triage — smart triage + coordination layer for the Reddit modqueue
**Phase:** 3 of build. After this task, Part 1 is a complete, robust, install-ready
product. Part 2 (claims + realtime) is the next and final feature phase.

---

## Objective

Two things: (1) let moderators tune the scoring weights and severity map without
touching code, and (2) add a scheduled reconcile job so the queue self-heals —
catching items triggers missed and pruning items resolved outside the board.

---

## Read first

- `triage-build-spec.md` — section 5 (scoring), section 6 (event flow, the
  reconcile job), section 2 (scope — note what is cuttable).
- `PROGRESS.md` — confirmed APIs and current backend contract.

---

## What to do

### 1. Settings backend
- Define a `Settings` type in `src/shared/types.ts`: the five scoring weights
  (`humanReportBoost`, `reportVolume`, `reasonSeverity`, `authorRisk`, `staleness`)
  and the severity map (reason string → `high` | `medium` | `low`).
- Store settings in Redis under `triage:settings`, or use Devvit's native settings
  capability if it fits cleanly — **check current docs and choose**; note the
  decision in `PROGRESS.md`.
- On `AppInstall`, seed the spec's default weights and severity map so the tool
  works with zero configuration.
- `scoring.ts` must now read weights from the passed-in settings instead of
  hardcoded constants. Keep it pure — settings come in as an argument, not via a
  Redis call inside the scoring function. The queue layer loads settings and
  passes them in.

### 2. Settings UI
A settings view a moderator can reach from the board (a button/tab on the board,
or a separate menu action — pick the cleaner one and note it). It lets a mod:
- Adjust each of the five weights (sliders or number inputs).
- Edit the severity tier for each report reason.
- Save (writes settings), and Reset to defaults.
Match the board's visual language — same palette, spacing, type scale. Not a raw
form dump.

### 3. Recompute on settings change
When settings are saved, existing queued items still carry old scores. Recompute
all items in `triage:queue` against the new settings and re-rank. A single pass
over the sorted set is fine — the queue is not large.

### 4. Scheduled reconcile job (`src/server/scheduler.ts`)
Register a scheduled job (confirm the current Devvit scheduler API and how
recurring jobs are declared — `devvit.json` and/or code). Every ~2 minutes:
- Fetch the subreddit's current modqueue via the Reddit API (confirm the method —
  e.g. modqueue listing for the subreddit).
- **Add** any reported item present in the modqueue but missing from
  `triage:queue` (triggers can miss events).
- **Prune** any item in `triage:queue` no longer in the modqueue (resolved
  elsewhere — e.g. native modqueue, another tool).
- This makes the board trustworthy: it converges to the true queue even if a
  trigger is dropped.

### 5. Optional, only if time is comfortable — AutoMod attribution backfill
The modqueue listing may expose per-report reporter info that the trigger payload
did not. If so, the reconcile job can refine the community-vs-automated split.
This is **cuttable** — do it only if Part 1 is otherwise solid and time allows.
Do not let it block the task.

---

## Constraints

- Verify the settings API, scheduler API, and modqueue-listing method against
  current official Devvit docs. Note all three in `PROGRESS.md`.
- `scoring.ts` stays pure — settings are an argument. Re-run its unit tests with a
  custom settings object to prove weights actually drive the score.
- Do NOT build claims, realtime, the active-mods strip, or auto-split. Those are
  Task 04.
- TypeScript strict.

---

## Definition of Done

- [ ] `Settings` type defined; defaults seeded on install.
- [ ] `scoring.ts` reads weights from passed-in settings; unit tests cover a
      non-default settings object.
- [ ] Settings UI works: adjust weights + severity, save, reset.
- [ ] Saving settings recomputes and re-ranks the existing queue.
- [ ] Reconcile job runs on schedule: adds missed items, prunes resolved ones.
- [ ] Verified live on `r/triage_tool_dev`: change a weight, save, watch the
      ranking shift; and confirm the reconcile job adds/prunes correctly (e.g.
      resolve an item natively in the modqueue and watch it leave the board).
- [ ] type-check, tests, lint, build all pass. `PROGRESS.md` updated.

---

## Report back

When done, tell me:
1. Where settings are stored (Redis vs native) and the scheduler API used.
2. The modqueue-listing method used in the reconcile job.
3. Confirmation of the live tests: weight change re-ranks; reconcile adds/prunes.
4. Whether you attempted the optional AutoMod backfill, and the result.
5. Any spec assumption that turned out wrong.

This completes Part 1. Do not proceed to Task 04. Stop and report.
