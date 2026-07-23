# FramerClone — Current Architecture (human-readable)

**Live site:** https://clone.webyverse.com  
**Repo:** `zumuuser/framer-clone-portal`  
**Server:** Hetzner VPS `46.225.69.237` → app at `/opt/apps/framer-clone-portal`  
**Snapshot date:** 2026-07-23  

This document describes **what exists today**, how each piece works alone, and how they talk to each other. Use it as the map for tomorrow’s work (including a possible multi-container split).

---

## 1. What the product does (one sentence)

A signed-in user pastes a Framer domain; the app **scrapes** the published site, **commits** it to their GitHub repo, and optionally **deploys** it to Cloudflare Pages.

---

## 2. Big picture (layers)

```
                    Internet users
                          │
                          ▼
              ┌───────────────────────┐
              │  Caddy (TLS + reverse │  ports 80/443
              │  proxy)               │
              └───────────┬───────────┘
                          │  → app:3000
                          ▼
              ┌───────────────────────┐
              │  Next.js monolith     │  UI + API + scrape + deploy
              │  (single Docker app)  │
              └───────────┬───────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
   Neon Postgres     GitHub API      Hosting APIs
   (Prisma)          (Octokit)       (CF / Vercel / Netlify)
          ▲
          │
   NextAuth sessions + user tokens (encrypted fields)
```

Today everything runs **in one container** (plus Caddy). Tomorrow’s goal may be to split: frontend / app API / functions (scrape+deploy) / DB (or keep Neon external).

---

## 3. Components (each one alone)

### 3.1 Edge: Caddy

| | |
|--|--|
| **What** | Reverse proxy + automatic HTTPS for `clone.webyverse.com` |
| **Where** | Docker service `caddy`, image `caddy:2-alpine` |
| **Config** | `Caddyfile` mounts into the container |
| **Job** | Terminate TLS, gzip, forward all traffic to `app:3000` |
| **Does not** | Run app logic, talk to DB, or hold user data |

### 3.2 App: Next.js 15 monolith

| | |
|--|--|
| **What** | Single Node process: App Router pages + API routes |
| **Where** | Docker service `app`, built from `Dockerfile` |
| **Start** | `npx prisma db push --skip-generate && npm start` |
| **Why db push** | Production Neon already has tables; `migrate deploy` fails with P3005 (no migration history). **Do not switch to migrate without baselining.** |
| **Contains** | UI, auth, project CRUD, scrape, GitHub sync, host deploys, admin |

### 3.3 Database: Neon Postgres + Prisma

| | |
|--|--|
| **What** | Hosted Postgres (not on the VPS) |
| **Schema** | `prisma/schema.prisma` |
| **Access** | `src/lib/prisma.ts` → `DATABASE_URL` in `.env` |

**Main models:**

| Model | Purpose |
|-------|---------|
| **User** | GitHub identity, role, limits; optional CF/Vercel/Netlify tokens (encrypted strings on user row) |
| **Account / Session** | NextAuth OAuth account + session rows |
| **Project** | Framer domain, GitHub repo/branch, deploy provider IDs/URLs, sync status |
| **SyncLog** | History of each scrape→commit run (status, commit sha, errors) |
| **AuditLog / RateLimitConfig** | Admin/security bookkeeping |

### 3.4 Auth: NextAuth + GitHub OAuth

| | |
|--|--|
| **What** | “Sign in with GitHub”; stores session + GitHub access token for API calls |
| **Code** | `src/lib/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts` |
| **Env** | `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` |
| **Also** | GitHub token may be stored on user for Octokit (repo create, commits) |

### 3.5 Frontend UI (pages)

| Route | Role |
|-------|------|
| `/` | Marketing home: centered logo, CTAs, feature cards |
| `/dashboard` | Logged-in project list entry |
| `/projects/new` | Create project (Framer domain, GitHub repo options) |
| `/projects/[id]` | Project detail: **Sync to GitHub**, host target, deploy status |
| `/admin/*` | Admin: users, audit, rate limits, security |

**UI building blocks** (`src/components/`):

