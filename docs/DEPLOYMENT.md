# Deployment

## V1 target

- Vercel
- Supabase

## Current production address — 2026-10-06

- [Nhà Mình](https://nha-minh-ten.vercel.app)
- Vercel project: `anduong1200/nha-minh`, Hobby, Node 24.x, Next.js.
- Git repository: `Anduong1200/nh-m-nh`, production branch `main`.
- Production has the two public Supabase variables; `NEXT_TELEMETRY_DISABLED=1`
  disables framework build telemetry on subsequent builds.
- Supabase Site URL: `https://nha-minh-ten.vercel.app`.
- Supabase Redirect URL: `https://nha-minh-ten.vercel.app/auth/callback?next=**`.

The HTTPS shell is deployed and checked. Saving the Supabase URLs, the real
two-account flow, server media Secret, background notification configuration and
installed phone acceptance remain separate gates; see `COMPLETION_STATUS.md`.

## First HTTPS deployment

The project is a Next.js server application. Use the repository root and the
Next.js preset; do not export it as a static GitHub Pages site. The checked-in
`vercel.json` pins pnpm 11.25.0 for both dependency installation and the real
production build. This avoids Vercel inferring an older pnpm from the lockfile.
Do not replace `pnpm build` with `build:e2e`: that test build intentionally blanks
the public Supabase environment.

1. Sign in to [Vercel](https://vercel.com/new) with the GitHub account that can
   access `Anduong1200/nh-m-nh`. Import that repository. If it is not listed,
   authorize the Vercel GitHub app for this repository only.
2. Keep Framework Preset **Next.js**, Root Directory at the repository root and
   Production Branch **main**. Leave the output directory at its Next.js default.
3. Use a supported Node 22 or 24 release. pnpm 11.25 requires Node >=22.13;
   inspect the build log's effective Node version, since `engines.node` can
   override the dashboard's selected major version.
4. Add both public Supabase variables to **Production** before building:
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
   Copy their values from the same project as the installed schema. They are
   browser configuration, not server secrets. Do not give unknown preview branches
   production private credentials.
5. For complete photo/voice support, add `SUPABASE_SECRET_KEY` through Vercel's
   environment settings using a sensitive server-only value. Never use a
   `NEXT_PUBLIC_` name or paste the key into chat/Git. This key is not required
   to install the PWA or use notes/doodles.
6. Deploy and record the stable production address shown by Vercel, for example
   `https://<your-project>.vercel.app`. Do not use a temporary branch preview
   origin as the two phones' permanent installation address.
7. In the same Supabase project, open **Authentication → URL Configuration**.
   Set Site URL to the stable HTTPS origin. Add the redirect pattern
   `https://<your-project>.vercel.app/auth/callback?next=**`, replacing the host
   with your actual one. The app always includes a validated local `next` path;
   this pattern permits its URL-encoded query on the exact callback path. The
   callback validates the destination again through `safeAuthRedirect`. Do not
   allow an arbitrary host or a production-domain-wide `/**` wildcard. Existing loopback
   redirects may remain for local development.
8. The Google OAuth authorized redirect URI stays the Supabase provider callback
   `https://<project-ref>.supabase.co/auth/v1/callback`. It is distinct from the
   app's callback above; do not replace it with the Vercel app URL.
9. On the HTTPS app, sign in with both original accounts and verify the existing
   House and protected rooms. Then install/test with [the PWA guide](WINDOWS_PWA_SETUP.md).

Public variables are embedded at build time. Redeploy after changing them.
Changing a Vercel setting alone does not update an already built deployment.
For CLI deployment, `.vercelignore` excludes `.env*`, workstation caches and
browser test artifacts from upload. Set environment through Vercel separately;
generated Whiteboard fonts and the offline asset manifest are built on the host.
Keep authentication, RLS and private Storage enforced; HTTPS deployment does not
make House content public. The public welcome/sign-in shell remains reachable.

References: [GitHub import/deploy](https://vercel.com/docs/git/vercel-for-github),
[package-manager selection](https://vercel.com/docs/package-managers),
[Node runtimes](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions),
[environment variables](https://vercel.com/docs/environment-variables),
[Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

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

The production server sets Secure auth cookies. Physical iOS acceptance must
use HTTPS; a plain HTTP loopback/LAN preview is not an authenticated production
substitute. Do not relax cookie options for local testing. The public recovery
shell and immutable assets are cached, not private HTML/API/media. Offline recent
content and drafts are scoped to the last verified account/House on that device.

Background push is a separate release step. See
[background notifications](BACKGROUND_NOTIFICATIONS.md) for VAPID, opt-in and
the protected POST dispatcher. No scheduler is installed by `vercel.json`;
do not configure a GET cron against this POST-only endpoint or assume that PWA
installation enables background delivery. No paid service is added by this guide.

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
