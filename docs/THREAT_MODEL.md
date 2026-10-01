# Threat Model

## Assets

- private letters
- photos
- voice notes
- status
- needs/mood
- board objects
- whiteboard content
- game artifacts
- shared island/memories
- prayer/reflection content
- pairing identity

## Trust boundaries

1. user device
2. browser/PWA storage
3. Vercel application boundary
4. Supabase Auth
5. PostgreSQL/RLS
6. Supabase Storage
7. push notification provider/browser OS surface

## Abuse cases

### Cross-House access
Attacker modifies object IDs to retrieve another couple’s content.

Control:
- RLS;
- storage authorization;
- integration tests.

### Pairing takeover
Attacker obtains invite link.

Control:
- high entropy;
- expiry;
- one use;
- recipient confirmation if needed;
- House member cap.

### Session theft
Attacker gains a valid token.

Control:
- secure auth defaults;
- session revoke support;
- logout cache clearing;
- minimize notification leakage.

### Shared-device privacy
Someone opens browser storage on a shared computer.

Control:
- logout clears private caches;
- optional future app lock;
- avoid excessive persistent cache.

### XSS
Malicious content executes in partner browser.

Control:
- text rendering;
- sanitization;
- CSP where practical;
- no arbitrary HTML.

### Destructive sync conflict
Offline changes overwrite partner state.

Control:
- versioning;
- append-only event model where suitable;
- conflict UI.

### Emotional dark pattern
The product pressures one partner to respond.

Control:
- no streak loss;
- no neglect wording;
- no relationship scoring;
- quiet hours;
- explicit notification controls.