| Component | Role |
|-----------|------|
| `navbar.tsx` | Sticky nav; theme cycle; auth buttons; **logo only when not on home** |
| `brand-logo.tsx` | Light logo (WebP/PNG) used site-wide |
| `theme-provider.tsx` | light / dark / system → `html` class |
| `atmosphere-bg.tsx` | Blurred painting layers + veil (mood only) |
| `beta-banner.tsx` | Small tilted “Beta” shard, fixed bottom-right |
| `providers.tsx` | SessionProvider + theme wrapper |
| `ui/*` | Button, card, input, badge (0px radius design system) |

**Design tokens:** `src/app/globals.css` — warm light paper, near-black dark, no blue cast, sharp corners.

### 3.6 Scraper (heavy work, same process)

| | |
|--|--|
| **What** | Headless Chromium visits the Framer site, collects HTML/assets |
| **Code** | `src/lib/scraper.ts` (Playwright / Chromium in container) |
| **Triggered by** | Sync API after user clicks sync |
| **Output** | File tree + content hash for change detection |

Runs **inside the app container** today (RAM/CPU intensive). This is the first piece to extract into a “functions” worker tomorrow.

### 3.7 GitHub integration

| | |
|--|--|
| **Code** | `src/lib/github.ts`, `src/app/api/github/repos/route.ts` |
| **Does** | List/create repos, commit scraped files, branch handling |
| **Auth** | User’s GitHub OAuth token from NextAuth / user record |

### 3.8 Hosting providers (optional after GitHub)

| Provider | Lib | Notes |
|----------|-----|--------|
| **Cloudflare Pages** | `src/lib/cloudflare.ts` | Recommended free path; direct upload deploy (hash → upload → manifest) |
| **Vercel** | `src/lib/vercel-hosting.ts` | OAuth scaffolding |
| **Netlify** | `src/lib/netlify-hosting.ts` | OAuth scaffolding |

**Shared helpers:**

- `hosting-providers.ts` — provider IDs, free-plan notes, which is recommended  
- `hosting-user.ts` / `cloudflare-user.ts` — load/store encrypted tokens on User  

**API surface:**

- `/api/cloudflare/*` — connect / OAuth / status  
- `/api/hosting/[provider]/*` — generic OAuth auth/callback/disconnect  
- `/api/hosting/status` — which hosts are linked  
- `/api/projects/[id]/host` — attach deploy to a project  
- Sync route accepts a **host target** (GitHub only vs also deploy to CF/Vercel/Netlify)

**SSO note:** OAuth apps for CF/Vercel/Netlify may still need client IDs/secrets in env; without them UI shows setup needed.

### 3.9 Sync pipeline (the core workflow)

**Entry:** `POST /api/projects/[id]/sync`  
**UI label:** “Sync to GitHub” (optional host deploy after)

**Steps (same process, sequential):**

1. Load project + user; set status busy; create `SyncLog`  
2. **Scrape** Framer domain via Playwright  
3. Compare content hash to last run (skip commit if unchanged when appropriate)  
4. **Push** files to GitHub (commit + sha)  
5. If host target ≠ GitHub-only and tokens exist → **deploy** to chosen host  
6. Update project fields + complete `SyncLog`  

Also: rollback API exists at `/api/projects/[id]/rollback`.

### 3.10 Security / admin utilities

| Piece | Role |
|-------|------|
| `middleware.ts` | Route protection patterns |
| `lib/crypto.ts` | Encrypt tokens at rest (needs `GITHUB_TOKEN_ENCRYPTION_KEY` or shared key) |
| `lib/rate-limit*.ts` | Admin rate limits |
| `lib/audit.ts` / `action-log.ts` | Audit trail |
| Admin API under `/api/admin/*` | Users, stats, security, audit |

### 3.11 Static assets (`public/`)

| Asset | Role |
|-------|------|
| `framerclonelogolight.*` | Brand mark (light logo used throughout) |
| `bg-atmosphere-light/dark.*` | Soft background paintings |
| `og-preview.jpg` | Social share image (desk + monitor mock) |
| `favicon.ico`, `icon-*.png`, `apple-touch-icon.png` | Favicons / PWA icons |
| `site.webmanifest` | Install metadata |

---

## 4. How components interact (flows)

### 4.1 Page load (any visitor)

1. Browser → **Caddy** (HTTPS) → **Next.js**  
2. Layout injects theme script → **AtmosphereBg** + **Navbar** + page + **BetaBanner**  
3. Static files (logo, atmosphere) served by Next through Caddy  

### 4.2 Sign-in

