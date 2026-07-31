# Roadmap

Planned work, roughly in dependency order. Each item lists where it touches the
current code so the scope is concrete rather than aspirational.

---

## 1. Multi-option voting and a "decided" event state

**Goal:** invitees pick *several* times that work for them, the creator then locks
one in. Once decided, the losing options grey out and the event clearly reads as
settled.

### Where we are

Today a vote carries a single choice: `votes.preferred_option text`
(`server/migrations/001_initial.sql:24`), rendered as one radio group
(`src/pages/EventPage.tsx` preference list). The `marcar` mode already does
multi-select via `votes.availability jsonb`, but through a separate, parallel
code path — so the app effectively has two voting systems that don't share logic.

There is no "decided" concept. The closest thing is `events.voting_closed boolean`
(`001_initial.sql:14`), which only stops new votes; it doesn't record *what was
chosen*.

### Proposed shape

- Add `events.decided_option text` (nullable) and `events.decided_at timestamptz`.
  Non-null `decided_option` is the single source of truth for "this event is
  settled" — derive the UI state from it rather than adding another boolean that
  can disagree with it.
- Replace `votes.preferred_option text` with `votes.preferred_options jsonb`
  (array). Migrate existing rows with `to_jsonb(array[preferred_option])`.
- Collapse `mais-tarde` and `marcar` onto one representation if possible: both are
  "here are N candidate slots, mark the ones you can do." That removes the
  duplicate tally logic in `preferenceSummary` / `slotSummary`
  (`src/pages/EventPage.tsx:39` and `:30`).
- Admin-only `PATCH /api/events/:slug` field to set/clear the decision, guarded by
  the existing admin-token check.
- UI: winning option highlighted, others dimmed and non-interactive, plus a
  header badge ("Decidido — quinta, 18:00"). Keep the vote counts visible; people
  still want to see how close it was.

### Fix this bug as part of the work

**Votes are currently matched by rendered display string.** `preferred_option` is
saved as `"18:00"` formatted in the *creator's* timezone (`src/lib/store.ts:78`)
and compared for equality against the *viewer's* rendering
(`src/pages/EventPage.tsx:43`, `:85`, `:510`). An invitee in another timezone
renders `"19:00"`, matches no option, and silently tallies as zero.

Options must be keyed by something stable — a slot id, or the absolute UTC
instant — with the local time used only for display. Doing this while the vote
schema is already being rewritten is far cheaper than a standalone fix.

### Open questions

- Can the creator change the decision after locking it, or is it final?
- Does deciding also close voting, or can people keep responding to the chosen time?
- What happens to people who marked "can't do" on the winning slot — notify them?

---

## 2. "My events" — see events you created or accepted

**Goal:** a person can find the Boras they made and the ones they said yes to,
without having saved the link.

### Where we are

Identity already exists and is device-local: `bora_participant_id` in
localStorage (`src/lib/store.ts:6`, `:35`), sent with every create and vote, and
stored as `votes.participant_id` with a `unique (event_id, participant_id)`
constraint (`001_initial.sql:21`, `:28`). Creator status is proven by holding the
admin token, of which only a hash is stored (`events.admin_token_hash`), so the
server currently *cannot* enumerate "events you created" — that link lives only
in the URL the creator was given.

So a lot of the plumbing is there; what's missing is a way to query by
participant and a durable place to keep the admin tokens.

### Proposed shape

- `GET /api/me/events`, keyed on participant identity, returning events where the
  participant has a vote — split into created vs. joined.
- To make "created by me" work server-side, add `events.created_by_participant_id`
  alongside the existing token hash. The token stays the capability for *admin
  actions*; the participant id is only for *listing*. Keep those separate — don't
  let listing grant edit rights.
- New route + page listing upcoming and past events, sorted by `starts_at`.
- Rate-limit and paginate: participant ids are guessable-ish, so treat the listing
  as low-sensitivity and never include admin tokens in it.

**Depends on item 3** for the interesting case. With localStorage-only identity,
the list is empty on a new phone and lost when storage is cleared. Item 2 is
still worth shipping first on device-local identity — it's useful immediately and
item 3 upgrades it in place.

---

## 3. Accounts / portable identity

**Goal:** your events follow you to a new device.

### Two candidate approaches

**A. Login with Google (OIDC).** Standard, no password handling, no reset flow,
and most of the target audience already has an account. Costs: an OAuth client
and consent screen, a `users` table, session cookies or JWTs, and a real
migration path for existing anonymous participants.

**B. Credentials embedded in a URL** — a long unguessable "magic link" that
restores your identity when opened.

Approach B is much cheaper and fits how the app already works (the admin token is
exactly this pattern). Its risks are real though, and worth stating plainly:

- URLs leak — via `Referer` headers, browser history, screenshots, and pasting
  into group chats. Anyone with the link *is* you.
- Putting an actual `login/password` pair in the URL, as opposed to an opaque
  random token, is strictly worse: people reuse passwords, and it would appear in
  logs in plaintext. **If we go with B, use a high-entropy random token, never a
  password.**
- Mitigations: keep the token out of the query string where practical, set
  `Referrer-Policy: no-referrer`, allow revoking/rotating a token, and scope it to
  listing rather than destructive actions.

**Recommendation:** start with B as an "account recovery link" — one opaque token
that re-binds a device to an existing participant id — since it needs no new
infrastructure and directly upgrades item 2. Add A later as an *optional* upgrade
for people who want it, keyed to the same underlying user record so the two can
coexist. Avoid making Google sign-in mandatory; the app's whole appeal is that you
can create a Bora and share a link in about ten seconds.

### Open questions

- Do we want accounts at all, or is a recovery link sufficient forever?
- If someone signs in with Google on a device that already has anonymous votes,
  do we merge that history into the account?
- Does an account change what invitees see (real names vs. self-declared names)?

---

## Suggested order

1. **Item 1** — highest user-visible value, and it fixes a live correctness bug.
2. **Item 2** on device-local identity — useful on its own, no new auth concepts.
3. **Item 3** as a recovery link, upgrading item 2 in place. Google sign-in only
   if there's real demand.
