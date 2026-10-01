---
name: nha-minh-games
description: Implement the four frozen V1 Nhà Mình async-first mini-games and their shared game-session/turn/artifact framework without scope creep.
---

# Games Skill

## V1 games only

- Doodle Relay
- Draw & Guess
- One-line Story
- Photo Mission

Do not add new V1 games without approval.

## Shared principles

- async-first;
- optional realtime enhancement;
- short;
- personal;
- custom prompts allowed;
- light history allowed;
- no XP;
- no leaderboard pressure;
- preserve shared artifact when meaningful.

## Framework

Each session should model:
- House;
- players;
- game type;
- current turn/state;
- ordered events;
- completion;
- artifact.

Server/database must validate turn and House membership.

## Doodle Relay

Alternate contributions.
Do not overwrite earlier partner strokes.

## Draw & Guess

Support custom prompt.
Do not expose answer prematurely.

## One-line Story

One line per turn.
Preserve sequence.

## Photo Mission

Support user-created mission.
Consider reveal-after-both-submit mode.
Private media rules apply.
