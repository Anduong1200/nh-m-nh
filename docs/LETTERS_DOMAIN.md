# Letters core

This workstream owns persistence, delivery/reveal rules, timezone resolution,
authorization, retries and the client lifecycle. Production visual composition
stays with the UI workstream. The existing UI prototype must consume these
contracts rather than infer delivery/opening or preload sealed content.

## Accepted reading rules

User decision, 2026-10-03: **joint opening requires both partners online in the
same reveal session**. It is not two acknowledgements accumulated hours apart.

- The author always reads their own immutable sent body.
- Before scheduled delivery, the recipient sees neither envelope nor clue/body.
- After delivery, an ordinary letter exposes its clue/envelope; the recipient
  explicitly opens it to receive content.
- A joint letter exposes recipient content only after both join the same session,
  maintain fresh presence, and explicitly confirm. The author's own copy remains
  readable throughout.
- Ordinary opening never exposes a sender read receipt, opening timestamp or
  changing sender version. Joint reveal is an explicitly shared interaction.

Only the original letter participants may read it, while still active members of
its active House. The recipient is derived from the other active member at send
time. Neither a client-supplied recipient nor a claimed House grants authority.
Creating/opening/joint actions require exactly two active House members. The
standard verified-auth/current-House boundary remains unchanged.

## Delivery, time and state

`schedule.ts` resolves a minute-precision `YYYY-MM-DDTHH:mm` wall time with an
IANA timezone to an explicit UTC instant. Supported wall years are 2000–2100.
The chosen delivery instant must still be in the future when committed. Invalid
zones/calendar dates and DST gaps are rejected. Repeated DST times require an
explicit `earlier`/`later` choice. For example:

```ts
const delivery = makeLetterSchedule("2027-01-10T08:00", "Asia/Ho_Chi_Minh");
// deliverAt = 2027-01-10T01:00:00.000Z
const repeat = makeLetterSchedule("2027-11-07T01:30", "America/New_York", "later");
```

Persist UTC `deliver_at`, the timezone and the original wall time. The DB checks
UTC/wall/zone correspondence independently, including direct-RPC callers. UTC
is the immutable delivery truth if timezone rules later change. A client clock,
animation or local timeout never grants access. RLS/RPC reads become eligible at
DB delivery time without requiring a cron or an open tab. This core does not send
push notifications; a future delivery notifier must preserve generic defaults
and quiet hours without changing content authorization.

`Letter` contains actor-specific `state`, `version`, `content`, `canOpen` and
`canJoin`:

| Reader / condition | State | Content |
| --- | --- | --- |
| Author, not due | `scheduled` | Own body |
| Author, ordinary delivered | `sent`, version 1 even after recipient opens | Own body |
| Recipient, not due | No DTO / no list row | None |
| Recipient, due and unopened | `sealed` | null |
| Recipient, explicitly opened | `opened`, version 2 | Body |
| Joint delivered and unopened, either actor | `sealed` | Author only |
| Joint successfully revealed, either actor | `opened`, version 2 | Body |

There is no mutable client `state`, reschedule/edit-after-send, deletion, burn,
conditional Open When, media attachment or automatic memory promotion in this
core. Drafts remain local until a confirmed send. Body length is at most 2,000
Unicode codepoints; an optional one-line clue is at most 80. Render plain text.

## Same-session joint reveal

A session lasts 120 seconds. Heartbeats every 5 seconds refresh only the explicit
open-letter session. Presence is fresh for 15 seconds. Both original participants
must have joined that session and have fresh heartbeats plus readiness when the
server processes the final confirmation. This is bounded heartbeat presence, not
proof of instantaneous physical connectivity: a disconnect can take up to 15
seconds to become stale. No global online/last-seen tracking is introduced.

`join` creates or joins the current session. `heartbeat` never confirms readiness.
After a stale heartbeat, readiness resets and explicit confirmation is required
again. `ready` may commit an opening only while both participants satisfy the
live-session checks. `leave` clears own presence/readiness and requires another
join. Expiry keeps the letter sealed; a new session cannot inherit old consent.
There is no penalty or notification pressure for leaving/timing out.

The DB locks House/membership/letter/session in a consistent order, checks time
after obtaining locks and creates one unique opening. A failure rolls back the
confirmation/opening atomically. Private session tables are not readable by
application roles: DTOs expose only connected count and the requesting actor's
readiness/presence, not a partner's last heartbeat. Closed/expired rows are kept
behind denied client access; no destructive retention purge is added.

## Server/UI contract

`model.ts` exports `Letter`, `LetterCommand`, `RevealCommand`, `RevealSession`,
codecs and limits. `actions.ts` authenticates each call from cookies, verifies
current House/account and validates actor-specific replies:

- `listLettersAction(context)` — latest 30 visible letters; scheduled recipients
  never receive prematurely listed envelopes;
- `readLetterAction(id, context)` — authoritative DTO or null;
- `applyLetterCommandAction(command, context)` — immutable `send` or recipient
  `open`, with an exact actor-bound receipt;
- `applyLetterRevealAction(command, context)` — explicit session action.

