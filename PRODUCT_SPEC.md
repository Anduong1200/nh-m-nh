# Product Specification — Nhà Mình V1

## 1. Vision

**Nhà Mình** is a private PWA for exactly two long-distance partners.

It is a shared home, play space, and growing world.

Tagline:

> Ngôi nhà nhỏ và thế giới của hai đứa.

Primary promise:

> Mỗi lần mở app đều có khả năng nhìn thấy một dấu vết mà người kia để lại, làm một thứ nhỏ cùng nhau, hoặc thêm một mảnh vào thế giới chung.

## 2. Audience

Exactly two people.

Known usage:
- Partner A: Android + Windows
- Partner B: iOS + Windows laptop
- desktop usage is important;
- PWA install should be supported;
- Locket already serves frequent spontaneous photo sharing.

## 3. Session model

Healthy target:
- 5–10 minutes per session;
- optional shorter micro-interactions;
- no strong obligation to return daily.

The product may create gentle continuity but never guilt.

Forbidden messaging examples:
- “Bạn đã bỏ bê người ấy.”
- “Chuỗi của bạn sắp mất.”
- “Relationship health declined.”
- “Your partner is waiting because you failed to respond.”

## 4. Home

Architecture:
- hybrid interactive room + Shared Island/map.

Home may visually change based on:
- time of day;
- user-selected location weather;
- room state;
- seasonal decoration;
- user activity.

Weather must never silently expose precise location.

Home objects may include:
- drawer;
- whiteboard;
- radio;
- campfire;
- map;
- garden;
- mascots;
- game box;
- window;
- fridge;
- mailbox;
- board.

## 5. Presence

Fields:
- mood;
- energy;
- availability;
- one-line note;
- need.

Expiry:
- manual;
- presets;
- end-of-day.

Presence is explicit, never inferred from activity.

## 6. Knock

Purpose:
- lightweight “I’m here / I thought of you.”

May support creative payloads:
- note;
- doodle;
- sticker;
- short voice;
- tiny surprise.

Must remain lighter than messaging.

## 7. Shared Board

Board should feel lived-in, not like a project-management app.

Allow flexible mixed content:
- notes;
- photos;
- voice;
- links;
- doodles;
- places;
- missions;
- memories;
- countdowns;
- other safe objects.

Layout may support playful positioning.

## 8. Whiteboard

V1:
- basic drawing;
- pen;
- highlighter;
- eraser;
- simple text;
- sticky note;
- basic object movement where supported.

Async-first.

Realtime simultaneous drawing is V2.

## 9. Games

### 9.1 Doodle Relay
Players alternate adding to a shared drawing.

Goal:
- absurd/fun artifact;
- preserve final image/drawing.

### 9.2 Draw & Guess
One user draws; the other guesses.

Allow custom word/prompt packs.

### 9.3 One-line Story
Players alternate exactly one line/turn.

Preserve completed stories as artifacts.

### 9.4 Photo Mission
One user or system defines a lightweight photo challenge.
Both may submit before reveal depending on challenge mode.

The product must not become a generic gaming portal.

## 10. Shared Island

Shared Island is the persistent meta-world.

Growth inputs:
- memories;
- games;
- missions;
- milestones;
- weekly activity.

No currency in V1.
No decay.
No absence penalty.

Island content can eventually host:
- map points;
- cabin;
- garden;
- campfire;
- lookout;
- faith/scout references;
- memory objects.

## 11. Letters

Support:
- immediate delivery;
- scheduled delivery;
- clue;
- sealed letter;
- open/reveal together.

Letters are sensitive data.

## 12. Memories

System may suggest a memory candidate.
User confirms before promotion.

Shared Island is primary memory navigation.

## 13. Scout / TNTT / Catholic layer

The product may contain meaningful shared identity.

Desired ideas:
- Vietnamese Scout motifs;
- PSVN references;
- Tráng / Thiếu / Kha online activities;
- shared prayer;
- Mother Mary visual presence;
- “phút hồi tâm” for two;
- prayer intentions.

Do not:
- turn faith into points;
- shame missed prayer;
- trivialize sacred practices;
- present spiritual judgments.

## 14. Notifications

Users configure quiet hours.

Users may choose notification privacy.

Default:
- generic lock-screen text.

Allowed:
- Knock;
- delivered letter;
- game turn;
- mission/challenge;
- explicit partner action.

## 15. Media

V1 preferred:
- photos;
- audio;
- links.

Audio:
- max 60 seconds by default.

Video:
- out of V1 unless explicitly approved.

## 16. Data portability

Export recommendation:
- ZIP
- JSON
- Markdown
- original media

Future optional:
- PDF memory book.

## 17. Data deletion

Deletion behavior may vary by content type.

Default approach:
- ordinary user content: recoverable trash window where sensible;
- ephemeral/burn semantics: explicit special behavior;
- irreversible deletion must be clearly disclosed.

## 18. Success criteria

V1 is successful if:

- both users naturally return without streak pressure;
- Home feels personally changed by the other person;
- games produce memorable shared artifacts;
- Board/Whiteboard becomes a lived-in space;
- the Shared Island becomes meaningful over time;
- users do not feel monitored;
- interactions work cross-platform and offline-tolerantly.
