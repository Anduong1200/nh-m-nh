---
name: nha-minh-review
description: Perform a strict final review of Nhà Mình changes for product drift, security regressions, UX pressure, maintainability, and incomplete testing.
---

# Review Skill

Review from six lenses:

1. Product
2. Privacy/security
3. UX/emotional safety
4. Engineering
5. Offline/realtime
6. Testing

## Product drift

Flag:
- Locket duplication;
- social-feed behavior;
- excessive chat;
- productivity dashboard feel;
- generic game portal;
- V1 scope creep.

## Emotional safety

Flag:
- streak pressure;
- guilt copy;
- “neglect” framing;
- forced daily completion;
- intrusive read/online tracking.

## Security

Flag:
- missing RLS;
- client-side trust;
- public media;
- sensitive push;
- weak pairing;
- unsafe cached data.

## Engineering

Flag:
- unnecessary dependency;
- huge component;
- hidden state coupling;
- fragile sync;
- undocumented schema behavior.

## Output format

Return:
- Critical
- High
- Medium
- Low
- Acceptable trade-offs
- Required fixes before merge
