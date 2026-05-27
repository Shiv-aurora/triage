# Triage

Triage is a Devvit Web app for Reddit moderators that turns reported posts and comments into a shared, ranked review board. It scores modqueue items by report severity, report source, age, and author history, then gives moderators one place to inspect reasons, tune scoring, take approve/remove actions, and coordinate claims so two people are less likely to work the same item.

## Install

Prerequisites:

- Node.js 22 or newer.
- Devvit CLI authenticated with `devvit login`.
- Moderator access to the subreddit where Triage will be installed.

From this repository:

1. Install dependencies with `npm install`.
2. Check the build locally with `npm run type-check`, `npm test`, `npm run lint`, and `npm run build`.
3. Upload the app with `devvit upload`.
4. Install it on a subreddit with `devvit install <subreddit>`.
5. Open the subreddit as a moderator and use the subreddit menu action, `Create Triage board`, to create the custom post.

The development subreddit used for this build is `r/triage_tool_dev`. The app name registered with Devvit is `triage-tool`.

## Moderator Workflow

Create one Triage board post for the subreddit. Reported posts and comments flow into the board automatically through Devvit report triggers, and a scheduled reconcile job catches items that were missed while the app was unavailable.

The board has two tabs:

- `Queue` shows ranked report cards with the content title or comment preview, author, permalink, report source badges, de-collapsed report reasons, score, queue age, and score breakdown.
- `Settings` lets moderators tune scoring weights and report-reason severity tiers. Saving or resetting settings recomputes the current queue.

Each card supports:

- Expanding the score breakdown to see which signals produced the current score.
- Approving or removing the item from the board.
- Opening the Reddit permalink.
- Claiming or unclaiming the item. Claimed items lock moderation actions for other moderators until the claim is cleared or expires.

The UI includes loading, empty, error, non-moderator blocked, populated, and dark-mode states.

## How It Works

Triage uses the current Devvit Web React starter architecture:

- React 19, Vite, and Tailwind CSS 4 in `src/client`.
- Hono server endpoints in `src/server`.
- Shared TypeScript types in `src/shared`.
- Redis for queue state, settings, author counters, and claim metadata.

The app registers these Devvit capabilities:

- Custom post assets through `post.dir` and `post.entrypoints.default.entry`.
- A moderator-only subreddit menu action at `/internal/menu/post-create`.
- Report and moderation triggers: `onPostReport`, `onCommentReport`, and `onModAction`.
- App install trigger: `onAppInstall`.
- Scheduled reconcile task: `reconcile-modqueue`, running every 2 minutes.
- Devvit Realtime permission for live claim and queue updates.

Redis keys used by the app include:

- `triage:item:{thingId}` for each active queue item.
- `triage:queue` as the ranked sorted set.
- `triage:settings` for scoring settings.
- `triage:author:{username}` for author removal history.

Report triggers hydrate the reported post or comment, build a `TriageItem`, score it with the pure scoring engine in `src/server/scoring.ts`, and upsert it into Redis. The board reads `/api/queue`, and client polling every 20 seconds is kept as a safety net. Claim and queue updates are published on the `triage_live` realtime channel. Two-session live testing confirmed claim propagation to other moderators within about 1-2 seconds, live unclaim release, and server-side conflict rejection.

The reconcile job uses `reddit.getModQueue({ subreddit, type: "all", limit })`, adds missing Redis queue records, prunes resolved records that are no longer in the modqueue, and releases stale claims.

## Verified Scope

Verified live on `r/triage_tool_dev`:

- App upload/install and custom board creation.
- Post and comment report triggers writing queue items to Redis.
- Ranked board rendering.
- Score breakdown expansion and report-reason display.
- Approve and Remove actions from the board.
- Mod action trigger resolving approved/removed items.
- Scheduled reconcile adding/pruning queue state.
- Realtime claim propagation updates other moderators' boards live within about 1-2 seconds; unclaim releases live, and conflicting claims are rejected.

Verified locally with tests and builds:

- Pure scoring logic, including non-default settings.
- Settings save/reset recompute path.
- Claim, unclaim, conflicting-claim rejection, and stale-claim release.
- Loading, empty, error, blocked, populated, and dark-mode UI states.

Still outstanding for final human demo verification:

- Settings UI live re-rank: changing a weight in the live board and confirming visible rank changes.

Known attribution limitation:

Devvit exposes hydrated `userReportReasons` and `modReportReasons`, but the confirmed trigger payload and Reddit models do not expose reporter identity or a direct AutoModerator flag. Triage displays community reasons and moderator/automated reasons separately. Exact AutoModerator versus human-moderator attribution is not available from the confirmed fields.

Build note:

`npm run build` currently succeeds while Vite prints the starter warning about deprecated output options such as `sourcemapFileNames` and `inlineDynamicImports`. This comes from the current Devvit starter/tooling path and does not block local build, upload, or install.

## Screenshots And Demo

- Screenshot placeholder: ranked queue board with populated cards.
- Screenshot placeholder: expanded score breakdown and report reasons.
- Screenshot placeholder: settings panel.
- Screenshot placeholder: dark mode.
- Demo video placeholder: install, create board, report content, review queue, settings, and claim workflow.

## App Listing Draft

Name: Triage

Short description: A shared, ranked modqueue board that helps moderators review urgent reports first and avoid duplicate work.

Long description:

Triage turns reported posts and comments into a moderator-only Devvit board ranked by report severity, source, age, and author history. Moderators can inspect transparent score breakdowns, see report reasons without collapsed modqueue rows, tune scoring settings, approve or remove items, and use live claim coordination to reduce duplicate review work.
