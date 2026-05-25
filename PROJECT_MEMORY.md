# PROJECT MEMORY — FramerClone Portal

> **Purpose:** This document exists so that if memory compression occurs, reading this file restores full context before any action is taken.  
> **Rule:** READ THIS FILE FIRST at the start of every session. Do NOT act until you have read it.  
> **MANDATORY:** After EVERY memory compression, review this file AND `AI_Code_Safety_System_ACSS_Methodology.docx` before ANY action.  
> **Last Updated:** 2026-05-25

---

## 1. WHAT THIS PROJECT IS

**FramerClone Portal** (`clone.webyverse.com`) is a Next.js 15 web application that allows users to:
- Sign in via GitHub OAuth
- Create "projects" linking a Framer-published site to a GitHub repository
- Scrape Framer sites using Playwright (headless Chromium)
- Sync scraped files to GitHub repos automatically
- Deploy to Netlify/Vercel (future feature)

**Admin panel** (`/admin`) provides system monitoring, user management, and security dashboards.

**Repo:** `zumuuser/framer-clone-portal`  
**VPS:** Hetzner, 178.105.193.3, 4 vCPU, 7.6GB RAM, 150GB SSD  
**Domain:** `clone.webyverse.com`  
**Deploy Path:** `/var/lib/dokploy/applications/framerclone-portal`  
**SSH Access:** `ssh -i ~/.ssh/framerclone_deploy root@178.105.193.3`  
**SSH Key:** `~/.ssh/framerclone_deploy` (ed25519)

---

## 2. TECH STACK

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router), React 18, TypeScript |
| Runtime | Node.js 20 |
| Database | SQLite (bind-mounted at `/app/data/prod.db`) |
| ORM | Prisma 5.22 |
| Auth | NextAuth.js v5 + GitHub OAuth |
| Scraper | Playwright 1.x with Chromium |
| Crypto | AES-256-GCM for GitHub token encryption |
| Rate Limit | In-memory token bucket (no Redis) |
| Container | Docker Swarm (non-root user `appuser`, UID 996) |
| Reverse Proxy | Traefik v3.6 (SSL via LetsEncrypt) |
| Orchestration | Dokploy v0.29.5 |

---

## 3. CURRENT DEPLOYMENT STATE

### Active Services (Docker Swarm)

| Service | Status | Purpose |
|---------|--------|---------|
| `framerclone_blue` | **ACTIVE** (1/1) | Production app serving `clone.webyverse.com` |
| `framerclone_green` | **INACTIVE** (0/0) | Standby for blue-green testing |
| `framerclone-portal` | **RETIRED** (0/0) | Old service, kept for emergency rollback |
| `monitoring_prometheus` | 1/1 | Metrics collection (basic auth protected) |
| `monitoring_grafana` | 1/1 | Dashboards (strong password, no anonymous access) |
| `monitoring_loki` | 1/1 | Log aggregation |
| `monitoring_promtail` | 1/1 | Log shipping from Docker containers |
| `monitoring_cadvisor` | 1/1 | Container resource metrics |
| `monitoring_node-exporter` | 1/1 | Host system metrics |
| `monitoring_wazuh-manager` | 1/1 | File integrity + rootkit detection |
| `dokploy` | 1/1 | Deployment orchestration UI |
| `dokploy-postgres` | 1/1 | Dokploy metadata DB |
| `dokploy-redis` | 1/1 | Dokploy queues |
| `dokploy-traefik` | 1/1 | Reverse proxy + SSL |

### Domains & Routing

| Domain | Service | Auth |
|--------|---------|------|
| `clone.webyverse.com` | `framerclone_blue` | OAuth (public site) |
| `blue.clone.webyverse.com` | `framerclone_blue` | OAuth |
| `green.clone.webyverse.com` | `framerclone_green` | OAuth (testing) |
| `dashboard.clone.webyverse.com` | `monitoring_grafana` | Strong admin password |
| `metrics.clone.webyverse.com` | `monitoring_prometheus` | Basic auth (admin + pass) |
| `wazuh.clone.webyverse.com` | *(not configured yet)* | *(Phase 3)* |

### DNS Records Required (User Must Add)
- `dashboard.clone.webyverse.com` → A → 178.105.193.3
- `metrics.clone.webyverse.com` → A → 178.105.193.3
- `green.clone.webyverse.com` → A → 178.105.193.3
- `blue.clone.webyverse.com` → A → 178.105.193.3
- `wazuh.clone.webyverse.com` → A → 178.105.193.3 *(Phase 3)*

---

## 4. WHAT HAS BEEN BUILT

