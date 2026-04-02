# Academy Rebuild Implementation Plan

Last updated: 2026-04-01

## Objective

Transform the current `/academy` experience to match the reference implementation in `C:\Users\USER\Downloads\Acad (1).html`, while keeping NexID's existing Gemini Live infrastructure for live AI assessment.

This document is the source of truth for the academy rebuild plan and should be updated as implementation evolves.

## Current Implementation Status

### Landed on 2026-04-01

- UI strategy has been corrected from "reference-inspired parity" to literal route-by-route porting of the reference DOM/CSS structure from `Acad (1).html`.
- The academy shell now follows the reference navigation model more directly, including real `/academy/identity` and `/academy/earnings` routes plus the reference mobile bottom navigation pattern.
- `/academy`, `/academy/campaign/[id]`, `/academy/leaderboard`, `/academy/dashboard`, `/academy/identity`, and `/academy/earnings` are now being rendered through copied reference class structure rather than older academy-specific layouts.
- Phase 1 implementation has started in the live codebase.
- The academy shell now resolves and exposes an active campaign shortcut from authenticated user campaign state.
- Campaign detail now enforces the initial CTA sequence:
  - `Enroll`
  - then `Begin Verification`
- The campaign theater no longer drops users directly into module playback before the verification flow is explicitly started.
- Video items now run a frontend countdown gate and only unlock `Continue` after the timed watch window completes.
- In-module progression now uses `Continue` between steps and blocks direct jumps to future items that have not been unlocked yet.
- Campaign ledger navigation is now locked until the user has actually started the flow or already completed the campaign.
- Campaign enrollment/completion now emit a shell refresh event so the active campaign shortcut stays in sync.
- Assessment flow now treats `quiz_assessment` and `live_ai_assessment` as separate gates.
- Structured quiz mode is now campaign-configurable as `MCQ` or `FREE_TEXT`.
- Structured quiz draws now use 5-question mode-specific pools, and free-text quizzes submit rubric-graded answers through the existing quiz pipeline.
- Live AI assessment remains mandatory for everyone and continues to use the existing Gemini Live stack.
- Campaign completion is now blocked until both structured quiz assessment and live AI assessment are completed.
- Quiz submission and live AI assessment completion now update persisted composite score inputs.
- The admin builder now exposes quiz mode selection and persists mandatory live-assessment configuration into campaign modules.
- Campaign flow now persists a lightweight theater snapshot on the participant record for reload-safe resume.
- Theater resume now restores active module/item, started-flow state, viewed item keys, quiz correctness, quiz answers, and active video unlock timers.
- Speed traps are now attached to grouped-module transitions through admin campaign builder configuration.
- Runtime speed traps now fire after grouped-module completion and before the next grouped module begins.
- The campaign theater now treats persisted `completedGroupIndexes` as the primary grouped-module progression ledger.
- `Begin Verification` now resumes from the next incomplete grouped module rather than from `completedUntil`.
- Final campaign completion now validates grouped-module completion from the persisted flow snapshot and only mirrors `completedUntil` for compatibility.
- Post-module assessment flow now enters explicit theater handoff stages instead of jumping directly from the last grouped module into assessment modals.
- The theater now includes a dedicated live AI prep handoff before opening the mandatory Gemini Live assessment modal.
- The campaign theater now has a staged header rail with progress/status context instead of relying only on the old mixed content canvas.
- Completed campaigns now render an in-theater results surface with real persisted component scores when available.
- Enrollment/completion payloads now expose `videoScore`, `quizScore`, `onchainScore`, `agentScore`, and `compositeScore` so the result screen can use real backend scoring data.
- Active grouped-module playback now uses a dedicated theater footer/status rail for transition controls, closer to the reference `theater-foot` model.
- Video stages now expose an in-frame watch-progress synth bar, and module quiz items now render inside a dedicated knowledge-check panel with progress dots.
- The campaign sidebar now uses a richer reference-style ledger surface with an active-campaign overview card, grouped-module cards, explicit assessment ladder rows, and a reworked notes panel.
- The in-page leaderboard tab now has a dedicated summary header, podium treatment, ranked table, and user-position card instead of the old flat utility list.
- The theater intro and pre-start states now use a tighter reference-style centered card treatment for `Enroll` and `Begin Verification`.
- The central grouped-module body now uses more reference-aligned stage surfaces for verification tasks and in-module quiz steps, instead of the previous generic centered content cards.
- The account surfaces are now being ported section-for-section from the reference file rather than rendered through approximated dashboard widgets.
- `/academy/dashboard`, `/academy/identity`, `/academy/earnings`, and `/academy/leaderboard` now use the reference card order and section positioning with real NexID data bound into those slots.
- `/api/user/campaigns` now exposes persisted participant progress fields (`completedUntil`, `flowStage`, `flowState`) so dashboard course progress can be driven by real campaign-state data rather than placeholder percentages.
- `/api/leaderboard` now returns real badge-display text and real behaviour-multiplier totals for leaderboard rows, replacing the previous synthesized frontend badge/multiplier placeholders.
- `/academy/campaign/[id]` now uses the reference right-rail structure directly:
  - `cs-card`
  - `mult-card`
  - `syl-card`
