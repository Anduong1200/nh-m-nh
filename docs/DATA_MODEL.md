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
- created_at
- updated_at

## Knock

### knocks
- id
- house_id
- sender_id
- payload_type
- payload_ref / compact payload
- created_at
- seen_at

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
- created_at
- updated_at
- deleted_at

Avoid storing sensitive blobs directly in JSON when typed columns/tables are safer.

## Whiteboard

### whiteboards
- id
- house_id
- version
- created_at
- updated_at

### whiteboard_snapshots/events
Choose based on library integration.
Must support safe sync and conflict semantics.

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
- size_bytes
- duration_seconds
- created_at
- deleted_at

## Export/deletion

Record lifecycle status explicitly where required.
Do not rely on client-only deletion state.
