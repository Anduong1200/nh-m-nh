# V1 integration review — 2026-10-03

Codex is the integration owner. Reviewed Gemini inputs: `feature/games-ui`
(`36c32f7`), `feature/island-ui` (`465ee71`) and `feature/letters-ui` (`1e8c1c2`)
against main `076b367`, canonical Product/Architecture/Security/UX and the existing
authorized domains. Integration was staged in `feature/v1-integration`; the primary
checkout and development preview were preserved during implementation.

## Critical

Resolved before release review: the Letters prototype assumed a body was always
available and revealed it from a local animation. The protected UI now renders
nullable actor-specific projections, sends/opens only with confirmed receipts,
and uses real same-session joint consent. Scheduled recipient envelope/clue/body
remain absent until the DB permits them. Ordinary opening remains recipient-private.

Private photos keep client metadata writes denied. Server pixel validation and
service-only registration enforce the existing ready-photo contract. Restrictive
Storage guards also deny unrelated broad authenticated/anonymous policies from
opening this private bucket. Image reads always use the requesting user's RLS
client. [ADR 003](ADR/003-private-photo-pipeline.md) records the reviewed boundary.

## High

Resolved integration blockers: disconnected Games controls and incorrect turn
defaults; public/demo Island memories and local unlock progression; public Letters
entry and sensitive console logging. Routes require verified identity and a paired
House; writes remain transactional/RLS-authorized. Island consumes source-derived
state and persisted completed game artifacts only. Home now has a real Whiteboard
entry and all four game modes preserve artifacts.

Remaining **production release gates**: apply the required additive schema to the
hosted project and configure the server-only media secret; verify new Games,
Letters and photo flows with two real accounts. No hosted schema, bucket, secret
or deployment was changed by this integration. Confirmed Memory/Milestone source
persistence and promotion are not implemented; their Island event contracts stay
reserved. Do not declare the entire frozen V1 production complete yet.

## Medium

Resolved: late heartbeat/mailbox projections could reseal a jointly opened letter;
the UI/cache keeps accepted versions and completed reveal sessions monotonic.
Unknown send outcomes retain their exact request; a null read never permits a
replacement send while the first request may still run. Local draft CAS forks can
be recovered, and closing/navigation waits for successful draft persistence.
Games stages edits immediately, flushes before navigation/refresh and retains
unsaved buffers on failure. Old-turn contributions are durably archived before a
new turn reuses the editor key, with preview/export and no fake recovery for
already committed content. Past scheduled instants are rejected before freezing
a send request. Logout closes private views across tabs, with IDB epoch fallback.

Remaining acceptance: physical iOS/Android installed-PWA lifecycle, device storage
eviction, hosted Storage API behavior and independent PostgreSQL-connection race
stress. Automated SQL tests use real PostgreSQL/PGlite policies but serialize
transactions; they do not prove multi-connection lock contention.

## Low

Protected rooms and photo reads now share the auth refresh proxy; verified-user
and House/RLS checks remain independent. Visual review also corrected Island link
contrast and artifact pins overlapping mascots on narrow screens.

Historical reports retain their dated core-only verification. README/domain docs
now point to this current integration status. Recent views remain bounded (20 Games
sessions, 30 visible Letters); older game artifacts work through an authorized
deep link, but full history pagination is not implemented. The Island map labels
its artifact list as recent history. There is no fake Memory action.

## Acceptable trade-offs

- Async-first established Excalidraw tooling; no simultaneous realtime drawing.
- Warm private UI uses authorized recent cache/drafts/queue; cold offline private
  navigation displays the generic app-shell fallback. No private HTML/API/media is
  service-worker cached. Browser/fixture tests are separate from hosted acceptance.
- Photos require online upload, accept static JPEG/PNG/WebP within documented
  bounds and become House-shared when ready. HEIC/audio/offline binary queues are
  absent. Failed registration can leave invisible private blobs; no automatic
  user-data deletion was added.
- V1 server and account-bound local storage are trusted with plaintext; no E2EE or
  background push-delivery guarantee is claimed. No XP, currency, decay, streak,
  guilt notification, analytics, public feed or extra game was added.

## Required fixes before merge

The prototype/security/draft blockers above are resolved. Required local gates on
the integrated tree passed; no test was disabled or relaxed. Hosted acceptance
and the missing confirmed Memory/Milestone producers remain production release
gates, not a claim that the entire V1 is complete.

## Verification

- `pnpm lint` — passed with zero warnings.
- `pnpm typecheck` — passed.
- `pnpm test --maxWorkers=1 --reporter=dot` — 568 tests in 59 files passed.
- `pnpm build:e2e` — production build passed, including all protected room routes
  and the private photo endpoint. Public Supabase configuration was deliberately
  empty for the isolated E2E build; no hosted credentials were used.
- `pnpm test:e2e --workers=1` — 174/174 passed in 7.8 minutes across desktop
  Chromium, iPhone 12 WebKit and Android Chromium. The earlier Safari focus
  failure and browser-start timeout are resolved in this full final run.
- Manual browser/visual inspection: Home, Games, Letters, Island and Whiteboard
  at desktop 1366×900 and iPhone 390-pixel viewports; Vietnamese local fonts,
  visible mascots, no horizontal overflow, actual editor readiness and Escape
  focus restoration checked. Data/auth used isolated fixtures, not real accounts.
- Local Windows checks used shared installed dependencies and the installed pnpm
  11.19 runtime. A temporary Turbopack root and one build worker accommodate the
  isolated dependency junction; the committed config has neither override. CI
  installs the pinned pnpm 11.25 dependency graph with the frozen lockfile.
- Earlier interrupted runs exhausted Windows virtual memory/space and were not
  counted as passes. The task's generated browser cache was preserved on drive D,
  with the original cache path retained through a junction; no user data deleted.
- The publishing gate is CI for the exact pushed main commit. Its run is linked
  in the final handoff; local checks do not imply hosted deployment or migration.

## Hosted acceptance sequence

1. Inspect the installed schema/migration history. Existing projects must use only
   missing additive migrations/guarded installers, not `setup-new-project.sql`.
   See [migration guidance](../supabase/migrations/README.md).
2. Configure `SUPABASE_SECRET_KEY` only on the server. Verify the private bucket and
   member/cross-House/anonymous denial with real Storage requests.
3. Complete one of each game with two accounts, reopen its artifact from Island,
   and test a stale turn plus offline draft/reconnect without overwriting a partner.
4. Send immediate/scheduled/joint letters; verify recipient payload absence before
   eligibility, both-online confirmation, expiry/reconnect and ordinary-open privacy.
5. Test Whiteboard conflict recovery and logout across tabs/devices; verify installed
   PWA offline/update behavior on real iPhone and Android before production sign-off.
