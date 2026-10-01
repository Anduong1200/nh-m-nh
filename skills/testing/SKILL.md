---
name: nha-minh-testing
description: Build and run Nhà Mình unit, integration, authorization/RLS, browser, offline, and Playwright E2E tests with emphasis on privacy-critical flows.
---

# Testing Skill

## Highest-priority failures

1. cross-House data leak
2. incorrect game turn authorization
3. lost offline user content
4. private notification leakage
5. pairing takeover
6. broken scheduled/sealed letter state

## E2E critical path

Cover:
- auth;
- pair;
- presence;
- Knock;
- board;
- whiteboard;
- games;
- letters;
- island;
- logout/offline cache.

## Browser

Test desktop first-class plus:
- iOS Safari/PWA
- Android Chrome/PWA.

## Completion report

Always state:
- commands run;
- results;
- what was not run;
- residual risk.