### Completed Features
- [x] GitHub OAuth sign-in with `repo` scope
- [x] Project creation (Framer domain → GitHub repo mapping)
- [x] Framer site scraping via Playwright (headless Chromium)
- [x] GitHub sync (commit files to repo)
- [x] Rollback to previous commit
- [x] Role-based access control (`user` vs `admin`)
- [x] Admin stats API (`/api/admin/stats`)
- [x] Admin users API (`/api/admin/users` — list only, no UI)
- [x] Metrics endpoint (`/api/metrics`) for Prometheus
- [x] Rate limiting on all API routes
- [x] AES-256-GCM encryption for GitHub tokens at rest
- [x] Security guards (URL validation, private IP blocking, CSP headers)
- [x] Blue-green deployment infrastructure
- [x] Monitoring stack (Prometheus, Grafana, Loki, Promtail, cAdvisor, Node Exporter)
- [x] Wazuh Manager deployed
- [x] Prometheus protected with Traefik basic auth
- [x] Grafana hardened (strong password, no anonymous access, no sign-ups)

### What EXISTS but is MINIMAL
- Admin panel UI (`/admin`) — only has aggregate stats and static security cards
- Security dashboard (`/admin/security`) — shows hardcoded booleans, NOT live data
- No user management UI page (API exists but no frontend)
- No audit logging
- No rate limit configuration UI
- No CEO dashboard

### What is BROKEN / REVERTED
- Commits `7317a68` and `66f5452` attempted admin features but broke the TypeScript build
- These were reverted to `64f437e` which is the last known working state
- DO NOT redeploy those commits without fixing the type errors first

---

## 5. BUILD & DEPLOY PROTOCOL (MANDATORY)

### Blue-Green Deployment Steps (MUST FOLLOW)

```
1. git pull origin main
2. docker build -t framerclone-portal:latest .
3. Determine ACTIVE color:
   - docker service inspect framerclone_blue | grep "framerclone_blue" in Traefik labels
   - If blue has production router labels → blue is ACTIVE
   - Else green is ACTIVE
4. Deploy to INACTIVE color:
   - If blue is active → deploy to green:
     docker service update --image framerclone-portal:latest framerclone_green
     docker service scale framerclone_green=1
   - If green is active → deploy to blue:
     docker service update --image framerclone-portal:latest framerclone_blue
     docker service scale framerclone_blue=1
5. WAIT for container healthy (docker service ps <inactive_color>)
6. SMOKE TESTS on inactive color domain:
   - curl https://green.clone.webyverse.com/ → 200
   - curl https://green.clone.webyverse.com/api/metrics → 200
   - curl https://green.clone.webyverse.com/api/admin/stats → 401 (expected)
   - docker service logs <inactive_color> --tail 20 (check for errors)
7. ONLY IF ALL TESTS PASS:
   - Swap Traefik production router to inactive color
   - Scale old active color to 0
8. IF ANY TEST FAILS:
   - DO NOT switch traffic
   - Debug on inactive color
   - Fix, rebuild, redeploy to inactive
```

### NEVER Do This
- [ ] NEVER deploy directly to the active color without testing on inactive first
- [ ] NEVER commit `.env` or secrets to git
- [ ] NEVER run `docker build` on the VPS without the user explicitly approving
- [ ] NEVER make database schema changes without a migration plan
- [ ] NEVER remove or alter Wazuh without approval
- [ ] NEVER change Grafana/Prometheus auth without documenting new passwords in `.env`
- [ ] NEVER ask the user to run manual steps on the VPS — automate everything
- [ ] NEVER skip ACSS review after memory compression
- [ ] NEVER use GitHub Actions (removed — use VPS cron only)

---

## 6. PROJECT PHASES (From User's Roadmap)

| Phase | Status | Description |
|-------|--------|-------------|
| **Phase 0** | ✅ DONE | Revert to working state |
| **Phase 1** | ✅ DONE | Secure monitoring stack (Prometheus auth, Grafana hardening) |
| **Phase 2** | ⏳ NEXT | Configure Grafana dashboards (System Overview, App Performance, Security) |
| **Phase 3** | ⏳ PENDING | Configure Wazuh properly (dashboard, agent, file integrity, active response) |
| **Phase 4** | ✅ DONE | Formalize blue-green deployment protocol script |
| **Phase 5** | 🔄 IN PROGRESS | Build admin panel + CEO dashboard + ACSS Action Logging Portal |
| **Phase 6** | ⏳ PENDING | ACSS compliance CI pipeline (npm audit, Trivy, Gitleaks, slopcheck) |

---

## 7. KEY FILES & LOCATIONS

