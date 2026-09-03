# Submission-day checklist

## Required deliverables

- [ ] Project title
- [ ] Short description
- [ ] Long description
- [ ] Technology/category tags
- [ ] Cover image (`public/og.png` is ready as the first candidate)
- [ ] Video presentation
- [ ] Slide presentation
- [ ] Public GitHub repository
- [ ] Public, incognito-tested demo URL
- [ ] Dedicated Alpaca paper account ID from the fresh $100,000 account
- [ ] One-page write-up covering AI logic, risk gates, and Alpaca infrastructure
- [ ] Up to five social post links, if available

## Logs and proof

Raw logs are **not listed as a separate required upload** in the supplied event requirements. Keep the following evidence ready because it strengthens the video, write-up, and judging review:

- [ ] Alpaca paper order and activity screenshot showing the atomic GLD spread and fill
- [ ] VolGuard Journal screenshot showing submission, reconciliation, and monitor events
- [ ] GitHub Actions run showing a successful automated monitor cycle
- [ ] Cloudflare Worker trigger/success view showing the five-minute schedule
- [ ] GitHub Actions evidence showing the ten-minute entry branch and a safe abstention or approved paper entry
- [ ] Performance page showing reconciled-trade metrics, verified catalyst evidence, Decision Memory confirmations, and the daily replay disclosure
- [ ] Pause/resume workflow evidence showing the authenticated Durable Object control state
- [ ] Test summary showing the current automated suite passing
- [ ] Fresh-account evidence showing the $100,000 starting balance

Do not publish raw environment files, API keys, bearer tokens, GitHub secrets, full request headers, or verbose logs containing private identifiers. The submission form may require the Alpaca paper account ID; enter it there rather than committing it to the public repository.

## Public-release gate

- [ ] Repository visibility is Public and the README renders correctly
- [ ] `.env.local`, secrets, account IDs, and generated private evidence are absent from Git history
- [ ] Demo opens in an incognito window without owner authentication
- [ ] `/`, `/decisions`, `/positions`, `/risk`, `/journal`, and `/performance` all show the same current telemetry
- [ ] Navbar and timezone selector work on phone and desktop
- [ ] Demo makes no live-trading claim and still displays the paper-trading disclaimer
- [ ] Final deck and video use the same facts and numbers
- [ ] Every performance screenshot is timestamped and uses actual reconciled data; illustrative scenarios are visibly labeled and never presented as results
- [ ] Every placeholder in `docs/SUBMISSION_COPY.md` has been replaced in the submission form

## Deployment decision for today

The current working product uses Vinext on OpenAI Sites with Cloudflare D1. A direct Vercel import will not preserve the existing API/data behavior because Vercel does not provide the `cloudflare:workers` D1 binding. For the fastest reliable submission, use the verified Sites deployment as the official demo. Treat Vercel as complete only after a storage adapter, ingestion security, persistence, and all five routes have passed end-to-end verification.

## Deadline

The supplied event page states **September 4, 2026 at 6:00 PM East Africa Time**. The live lablab event page also lists the event as running through September 4. Submit earlier if possible so video processing, repository visibility, or form validation cannot consume the final minutes.
