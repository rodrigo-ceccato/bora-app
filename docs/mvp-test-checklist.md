# Bora MVP pre-test checklist

## 1. Automated verification

```bash
npm run verify
npm run verify:ops
npm run test:e2e:local
```

All commands must pass.

## 2. Shared environment

1. Copy `.env.docker.example` to `.env` and replace the database password.
2. Run `docker compose up -d --build`.
3. Open `http://localhost:8080/api/health`.
4. Confirm the response is `{"status":"ok"}`.

Pass criteria:

- An event created in one browser opens in another browser or phone.
- Votes appear after submission and after automatic refresh.
- Opening a fake `?admin=` token does not expose creator controls.
- A direct `/e/:slug` page load works.

## 3. Creation and creator controls

- The creator is automatically counted as confirmed.
- The creator can copy a clean invite link.
- The creator can recover the admin page under “Meus Boras neste aparelho.”
- Closing voting disables guest voting.
- Reopening voting enables it.
- Deleting removes the event and its votes.

## 4. Guest voting

- The voting form appears before group results.
- A name is required.
- Double-clicking does not create duplicate votes.
- Voting again from the same browser updates the previous vote.
- A clear saved state appears after voting.
- “Alterar meu voto” restores the previous selection.
- Declining does not record a preferred time or availability.

## 5. Mode-specific checks

### Bora Agora

- The threshold includes the creator.
- Status changes from “Faltam…” to “Vai acontecer!” at the threshold.

### Bora Mais Tarde

- Main and alternative times display correctly in the test timezone.
- Preferences count only “Bora” and “Talvez” responses.

### Bora Marcar

- Day cards scroll horizontally on small phones.
- Hour labels are readable.
- The creator starts available for every proposed slot.
- Best times rank by availability and highlight the threshold.

## 6. Friends-and-family pilot

Start with 5–10 trusted people and Bora Agora. Record:

- whether creation required help;
- whether invitees understood the page without explanation;
- time from opening the link to voting;
- failed or duplicate submissions;
- confusion about creator versus invite links.

The API includes an in-memory mutation rate limit and the production runbook
covers automated backups. Before a wider public launch, verify both on the
deployed host and decide whether the expected traffic warrants a shared,
durable rate-limit store.