### On VPS (`/var/lib/dokploy/applications/framerclone-portal/`)

| File | Purpose |
|------|---------|
| `docker-compose.bluegreen.yml` | Blue-green Swarm services definition |
| `docker-compose.monitoring.yml` | Monitoring stack (Prometheus, Grafana, Loki, Wazuh) |
| `docker-compose.yml` | Legacy single-container compose (retired) |
| `Dockerfile` | Next.js app build (Node 20 + Playwright + non-root user) |
| `.env` | Secrets (NOT in git) — DB URL, OAuth creds, encryption keys, Grafana/Prometheus passwords |
| `prisma/schema.prisma` | Database schema |
| `data/prod.db` | SQLite database (bind-mounted) |
| `C4_ARCHITECTURE.md` | C4 model + ACSS compliance matrix |
| `scripts/deploy-bluegreen.sh` | Blue-green deployment script (automated — no manual steps) |
| `scripts/setup-wazuh.sh` | Idempotent Wazuh setup (certs + agent + FIM + active response) |
| `monitoring/prometheus.yml` | Prometheus scrape config |
| `monitoring/prometheus.htpasswd` | Basic auth credentials for Prometheus |
| `monitoring/grafana/provisioning/` | Grafana datasources and dashboards auto-provisioning |
| `monitoring/loki-config.yml` | Loki log aggregation config |
| `monitoring/promtail-config.yml` | Promtail log shipping config |

### Source Code (`src/`)

| File | Purpose |
|------|---------|
| `src/lib/auth.ts` | NextAuth.js config (GitHub OAuth, JWT sessions, token encryption on sign-in) |
| `src/lib/admin.ts` | `requireAdmin()` helper — checks session + DB role |
| `src/lib/prisma.ts` | Singleton PrismaClient |
| `src/lib/crypto.ts` | AES-256-GCM token encryption/decryption |
| `src/lib/github.ts` | Octokit client for GitHub API operations |
| `src/lib/scraper.ts` | Playwright scraping engine |
| `src/lib/security.ts` | URL validation, private IP blocking, HTTPS enforcement |
| `src/lib/rate-limit.ts` | In-memory token bucket rate limiter |
| `src/middleware.ts` | NextAuth middleware protecting `/dashboard` and `/projects` routes |
| `src/app/api/admin/stats/route.ts` | Admin KPIs endpoint |
| `src/app/api/admin/users/route.ts` | Admin user list endpoint |
| `src/app/api/metrics/route.ts` | Prometheus metrics endpoint |
| `src/app/admin/layout.tsx` | Admin panel shell with sidebar |
| `src/app/admin/page.tsx` | Admin dashboard (aggregate stats) |
| `src/app/admin/security/page.tsx` | Security dashboard (currently static/hardcoded) |

---

## 8. DATABASE SCHEMA

```prisma
model User {
  id            String    @id @default(cuid())
  name          String?
  email         String?   @unique
  emailVerified DateTime?
  image         String?
  githubId      String?   @unique
  githubToken   String?   // AES-256-GCM encrypted
  role          String    @default("user")   // "user" | "admin"
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  accounts      Account[]
  sessions      Session[]
  projects      Project[]
}

model Project {
  id              String   @id @default(cuid())
  userId          String
  name            String
  framerDomain    String
  framerUrl       String
  githubRepo      String
  githubBranch    String   @default("main")
  deployProvider  String   @default("none")
  deployUrl       String?
  lastSyncAt      DateTime?
  lastContentHash String?
  status          String   @default("idle")
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  syncLogs        SyncLog[]
}

model SyncLog {
  id              String   @id @default(cuid())
  projectId       String
  status          String   @default("pending")
  changesDetected Boolean  @default(false)
  filesChanged    Int      @default(0)
  commitSha       String?
  commitMessage   String?
  errorMessage    String?
  startedAt       DateTime @default(now())
  completedAt     DateTime?
  project         Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
}
```

**Schema HAS:**
- `User.status`, `User.lastLoginAt`, `User.lastIp`
- `AuditLog` table (with ACSS layer + STOP step tracking)
- `RateLimitConfig` table

**Action Logging Portal:** Every deployment action is logged with ACSS layer mapping and STOP framework step.

---

## 9. ENVIRONMENT VARIABLES

