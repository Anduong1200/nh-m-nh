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

Board domain tests and the simulated browser transport are documented in [BOARD_DOMAIN.md](BOARD_DOMAIN.md#verification-boundaries). SQL tests run the real migration chain under PostgreSQL roles; browser tests run real IndexedDB/sync with separate simulated HTTP data. Both are required; neither claims hosted Storage/Auth or independent connection concurrency coverage. The Home palette test waits for CSS transitions before asserting final contrast, retaining the original accessibility threshold.

Do not report “done” if tests were skipped.
Whiteboard tests use actual SQL/RLS, actual native editor serialization and IndexedDB. Browser transport stays simulated and isolated from production auth. Android strokes use Chromium native touch injection; iPhone WebKit covers touch toolbar interaction and canvas at an iPhone viewport, with physical installed-PWA acceptance still separate. See [the Whiteboard verification boundary](WHITEBOARD_DOMAIN.md#verification).
Report:
- command;
- pass/fail;
- skipped reason.
