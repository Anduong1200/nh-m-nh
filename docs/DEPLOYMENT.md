# Deployment

## V1 target

- Vercel
- Supabase

## Environments

Recommended:
- local
- preview
- production

Use separate production credentials.
Prefer separate Supabase projects for production vs development when practical.

## Secrets

Store only in platform secret management / env.
Never commit `.env*` containing real secrets.

## Migrations

- migrations are versioned;
- review RLS with every schema change;
- destructive migrations require ADR + explicit approval;
- production migration sequence must be documented.

## PWA deployment

Verify:
- HTTPS;
- manifest served correctly;
- icons;
- service worker scope;
- update behavior;
- offline fallback;
- iOS Home Screen behavior;
- Android install behavior.

## Post-deploy smoke test

- auth
- House load
- paired authorization
- private media
- status
- Knock
- board
- a game turn
- letter state
- island state
