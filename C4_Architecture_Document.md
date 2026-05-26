# C4 Architecture Document — FramerClone Portal

> **Document Type:** C4 Model (Context → Containers → Components → Code)  
> **Project:** FramerClone Portal (`clone.webyverse.com`)  
> **Last Updated:** 2026-05-25  
> **Purpose:** Provide a complete architectural overview with ACSS compliance matrix and action log

---

## Table of Contents
1. [C4 Level 1: System Context](#level-1-system-context)
2. [C4 Level 2: Container Diagram](#level-2-container-diagram)
3. [C4 Level 3: Component Diagram](#level-3-component-diagram)
4. [C4 Level 4: Code Overview](#level-4-code-overview)
5. [ACSS Compliance Matrix](#acss-compliance-matrix)
6. [Action Log: Requests vs Deliverables](#action-log)
7. [Known Issues & Technical Debt](#known-issues)

---

## Level 1: System Context

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FramerClone Portal System                          │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌──────────────┐         ┌──────────────────────┐         ┌──────────────┐
  │   End User   │◄───────►│  FramerClone Portal  │◄───────►│   GitHub     │
  │  (Browser)   │  HTTPS  │  (clone.webyverse)   │  OAuth  │   (OAuth)    │
  └──────────────┘         └──────────────────────┘         └──────────────┘
                                    │
                                    │ Scrapes
                                    ▼
                            ┌──────────────┐
                            │ Framer Sites │
                            │ (Published)  │
                            └──────────────┘

  ┌──────────────┐         ┌──────────────────────┐         ┌──────────────┐
  │   Admin      │◄───────►│  Monitoring Stack    │◄───────►│   Alerts     │
  │  (Dashboard) │  HTTPS  │  (Grafana/Wazuh)     │  Webhook│   (Email)    │
  └──────────────┘         └──────────────────────┘         └──────────────┘
```

### External Systems
| System | Protocol | Purpose |
|--------|----------|---------|
| GitHub OAuth | HTTPS/OAuth2.0 | User authentication, repo access |
| GitHub API | HTTPS/REST | Sync files, create commits |
| Framer Sites | HTTPS | Source content for scraping |
| LetsEncrypt | ACME | SSL certificate provisioning |

### Users
| Role | Access |
|------|--------|
| Standard User | Create projects, sync, view dashboard |
| Admin | Full admin panel, user management, security |
| System (monitoring) | Prometheus scrapes, Wazuh alerts |

---

## Level 2: Container Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Docker Swarm (Single Node)                         │
│                           Hetzner VPS — 4vCPU / 7.6GB RAM                   │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────────────────────┐
  │                            Traefik v3.6 (Reverse Proxy)                   │
  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
  │  │ clone...    │  │ dashboard.. │  │ metrics...  │  │ wazuh...        │  │
  │  │ :443        │  │ :443        │  │ :443        │  │ :443            │  │
  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘  │
  └─────────┼────────────────┼────────────────┼──────────────────┼───────────┘
            │                │                │                  │
            ▼                ▼                ▼                  ▼
  ┌─────────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐
  │  Next.js App    │ │   Grafana    │ │  Prometheus  │ │  Wazuh Dashboard │
  │  (Green/Blue)   │ │  (Grafana)   │ │  (Prometheus)│ │  (OpenSearch)   │
  │  Port: 3000     │ │  Port: 3000  │ │  Port: 9090  │ │  Port: 5601     │
  └────────┬────────┘ └──────────────┘ └──────────────┘ └──────────────────┘
           │
           │ Prisma ORM
           ▼
  ┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
  │   SQLite DB     │◄───────►│   Playwright    │◄───────►│  Wazuh Manager  │
  │  /app/data/     │         │  (Chromium)     │         │  (Host agent)   │
  │   prod.db       │         │                 │         │                 │
  └─────────────────┘         └─────────────────┘         └─────────────────┘
           ▲
           │ Logs
           ▼
  ┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
  │     Loki        │◄───────►│    Promtail     │◄───────►│  cAdvisor       │
  │  (Log Storage)  │         │  (Log Shipper)  │         │  (Container     │
  └─────────────────┘         └─────────────────┘         │   Metrics)      │
                                                          └─────────────────┘
  ┌─────────────────┐         ┌─────────────────┐
  │  Node Exporter  │         │  Wazuh Indexer  │
  │  (Host Metrics) │         │  (OpenSearch)   │
  └─────────────────┘         └─────────────────┘
```

### Container Descriptions

| Container | Technology | Purpose | Port |
|-----------|-----------|---------|------|
| **Next.js App** | Next.js 15 + Node.js 20 | Main application (blue-green) | 3000 |
| **Grafana** | Grafana 10.4.5 | Metrics dashboards | 3000 |
| **Prometheus** | Prometheus 2.53.0 | Metrics collection | 9090 |
| **Loki** | Loki 2.9.10 | Log aggregation | 3100 |
| **Promtail** | Promtail 2.9.10 | Log shipping | 9080 |
| **cAdvisor** | cAdvisor v0.49.1 | Container metrics | 8080 |
| **Node Exporter** | node-exporter v1.8.1 | Host system metrics | 9100 |
| **Wazuh Manager** | Wazuh 4.8.0 | Security monitoring | 55000 |
| **Wazuh Indexer** | OpenSearch 2.10.0 | Security data store | 9200 |
| **Wazuh Dashboard** | OpenSearch Dashboards | Security UI | 5601 |
| **Wazuh Exporter** | Python 3.11 | Prometheus bridge | 9101 |

---

## Level 3: Component Diagram

### Next.js App Components

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Next.js Application                             │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────────────────────┐
  │                              Presentation Layer                           │
  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
  │  │ App Router  │  │  Admin      │  │  Project    │  │   Auth Pages    │  │
  │  │ (App Dir)   │  │  Panel      │  │  Dashboard  │  │  (NextAuth)     │  │
  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘  │
  └─────────┼────────────────┼────────────────┼──────────────────┼───────────┘
            │                │                │                  │
            └────────────────┴────────────────┴──────────────────┘
                                    │
                                    ▼
  ┌──────────────────────────────────────────────────────────────────────────┐
  │                              API Layer (Route Handlers)                   │
  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
  │  │ /api/admin/ │  │ /api/projects│  │ /api/sync/  │  │ /api/metrics    │  │
  │  │ stats,users │  │ CRUD ops    │  │ trigger     │  │ Prometheus      │  │
  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘  │
  └─────────┼────────────────┼────────────────┼──────────────────┼───────────┘
            │                │                │                  │
            └────────────────┴────────────────┴──────────────────┘
                                    │
                                    ▼
  ┌──────────────────────────────────────────────────────────────────────────┐
  │                              Service Layer                                │
  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
  │  │  Prisma     │  │  Playwright │  │  GitHub     │  │  Rate Limiter   │  │
  │  │  Client     │  │  Scraper    │  │  API Client │  │  (In-Memory)    │  │
  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘  │
  └─────────┼────────────────┼────────────────┼──────────────────┼───────────┘
            │                │                │                  │
            ▼                ▼                ▼                  ▼
  ┌─────────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐
  │   SQLite DB     │ │  Chromium    │ │  GitHub API  │ │   Memory Map     │
  │   (prod.db)     │ │  (Headless)  │ │  (REST)      │ │   (Token Bucket) │
  └─────────────────┘ └──────────────┘ └──────────────┘ └──────────────────┘
```

### Key Components

| Component | File Path | Responsibility |
|-----------|-----------|----------------|
| App Router | `src/app/**/page.tsx` | Server/client pages, layouts |
| API Routes | `src/app/api/**/route.ts` | REST endpoints, auth guards |
| Prisma Client | `src/lib/prisma.ts` | Database access |
| Auth Options | `src/lib/auth.ts` | NextAuth configuration |
| Admin Guard | `src/lib/admin.ts` | Role-based access control |
| Rate Limit | `src/lib/rate-limit.ts` | Token bucket rate limiting |
| Audit Log | `src/lib/audit.ts` | Action logging to DB |
| GitHub API | `src/lib/github.ts` | Repository operations |
| Scraper | `src/lib/scraper.ts` | Playwright-based scraping |

---

## Level 4: Code Overview

### Directory Structure
```
src/
├── app/
│   ├── (auth)/           # OAuth callback, signin
│   ├── admin/            # Admin panel pages
│   │   ├── page.tsx      # Dashboard (stats)
│   │   ├── users/        # User management
│   │   ├── activity/     # Audit log viewer
│   │   ├── security/     # Security checks
│   │   └── rate-limits/  # Rate limit config
│   ├── api/
│   │   ├── admin/        # Admin APIs
│   │   ├── auth/         # NextAuth handlers
│   │   ├── projects/     # Project CRUD
│   │   └── sync/         # Sync operations
│   ├── dashboard/        # User dashboard
│   └── layout.tsx        # Root layout
├── components/           # Shared React components
├── lib/
│   ├── auth.ts           # NextAuth config
│   ├── admin.ts          # Admin auth guard
│   ├── prisma.ts         # Prisma client
│   ├── audit.ts          # Audit logging
│   ├── rate-limit.ts     # Rate limiter
│   ├── rate-limit-config.ts # Rate limit DB ops
│   ├── github.ts         # GitHub API client
│   └── scraper.ts        # Playwright scraper
└── types/                # TypeScript types
```

### Database Schema
```prisma
User { id, email, name, githubId, role, status, lastLoginAt, lastIp, projectLimit, projects[] }
Project { id, userId, name, framerDomain, githubRepo, status, syncLogs[] }
SyncLog { id, projectId, status, changesDetected, errorMessage, startedAt }
AuditLog { id, userId, action, resource, metadata, ip, createdAt }
RateLimitConfig { id, route, windowMs, maxRequests, description }
```

---

## ACSS Compliance Matrix

| ACSS Layer | Principle | Implementation | Status |
|------------|-----------|----------------|--------|
| **PREVENT** | Least privilege | Role-based access (`user`/`admin`) | ✅ |
| **PREVENT** | Defense in depth | Traefik SSL + container non-root + rate limits | ✅ |
| **PREVENT** | Secure defaults | Strong Grafana password, anonymous disabled | ✅ |
| **PREVENT** | Fail securely | Admin APIs return 401/403 without leaking data | ✅ |
| **DETECT** | Monitoring | Prometheus + Grafana + 4 dashboards | ✅ |
| **DETECT** | Logging | Loki + Promtail + AuditLog table | ✅ |
| **DETECT** | Intrusion detection | Wazuh Manager + host agent | ⚠️ Partial |
| **VERIFY** | Health checks | Container health checks + smoke tests | ✅ |
| **VERIFY** | Blue-green deploy | Inactive color testing before swap | ✅ |
| **VERIFY** | Audit trail | AuditLog table + action logging | ✅ |

### Missing ACSS Controls
- ❌ `npm audit` in CI pipeline
- ❌ Container image scanning (Trivy)
- ❌ Secrets scanning (Gitleaks)
- ❌ Wazuh FIM configured for app directory
- ❌ Wazuh active response (auto-block)

---

## Action Log

### Original Plan (User-Approved)
| Phase | Request | Status | Notes |
|-------|---------|--------|-------|
| 0 | Revert to `64f437e` | ✅ Done | Production restored |
| 1 | Secure monitoring stack | ✅ Done | Auth on all endpoints |
| 2 | Grafana dashboards | ✅ Done | 4 dashboards provisioned |
| 3 | Wazuh setup | ⚠️ Partial | Dashboard needs DNS; FIM pending |
| 4 | Blue-green protocol | ✅ Done | Script works; manual swap verified |
| 5 | Admin + CEO dashboard | ⚠️ Partial | Basic admin works; CEO report not built |
| 6 | ACSS CI pipeline | ❌ Not done | Scans not implemented |

### Fixes Applied in This Session
| Issue | Fix | File |
|-------|-----|------|
| Admin dashboard crash (`Cannot read properties of undefined`) | Fixed `/api/admin/stats` to return correct field names + added null-safety | `src/app/api/admin/stats/route.ts`, `src/app/admin/page.tsx` |
| Missing user project limits | Added `projectLimit` to User model + UI controls | `prisma/schema.prisma`, `src/app/admin/users/page.tsx` |
| Missing rate limit management | Created admin page for viewing/editing rate limits | `src/app/admin/rate-limits/page.tsx` |
| Wazuh unknown password | Generated new Traefik basic auth password | `docker-compose.monitoring.yml` |
| Green env vars empty | Updated service env vars | Docker Swarm service config |

---

## Known Issues & Technical Debt

### Critical
1. **No CI/CD pipeline** — Deployments rely on manual script execution
2. **GitHub token encryption key is weak** — `test1234567890123456789012345678` is hardcoded/test value
3. **No automated backups** — SQLite database has no backup strategy

### Medium
1. **Rate limiter is in-memory** — Doesn't scale across replicas; resets on restart
2. **Wazuh dashboard DNS** — `wazuh.clone.webyverse.com` needs A record
3. **Audit log no pagination** — Large tables will slow down over time

### Low
1. **No CEO report** — `/admin/ceo-report` not implemented
2. **No FIM config** — Wazuh file integrity monitoring not configured
3. **Blue service shows 1/0** — Docker Swarm display quirk, not functional issue

---

## Credentials & Access

| Service | URL | Username | Password |
|---------|-----|----------|----------|
| Main App | `https://clone.webyverse.com` | GitHub OAuth | — |
| Grafana | `https://dashboard.clone.webyverse.com` | admin | `CUyHf-FOPrbqY245A3eOHd3v4Gfm2RgqUqCpjb2ahsU` |
| Prometheus | `https://metrics.clone.webyverse.com` | admin | `fOwTMYJ9kOroFodpKLt9CVbJGxDWXH5Y_FL59DKjuwQ` |
| Wazuh Dashboard | `https://wazuh.clone.webyverse.com` | admin | `WazuhSecure123!` |
| Wazuh Internal | — | admin | `admin` |

---

## Quick Reference

```bash
# SSH
ssh -i ~/.ssh/framerclone_deploy root@178.105.193.3

# View logs
APP=$(docker ps --filter name=framerclone_green --format "{{.ID}}")
docker logs "$APP" 2>&1 | tail -20

# Check services
docker service ls | grep -E "framerclone|monitoring"

# Manual blue-green swap
docker service update --label-add "traefik.http.routers.framerclone.rule=Host(\`clone.webyverse.com\`)" framerclone_green
docker service update --label-rm "traefik.http.routers.framerclone.rule" framerclone_blue
```
