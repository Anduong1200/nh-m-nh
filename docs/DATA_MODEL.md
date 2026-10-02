# Data Model — Conceptual V1

Names are conceptual and may be adjusted during implementation.

## Core

### profiles
- id
- display_name
- avatar_url
- timezone
- created_at

### houses
- id
- created_at
- state

### house_members
- house_id
- user_id
- joined_at
- status

Constraint:
- at most 2 active members in V1.

### pairing_invites
- id
- house_id
- token_hash
- expires_at
- used_at
- created_by

## Presence

### presence_entries
- id
- house_id
- user_id
- mood
- energy
- availability
- need
- note
- expires_at
- cleared
- version
- created_at
- updated_at

Implemented Presence uses optimistic versions and retains an owner-only conflict version after expiry/clear. Partner reads exclude expired/cleared rows. These timestamps are database internals, not last-seen signals in the client DTO.

## Knock

### knocks
- id
- house_id
- sender_id
- recipient_id
- kind (`note` / `sticker`)
- content (bounded one-line note / sticker identifier)
- created_at

`id` is the stable send-operation UUID. No `seen_at` or read receipt exists. The RPC derives actors and House and retries the same operation idempotently.

### knock_dismissals
- knock_id
- user_id
- dismissed_at

Recipient-owned inbox tidying. The sender cannot read dismissals.

### notification_preferences
- user_id
- quiet_enabled
- start_minute / end_minute
- timezone
- preview (`generic` default / `detail` opt-in)
- knocks_enabled
- updated_at

Preferences are account-private; quiet hours use a validated IANA zone. Presence/Knock implementation and authorization contracts: [Workstream B](WORKSTREAM_B.md).

## Board

### board_objects
- id
- house_id
- created_by
- type
- payload
- x
- y
- rotation
- z_index
- version (optimistic integer; incremented by authorized RPC)
- media_id (same-House verified media reference, nullable)
- created_at
- updated_at
- deleted_at

Avoid storing sensitive blobs directly in JSON when typed columns/tables are safer.

### board_operations
- operation_id (stable retry UUID)
- house_id / actor_id / item_id
- request (immutable logical mutation)
- outcome (`applied` / `conflict`)
- snapshot (immutable authoritative result)
- created_at

Both House members edit; only the creator trashes/restores. Ledger SELECT is actor-private and requires current membership. Details and integration contract: [Board domain](BOARD_DOMAIN.md).

## Whiteboard

### whiteboards
- id
- house_id
- version
- scene (bounded native Excalidraw envelope)
- updated_by
- created_at
- updated_at

### whiteboard_operations
- operation_id
- house_id
- actor_id
- request (expected version + immutable scene)
- outcome (applied / conflict)
- snapshot (exact versioned receipt)
- created_at

One Whiteboard per active House. Both members edit; clients have SELECT only with RLS. Writes use `save_whiteboard_snapshot`, with exact retry replay and no automatic full-canvas merge. Operation history is actor-private and remains sensitive. No purge API or images/embeds in this codec. See [Whiteboard domain](WHITEBOARD_DOMAIN.md).

## Games

### game_sessions
- id
- house_id
- game_type
- status
- created_by
- current_turn_user_id
- created_at
- updated_at
- completed_at

### game_events
- id
- game_session_id
- actor_id
- event_type
- payload
- sequence
- created_at

Prefer event/turn validation server-side.

## Letters

### letters
- id
- house_id
- sender_id
- delivery_mode
- deliver_at
- clue
- sealed
- reveal_together
- state
- content_ref
- created_at
- opened_at

## Island

### island_state
- house_id
- version
- progression_state
- updated_at

### island_events
- id
- house_id
- source_type
- source_id
- event_type
- created_at

Prefer deriving progression from events rather than arbitrary client score.

## Media

### media_objects
- id
- house_id
- owner_id
- storage_path
- media_type
- bucket_id (`nha-minh-private`)
- state (`pending` / `ready` / `error`)
- mime_type
- size_bytes
- duration_seconds
- created_at

Board media metadata is read-only to clients; only ready, verified same-House media may be attached. Upload/Storage policies and signed delivery belong to the separate media pipeline. See [Board domain](BOARD_DOMAIN.md#media-boundary).

## Export/deletion

Record lifecycle status explicitly where required.
Do not rely on client-only deletion state.
