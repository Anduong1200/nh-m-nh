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

Do not report “done” if tests were skipped.
Report:
- command;
- pass/fail;
- skipped reason.
