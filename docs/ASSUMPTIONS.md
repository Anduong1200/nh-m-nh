# Frozen Assumptions

## Board domain, 2026-10-02

- Accepted user decision: both House members edit/move; creator alone trashes/restores. No permanent purge.
- Offline queue is limited to note/doodle, with explicit conflict resolution; existing schema-0/1 work stays held for a user-visible recovery flow.
- Media work here is same-House verified metadata references only. Upload, private Storage policies, byte validation and delivery remain in the media pipeline. Bounds are 20 MiB and 60 seconds for short voice until that pipeline is implemented.
- This branch stays separate from Gemini's Board UI. Existing action calls/coordinator require integration against [BOARD_DOMAIN.md](BOARD_DOMAIN.md) before merging into the app.

These decisions resolve answers that were intentionally flexible.

## Package manager
Prefer `pnpm`; agent may use another only for a concrete repository/tooling reason.

## Browser floor
Target modern evergreen browsers and current + previous two major versions where practical.

Priority real-world matrix:
- iPhone 12-class Safari / installed PWA
- modern Android Chrome / installed PWA
- Windows Chrome
- Windows Edge

## Media
V1 default:
- photo
- audio up to 60 seconds
- links

Video is out of V1.

## Storage limits
Do not hardcode product limits prematurely.
Implement configurable server-side validation and document chosen technical limits once media pipeline is built.

## Deletion
Use per-content lifecycle.

For future Campfire Burn Note:
- default intended behavior is soft-delete/recovery window of 24 hours before permanent deletion.

Campfire itself is post-V1.

## Notifications
Feature code decides which explicit partner events are notification-worthy.
User controls quiet hours and lock-screen detail.
Default content is privacy-preserving generic copy.

## Whiteboard

Whiteboard domain (2026-10-02): both active House members may edit the shared canvas, as Phase 3 M2 specifies. A House has one canvas; reads of an unused canvas return virtual version zero. Saves are explicit; drafts persist automatically. A conflict never auto-merges a canvas. Eraser deletion flags remain in snapshots. No image/remote embed, public room, realtime or permanent purge is added. Scene format and library version are pinned and reviewed together.

Games domain (2026-10-02): creator goes first; sessions require exactly two active members and retain fixed player seats. Doodle Relay defaults to six contributions and One-line Story to eight (both configurable 2–12). Draw & Guess uses one drawing and up to three exact case-sensitive guesses, then reveals its answer. Photo Mission uses the canonical immediate shared-reveal mode with one owned ready House photo per player; sealed-until-both-submit media is not implemented. There is no abandonment deadline, notification sender, deletion API, scoring or automatic memory promotion. The current assignment covers domain/persistence/offline; production UI is a separate integration. These choices follow existing V1 scope and preserve existing House/media authorization.

Island domain (2026-10-02): rules version 1 exposes monotonic history evidence flags and counters without inventing numeric levels or unlock thresholds. Photo Mission records both completion categories but one history item. Weekly activity means at least one server-completed game in a UTC Monday-based week; absence never changes state. Memory/Milestone contracts remain reserved until their own domains validate persisted sources, including explicit Memory confirmation. Existing House read permissions remain in force, including an empty Island for an owner awaiting pairing. Frontend composition/offline screen integration stays separate.

Letters core (2026-10-03): user explicitly chose both online in the same session for joint opening, replacing an async acknowledgement proposal. The author keeps their own copy; recipients see envelope/clue only after delivery and bodies only after explicit opening. Ordinary open times/state are private to the recipient; joint reveal is a shared explicit interaction. Defaults: 120-second session, heartbeat every 5 seconds, 15-second presence freshness; stale readiness resets. Sends are immutable, text-only, at most 2,000 codepoints with an 80-character clue. Minute-precision wall scheduling supports 2000–2100, with explicit DST overlap selection, UTC persistence and DB-clock eligibility. No letter deletion/reschedule, offline send/open, notification worker or conditional Open When is added. Production visual UI integration remains separate.

## Weather/location

Home may use user-selected location to decorate weather/time context.

Rules:
- do not continuously track location;
- do not expose coordinates to partner by default;
- explicit user location selection is preferred;
- weather is ambience, not presence surveillance.

## Scout / Catholic modules
Meaningful but not all required for V1.

V1 may establish visual/content extension points.
Full online Tráng/Thiếu/Kha program and deeper Prayer Corner may land after core V1 unless explicitly promoted.
