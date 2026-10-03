# Testing Strategy

## Required levels

### Unit
Use for:
- pure domain rules;
- status expiry;
- game turn validation helpers;
- island progression derivation;
- notification privacy formatting.

### Integration
Use for:
- API/server action behavior;
- DB interaction;
- storage metadata;
- scheduled letters.

### Authorization/RLS
High priority.

Test:
- member access;
- outsider denial;
- third-member denial;
- cross-House denial;
- media isolation;
- letter state restrictions;
- game turn authorization.

### E2E critical paths

1. sign in
2. create House
3. partner pairs
4. status update
5. Knock delivery
6. create board object
7. whiteboard save/sync
8. complete each game happy path
9. scheduled/sealed letter
10. logout/session behavior
11. offline draft then reconnect
12. export/delete flow when implemented

## Browser matrix

Priority:
- Windows Chrome
- Windows Edge
- iOS Safari
- iOS installed PWA
- Android Chrome
- Android installed PWA

## Accessibility checks

- keyboard
- focus visibility
- dialog focus management
- touch target size
- reduced motion
- contrast
- screen reader labels for critical controls

## Completion

Current integration verification is recorded in [V1 integration review](V1_INTEGRATION_REVIEW.md).
Production components for Games, Letters and Island are mounted in isolated
browser fixtures with real IndexedDB. Letters runs real SQL/RLS/RPCs behind
test-only identities; Games/Island use simulated transport with separate SQL
integration coverage. Protected production routes and the private image denial
endpoint are checked against `next start`. Actual Excalidraw canvas interactions
and private-photo pixel decoding are exercised. These tests do not substitute
for hosted Supabase Auth/Storage, independent DB connections or physical PWAs.
Constrained Windows checks may run one worker; no tests are disabled.

Letters browser tests execute actual PostgreSQL/PGlite RPCs/RLS via a separate test-only HTTP process, while auth identities and due/stale/expiry controls are explicit fixture shims. They verify sealed payload absence, scheduled eligibility, live joint consent, expired sessions, reconnect and logout/draft persistence in three browser projects. Unit/integration tests also check DST, actor projections, permission denial and transactional opening rollback. This is not hosted Supabase/Auth or independent-connection concurrency coverage. See [Letters verification](LETTERS_DOMAIN.md#install-and-verification).

Island tests execute the real SQL ledger/view/trigger and guarded installer under PostgreSQL/PGlite roles. They check source-derived completion, transactional failure rollback, retry/backfill deduplication, UTC weekly boundaries, cross-House/anonymous/inactive access, forbidden writes and SQL/TypeScript projection parity. Browser regression exercises the production Island UI with Games as the active producer; hosted migration/Auth and independent-connection stress remain separate. See [Island verification](ISLAND_DOMAIN.md#verification).

Board domain tests and the simulated browser transport are documented in [BOARD_DOMAIN.md](BOARD_DOMAIN.md#verification-boundaries). SQL tests run the real migration chain under PostgreSQL roles; browser tests run real IndexedDB/sync with separate simulated HTTP data. Both are required; neither claims hosted Storage/Auth or independent connection concurrency coverage. The Home palette test waits for CSS transitions before asserting final contrast, retaining the original accessibility threshold.

Do not report “done” if tests were skipped.
Whiteboard tests use actual SQL/RLS, actual native editor serialization and IndexedDB. Browser transport stays simulated and isolated from production auth. Android strokes use Chromium native touch injection; iPhone WebKit covers touch toolbar interaction and canvas at an iPhone viewport, with physical installed-PWA acceptance still separate. See [the Whiteboard verification boundary](WHITEBOARD_DOMAIN.md#verification).
Report:
- command;
- pass/fail;
- skipped reason.

Games combine bounded state-machine unit tests, authenticated-action tests, real PostgreSQL/PGlite policies/RPCs and browser IndexedDB/HTTP-fixture flows for all four V1 games. Conflicts, exact retries, answer secrecy, photo ownership and logout/reconnect are covered. PGlite serializes transactions; independent connection lock stress and hosted media/Auth acceptance remain separate. See [Games verification](GAMES_DOMAIN.md#verification-boundaries). On constrained Windows development machines, `pnpm test --maxWorkers=2` bounds parallel PostgreSQL workers without skipping tests.
