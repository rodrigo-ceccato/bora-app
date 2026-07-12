# Bora App Modernization Roadmap

## Executive summary

Bora is an early Ionic/Cordova prototype for organizing social meetups with friends. The current product direction is still viable: a mobile-first app for creating events, inviting friends, collecting attendance/availability, and helping groups decide when and where to meet.

The current implementation should not be treated as production-ready. It uses Ionic 3, Angular 5, Cordova, TypeScript 2.4, and a prototype Express/MongoDB backend with plaintext passwords and no real authorization. The recommended path is to preserve the product concept but rebuild the client on modern Ionic + Angular + Capacitor and replace or substantially rewrite the backend.

## Current project goal

Based on `DOCS/DesignDecisions`, page names, providers, and user-facing copy, the app aims to:

- Let users register and log in.
- Let users maintain a friend list.
- Let users create meetings/events.
- Let users invite friends to meetings.
- Show meetings created by the current user and meetings where the current user was invited.
- Support quick events such as "Bora Hoje" / "Bora Agora".
- Support scheduled events where participants may coordinate availability.
- Eventually support location/map functionality.

Recommended MVP definition:

1. Secure user registration and login.
2. Friend search/add flow.
3. Create fixed-date events.
4. Invite friends to events.
5. Accept/decline invitations.
6. List created and invited events.
7. Show event details with date, time, location, invitees, and RSVP state.

Treat flexible availability voting, push notifications, maps, and spontaneous event discovery as post-MVP unless they are core to the product strategy.

## Current technical state

### Frontend

The frontend is an Ionic 3 app using:

- `ionic-angular` 3.9.2
- Angular 5.0.3
- TypeScript 2.4.2
- RxJS 5.5.2
- Cordova Android 7
- Old Ionic Native plugins
- TSLint

Important files:

- `src/app/app.module.ts`
- `src/app/app.component.ts`
- `src/pages/*`
- `src/providers/people/people.ts`
- `src/providers/meeting/meeting.ts`
- `src/models/consts.ts`

State is held in mutable provider fields such as `currentUser`, `currentUserMeetingsInvited`, and `currentUserMeetingsCreated`. Pages are notified via Ionic `Events`. This is workable for a prototype but should be replaced with typed services, RxJS streams, Angular signals, or a state store.

### Backend

The backend is a single `index.js` Express server with MongoDB access through `express-mongo-db`.

Current endpoints include:

- `POST /login`
- `POST /users`
- `POST /search`
- `POST /addFriend`
- `POST /events`
- `GET /events`
- `POST /searchMeetingsInvited`
- `POST /searchMeetingsCreated`
- `POST /inviteFriends`
- `POST /removeEvent`

Backend concerns:

- Passwords are stored and compared as plaintext.
- No JWT/session authentication.
- No authorization checks on event/friend operations.
- No validation layer.
- No environment configuration.
- MongoDB connection is hardcoded.
- Uses old Mongo APIs (`insert`, `update`, `remove`).
- Logs contain debug/offensive text.
- Backend dependencies are not properly declared in `package.json`.
- No tests.

### Configuration and secrets

Current issues:

- Backend API URL is hardcoded in `src/models/consts.ts`.
- Google Maps API key is committed in `src/models/consts.ts`.
- Cordova metadata still uses starter values such as `io.ionic.starter` and `MyApp`.
- Android min SDK is `16`, which is obsolete.

## How the app currently works

1. `MyApp` starts at `LoginPage`.
2. `LoginPage` calls `PeopleProvider.login()`.
3. `PeopleProvider.login()` posts credentials to `/login`.
4. On success, the provider stores the returned user in `currentUser` and publishes the `formigueiro de rua` event.
5. The provider fetches invited and created meetings from the backend.
6. Login navigation pushes `SlidesHomePage`, then the user can continue to `TabsPage`.
7. Tabs lead to meeting list, meeting creation, and profile/friends.
8. `MeetingProvider.addMeeting()` posts to `/events`, then refreshes meeting lists and publishes `meeting added`.
9. `MeetingProvider.removeMeeting()` posts to `/removeEvent`, then refreshes meeting lists and publishes `meeting removed`.

This flow should be redesigned around explicit route guards, an auth service, API services, and typed state.

