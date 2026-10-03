# Background notifications

Opt-in classes: explicit Knock, letter delivery and game turn. Home settings
offer enrollment/disable with no permission request on load. Background text is
always `Có điều mới trong Nhà.` Detailed foreground Knock preview is separate.
Quiet hours, timezone and Knock disable preferences apply to dispatch.

Apply `install-notifications.sql` after Letters/Games, or the complete guarded
Phase 2 upgrade. Subscription credentials have owner-only RLS. Browser roles
have no outbox access. Source triggers enqueue jobs; service-role RPCs claim up
to eight with `FOR UPDATE SKIP LOCKED`, two-minute leases and four attempts.
Jobs older than 24 hours expire. Disable cancels pending/leased jobs. The outbox
and payload contain no letter/message/game-answer text.

Set these through ignored `.env.local` or deployment secrets. Never paste private
values into chat or Git:

- `SUPABASE_SECRET_KEY`: the project's server Secret key.
- `NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY`: VAPID public key, safe for browsers.
- `WEB_PUSH_PRIVATE_KEY`: matching VAPID private key.
- `WEB_PUSH_SUBJECT`: contact `mailto:` or HTTPS URL you control.
- `PUSH_DISPATCH_SECRET`: random secret of at least 32 characters.

Generate VAPID locally with `pnpm exec web-push generate-vapid-keys`. A deployment
scheduler should POST `/api/notifications/dispatch` once a minute with
`Authorization: Bearer <PUSH_DISPATCH_SECRET>`. Never put this header in a public
client. Missing configuration is explained in the UI; normal async use works.

Acceptance requires installed iPhone/Android and Windows testing: permission,
closed app, due time, quiet hours, account switch, logout and revoked endpoint.
Automated tests inject a transport and exercise PostgreSQL RLS/leases; they send
no real push and do not prove physical device delivery.
