# Roadmap

## Current product baseline

The no-account planning flow is shipped:

- Bora Agora, Bora essa semana, and Bora marcar creation flows.
- Multi-option voting, a creator-selected final time, Google Calendar links, and
  downloadable ICS files.
- A device-local **Meus Boras** list plus a recovery link for moving that
  participant identity to another device.
- Optional Web Push subscriptions for confirmation, change, 24-hour, and
  two-hour reminders.
- Production deployment, health checks, backups, and release rollback
  procedures.

## Next milestone: learn from a small pilot

Run a 5–10 person friends-and-family pilot, beginning with Bora Agora. Capture
whether people can create and vote without help, time from opening an invite to
submitting a response, duplicate or failed submissions, and confusion between
the creator and invite links. See the [MVP test checklist](docs/mvp-test-checklist.md).

Use that evidence to decide whether the next product change is reminders or
creation-flow simplification. The recovery link remains the lightweight way to
move a participant identity between devices.

## Quality work before the next feature

1. Extend automated checks to invalid, loading, empty, closed, and decided
   states; include keyboard-only interaction for creation, voting, and creator
   controls.
2. Add API-level coverage for authorization, rate limits, recovery-token
   rotation, and Web Push subscription validation.
3. Test reminder delivery on Android Chrome and installed iOS Safari with real
   VAPID credentials before relying on reminders during a pilot.
4. Keep a small visual baseline gallery for the three supported viewport widths:
   360px, 768px, and 1440px.

## Refactoring direction

Refactor only behind coverage. `EventPage` is the next candidate: keep the
page as orchestration and move pure result calculations, the vote form,
creator controls, and event editing into focused modules. The API can follow by
separating route wiring from validation and notification delivery once API
integration tests are in place.