## Is Ionic the correct framework?

### Recommendation

Ionic is still a reasonable framework for Bora if the desired product is:

- Mobile-first.
- Deployed to Android and/or iOS.
- Potentially also available as a PWA/web app.
- Mostly form/list/card/navigation driven.
- Using device capabilities such as camera, geolocation, status bar, splash screen, push notifications, and maps.

However, the current Ionic 3 + Cordova stack should be replaced. The recommended target is:

- Ionic 8+
- Modern Angular
- Capacitor
- TypeScript 5+
- ESLint/Prettier

### When to choose another framework

Use React Native/Expo if native mobile feel, native ecosystem breadth, and advanced device integrations matter more than web/PWA reuse.

Use native Android/iOS if the app requires heavy background location, advanced notification behavior, high-performance maps, or deep OS integrations.

Use a normal web/PWA stack without Ionic if the product will primarily be used in browsers rather than installed as a mobile app.

For Bora's current goal, modern Ionic + Capacitor remains a strong fit.

## Target architecture

### Recommended frontend stack

- Ionic 8+
- Modern Angular with standalone components
- Angular Router
- Reactive Forms
- HttpClient interceptors
- Capacitor
- RxJS and/or Angular signals for state
- ESLint + Prettier
- Playwright for web E2E tests
- Optional mobile E2E via Maestro

Suggested structure:

```text
src/app/
  core/
    api/
    auth/
    config/
    guards/
    interceptors/
  features/
    auth/
    onboarding/
    meetings/
    friends/
    profile/
  shared/
    components/
    models/
    utils/
```

### Recommended backend options

Option A — Fast MVP:

- Supabase Auth
- Supabase Postgres
- Row-level security
- Realtime updates where useful

Option B — Structured custom backend:

- NestJS or Express/Fastify with TypeScript
- MongoDB or PostgreSQL
- JWT or secure session authentication
- `argon2` or `bcrypt` password hashing
- Zod/Joi/class-validator validation
- Helmet, CORS allowlist, rate limiting
- Structured logging
- API tests

Recommendation: use Supabase for fastest product validation; use NestJS if the project goal includes learning/building a custom backend.

## Proposed data model

### User

```ts
interface User {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}
```

### Friendship

```ts
interface Friendship {
  id: string;
  requesterId: string;
  receiverId: string;
  status: 'pending' | 'accepted' | 'blocked';
  createdAt: string;
  updatedAt: string;
}
```

### Event

```ts
interface Event {
  id: string;
  creatorId: string;
  title: string;
  description?: string;
  locationName?: string;
  locationLat?: number;
  locationLng?: number;
  startsAt?: string;
  endsAt?: string;
  schedulingMode: 'fixed' | 'poll';
  createdAt: string;
  updatedAt: string;
}
```

### EventInvitation

```ts
interface EventInvitation {
  id: string;
  eventId: string;
  userId: string;
  status: 'invited' | 'accepted' | 'declined' | 'maybe';
  createdAt: string;
  updatedAt: string;
}
```

### AvailabilitySlot

```ts
interface AvailabilitySlot {
  id: string;
  eventId: string;
  userId: string;
  startsAt: string;
  endsAt: string;
}
```

## Modernization roadmap

### Phase 0 — Product and repository baseline

Deliverables:

- Define MVP scope and post-MVP features.
- Decide target platforms: Android, iOS, PWA/web.
- Decide backend strategy: Supabase, NestJS, or Express/Fastify.
- Add useful README documentation.
- Add `.env.example`.
- Remove secrets from source and rotate exposed keys.
- Rename app metadata from starter defaults.

Acceptance criteria:

- README states what Bora is, how to run it, and what stack it uses.
- No API keys or production server IPs are committed as active config.
- MVP scope is documented.

### Phase 1 — Security and backend foundation

Deliverables:

- Replace plaintext password handling.
- Add real authentication.
- Add authorization checks for users, friends, invitations, and events.
- Add request validation.
- Add consistent error responses.
- Move database URL and CORS config to environment variables.
- Add API tests for auth and core event operations.

Acceptance criteria:

- Users cannot access or mutate other users' private data.
- Passwords are hashed.
- Invalid requests return structured 4xx errors.
- Backend can run locally from documented commands.

