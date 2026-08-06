# Repository working agreements

## Product direction

- Bora is deliberately no-account. Do not propose, add, or retain account or
  sign-in work in the roadmap unless the user explicitly reopens that decision.
- Recovery links are the supported cross-device identity mechanism.
- Keep the default scheduling grid focused on daytime/evening slots. Offer
  early-morning times (01:00–07:00) behind an explicit per-day control.

## Git and GitHub workflow

- Work directly on `main`: commit requested changes and push `main` when the
  user asks to push.
- Do not create branches or pull requests unless the user explicitly asks for
  one. If an accidental PR or temporary branch is created, close/delete it
  before continuing with the direct-to-`main` workflow.
- Before a release, review every commit since the latest release tag. Release
  notes must describe all user-visible changes in that range, not just the
  most recent commit.
- If a release fails and a corrective tag is needed, carry forward the
  user-visible changes from the failed, unpublished tag into the corrective
  release notes so they are not lost.
- Pushing an annotated `vX.Y.Z` tag deploys production. Prepare the notes and
  request explicit confirmation immediately before creating or pushing a
  release tag.
