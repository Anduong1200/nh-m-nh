# Frozen Assumptions

These decisions resolve answers that were intentionally flexible.

## Package manager
Prefer `pnpm`; agent may use another only for a concrete repository/tooling reason.

## Browser floor
Target modern evergreen browsers and current + previous two major versions where practical.

Priority real-world matrix:
- iPhone 12-class Safari / installed PWA
- modern Android Chrome / installed PWA
- Windows Chrome
- Windows Edge

## Media
V1 default:
- photo
- audio up to 60 seconds
- links

Video is out of V1.

## Storage limits
Do not hardcode product limits prematurely.
Implement configurable server-side validation and document chosen technical limits once media pipeline is built.

## Deletion
Use per-content lifecycle.

For future Campfire Burn Note:
- default intended behavior is soft-delete/recovery window of 24 hours before permanent deletion.

Campfire itself is post-V1.

## Notifications
Feature code decides which explicit partner events are notification-worthy.
User controls quiet hours and lock-screen detail.
Default content is privacy-preserving generic copy.

## Weather/location
Home may use user-selected location to decorate weather/time context.

Rules:
- do not continuously track location;
- do not expose coordinates to partner by default;
- explicit user location selection is preferred;
- weather is ambience, not presence surveillance.

## Scout / Catholic modules
Meaningful but not all required for V1.

V1 may establish visual/content extension points.
Full online Tráng/Thiếu/Kha program and deeper Prayer Corner may land after core V1 unless explicitly promoted.
