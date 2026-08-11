# Bora quality remediation TODO

This is the living checklist for the repository-wide audit remediation. Update
the checkboxes in the same change that supplies the implementation and its
verification evidence.

Product constraints that apply throughout:

- Bora remains deliberately no-account. Recovery links are the supported
  cross-device identity mechanism.
- The default scheduling grid remains focused on daytime/evening hours.
  Hours from 01:00 through 07:00 must require an explicit per-day control.
- No release tag may be created or pushed without explicit confirmation.

## Baseline and tracking

- [x] Complete the initial repository, UI, API, CI, deployment, and operations audit.
- [x] Record a clean pre-change baseline for unit tests, lint, build, Compose,
  Playwright, dependency audit, and working-tree state.
- [x] Keep this checklist current as implementation progresses.
- [x] Add a single local verification command that matches the required CI gates.

## P0: production and data-safety blockers

### Web Push and reminders

- [x] Fix the creator-audience SQL bind mismatch.
- [x] Parenthesize audience selection so every subscription preference is honored.
- [x] Honor the event-level creator vote-notification setting, or remove the dead setting.
- [x] Catch every fire-and-forget Push/database/reminder rejection so it cannot
  terminate the API process.
- [x] Add an outbound Push timeout and bounded failure handling.
- [x] Prevent duplicate delivery under concurrent notification workers.
- [x] Notify participants when alternative-only schedules change.
- [x] Use the selected `mais-tarde` option for reminders and deletion timing.
- [x] Store/use an explicit event timezone for floating `marcar` schedules.
- [x] Rebind or remove an existing Push subscription when recovery replaces a
  participant identity or device access is removed.
- [ ] Verify VAPID-enabled delivery, preference opt-outs, stale endpoint cleanup,
  restart windows, and process survival with integration tests.

### Backups and restores

- [x] Make backup creation fail if `pg_dump` fails upstream.
- [x] Reject empty, truncated, or invalid compressed dumps.
- [x] Restore into an isolated database and verify all required tables.
- [x] Compare every application-table row count with an exact source-snapshot
  manifest so a parseable schema-only or data-loss dump is rejected.
- [x] Add automated forced-failure and truncated-dump tests.
- [ ] Document and verify an off-host backup/restore drill.

## P1: API, security, and data integrity

### Event and vote contracts

- [x] Reject cross-mode PATCH payloads and preserve persisted mode invariants.
- [x] Require at least one day for `marcar`.
- [x] Validate real calendar dates and 00:00-23:59 clock values.
- [x] Reject duplicate day IDs and dates.
- [x] Validate and canonicalize every `mais-tarde` alternative instant.
- [x] Reject invalid, removed, or non-canonical option IDs consistently.
- [x] Apply the same future/duplicate schedule rules in create and edit flows.
- [x] Protect vote-versus-close/delete races transactionally.
- [x] Add organizer update conflict detection to prevent silent lost updates.
- [x] Add slug collision retry and substantially increase invite-link entropy.

### Abuse and privacy boundaries

- [x] Resolve client IP only from a configured trusted proxy boundary.
- [x] Classify rate limits from the parsed pathname, including query strings.
- [x] Put a hard memory bound/expiry strategy on rate-limit buckets.
- [x] Add direct rate-limit spoof, query-string, and memory-bound tests.
- [x] Bound public event reads and paginate large vote sets; keep polling to one
  page and let people load more names explicitly.
- [ ] Review arbitrary Push endpoints for SSRF/egress and DNS-rebinding risk.
- [x] Coarsen small presence cohorts in the API, not only in the UI.
- [ ] Add CORS, security-header, malformed JSON, body-size, and strict-path tests.

### Recovery-link identity lifecycle

- [ ] Test recovery token creation, replacement, invalid tokens, and concurrent rotation.
- [ ] Test recovery over an already-subscribed device without leaking the old identity.
- [ ] Test optional organizer-control transfer at zero, one, and maximum saved events.
- [x] Handle oversized recovery URLs/QR payloads safely.
- [ ] Ensure organizer capabilities never appear in invite URLs, logs, or unsafe fallbacks.

## P1: frontend correctness, accessibility, and responsiveness

### User-visible correctness

- [x] Generate standards-compliant ICS timestamps and reject malformed UTC/newline output in tests.
- [x] Validate generated ICS files with a standards parser.
- [x] Count every selected option from both `Posso` and `Talvez` responses;
  preserve the reported multi-option 3/3-and-1/3 case as a regression test.
- [x] Preserve creator availability correctly when offered schedules are edited.
- [x] Distinguish not-found, offline, server-error, and retryable event states.
- [x] Add a useful unknown-route page.
- [x] Show the actual guest response in upcoming-event cards instead of always
  saying `Você confirmou`.
- [x] Fix Metrics polling so failures retain and mark existing data as stale.
- [x] Handle corrupted/quota-limited local storage without crashing or losing a
  newly created organizer capability silently.
