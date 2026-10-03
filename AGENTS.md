# AGENTS.md — Nhà Mình

This file contains repository-wide invariants. Specialized workflows live in `/skills/*/SKILL.md`.

## Mission

Build **Nhà Mình**, a private PWA for exactly two long-distance partners.

The product must feel like **a small home and a shared world**, not a generic social app, messenger, productivity dashboard, or Locket clone.

Core product sentence:

> Leave something behind for the person you love to discover.

Tagline:

> Ngôi nhà nhỏ và thế giới của hai đứa.

## Product invariants

Always preserve:

- exactly two paired members per House in V1;
- privacy-first access control;
- no public feed or follower model;
- no engagement pressure based on streaks;
- no “you neglected your partner” messaging;
- no relationship-health score;
- no default live location tracking;
- no coercive last-seen/read-receipt mechanics;
- no guilt notifications;
- no punitive world decay;
- app sessions should naturally fit **5–10 minutes**;
- async interaction is first-class;
- realtime is optional enhancement, not a dependency for basic use;
- Locket remains the spontaneous-photo product; Nhà Mình owns play, context, shared rituals, and long-term artifacts.

## V1 frozen feature set

1. Auth
2. Pairing / House
3. Home room/world entry
4. Presence/status
5. Knock
6. Shared Board
7. Whiteboard
8. Four games:
   - Doodle Relay
   - Draw & Guess
   - One-line Story
   - Photo Mission
9. Letters
10. Shared Island

Do not add V1 features without explicit approval.

Backlog candidates include Radio, Campfire, Museum, Open When, expanded Prayer Corner, deeper scout programs, more games, AI recap.

## UX identity

Mood:
- cozy
- adventurous
- cute
- scout
- weird
- playful

Visual system:
- adaptive day/night;
- cream / forest green / brown as base;
- scrapbook;
- hand-drawn;
- field notebook;
- animation intensity 3/5;
- couple identity 5/5;
- cute 4/5.

Mascots:
- rabbit;
- owl;
- they may react to activity;
- they must never create obligation or “pet death” mechanics.

## Home-space objects

Home may include, when relevant:

- drawer;
- whiteboard;
- radio placeholder/future door;
- campfire placeholder/future door;
- map;
- garden;
- mascot;
- game box;
- window;
- fridge;
- mailbox;
- board.

V1 must avoid fake functionality. If a future object is visible, it must be clearly decorative or labelled as not yet active.

## Scout / TNTT / Catholic identity

The experience may meaningfully include:

- Scout visual motifs and signs;
- Vietnamese Scout identity (PSVN);
- Tráng / Thiếu / Kha online program concepts;
- prayer together;
- statue/image representation of Mother Mary as a respectful visual element;
- “phút hồi tâm” for two people;
- prayer intentions.

Rules:
- keep tone respectful;
- never trivialize prayer into XP;
- never gamify sacraments, confession, or faith obligations;
- never infer spiritual state;
- never shame users for not completing spiritual activities.

## Presence model

Status fields:

- mood;
- energy;
- availability;
- one-line note;
- need.

Expiry:
- manual expiry;
- presets;
- end-of-day option.

Presence must reduce ambiguity, not enable surveillance.

## Knock

Knock is intentionally lightweight.

Allowed attachments may include:
- tiny note;
- doodle;
- sticker;
- short voice;
- small surprise interaction.

Do not turn Knock into chat.

## Whiteboard

V1:
- async first;
- basic pen/highlighter/eraser;
- text/sticky note;
- simple shapes/move/rotate if library supports safely;
- image support optional when persistence is stable.

Realtime simultaneous drawing is V2 unless trivial with chosen library.

Prefer established canvas tooling over building an editor engine from scratch.

## Board

Board is permissive and playful.

It may contain:
- note;
- photo;
- voice;
- links;
- doodles;
- place;
- mission;
- memory;
- countdown;
- other safe attachment types.

Avoid rigid productivity-dashboard layouts.

## Games

V1 game set is fixed:
- Doodle Relay;
- Draw & Guess;
- One-line Story;
- Photo Mission.

Default:
- async-first;
- optional live enhancement if both are online;
- light win/history is allowed;
- no XP system;
- no leaderboard pressure;
- users may create their own prompts/challenges.

Every game should produce or preserve a shared artifact when practical.

## Shared Island

Shared Island is the meta-world.

Progress comes from:
- memories;
- games;
- missions;
- milestones;
- weekly activity.

