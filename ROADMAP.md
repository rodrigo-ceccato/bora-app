# Roadmap

Planned work, roughly in dependency order. Each item lists where it touches the
current code so the scope is concrete rather than aspirational.

---

## Completed — Product UX refresh

**Delivered (2026-08-02):** the first impression and the three creation paths
now match their distinct planning jobs, while keeping Bora's no-account promise
obvious.

- Add the green Bora graph symbol as the favicon and home-page mark.
- Home hero: “Bora marcar?” above the symbol and concise no-account copy below
  it; retain Bora Agora, Bora essa semana and Bora marcar as equal actions.
- Remove duplicate create-page titles, constrain desktop form width, and use a
  typed +/- confirmation-count control.
- Bora Agora: initialise to the present, prohibit past time choices, and show a
  date once a selection crosses midnight.
- Bora essa semana: use compact current-week day buttons by default; add sorted,
  removable time chips for one selected day and keep a full date picker as a
  secondary route.
- Bora marcar: use compact collapsible date sections, selectable time chips,
  duplicate-date/past-time validation, and day duplication, removal, addition,
  and “same times” actions.
- Results: group schedule choices by date, show “x de y disponíveis”, expose at
  most three top options initially, and give only creators compact finalisation
  controls.
- Manual visual validation was completed at 360px, 768px and 1440px. Automated
  responsive smoke coverage now checks the home page, every creation mode, the
  time wheel and results with real votes at those same widths; it saves a
  screenshot and trace when a check fails. Deeper visual baselines for empty,
  invalid, loading and completed states remain a later quality improvement.

---

## 1. Multi-option voting and a "decided" event state

**Status (2026-08-02): delivered.** Events persist a decision and its timestamp;
votes persist multiple stable option IDs; creators can decide a qualifying slot;
and the results interface groups, ranks and explains availability. A decided
event now offers Google Calendar and a downloadable ICS file to both organisers
and invitees. The former timezone bug is covered by option-ID tests and no
longer relies on rendered time labels.

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

- Notification system (from browser? shoudl work on mobile too).

- use local storage and or cookies to show presistente list of ongoing accepted/votting events

- Generate google agenda adder handle, or link, something like that from the event page (from manager and for voteees to access, when date is decided)

- Check if, when suggesting, votters can pick multiple possible dates. the creator of the event can 'close' the event and pick any of the dates that have a minumum of votes on (if minum is 3, the date/hour options with less than 3 should be grayed out)

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

**Status (2026-08-02): delivered without mandatory accounts.** “Meus Boras” is
queried from the server for the current participant, while administrator tokens
remain only on the original device. An optional recovery link restores that
participant identity on another device without transferring admin privileges.

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

**Status (2026-08-02): recovery-link phase delivered.** Bora now uses an opaque,
high-entropy recovery token whose hash alone is stored by the server. Google
sign-in remains an optional future upgrade, not a requirement for creating or
voting.

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

## Suggested next order

1. **Automated visual and flow coverage** — verify all three modes at 360px,
   768px and 1440px, including keyboard, invalid and loading states.
2. **Notifications/reminders** — first define the consent and delivery channel;
   browser notifications must work on mobile before they are relied on.
3. **Optional sign-in only if demand proves it valuable** — preserve the recovery
   link as the lightweight, no-account default.