1. User clicks GitHub → NextAuth → GitHub OAuth  
2. Callback creates/updates **User** + **Account** in Neon  
3. Session cookie used on later API calls  

### 4.3 Create project

1. UI `/projects/new` → `POST /api/projects`  
2. Optionally create GitHub repo via GitHub API  
3. **Project** row stored with Framer URL + repo  

### 4.4 Sync to GitHub (+ optional host)

```
UI button
   → POST /api/projects/:id/sync  { hostTarget? }
        → scraper (Playwright)
        → github.commit
        → [optional] cloudflare.deployPagesFiles | vercel | netlify
        → SyncLog + Project updated
   → UI polls / shows status + deploy URL
```

### 4.5 Connect hosting (e.g. Cloudflare)

```
UI “Connect Cloudflare”
   → /api/cloudflare/auth  (or token connect if used)
   → OAuth callback stores encrypted token on User
   → /api/hosting/status reports linked
   → later sync can deploy using that token
```

---

## 5. Production runtime (Hetzner)

| Piece | Detail |
|-------|--------|
| **Host** | `root@46.225.69.237` |
| **Path** | `/opt/apps/framer-clone-portal` |
| **Compose** | `docker compose` → services `app` + `caddy` |
| **Secrets** | `/opt/apps/framer-clone-portal/.env` (never commit) |
| **DB** | Neon Postgres URL in `.env` |
| **Domain** | `clone.webyverse.com` A record → VPS |

**Typical ops:**

```bash
cd /opt/apps/framer-clone-portal
docker compose ps
docker compose logs -f app
docker compose build app && docker compose up -d app
```

**Known footgun:** App must start with **`prisma db push`**, not `migrate deploy`, until migrations are baselined.

---

## 6. Env vars (names only)

| Variable | Used for |
|----------|----------|
| `DATABASE_URL` | Neon Postgres |
| `NEXTAUTH_URL` | https://clone.webyverse.com |
| `NEXTAUTH_SECRET` | Session signing |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth app |
| `GITHUB_TOKEN_ENCRYPTION_KEY` | Encrypt stored tokens |
| `CLOUDFLARE_OAUTH_*` | Optional CF SSO (when registered) |
| `VERCEL_OAUTH_*` / `NETLIFY_OAUTH_*` | Optional host SSO |

---

## 7. Repo map (where to look tomorrow)

```
src/
  app/                 # Pages + API routes (Next App Router)
  components/          # UI chrome (nav, theme, brand, beta, atmosphere)
  lib/                 # Business logic (scrape, github, hosts, auth, prisma)
  middleware.ts
prisma/schema.prisma   # Data model
public/                # Logos, atmospheres, OG, icons
Dockerfile             # One fat image: Node + Playwright + Next build
docker-compose.yml     # app + caddy
Caddyfile              # TLS reverse proxy
```

---

## 8. What is *not* split yet (tomorrow multi-container idea)

| Future service | What would move there | Why |
|----------------|----------------------|-----|
| **Frontend** | Next UI / SSR pages | Scale web separately from jobs |
| **App / API** | Auth, CRUD, light APIs | Stable low-RAM service |
| **Functions / worker** | Scrape + GitHub push + host deploy | Isolates Playwright RAM spikes |
| **DB** | Already external (Neon) — keep or run Postgres container | Resilience / locality tradeoff |

Today a scrape can stress the same process that serves the homepage. Splitting prevents “one heavy sync kills the site.”

---

## 9. Status as of this commit

- **Live:** single app container + Caddy, healthy boot via `db push`  
- **UI:** system theme, sharp corners, light brand logo, atmosphere, beta banner, nav logo off-home  
- **Core path:** Framer scrape → GitHub sync works on Hetzner  
- **Hosting:** code paths for CF/Vercel/Netlify present; full SSO may need OAuth app registration  
- **Not pushed before:** this architecture snapshot + accumulated portal features  

---

## 10. Suggested next steps (for tomorrow)

1. Read this file + skim `src/lib/scraper.ts` and `src/app/api/projects/[id]/sync/route.ts`  
2. Register Cloudflare OAuth (if SSO is the goal) and set env on Hetzner  
3. Plan multi-container split without changing user-facing URLs (Caddy routes stay)  
4. Optional: baseline Prisma migrations so boot can use `migrate deploy` safely  

---

*Written for humans. If something in production disagrees with this file, trust production logs + `docker compose ps`, then update this doc.*
