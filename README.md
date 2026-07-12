# Bora

Bora is now a modern responsive Ionic React + Capacitor app for creating shareable event-planning links.

## Product modes

- **Bora Agora**: invitees vote if they are up to going now. The creator sets a minimum number of accepts required for the event to happen.
- **Bora Mais Tarde**: invitees vote if they are up for a later event and can pick a preferred alternative time/day.
- **Bora Marcar**: creator defines days and hour slots; invitees enter their name and mark availability in horizontally scrollable day cards, like a simple when2meet.

Invitees do **not** need accounts. They only enter their name before voting. Creator accounts are optional for future expansion; the MVP uses a shareable event link plus an admin token in the creator URL.

## Stack

- Ionic React
- Vite
- Capacitor
- Supabase
- TypeScript

The app works as a responsive website/PWA and can be packaged for Android/iOS with Capacitor.

## Run locally

```bash
npm install
npm run dev
```

Open the shown Vite URL.

## Build

```bash
npm run build
```

## Supabase setup

1. Create a Supabase project.
2. Run `docs/supabase-schema.sql` in the Supabase SQL editor.
3. Copy `.env.example` to `.env` and fill:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

If Supabase env vars are absent, the app runs in local demo mode using `localStorage`.

## MVP testing

Before sharing with testers, follow [`docs/mvp-test-checklist.md`](docs/mvp-test-checklist.md).

## Mobile packaging

```bash
npm run build
npx cap add android
npx cap sync android
npx cap open android
```

Use `ios` instead of `android` on macOS with Xcode.

## Legacy note

The previous Ionic 3/Cordova prototype was replaced by this fresh migration because the old stack no longer builds reliably on modern Node and does not fit the anonymous link-based Bora use case.