- The non-reference campaign-side notes panel, in-page leaderboard rail, and assessment-ladder rail have been removed from the visible detail route in favor of the reference layout.
- Reference campaign layout CSS for `det-layout`, `cs-*`, and `syl-*` has now been ported into the shared academy styles so the right rail matches the source HTML more directly.

### Still outstanding in the current rebuild

- Replace the remaining module renderer with the full reference-style stage machine.
- Continue tightening the campaign theater body so the remaining header/chrome and results choreography match the reference more exactly.
- Continue literal route-by-route parity passes for any remaining academy surfaces that still use old copy, fallback placeholders, or non-reference interactions.
- Harden timed video persistence with backend watch-session / integrity support beyond the current snapshot-backed resume state.
- Add backend progress/session persistence that can represent staged flow state beyond the current snapshot-backed participant model.
- Replace residual module-end completion scaffolding with explicit stage-state persistence and resume.
- Replace the current participant-row snapshot approach with the final explicit stage-machine persistence model if the flow grows beyond the current JSON snapshot.

## Non-Negotiable Product Rules

### 1. UI parity with the reference

- The academy shell, browse page, course detail theater, leaderboard, dashboard, identity, and earnings experiences should match the reference UI and interaction model as closely as practical.
- The reference flow is the default product behavior unless explicitly overridden here.

### 2. Assessment model

There are **two distinct assessment layers** and they must not be merged:

- `Quiz Assessment`
  - This is the structured quiz stage in the course flow.
  - It must be one of:
    - `MCQ`
    - `FREE_TEXT`
  - It is not the same thing as the live AI assessment.
  - It should behave like the reference quiz stage: a discrete stage in the module flow, with randomized question selection where applicable.

- `Live AI Assessment`
  - This is a separate live verification stage after the quiz stage.
  - **Everyone must do this stage.**
  - We will **not** use the reference file's browser TTS / SpeechRecognition approach.
  - We will keep and integrate the existing `Gemini Live` stack.

### 3. Timed video gating

- When a course video is played in the iframe/theater, a background timer must start.
- The continue CTA only appears after the configured watch duration is satisfied.
- The reference currently hardcodes durations per module and falls back to `180s` if none is provided.
- If product decides to standardize on `3 minutes` everywhere, that should be expressed as campaign/module configuration rather than implicit frontend-only behavior.

### 4. Speed traps

- Speed traps are part of the transition experience between learning stages.
- They must appear between grouped modules, not inside the content items of a grouped module.
- They should fire occasionally, only when configured for a given grouped-module transition.
- The admin must be able to attach speed-trap questions to grouped modules / grouped-module transitions explicitly.

### 5. Enrollment and campaign activation CTA flow

- When a user opens a campaign, the academy should expose an `Active Campaign` / active campaign shortcut in the shell, matching the reference behavior conceptually.
- The course theater must not show `Begin Verification` immediately by default.
- The CTA order must be:
  - `Enroll`
  - then `Begin Verification`
- `Begin Verification` only becomes available after successful enrollment.
- The active campaign shortcut should route the user back into their in-progress campaign experience.

## Current State Findings

### Frontend gaps

