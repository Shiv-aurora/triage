# Triage — Build Spec & Claude Code Handoff

**Project:** A smart triage + coordination layer for the Reddit modqueue
**Event:** Reddit Mod Tools & Migrated Apps Hackathon — *New Mod Tool* category
**Deadline:** May 27, 2026, 9:00pm EDT
**Platform:** Devvit Web (React) — Reddit's Developer Platform

> Keep this file in the repo root. The Claude Code prompt at the bottom tells the
> agent to read it. It is the single source of truth for scope and architecture.

---

## 1. The thesis (why this can place)

A CHI 2026 paper (Bajpai & Chandrasekharan, *"In the Queue"*) surveyed 110 mods
across 400+ subreddits and documented three concrete modqueue pain points:

1. Mods **cannot sort human reports above automod reports** — they want to, the
   modqueue won't let them, so they fall back to sorting by newest.
2. **Spam reports collapse under one "spam" label** even though they come from
   several distinct user-selected reasons — granularity is lost.
3. **No review coordination** — multiple mods, zero shared awareness of who is
   handling what; duplicated work and missed items.

Triage solves all three. Points 1 and 2 are a *smart ranked queue*. Point 3 is a
*real-time coordination layer* — and that third piece is only possible because of
Devvit's KV + realtime primitives. Old PRAW/Data-API bots could not do shared
live state well, which is why no existing bot solves it. That hits the hackathon's
"unique to the Devvit ecosystem" criterion directly, and it is a new tool, not a
port.

**Judging reality:** the rubric rewards *polish*, *concept-complete*, *easy install*,
*measurable time savings*, *great mod UX*. Therefore scope is split so a complete,
submittable product exists by hour ~14, with the differentiator layered on top.

---

## 2. Scope — locked

### Part 1 — Smart Triage Queue (THE SPINE — must fully ship)
A mod-only custom post that renders an alternative, intelligently-ranked modqueue.

- Ranks every reported item by a transparent `triageScore`.
- Surfaces human-vs-automod report source explicitly.
- **De-collapses** spam reports into their individual reasons.
- Per-item quick actions: Approve / Remove / open in native modqueue.
- "Why this score" breakdown panel (transparency builds mod trust — and impresses judges).
- Settings page so mods tune the scoring weights.

### Part 2 — Coordination layer (THE WOW — layered on top)
- **Claim** an item → other mods instantly see "u/x is reviewing this" (realtime).
- Claimed cards dim/lock for everyone else.
- Stale claims auto-release after N minutes.
- Active-mods presence strip.

### Cut line — HARD, at hour 20
Must ship: Part 1 complete + claim/unclaim + realtime presence.
Cuttable cleanly if time runs out: auto-split queue across mods, activity feed,
reporter-trust scoring. Cutting these leaves a complete product. Never submit a
half-built feature.

---

## 3. Architecture

Devvit Web app. Reddit hosts both client and server for free. Node 22.

```
┌─────────────────────────────────────────────────────────────┐
│  CLIENT  (React + Vite)  — the Triage board custom post       │
│  - ranked card list, score breakdown, quick actions, claim    │
│  - subscribes to realtime channel for live claim updates      │
└───────────────▲───────────────────────────┬───────────────────┘
                │ fetch (API endpoints)     │ realtime events
┌───────────────┴───────────────────────────▼───────────────────┐
│  SERVER  (Devvit Web server)                                   │
│  - trigger handlers: PostReport / CommentReport / ModAction    │
│  - scheduled reconcile job (~every 2 min)                      │
│  - scoring engine                                              │
│  - API endpoints: getQueue, claim, unclaim, moderate, settings │
│  - Redis read/write  +  realtime publish                       │
└───────────────┬───────────────────────────────────────────────┘
                │
        ┌───────▼────────┐   ┌──────────────┐   ┌───────────────┐
        │  Redis (KV)    │   │  Reddit API  │   │  Realtime ch. │
        │  triage state  │   │  modqueue /  │   │ "triage_live" │
        │                │   │  moderate    │   │               │
        └────────────────┘   └──────────────┘   └───────────────┘
```

### Suggested file structure
```
triage/
├── triage-build-spec.md        ← this file
├── devvit.json                 ← app config: permissions, triggers, post type, menu, settings
├── package.json
├── src/
│   ├── server/
│   │   ├── index.ts            ← server entry, route registration
│   │   ├── triggers.ts         ← onPostReport / onCommentReport / onModAction handlers
│   │   ├── scheduler.ts        ← reconcile job: sync modqueue, prune, expire claims
│   │   ├── scoring.ts          ← triageScore engine (pure functions, unit-testable)
│   │   ├── queue.ts            ← Redis read/write for triage items + sorted set
│   │   ├── claims.ts           ← claim/unclaim logic + realtime publish
│   │   └── api.ts              ← endpoint handlers the client calls
│   ├── client/
│   │   ├── main.tsx            ← React entry
│   │   ├── App.tsx             ← board layout, data fetch, realtime subscription
│   │   ├── components/
│   │   │   ├── TriageCard.tsx
│   │   │   ├── ScoreBreakdown.tsx
│   │   │   ├── ReportReasons.tsx
│   │   │   ├── ClaimBadge.tsx
│   │   │   └── ActiveMods.tsx
│   │   └── api.ts              ← typed client-side fetch wrappers
│   └── shared/
│       └── types.ts            ← TriageItem, ScoreBreakdown, ClaimState, Settings
└── README.md
```

