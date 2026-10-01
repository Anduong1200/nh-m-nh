# Codex Entry Instructions

Use `AGENTS.md` as repository-wide invariant context.

For any non-trivial task:

1. Read `AGENTS.md`.
2. Read `PRODUCT_SPEC.md`.
3. Read the relevant `/skills/<name>/SKILL.md`.
4. Read any affected docs under `/docs`.
5. Inspect existing code before proposing a new pattern.
6. Implement the smallest coherent solution.
7. Run required checks.
8. Report assumptions and residual risks.

## Skill routing

Use:

- product behavior/scope → `skills/product/SKILL.md`
- visual/UI interaction → `skills/frontend-ui/SKILL.md`
- auth/RLS/privacy/media → `skills/security/SKILL.md`
- schema/migration/RLS → `skills/database/SKILL.md`
- games → `skills/games/SKILL.md`
- PWA/offline/sync → `skills/pwa-offline/SKILL.md`
- tests → `skills/testing/SKILL.md`
- pre-merge/final review → `skills/review/SKILL.md`

Multiple skills may apply.

## Do not

Do not re-interpret the product from scratch.
Do not expand V1 because a feature seems attractive.
Do not trade authorization/security for development speed.
Do not introduce streak, guilt, surveillance, or relationship scoring.

## Task completion format

Return:

### Changed
- ...

### Assumptions
- ...

### Security/privacy
- ...

### Verification
- command → result

### Remaining risks
- ...

### Files touched
- ...