- The current academy is split across multiple route layouts rather than a unified shell.
- The current campaign detail page marks non-quiz items as viewed on selection, which is not strict enough for a timed theater flow.
- The current progress model is module-level only and too coarse for the reference stage machine.
- The current speed trap integration runs at module completion time rather than as a native transition step in the theater flow.
- The current dashboard contains identity/passport/badges/multiplier content, but not in the same information architecture as the reference.

### Backend gaps

- `completedUntil` alone cannot represent:
  - active stage
  - active item
  - timer unlock state
  - speed trap completion state
  - quiz stage completion state
  - mandatory live assessment completion state
- Engagement telemetry payloads are mismatched between client and server and need correction before relying on them for scoring or integrity.
- Assessment routing now separates structured quiz mode from mandatory live AI, and grouped-module completion now resumes from the persisted theater snapshot, but the detailed theater still has not been fully refactored into the final reference-style stage machine.

## Target Architecture

## A. Route and shell structure

Target academy route family:

- `/academy`
- `/academy/campaign/[id]`
- `/academy/leaderboard`
- `/academy/dashboard`
- `/academy/identity`
- `/academy/earnings`
- `/academy/faq`
- `/academy/interview`

The academy shell should provide:

- persistent sidebar / topbar desktop layout
- mobile bottom navigation
- consistent academy-wide visual system
- active campaign shortcut/state when the user has selected or enrolled in a campaign

## B. Campaign theater state machine

Each campaign should run through a strict stage machine:

1. `intro`
2. `grouped_modules`
3. `speed_trap` only when configured between grouped modules
4. repeat `grouped_modules` / `speed_trap` transitions until all grouped modules are completed
5. `quiz_assessment`
6. `live_ai_prep`
7. `live_ai_assessment`
8. `results`

Important:

- `quiz_assessment` and `live_ai_assessment` are different stages.
- `live_ai_assessment` is always required.
- `quiz_assessment` mode must be configurable as either `MCQ` or `FREE_TEXT`.
- `quiz_assessment` only begins after all grouped modules are completed.
- `results` only unlock after both `quiz_assessment` and `live_ai_assessment` are complete.
- campaign entry CTA must be gated by enrollment:
  - pre-enrollment: show `Enroll`
  - post-enrollment: replace or unlock `Begin Verification`

## C. Assessment composition

### Quiz assessment

Configurable per campaign:

- `MCQ` quiz mode
  - randomized draw from pool
  - randomized option ordering where applicable
  - pass/fail and score persisted

- `FREE_TEXT` quiz mode
  - randomized draw from rubric-backed free-text pool
  - semantic grading persisted
  - pass/fail and score persisted

This stage should remain visually consistent with the reference quiz theater.

### Live AI assessment

- Mandatory for all users.
- Uses existing Gemini Live infrastructure.
- Replaces the reference file's browser speech synthesis and browser recognition implementation.
- Runs as its own stage after quiz assessment.
- Produces persisted assessment score and completion state.

## Implementation Phases

## Phase 1. Establish the academy shell

Deliverables:

- Replace current academy wrapper with the reference-style shell.
- Bring `/academy`, `/academy/leaderboard`, `/academy/dashboard`, `/academy/faq` into the same visual system.
- Add `/academy/identity` and `/academy/earnings` routes.
- Keep `/academy/interview`, but visually align it with the new shell.

Notes:

- The current dashboard should be decomposed, not merely restyled in place.

## Phase 2. Rebuild campaign detail as a stage machine

Deliverables:

- Replace the current mixed module/item renderer with an explicit theater stage system.
- Implement campaign entry CTA flow:
  - `Enroll` first
  - `Begin Verification` only after enrollment succeeds
- Support:
  - intro screen
  - grouped module theater
  - optional between-group speed trap
  - quiz assessment stage
  - live AI prep stage
  - Gemini Live assessment stage
  - results stage

Critical rules:

- No item should count as complete merely because it was selected.
- Video progression must be timer-gated.
- Continue buttons should appear only when stage conditions are met.
- Enrollment must be completed before the user can begin the verification flow.
- All grouped modules must be completed before quiz assessment begins.
- Speed traps attach to grouped-module transitions, not to individual items inside a grouped module.

## Phase 3. Introduce resumable detailed progress persistence

Deliverables:

- Persist campaign progress at stage/item granularity.
- Store enough state to resume accurately after reload or disconnect.

