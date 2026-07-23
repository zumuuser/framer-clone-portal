# Cloudflare OAuth client — exact settings for FramerClone

Use this when creating the OAuth app in the Cloudflare dashboard so SSO “Connect Cloudflare” works with our code.

## What our app does (so you pick the right options)

| Step | Our code |
|------|----------|
| Start login | Browser redirect to Cloudflare with `response_type=code` |
| Callback URL | `https://clone.webyverse.com/api/hosting/cloudflare/callback` |
| Token exchange | Server POST to token endpoint with `grant_type=authorization_code` + **client_id + client_secret in form body** |
| Refresh | Same token endpoint with `grant_type=refresh_token` |
| Scopes we request | `account:read` `user:read` `pages:write` `offline_access` |

Source: `src/lib/cloudflare.ts` (`buildCloudflareAuthUrl`, `exchangeCloudflareCode`, `refreshCloudflareToken`).

---

## Settings to choose

### Response type
- **Select: `code` only** (Authorization Code flow)
- Do **not** select `token` (implicit — not used; secrets would leak to browser)
- Do **not** require only `id_token` (we need an **access token** for the Pages API)

### Grant types
- **Select: `authorization_code`** (required)
- **Select: `refresh_token`** (required — we request `offline_access` and store a refresh token)

### Token endpoint authentication method
- **Select: `client_secret_post`** (Client Secret Post)  
  Our server sends `client_id` and `client_secret` in the **POST body** (`application/x-www-form-urlencoded`).
- Avoid `none` (public clients / PKCE-only) unless you also change the app to PKCE with no secret.
- `client_secret_basic` (HTTP Basic header) is **not** what our code uses today. Prefer **post**.

### Application type
- **Confidential / web application** (server-side secret is fine — we hold the secret on Hetzner)

### Redirect / callback URI (exact)
```
https://clone.webyverse.com/api/hosting/cloudflare/callback
```
Must match character-for-character (no trailing slash).

Optional local dev (only if you test locally):
```
http://localhost:3000/api/hosting/cloudflare/callback
```

### Scopes / permissions
Enable at least:
- `account:read` — list accounts
- `user:read` — identity
- `pages:write` — create Pages projects + deploy
- `offline_access` — refresh tokens

If the UI uses different labels (e.g. “Account — Read”, “Pages — Edit”), map them to those four.

---

## After you create the client

You will get:
1. **Client ID**
2. **Client Secret**

Put them on the server (Hetzner) in `/opt/apps/framer-clone-portal/.env`:

```bash
CLOUDFLARE_OAUTH_CLIENT_ID=...
CLOUDFLARE_OAUTH_CLIENT_SECRET=...
NEXTAUTH_URL=https://clone.webyverse.com
```

Then recreate the app container so env is loaded:

```bash
cd /opt/apps/framer-clone-portal
docker compose up -d --force-recreate app
```

---

## Smoke test

1. Sign in to https://clone.webyverse.com with GitHub  
2. Open a project → **Connect Cloudflare**  
3. Approve scopes on Cloudflare  
4. Land back with `?host=connected&provider=cloudflare`  
5. Choose “Cloudflare Pages” as deploy target → **Sync to GitHub**  

If you see **SSO setup needed**, the env vars are missing or the container wasn’t restarted.

---

## Quick “pick this” checklist

| Field | Choose |
|-------|--------|
| Response type | **code** |
| Grant types | **authorization_code** + **refresh_token** |
| Token auth method | **client_secret_post** |
| Client type | Confidential (has secret) |
| Redirect URI | `https://clone.webyverse.com/api/hosting/cloudflare/callback` |
| Scopes | account:read, user:read, pages:write, offline_access |