| Variable | Required | Location | Description |
|----------|----------|----------|-------------|
| `DATABASE_URL` | Yes | `.env` | SQLite path: `file:/app/data/prod.db` |
| `NEXTAUTH_URL` | Yes | `.env` | Public URL: `https://clone.webyverse.com` |
| `NEXTAUTH_SECRET` | Yes | `.env` | JWT signing secret (min 32 chars) |
| `GITHUB_CLIENT_ID` | Yes | `.env` | GitHub OAuth App ID |
| `GITHUB_CLIENT_SECRET` | Yes | `.env` | GitHub OAuth App secret |
| `GITHUB_TOKEN_ENCRYPTION_KEY` | Yes | `.env` | AES-256-GCM key (min 16 chars) |
| `GRAFANA_ADMIN_PASSWORD` | Yes | `.env` | Generated 32-char password |
| `PROMETHEUS_ADMIN_PASSWORD` | Yes | `.env` | Generated 32-char password |
| `NODE_ENV` | Yes | `.env` | `production` |
| `PORT` | Yes | `.env` | `3000` |
| `PLAYWRIGHT_BROWSERS_PATH` | Yes | `.env` | `/app/ms-playwright` |

**CRITICAL:** `.env` is in `.gitignore`. It exists ONLY on the VPS. Never commit it.

---

## 10. MONITORING CREDENTIALS

Stored in `/var/lib/dokploy/applications/framerclone-portal/.env`:

| Service | Username | Password Source |
|---------|----------|-----------------|
| Grafana | `admin` | `GRAFANA_ADMIN_PASSWORD` in `.env` |
| Prometheus | `admin` | `PROMETHEUS_ADMIN_PASSWORD` in `.env` |

**To retrieve:** `grep GRAFANA_ADMIN_PASSWORD .env` or `grep PROMETHEUS_ADMIN_PASSWORD .env`

---

## 11. ACSS METHODOLOGY CONTEXT

The project follows **ACSS (AI Code Safety System)** with three layers:

1. **PREVENT:** Constraint-first prompting, C4 diagrams before coding, temperature 0.0-0.2
2. **DETECT:** Automated scanning (npm audit, Trivy, secret scanners)
3. **VERIFY:** C4 diagram comparison, README spec matching, STOP framework

**STOP Framework (daily practice):**
- **S**earch — Verify packages/APIs exist on official registries
- **T**est — Run automated security scans
- **O**bserve — Monitor containers, logs, network traffic
- **P**rove — Match output against README/C4 spec

**After EVERY action, log it:**
- Action description, reason, decision point, result
- ACSS layer (Prevent / Detect / Verify)
- STOP step (Search / Test / Observe / Prove)
- Viewable at `/admin/audit-log` (Action Logging Portal)

---

## 12. WHAT THE USER ORIGINALLY ASKED FOR

From the original task (before memory compression):
1. EDR/XDR monitoring stack with Wazuh, Prometheus, Grafana, Loki
2. Admin panel with security dashboard and user management
3. Automated CEO dashboard that visualizes the entire tech stack in non-technical terms
4. Blue-green deployment for ALL updates (test on green, promote to production)
5. ACSS compliance CI pipeline

**The user explicitly said:** "I won't push updates just now" and "ask permission for each step."

---

## 13. RECOVERY CHECKLIST (If Memory Lost)

If this file is being read after memory compression:

- [ ] Read this entire document
- [ ] Check current deployment state: `docker service ls | grep framerclone`
- [ ] Check blue service health: `curl -s https://clone.webyverse.com`
- [ ] Check git status on VPS: `cd /var/lib/dokploy/applications/framerclone-portal && git status`
- [ ] Verify which commit is deployed vs what's in git
- [ ] DO NOT make changes until user approves next phase
- [ ] DO NOT deploy to production without blue-green testing
- [ ] DO NOT write files via shell heredoc (use local WriteFile + scp)

---

## 14. KNOWN ISSUES & GOTCHAS

1. **Shell heredocs corrupt quotes** — When writing TypeScript files via `cat << 'EOF'`, double quotes get stripped. Always write files locally with `WriteFile` then `scp` to VPS.
2. **Prisma migrations on SQLite** — `prisma migrate dev` fails in Docker. Use `prisma db push` for SQLite schema changes, or run migrations inside the container.
3. **Grafana password caching** — `GF_SECURITY_ADMIN_PASSWORD` only works on FIRST startup. To change after first boot, use `grafana-cli admin reset-admin-password <pass>` inside the container.
4. **NextAuth types** — `getServerSession()` returns `{}` type unless cast: `(await getServerSession(authOptions)) as Session | null`
5. **TypeScript build errors** — The attempted admin feature commits (`7317a68`, `66f5452`) broke the build. Always verify `npm run build` succeeds before deploying.
6. **Docker Swarm env vars** — `docker stack deploy` reads env vars from the shell. Use `set -a; source .env; set +a` before deploying.

---

*End of Project Memory. Do not proceed with implementation until user explicitly approves the next phase.*