Recommended persisted fields:

- `campaignId`
- `userId`
- `activeGroupIndex`
- `activeItemIndex`
- `activeStage`
- `videoStartedAt`
- `videoUnlockAt`
- `videoCompletedAt`
- `speedTrapState`
- `quizMode`
- `quizAttemptId`
- `quizCompletedAt`
- `liveAssessmentSessionId`
- `liveAssessmentCompletedAt`
- `resultsUnlockedAt`

## Phase 4. Correct and harden scoring/integrity flows

Deliverables:

- Fix engagement telemetry contract mismatch.
- Ensure video integrity can contribute to a real `videoScore`.
- Persist:
  - `videoScore`
  - `quizScore`
  - `onchainScore`
  - `agentScore`
  - `compositeScore`

Scoring behavior target:

- Video score comes from actual stage completion plus integrity signals.
- Quiz score comes from the configured quiz assessment mode.
- Live AI assessment score is stored separately and is mandatory.
- Composite score should be computed from persisted components, not inferred loosely.

## Phase 5. Rebuild secondary academy surfaces to match reference

Deliverables:

- Leaderboard parity
- Dashboard parity
- Identity parity
- Earnings parity

Expected mapping:

- Current dashboard passport/badges/multiplier content moves into dedicated identity/dashboard surfaces.
- Ended reward claim content should map cleanly into earnings.

## Phase 6. Upgrade admin campaign authoring

Deliverables:

- Expand the campaign builder to author the new staged flow.
- Keep grouped videos, but add explicit assessment and stage configuration.

Builder should support:

- grouped video sections
- grouped-module transition configuration
- per-video title
- per-video duration seconds
- quiz assessment mode:
  - `MCQ`
  - `FREE_TEXT`
- speed-trap attachments per grouped module / grouped-module transition
- mandatory live AI stage flag, default `true`
- optional results-stage reward config

Question pool authoring should support:

- standard MCQ pool
- standard FREE_TEXT pool
- speed trap pool

## Backend Work Required

### Required

1. Add fine-grained campaign progress persistence beyond `completedUntil`.
2. Fix engagement telemetry payload mismatch between client and server.
3. Persist the new structured-quiz-mode and live-assessment stage model as first-class campaign progress state.
4. Persist live AI assessment completion as mandatory campaign flow state.
5. Persist component scores and composite score consistently.

### Likely required

1. New API endpoints for video session start / heartbeat / unlock / complete.
2. New API endpoints for richer progress snapshot and resume.
3. Builder/API support for assessment mode configuration.
4. Results payload that reflects actual component scores instead of placeholder UI math.

### Not required

- Replacing Gemini Live.
- Reintroducing browser TTS / SpeechRecognition from the reference file.

## Implementation Notes and Decisions

### Decision: quiz vs live AI

Accepted:

- Quiz assessment is separate from live AI assessment.
- Everyone must complete live AI assessment.
- Quiz assessment mode is either `MCQ` or `FREE_TEXT`.

### Decision: current implementation checkpoint

Accepted:

- The existing Gemini Live implementation remains the live assessment engine.
- The current build now enforces `structured quiz -> live AI assessment -> campaign completion`.
- The current campaign detail page is still an intermediate step toward the full reference stage machine, not the final theater architecture.
- Speed traps are now treated as grouped-module transition gates, which matches the current product requirement.

### Decision: source of truth

Accepted:

- This file is the working plan and must be updated as scope or implementation details change.

### Decision: reference parity

Accepted:

- Use the reference file as the literal UI blueprint, not merely a visual direction.
- Prefer direct reuse of the reference structure/class system over "matching it closely" with newly invented layouts.
- Keep NexID-native backend and Gemini Live implementation where the reference used mock or browser-local behavior.

## Immediate Next Build Steps

1. Replace the academy shell and route structure with the reference layout model.
2. Add active campaign shell behavior and enforce `Enroll -> Begin Verification` CTA gating.
3. Rebuild `/academy/campaign/[id]` around an explicit stage machine.
4. Add detailed progress persistence for timed video, quiz stage, and live AI stage.
5. Fix engagement telemetry contract mismatch.
6. Update admin builder to support quiz mode and per-video duration configuration.