- [x] Make clipboard failure expose a clean invitation URL, never the current admin URL.
- [x] Avoid duplicate URLs in Web Share payloads.

### Accessibility

- [x] Preserve link/button semantics for the three Home mode actions.
- [x] Give every input, textarea, date/time control, and checkbox an accessible name.
- [x] Expose selected state for week choices and organizer navigation.
- [x] Connect validation messages with `aria-invalid` and `aria-describedby`.
- [x] Keep progressbar values within their declared ARIA range.
- [x] Localize back-button accessible text to Portuguese.
- [x] Give every page a coherent heading hierarchy.
- [x] Verify modal focus, Escape/close behavior, and focus restoration.
- [ ] Add automated axe checks and keyboard-only critical journeys.
- [ ] Complete VoiceOver/iOS Safari and TalkBack/Android Chrome smoke checks.

### Responsive behavior

- [x] Stop the Local field from collapsing beside its checkbox at narrow widths.
- [x] Make week-day targets usable at 320-390 CSS pixels and with touch input.
- [x] Use a mobile-friendly time entry control that can enter `:` reliably.
- [x] Handle quick-time additions that cross midnight without silently changing days.
- [x] Keep 01:00-07:00 hidden behind an explicit per-day control and test it.
- [ ] Test 320, 360, 390, 768, 1024, and 1440 widths.
- [ ] Test portrait, landscape, safe areas, soft keyboard, long content, and
  200%/400% zoom or text scaling.
- [ ] Replace passive screenshots with reviewed visual-regression baselines.

## P1: automated test architecture

- [x] Make the default/root test command run the server tests.
- [x] Add explicit unit, server, API-integration, component, E2E-smoke,
  E2E-full, and coverage scripts.
- [x] Run HTTP route tests against disposable PostgreSQL, with Docker required
  for the explicit integration gate.
- [ ] Inject database, clock, Push sender, and client-IP resolution where needed
  for deterministic tests.
- [ ] Add component/DOM tests for store, datetime, Push, presence, and page states.
- [ ] Add coverage reporting and meaningful per-critical-module thresholds.
- [x] Typecheck server/config/E2E code in addition to `src`.
- [x] Enable React Hooks and JSX accessibility lint rules.
- [ ] Ensure secondary Playwright browser contexts inherit the active project device.
- [ ] Complete full create-vote-edit-decide-close-reopen-delete flows for all three modes.
- [ ] Test fresh and returning voters, double submission, declines, invalid admin
  tokens, recovery, and automatic refresh between two devices.
- [ ] Add Chromium, Firefox, and WebKit projects plus real touch/mobile profiles.
- [ ] Run date/time tests in UTC, America/Sao_Paulo, and at least one DST timezone.

## P1: CI, deployment, and release safety

- [x] Add `forbidOnly`, retries/flake visibility, and Playwright HTML/trace artifacts.
- [x] Validate base and production Compose overlays plus nginx and Caddy in CI.
- [x] Add actionlint, shellcheck, Dockerfile linting, secret scanning, dependency
  auditing, image scanning, and SBOM generation.
- [x] Resolve or explicitly document all high dependency advisories; keep the
  production audit clean.
- [x] Pin supported Node versions and reduce reliance on mutable `latest` ranges/tags.
- [x] Test fresh migrations and upgrades from representative historical schemas.
- [x] Smoke `/`, client-side route fallback, hashed assets, and `/api/health` after deploy.
- [x] Preserve previous runtime assets, environment/image digests, and release
  marker, then automatically roll back a failed deployment. Database migrations
  remain forward-only and are gated as additive/previous-image-compatible.
- [ ] Keep release notes based on every commit since the latest release tag.

## P2: performance, scale, and resilience

- [x] Remove or bound the My Events N+1 fan-out of up to 200 event/vote requests.
- [x] Page or summarize large event vote lists.
- [x] Make reminder scanning incremental/indexed instead of scanning every event.
- [x] Add JS/CSS transfer and parsed-size budgets.
- [ ] Add Lighthouse/Web Vitals budgets for representative mobile hardware/network profiles.
- [x] Add a safe, explicitly targeted pilot load smoke for concurrent voting,
  organizer updates, polling, presence, rate limiting, and the database pool.
- [ ] Extend load testing to reminders and representative growth targets.
- [ ] Test API restart, slow/lost network, lazy-chunk failure, and database outage recovery.
- [ ] Validate Web Push, notification clicks, Web Share, clipboard, and calendar
  downloads on installed Android Chrome and iOS Safari.

## Completion evidence

- [ ] Every item above is implemented, explicitly accepted with rationale, or removed
  because the corresponding feature no longer exists.
- [ ] All unit, server, API, component, E2E, accessibility, visual, dependency,
  configuration, migration, backup, and performance gates pass.
- [ ] The production-like restore and rollback drills pass.
- [ ] The working tree contains only intentional changes.
- [ ] No release tag has been created or pushed without explicit user confirmation.