```ts
const command: LetterCommand = {
  kind: "send", letterId: crypto.randomUUID(), operationId: crypto.randomUUID(),
  payload: { content, clue, delivery: { mode: "immediate" }, revealTogether: true },
};
const sent = await applyLetterCommandAction(command, verifiedContext);
// Keep the same IDs/payload when retrying a lost acknowledgement.
const room = await applyLetterRevealAction(
  { kind: "join", letterId: command.letterId, sessionId: null }, verifiedContext,
);
// Subsequent heartbeat/ready/leave must use room.session.sessionId.
```

The UI prototype's always-present `content: string` must become a nullable,
authorized body. Ordinary seal-break invokes `open` and waits for its receipt
before rendering content. Joint reveal joins, runs heartbeat lifecycle and sends
`ready` only on each user's explicit confirmation. Render the returned session;
never set `opened` from animation completion, two locally selected avatars,
offline time or cached presence. No body logging or prefetch from unfiltered
tables. `result.blocked` requires account/House re-verification; errors offer retry
and retain drafts. The composer must supply a timezone and DST choice, not only
the prototype's timezone-free `datetime-local` value.

`LetterClient` and `letterTransport` provide bounded recent caching, CAS drafts,
receipt validation, and `watchReveal` lifecycle. Detach the watcher and call
`stop()` when leaving/logout/account change; send `leave` when possible. Hidden
or offline tabs do not heartbeat and listeners report lost connectivity; online
return refreshes presence without automatically confirming readiness. Backend
expiry protects disconnects even if the leave request cannot be delivered.

## Persistence and privacy

Six additive RLS-enabled tables:

- `letters`: immutable participant/delivery/clue metadata;
- `letter_contents`: separate sensitive body, author or eligible opened recipient;
- `letter_openings`: recipient-private ordinary opening truth; joint opening is
  visible only to its participants;
- `letter_operations`: actor-private exact retry requests/snapshots;
- `letter_reveal_sessions`, `letter_reveal_participants`: internal live-session
  truth, no application SELECT or writes.

All application INSERT/UPDATE/DELETE privileges are denied. Internal projection
helpers have no PUBLIC/anon/authenticated execute privilege. Public RPCs perform
membership/participant/time checks again, with empty security-definer search
paths. Composite foreign keys keep bodies/openings tied to the correct author/
recipient and House. No private Storage bucket, auth model or service-role key is
introduced. Bodies and sender send requests/snapshots remain sensitive plaintext
in the standard V1 database, not E2EE.

IndexedDB retains only the bound account/House's local drafts and validated
authorized recent DTOs, bounded by the existing seven-day/50-item cache. Sealed
recipient bodies are never cached. Already authorized opened content can be read
offline, explicitly labelled cached. No send/open/reveal is queued offline and no
delivery is inferred locally. Logout uses the existing persistent epoch barrier
to reject late replies and clear account data. Offline cache cannot instantly
learn a remote membership revocation while disconnected; online denial stops the
bound client. Full cold private offline navigation remains app-shell integration.

## Install and verification

Migration: `20261002050000_letters_core.sql`. Existing hardened House projects
may apply generated `supabase/install-letters.sql` once, atomically; Games/Island
are not runtime prerequisites. Fresh projects use regenerated
`supabase/setup-new-project.sql`. Neither installation is a remote deployment by
this workstream; keep applied migration history immutable.

Regenerate with `node scripts/generate-letters-install.mjs` and
`node scripts/generate-supabase-setup.mjs`.

Unit/action/IndexedDB tests cover schedules/DST, strict codecs, sealed-content
rejection, current auth, exact receipts, drafts and late-reply logout. PostgreSQL/
PGlite integration tests cover the actual installer/RLS/RPCs, scheduling, ordinary
and joint opening, stale/expired/left sessions, rollback and permission denial.
Browser tests run actual PostgreSQL RPCs behind an isolated HTTP fixture with
test auth identities, plus actual browser IndexedDB; no alternate production
auth path exists. Fixture due/stale/expiry controls change test DB rows only.
PGlite serializes connections; independent PostgreSQL-connection stress remains
separate. Production visual UI wiring, hosted Supabase acceptance and physical
installed-PWA acceptance are separate checks.

Validation on 2026-10-03:

- `pnpm lint`: passed, zero warnings.
- `pnpm typecheck`: passed.
- `pnpm test --maxWorkers=1`: all 489 tests in 46 files passed, including 38
  Letters tests. An earlier test run alongside build exhausted Windows memory;
  the final isolated one-worker run passed without removing tests.
- `pnpm build`: production build passed. The isolated Windows worktree's shared
  dependency junction required a temporary containing `turbopack.root`; this
  environment-only override is not committed.
- `pnpm test:e2e --workers=1`: 106/111 passed, including all 18 Letters tests across
  desktop Chromium, iPhone WebKit and Android Chromium. Five existing iPhone
  regression tests failed with native page creation timeouts/closed browser
  contexts, not failed domain assertions. Original traces are retained locally.
- `pnpm test:e2e --last-failed --project=iphone-webkit --workers=1`: those same five
  tests passed with unchanged assertions/timeouts and successful runner exit.
  The initial whole-suite command itself exited 1; it is not reported as a clean
  whole-suite pass.

Not run: hosted migration/Auth/Storage acceptance, independent PostgreSQL
connection race stress, physical installed PWA, or manual production Letters UI
flow. The production visual UI is not wired by this core workstream.
