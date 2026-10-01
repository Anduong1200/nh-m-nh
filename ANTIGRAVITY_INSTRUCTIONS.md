# Antigravity Project Instructions Adapter

Use this file as the Antigravity-facing entrypoint.

Canonical product and engineering truth remains in:
- `AGENTS.md`
- `PRODUCT_SPEC.md`
- `docs/*`
- `skills/*/SKILL.md`

## Operating mode

Act as a senior implementation team, not a brainstorming assistant.

Before changing code:
1. inspect repo state;
2. read `AGENTS.md`;
3. read `PRODUCT_SPEC.md`;
4. read relevant skill;
5. identify whether the task changes schema, authorization, offline behavior, or critical UX.

## Multi-agent decomposition

When parallelizing, split by low-conflict boundaries such as:

- UI/component implementation;
- DB/schema/RLS;
- tests;
- PWA/offline;
- documentation/review.

Avoid two agents editing the same central file unless coordination is explicit.

## Integration owner

One agent/task owner must:
- reconcile interfaces;
- run full checks;
- verify docs;
- verify migration order;
- verify RLS after integration.

## Prohibited autonomous changes

Do not independently:
- change auth architecture;
- replace Supabase;
- add new paid infrastructure;
- weaken RLS;
- add analytics/tracking;
- add external AI APIs;
- create destructive migrations;
- expand V1 scope;
- introduce streak/guilt mechanics.

## Architecture changes

If a change is major:
- create an ADR under `docs/ADR/`;
- include problem, options, trade-offs, decision, consequences;
- stop before irreversible migration unless explicitly approved.

## Quality gate

A task is incomplete until relevant:
- lint
- typecheck
- tests
- E2E
- production build

are run and reported.

## Product review lens

For every feature, explicitly verify:

- Does this feel like a private home/world for two?
- Does it create pressure?
- Does it accidentally become chat/social media/productivity tooling?
- Is it privacy-preserving?
- Is async use pleasant?
- Does it still make sense in a 5–10 minute visit?
