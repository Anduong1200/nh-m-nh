---
name: nha-minh-security
description: Review and implement authorization, privacy, storage, pairing, offline caching, and security-sensitive flows for the two-person Nhà Mình PWA.
---

# Security Skill

## Always assume

All user content is sensitive.

## Required review

For every data feature answer:

- Who owns this?
- Which House may read it?
- Which member may mutate it?
- Can a third user guess the object ID?
- Does RLS deny cross-House access?
- Is media private?
- Does notification text leak content?
- What remains cached offline?
- What happens on logout?
- Is deletion reversible?

## Mandatory

- RLS for exposed tables;
- private media;
- no service-role client-side;
- high-entropy pairing;
- one-time invite;
- two-member constraint;
- input validation;
- untrusted text rendering;
- authorization tests.

## Stop conditions

Do not autonomously proceed if task requires:
- weakening RLS;
- destructive migration;
- auth model replacement;
- irreversible data deletion semantics not documented;
- secrets in client bundle.

Write an ADR / request explicit approval.