---

## 4. Data model (Redis)

> Exact Redis method names — `hSet`, `hGetAll`, `zAdd`, `zRange`, `zRem`, etc. —
> must be confirmed against the current `@devvit/web` / `@devvit/redis` types.
> The *shape* below is the contract; adapt method calls to whatever the SDK exposes.

| Key | Type | Purpose |
|---|---|---|
| `triage:item:{thingId}` | hash | full TriageItem record (see below) |
| `triage:queue` | sorted set | member = thingId, score = triageScore; `ZREVRANGE` → ranked list |
| `triage:author:{username}` | hash | `{ removalCount, lastRemovalAt }` — author risk signal |
| `triage:claim:{thingId}` | hash | `{ claimedBy, claimedAt }` (or fold into item hash + TTL) |
| `triage:settings` | hash | scoring weights + feature toggles (or use Devvit settings) |
| realtime channel `triage_live` | — | publishes item add/update/resolve + claim/unclaim events |

**TriageItem (shared type):**
```ts
type TriageItem = {
  thingId: string;            // t3_... (post) or t1_... (comment)
  kind: 'post' | 'comment';
  author: string;
  permalink: string;
  title?: string;             // posts
  bodyPreview?: string;       // comments
  reportReasons: string[];    // de-collapsed, individual reasons
  reportCount: number;
  humanReports: number;
  automodReports: number;
  authorRemovalCount: number; // prior removals in THIS sub
  createdAt: number;          // queue-entry time
  lastSeenAt: number;
  score: number;
  scoreBreakdown: ScoreBreakdown;
  claimedBy?: string;
  claimedAt?: number;
};
```

---

## 5. Scoring engine (`scoring.ts`)

Pure, deterministic, unit-testable. `triageScore` = weighted sum of normalized signals.

| Signal | Description | Default weight |
|---|---|---|
| `humanReportBoost` | flat boost if ≥1 human (non-automod) report — the #1 documented ask | 40 |
| `reportVolume` | `log2(1 + reportCount)` scaled | 15 |
| `reasonSeverity` | max severity across report reasons, via configurable severity map | 25 |
| `authorRisk` | `min(authorRemovalCount, 5) * k` — light touch, a signal not the product | 10 |
| `staleness` | small bump as item ages in queue so nothing rots | 10 |

`scoreBreakdown` stores each component's contribution so the "Why this score"
panel can render it. **Every weight must be overridable** from the settings page.

Severity map (default, mod-editable): violence/threats → high; harassment/hate →
high; minor-safety → high; spam → medium; misinformation → medium; off-topic →
low; "I don't like this" → low.

**Spam de-collapsing:** Reddit surfaces spam reports under a single label, but the
underlying report objects often carry distinct user-selected reasons. Triage reads
every individual report on an item and lists the distinct reasons with counts.
*Confirm what the report payload actually exposes — if individual sub-reasons are
not retrievable, fall back to listing all distinct report-reason strings present
on the item, which the API does provide per-report.*

---

## 6. Event flow

**On `PostReport` / `CommentReport`:** upsert `triage:item:{thingId}`, recompute
`triageScore`, `zAdd` into `triage:queue`, publish an update on `triage_live`.

**On `ModAction`:** if action resolves an item (approve/remove/spam): `zRem` from
`triage:queue`, delete item hash, publish "resolved". If it's a removal:
increment `triage:author:{username}.removalCount`.

**Scheduled reconcile job (~every 2 min):** call the Reddit API modqueue fetch —
add anything triggers missed, prune items no longer in the queue, expire claims
older than the stale threshold (publish "unclaimed" for each).

**On `AppInstall`:** seed default settings; surface instructions (or a menu action)
for a mod to create the Triage board post.

**Claim / unclaim (API endpoints):** write claim state to Redis, publish on
`triage_live`. All connected boards update instantly. Reject a claim if the item
is already claimed by someone else (last-write-wins guarded by a check).

---

## 7. Client UX notes (polish = points)

- **Mod-only gate:** verify the viewer is a mod; non-mods see a friendly "this is
  a moderator tool" message. Quick actions must never render for non-mods.
- Each `TriageCard`: title/body preview, author + risk flag, **human/automod
  badge**, de-collapsed report reasons with counts, score pill, age-in-queue,
  Approve / Remove / Open buttons, Claim button, claim badge when claimed.