No currency in V1.
No decay.
No punishment for absence.
No “come back or lose progress”.

## Letters

Support:
- immediate send;
- scheduled delivery;
- clue;
- sealed state;
- reveal together.

Treat letter content as sensitive.

## Memories

The app may suggest memories, but the user confirms before permanent promotion.

Primary memory navigation:
- Shared Island.

Secondary timeline may exist later.

## Notifications

Quiet hours are user configurable.

Notification content is user-selectable:
- default should be privacy-preserving generic text.

Allowed notification classes include:
- explicit Knock;
- letter delivered;
- game turn;
- mission/challenge;
- explicit shared interaction.

Never send guilt notifications.

## Platform priorities

Primary:
- Windows desktop/laptop;
- iOS Safari / installed PWA;
- Android Chrome / installed PWA.

Desktop is first-class.
Mobile must remain excellent.

Support:
- modern evergreen browsers;
- current and previous two major browser releases where practical;
- iOS WebKit behavior must be tested on a realistic iPhone-class viewport.

## Offline

Required:
- app shell;
- cached recent content;
- local draft/create queue for notes and doodles;
- eventual sync after reconnect;
- clear conflict state when auto-merge is unsafe.

Never silently overwrite partner content.

## Security invariants

Never:
- expose Supabase service-role keys client-side;
- trust client-provided `house_id` without server/database authorization;
- ship tables without RLS when exposed through Supabase;
- use public storage buckets for private user media;
- put sensitive content into push notifications by default;
- weaken auth or authorization to “make development easier”;
- add analytics/tracking without explicit approval;
- commit secrets;
- perform destructive schema changes without an ADR and explicit approval.

Design V1 as secure standard architecture with a future migration path toward stronger client-side/E2EE protection.

All content is sensitive by default.

## Agent autonomy

Default autonomy: **Level 2**.

Agents may:
- implement assigned work;
- refactor locally;
- add tests;
- improve types;
- improve obvious UX states;
- document decisions.

Agents may not autonomously:
- replace core architecture;
- make destructive DB migrations;
- change auth model;
- remove security controls;
- disable tests;
- add paid dependencies/services;
- add external AI APIs;
- add tracking;
- delete user data;
- broaden V1 scope.

If a major architecture change appears necessary:
1. write an ADR;
2. explain trade-offs;
3. stop before destructive implementation unless explicitly approved.

## Ambiguity policy

When a requirement is ambiguous:

1. inspect canonical docs;
2. choose a reasonable default;
3. record the assumption in the task/PR;
4. continue.

Exception: stop for clarification when ambiguity affects:
- auth;
- authorization;
- destructive schema migration;
- irreversible data deletion;
- major privacy behavior.

## Decision priority

Use this order:

1. correctness
2. privacy/security
3. simplicity
4. UX
5. maintainability
6. performance
7. implementation speed
8. cleverness

## Definition of Done

A user-facing feature is not done unless:

- implementation works;
- responsive desktop/mobile behavior works;
- authorization is enforced and tested;
- loading/error/empty states exist;
- accessibility is reasonable;
- unit/integration tests exist where appropriate;
- critical E2E exists where appropriate;
- lint passes;
- typecheck passes;
- build passes;
- no secrets are introduced;
- docs are updated for schema/architecture behavior;
- critical browser flow is manually verified.

## Required commands before completion

Use project package-manager equivalents:

- lint
- typecheck
- unit/integration tests
- relevant Playwright E2E
- production build

Do not claim completion if required checks were skipped. State exactly what was and was not run.

## Git

Branches:
- `main`
- `feature/*`
- `fix/*`
- `refactor/*`

Conventional Commits:
- feat:
- fix:
- refactor:
- test:
- docs:
- chore:

Agents may commit when asked or when the environment expects autonomous task completion, but commits must be coherent and scoped.

## Integration owner

Codex owns integration at the end of every phase: review Gemini branches, resolve
integration issues, merge, then run lint, typecheck, tests, production build and
relevant E2E on the integrated tree. Record remaining release gates honestly.
See `docs/INTEGRATION.md`. A UI prototype or green branch alone is not completion.

## Canonical references

Before implementing significant work, read:

- `PRODUCT_SPEC.md`
- `docs/ARCHITECTURE.md`
- `docs/SECURITY.md`
- `docs/UX_RULES.md`
- relevant `/skills/*/SKILL.md`

Do not invent product behavior that contradicts those files.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
