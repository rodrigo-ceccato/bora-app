# Bora MVP pre-test checklist

Use this before sharing the MVP with real testers.

## 1. Local verification

```bash
npm install
npm test
npm run lint
npm run build
npm run dev
```

Pass criteria:

- All commands pass.
- `/home`, `/create`, and `/e/:slug` render without console errors.
- Mobile viewport and desktop viewport are usable.

## 2. Supabase verification

1. Create a Supabase project.
2. Run `docs/supabase-schema.sql`.
3. Copy `.env.example` to `.env` and fill `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Restart `npm run dev`.
5. Confirm the home page says `Supabase configurado`.

Pass criteria:

- Created events open in a different browser/incognito window.
- Votes submitted in one browser appear after refresh in another browser.

## 3. Deployment verification

Deploy to Vercel, Netlify, or Cloudflare Pages with the same env vars.

Pass criteria:

- Public event link works on phone and desktop.
- Invitee link does not include `?admin=`.
- Admin link includes `?admin=` and should only be kept by the creator.

## 4. Bora Agora flow

1. Create a Bora Agora event.
2. Set threshold to 3.
3. Copy public invite link.
4. Vote as three different names in incognito/private sessions.

Pass criteria:

- Invitees can vote without account.
- Name is required.
- Threshold text changes from `Faltam...` to `Vai acontecer!`.
- Creator can close and reopen voting with the admin link.

## 5. Bora Mais Tarde flow

1. Create alternatives like `Hoje 20:00`, `Amanhã 19:30`, `Quarta 21:00`.
2. Vote with accept/maybe/decline and different preferred options.

Pass criteria:

- Preferred option is shown in the votes list.
- Threshold still uses accepted votes.

## 6. Bora Marcar flow

1. Create at least three days.
2. Add multiple hour slots for each day.
3. Vote availability across horizontally scrollable day cards.

Pass criteria:

- Day cards scroll horizontally on mobile.
- Selected slots are visually highlighted before submit.
- `Melhores horários` ranks slots by vote count.
- Slots meeting the threshold are highlighted green.

## 7. Known MVP limitations

- No full account system yet.
- Admin-token updates are suitable for private MVP tests only; production should move admin mutations to a Supabase Edge Function.
- No anti-spam/CAPTCHA yet.
- No realtime subscriptions yet; users refresh to see latest votes.
