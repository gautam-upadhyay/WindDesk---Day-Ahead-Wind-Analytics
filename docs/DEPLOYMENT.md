# Deployment and public repository — later phase

No GitHub repository or hosted deployment was created in the local implementation phase. The following is a concrete procedure to finish that phase. Do not treat a configuration file as proof of a successful remote deployment.

## Preflight

1. Run all checks in the README and inspect `docs/VERIFICATION.md`.
2. Confirm the two gzip data files, manifest and `data/upstream-verification.json` are included. Run `python scripts/verify_upstream.py` if the snapshot has changed or a fresh upstream check is needed; investigate differences before deployment. Never commit `.venv`, `node_modules`, `.env`, `.vercel`, browser profiles or credentials.
3. Rehearse the demo and understand the domain assumptions. Keep the supplied January scope unless the reviewer clarifies it.

## Public GitHub repository

Create a **public** repository with an anonymous random name, for example `q7m2v9k4` (choose an available name). Do not use the company name as the repository name. The application can still be called WindDesk.

From the project root, after reviewing the files to commit:

```sh
git init -b main
git add .
git status --short
git commit -m "Build point-in-time wind forecast pilot"
git remote add origin https://github.com/YOUR_ACCOUNT/YOUR_RANDOM_REPO.git
git push -u origin main
```

Replace the placeholders with the real account and repository. Authenticate through your usual GitHub flow; do not paste tokens into tracked files. If the directory is already a repository, preserve its history and skip initialization. The supplied CI workflow runs on push and pull request with read-only repository permissions.

## Vercel — primary requested hosting path

The project includes `vercel.json`, `.python-version`, `requirements.txt`, its runtime lockfile, and `api/index.py`. The framework is explicitly Vite; Python functions are discovered under `/api`.

1. Sign into Vercel and import the public repository.
2. Use the **repository root** as Root Directory. Keep the Vite framework preset, Node.js **22.x**, install command `npm ci --no-fund --no-audit`, build command `npm run build`, and output directory `dist`. These commands are in `vercel.json`.
3. Python 3.13 is declared in `.python-version`. To enable hosted signup/login, provision PostgreSQL and configure `DATABASE_URL` using the provider's TLS connection string, `AUTH_COOKIE_SECURE=true`, and the exact production `AUTH_ALLOWED_ORIGINS`. See [account configuration](UI_AND_ACCOUNTS.md). Public guest analysis works without account database configuration; signup/login deliberately report that missing configuration rather than using ephemeral storage.
4. Deploy. Check the build logs: the Vite output and `api/index.py` Python function must both be present. The function bundles `backend/**` and `data/**`; the `/api/:path*` rewrite routes API requests to that function while static assets remain on the CDN.
5. Open the production URL. Verify health, day, month, docs and CSV routes; check that API responses are JSON rather than HTML. Run the smoke script below. Then create a test account, save preferences, reload, log out and log in again. Verify account requests are not cached and the production session cookie is Secure/HttpOnly.
6. Ensure the final **production** URL can be opened without a Vercel login. If project deployment protection blocks anonymous access, configure the intended public production deployment through Vercel's project settings. Do not submit a protected preview URL.
7. Update the README's **Live application** line with the actual production URL, commit it and wait for the new deployment. Recheck the final URLs incognito.

Optional CLI path after an authenticated login:

```sh
npx vercel login
npx vercel --prod
```

Keep project-level settings consistent with the checked-in configuration. Never set the runtime to `python` manually in `functions`; the official Python runtime is detected from the `.py` entrypoint. If platform behavior changes, consult [Vercel Python runtime documentation](https://vercel.com/docs/functions/runtimes/python) and [Vite hosting documentation](https://vercel.com/docs/frameworks/frontend/vite), inspect the actual build output, and fix before submitting. Remote deployment remains unverified until these steps run with an account.

## Docker — portable runtime

```sh
docker compose up --build -d
python scripts/smoke.py --base-url http://localhost:8000
docker compose logs --tail 30
docker compose down
```

The image supports `PORT` for dynamic host ports. Energy data is bundled; account writes use `/app/accounts`. Compose supplies the persistent `accounts` volume. Ordinary `docker compose down` retains users; deliberately removing volumes resets them. Production must terminate HTTPS at the host/proxy and enable secure cookies. No background worker or Elexon API credentials are required. See the account guide for backups and PostgreSQL hosting.

The same image can be deployed to a container platform. Vercel uses the Python-function path rather than running this Dockerfile. The assignment asks for Vercel **or** Heroku; the primary documented sample deployment is Vercel, so a second platform is not necessary.

## Anonymous access smoke check

```sh
python scripts/smoke.py --base-url https://YOUR_REAL_PROJECT.vercel.app
```

This script makes unauthenticated HTTP requests and checks HTML, fonts, JSON, one-day CSV dimensions, the February boundary and the recorded source-verification summary. It fails on login redirects or errors. It does not re-query Elexon or replace the assignment's explicit incognito browser check.

Open a new incognito/private window, with no account login, and independently verify:

- Public GitHub repository: README, code and data can be read.
- Vercel production app: all three views, date/cutoff changes, publication history and downloads work.
- Unlisted YouTube video: both parts play with audio; total duration ≤10 minutes.

Use those exact verified URLs in the submission form. Record the verification date and URLs in `docs/SUBMISSION.md` only when the checks have actually happened.