### Phase 2 — New frontend shell

Deliverables:

- Create a new modern Ionic Angular + Capacitor app shell.
- Add routing and route guards.
- Add auth screens.
- Add app tabs/shell.
- Add environment-based API config.
- Add linting and formatting.

Acceptance criteria:

- App builds on supported Node LTS.
- Login/logout flow works against the modern backend.
- No Cordova dependencies remain in the new shell.

### Phase 3 — Port core features

Deliverables:

- Port friend list/search/add.
- Port event creation.
- Port created/invited event lists.
- Port event detail view.
- Add RSVP statuses.
- Replace Ionic `Events` with typed state/services.

Acceptance criteria:

- User can create an event and invite a friend.
- Invited user can see and respond to the invitation.
- Created and invited event lists update predictably.
- Empty/loading/error states are implemented.

### Phase 4 — Scheduling improvements

Deliverables:

- Implement fixed-date event flow cleanly.
- Implement poll/availability flow if still in MVP.
- Store availability slots in backend.
- Show aggregated availability to event creator.

Acceptance criteria:

- Event creator can propose a time or date range.
- Invitees can submit availability.
- Creator can see overlap and choose final time.

### Phase 5 — Device integrations

Deliverables:

- Replace Cordova plugins with Capacitor plugins.
- Add geolocation only if it supports a real feature.
- Add map display/search if location is core.
- Add camera only if profile/avatar or event photos are in scope.
- Add push notifications for invitations/updates if needed.

Acceptance criteria:

- Android build uses Capacitor.
- Runtime permissions are explained to users.
- Features degrade gracefully on web/PWA if supported.

### Phase 6 — Quality, CI, and release readiness

Deliverables:

- Add unit tests for services and core logic.
- Add API integration tests.
- Add E2E tests for auth and event invitation flow.
- Add CI checks for lint/test/build.
- Add deployment documentation.
- Add production observability/logging.

Acceptance criteria:

- CI fails on lint, test, or build failure.
- Release builds are reproducible.
- Deployment uses environment variables and HTTPS.

## Migration strategy

Recommended strategy: rebuild and port, not in-place upgrade.

Reasoning:

- The Ionic 3 to Ionic 8 gap is too large.
- Angular 5 to modern Angular requires significant API, tooling, and build changes.
- Cordova should be replaced by Capacitor.
- Current app has prototype state management and debug code that should not be preserved.

Suggested approach:

1. Freeze this repository as legacy/reference behavior.
2. Create a modern app shell in a new branch or new directory.
3. Implement backend/API contracts first.
4. Port screens by feature, not by file.
5. Keep old code only as a UX/reference source.
6. Delete legacy-only pages and debug flows after replacement.

## Immediate cleanup checklist

- [ ] Rotate the committed Google Maps API key.
- [ ] Move API endpoint and keys to environment configuration.
- [ ] Remove offensive/debug logging from `index.js` and `src/**`.
- [ ] Add backend dependencies to `package.json` if maintaining the current server temporarily.
- [ ] Add `.env.example`.
- [ ] Update Cordova/app identifiers if the legacy app must still be run.
- [ ] Document local setup for frontend and backend.
- [ ] Add a basic API contract document.

## Risk register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Plaintext passwords | Critical security issue | Replace auth before any release |
| Committed API key | Key abuse and billing risk | Rotate key and move to env config |
| Obsolete Ionic/Cordova stack | Hard to build/maintain | Rebuild on Ionic + Capacitor |
| No tests | Refactors can break behavior silently | Add backend and core frontend tests early |
| Hardcoded backend IP | Environment coupling | Use environment-based config |
| Global mutable provider state | UI bugs and stale state | Replace with typed state services |

## Final recommendation

Keep the Bora product direction and keep Ionic as the preferred frontend framework only if the target remains mobile-first with optional web/PWA support. Do not continue investing in the current Ionic 3/Cordova implementation beyond short-lived reference or emergency fixes.

The best modernization path is:

1. Secure/rebuild the backend or adopt Supabase.
2. Build a fresh Ionic Angular + Capacitor client.
3. Port MVP features only.
4. Add tests, CI, and environment-based deployment before release.
