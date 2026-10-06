# V1 quality review — 2026-10-06

## Assessment

The current product is an internal beta with implemented V1 domains, not a
finished release. Green simulated transports do not prove hosted Supabase
configuration or usability with the couple's real data. The owner's reports of
Board/Island failures remain release blockers until reproduced and verified.

| Area | Finding before this repair | Repair in this branch |
| --- | --- | --- |
| Home | Disconnected UI panels; `/home` absent; weak sense of a room | Reuse the authored room illustration, visible rabbit/owl, object controls, notebook and room navigation; `/home` redirects to the authorized House |
| Board | Header overlaid the wall; negative saved coordinates could disappear outside the scrollable origin | Header/canvas/tools occupy separate rows; display origin includes negative coordinates without rewriting saved positions; origin stays fixed during a drag; new items are placed in the visible part of the wall |
| Whiteboard | Basic pen had no visible palette or stroke width | Six inks, adjustable width, selected tool state, paper frame; actual document persistence and explicit conflict resolution retained |
| Games | Four generic text buttons; selected play form below the entire lobby | Four distinct illustrated covers; selected form receives focus and scrolls into view once per selection |
| Island | A game-list failure hid an otherwise valid projection; journal below legend; mobile map labels obscured mascots | Shared server/client read validation allows an explicit partial warning; journal/create actions first, secondary legend; mobile destinations below the map |

## Review by severity

**Critical:** no newly established authorization defect in this change. This is
not an independent security audit. Existing same-House, account invalidation,
creator-only trash/restore and server-derived progression remain required.

**High:** the owner's hosted Board/Island failures are not yet reproduced with
an authenticated production session. Table existence alone does not establish
column/RPC/grant compatibility. Missing server media secret also prevents real
photo/voice acceptance. See read-only `supabase/diagnose-v1.sql`; do not repair
these failures by granting anonymous access, dropping guards or clearing data.

**Medium:** previously unreachable Board items, whole-map failure from an
optional game list, and mobile controls overlapping artwork. Regression coverage
and visual inspection are required before integration.

**Low:** UI copy/layout consistency, tools and room navigation polish. The
chosen repair adds no editor engine, realtime dependency or new V1 feature.

## Product, privacy and engineering trade-offs

- Home illustration is reused rather than introducing a new rendering engine.
  Scene objects are navigation; no fabricated partner activity is displayed.
- Board coordinate offsets are display-only. Persisted moves/rotations keep the
  existing bounds, CAS versions and offline queue semantics.
- Only an explicitly failed optional game list may produce a partial Island.
  Authorization denial, changed account/House and malformed game records still
  fail closed. The world comes from the validated projection, never UI counters.
- Native Excalidraw elements retain color/width in the existing bounded codec.
  A numeric slider value does not introduce a second live status announcement.
- Future Island areas remain visibly decorative; there are no new missions,
  points, streaks, radio or campfire functionality.

## Required release evidence

Record final lint/typecheck/unit/build/E2E results in `COMPLETION_STATUS.md` after
the integrated tree passes. Browser fixtures use real components, IndexedDB and
codecs with simulated transports; DB/RLS tests are separate. They do not replace
two-account acceptance on HTTPS or physical iPhone/Android installed-PWA checks.

Required hosted retest: open/save/reload Board and journal, conflict between both
accounts, creator-only trash/restore, then private media. Obtain the exact visible
error and origin before attributing a hosted failure to schema or network.
