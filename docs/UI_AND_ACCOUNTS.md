# Visual design and accounts

The applicant requested **60% Jimo, 20% Meteomatics and 20% AleaSoft** as design inspiration, plus day/night modes and working signup/login. Percentages describe emphasis, rather than a measurable share of pixels or copied components. All copy is specific to WindDesk. The energy analysis still uses only the two permitted Elexon datasets.

| Reference | Applied influence |
| --- | --- |
| [Jimo](https://jimo.ai/) — 60% | White/navy composition, large centred headline, subtle grid, blue actions, rounded pastel panels, tabbed product preview, workflow and FAQ |
| [Meteomatics](https://www.meteomatics.com/) — 20% | Weather-intelligence hierarchy, lime accent, data-first presentation and technical workflow |
| [AleaSoft](https://aleasoft.com/) — 20% | Blue energy-market framing, decision-oriented language and capability structure |

The sites were inspected in a browser. No competitor logos, customer claims, proprietary fonts or screenshots are used as WindDesk assets. Self-hosted DM Sans and Manrope retain their licences. Visualizations use SVG/Recharts and actual application data.

## Content and themes

The landing page includes a hero, public access and account actions, three interactive product previews, scope metrics, a three-step workflow, six capability descriptions, dataset lineage, six explanatory FAQs, final actions and a resource footer. The previews query the real 15 January 09:00 decision and January accuracy endpoints.

All analytical components remain: date/cutoff filters, forecast chart, explicit actual reveal, empirical reference, publication history, interval table, day/month CSVs, metrics, daily/hourly charts, distribution, heatmap, source links and provenance. Reviewers can access this public-data pilot without an account.

Day/night controls appear on both the landing page and workspace. First visit follows the system preference. Explicit selection persists in browser storage; semantic theme variables cover surfaces, controls, charts, heatmap, tooltips, account forms and notifications. A small head script applies the theme before React renders. Accounts also save appearance and the default cutoff.

## Account behavior and controls

- Signup collects full name, normalized email and a 12–128-character password, creates a session and opens the decision desk. There are no default users/passwords.
- Login restores saved theme/cutoff preferences. Unknown users and wrong passwords receive the same error.
- The account panel shows member details, saves preferences, updates the display name, changes the password with current-password confirmation and provides logout. Password changes revoke other sessions and rotate the current session.
- Passwords use random salts and PBKDF2-HMAC-SHA256 with 600,000 iterations; digest comparison is constant-time.
- Sessions expire after seven days. The browser receives an opaque random token in an HttpOnly/SameSite=Lax cookie. Only its SHA-256 digest is stored. Login rotates the current session; logout revokes it on the server. Tokens are never placed in localStorage.
- Account mutations require JSON and pass an origin check. Signup/login use database-backed attempt limits. Queries are parameterized. Account responses are private/no-store. Credentials are excluded from response contracts, validation-error input and application logs.

Accounts personalize this public pilot. They do not provide organization/portfolio authorization. Email ownership verification, password reset, email delivery, MFA and admin tools are outside this extension; no email service is configured.

## Local and Docker storage

Local startup creates `.local/winddesk-auth.sqlite3` on first account use. `.local/` is ignored by Git and excluded from source ZIPs. No external credentials are needed locally.

Docker Compose mounts the named `accounts` volume at `/app/accounts`, owned by UID 10001. The SQLite file lives there; the rest of the container filesystem remains read-only. `docker compose down` preserves accounts. **`docker compose down --volumes` deletes the account volume**; use it only to deliberately reset local data. Back up accounts before resetting/moving the volume.

Plain `docker run` also uses `/app/accounts/winddesk.sqlite3`; mount a volume at `/app/accounts` to retain users after removing the container. Set `AUTH_COOKIE_SECURE=true` when serving through production HTTPS.

## Vercel storage

Vercel's function filesystem is not durable. Account mutations explicitly return an actionable 503 when Vercel has no `DATABASE_URL`; public guest analysis remains available. Do not use a bundled SQLite file or `/tmp` for hosted users.

Provision PostgreSQL and set these Vercel environment variables using the real provider URL and production origin:

```text
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
AUTH_COOKIE_SECURE=true
AUTH_ALLOWED_ORIGINS=https://YOUR_ACTUAL_APP.vercel.app
```

Use the provider's TLS-enabled connection string and a serverless-compatible pooled endpoint when offered. Keep secrets out of source and browser code. The pinned Psycopg driver supports this path. Three small tables and an expiry index are created on first account access, so the database role needs creation permissions. For a larger service, use versioned migrations and a separate runtime role. Redeploy after configuration changes.

Account tests run against SQLite and a disposable local PostgreSQL 17 database. CI includes both. These checks do not claim a successful hosted deployment; finish [the deployment guide](DEPLOYMENT.md) and verify anonymous and signed-in production flows.

## My workspace and focus refinement

My workspace adds saved decisions, 400-character notes, exact date/cutoff replay and a last-decision shortcut. It supports Ocean, Mint and Violet accents alongside day/night mode. These records are browser-local, keyed separately for the guest and each account; they do not sync between devices. The interface states that limit explicitly. Profile names, passwords, theme and default-cutoff account preferences remain server-persistent.

The dark theme uses charcoal surfaces, restrained accents and semantic chart colors. Input/select focus uses a thin border and compact halo rather than the previous large external outline. Keyboard focus remains visible on buttons and links, and native autofill is retained. Account forms no longer automatically focus an email field when a dialog opens.

## Readability and navigation

Body text, navigation, labels, tables and chart ticks use larger type while retaining the existing layout. CSS text sizes use rem units to respect the browser's preferred font size. Mobile account and decision inputs use at least 16px at default settings to avoid focus zoom.

Saved decisions can be searched by date, cutoff or saved note, and sorted by save order or decision date. An empty search explains how to recover and offers Clear search. The sidebar pilot card opens Data & method. Back/Forward restores views and date/cutoff selections; mobile navigation supports Escape, returns focus to its trigger and locks background scrolling while open. Hiding actuals restores delivery-time ordering in the interval table.

Public snapshot responses use a bounded 48-entry, five-minute browser-memory cache, keyed by the full request path. Account/session responses and errors are excluded. Explicit retry invalidates the selected entry, and obsolete requests remain abortable. Chart transitions are disabled so data updates display immediately; charts are still loaded on demand.

