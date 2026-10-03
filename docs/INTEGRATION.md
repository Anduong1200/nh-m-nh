# Integration ownership

Codex owns integration, as decided by the project owner on 2026-10-03.

Every phase follows this sequence:

1. Gemini prepares scoped branches against canonical `PRODUCT_SPEC.md`, `AGENTS.md`
   and `/docs`, and states API assumptions and verification results.
2. Codex reviews product scope, authorization/privacy, UX, engineering, offline and
   tests. Demo content, local-only reveal/progression and disconnected controls are
   blockers for production feature integration.
3. Codex stages branches in an isolated integration checkout, resolves conflicts,
   connects authoritative domain contracts and adds necessary regression coverage.
4. On the resulting integrated tree, run lint, typecheck, unit/integration tests,
   production build and relevant E2E. Verify critical UI at desktop/iPhone/Android
   viewports. A green individual branch does not replace this gate.
5. Merge/push the reviewed tree to main and check CI for that exact commit. Record
   deployment/migration and real-device gaps separately from automated checks.

Do not mark a phase complete with skipped required checks. Do not call V1 ready
for production merely because all branches were merged. Hosted schema/auth/media,
native installed PWA and any unimplemented canonical product path remain explicit
release gates. Scope changes still require the product owner's approval.