- `ScoreBreakdown`: collapsible, shows each signal's contribution.
- Empty state, loading state, and error state all designed — not blank screens.
- Optimistic UI on claim/moderate, reconciled by the realtime event.
- Zero-config install: sensible defaults so the tool works the moment it's added.

---

## 8. Hour-by-hour (≈24h)

| Hours | Goal |
|---|---|
| 0–2 | Scaffold from official Devvit Web React starter. Create a dev subreddit. Confirm end-to-end: a trigger fires → server writes Redis → custom post renders a value. Prove the pipeline with a placeholder before building anything real. |
| 2–8 | Triggers + Redis queue + scoring engine. Reported items land in `triage:queue` ranked. Unit-test `scoring.ts`. |
| 8–12 | Client board: ranked cards, report-reason de-collapsing, score breakdown, quick actions wired to moderate endpoints. |
| 12–14 | Settings page (weights + severity map). Mod-only gating. Reconcile job. **Part 1 is now complete and submittable.** |
| 14–18 | Part 2: claim/unclaim, realtime channel, live claim badges, stale-claim expiry. |
| 18–20 | Active-mods strip; optional auto-split *if* time allows. |
| **20** | **HARD CUT.** Whatever coordination works, ships. Freeze features. |
| 20–22 | Hard testing on the dev subreddit. Polish empty/loading/error states. Record a 60–90s demo video. |
| 22–24 | Write the submission. README. Devpost feedback survey (separate "Best Feedback" prize — almost nobody does it). |

---

## 9. Submission checklist (the writeup is ~half the score)

- **App listing** link on developer.reddit.com.
- **Tool Overview:** walk the exact mod workflow *before vs after* Triage.
- **Project Impact:** name 3 real subreddits; give **numbers** — e.g. "team triages
  ~N reports/day; Triage removes ~60–90s of tab-hopping + re-sorting per item →
  ~M minutes saved/day; human reports surface first instead of being buried."
- Cite the CHI 2026 paper as evidence the pain points are real and documented.
- Complete the **Developer Platform feedback survey** (Best Feedback prize).
- Nominate any r/Devvit Discord helper who assisted.
- 60–90s demo video showing: a reported item ranking up, spam reasons expanded,
  a second mod claiming an item live.

---

## 10. ===== PASTE THIS INTO CLAUDE CODE =====

```
I'm building "Triage" — a smart triage + coordination layer for the Reddit
modqueue — for the Reddit Mod Tools Hackathon (New Mod Tool category). It's a
Devvit Web app (React). I have ~24 hours. Read triage-build-spec.md in the repo
root — it is the full architecture, data model, scoring spec, file structure, and
scope. Follow it.

CRITICAL — verify before you build:
- Devvit's API surface changes often. Do NOT trust your training data for exact
  package names, imports, method signatures, devvit.json schema, trigger names,
  Redis methods, realtime API, or scheduler API. Scaffold from the CURRENT
  official Devvit Web React starter template and read its types and the official
  docs at developers.reddit.com/docs. Adapt the spec's contracts to the real SDK.
- Confirm Node version and CLI commands from the current starter.

SCOPE DISCIPLINE — this is non-negotiable:
- Build Part 1 (Smart Triage Queue) COMPLETELY first — triggers, Redis ranked
  queue, scoring engine, client board, quick actions, settings, mod-only gating,
  reconcile job. It must be fully working and testable before you touch Part 2.
- Only then build Part 2 (claim/unclaim + realtime presence).
- A complete Part 1 is a shippable product. Never leave a half-built feature.

BUILD ORDER:
1. Scaffold the Devvit Web React app. Get end-to-end working: a trigger fires →
   server writes Redis → custom post renders it. Placeholder is fine — prove the
   pipeline first.
2. Triggers (PostReport, CommentReport, ModAction) + Redis queue + scoring engine
   per the spec. Make scoring.ts pure and unit-test it.
3. Client board: ranked TriageCards, de-collapsed report reasons, ScoreBreakdown,
   quick actions wired to moderate endpoints.
4. Settings page (scoring weights + severity map) and mod-only gating.
5. Reconcile scheduled job.
6. Part 2: claim/unclaim API, realtime channel, live claim badges, stale-claim
   expiry, active-mods strip.

REQUIREMENTS:
- TypeScript throughout. Shared types in src/shared/types.ts per the spec.
- Every scoring weight overridable from settings.
- Design empty / loading / error states — no blank screens.
- Mod-only: quick actions and the board must never function for non-mods.
- Zero-config: sensible defaults so the tool works immediately on install.
- Write a README covering install, what it does, and the mod workflow.

Start now with step 1: scaffold the app and prove the trigger → Redis → render
pipeline end to end. Tell me the exact CLI commands and what you need from me
(Reddit account, dev subreddit name, app name) as you go.
```

=====================================
```
