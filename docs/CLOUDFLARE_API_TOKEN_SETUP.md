# Cloudflare API token (FramerClone)

Users connect Cloudflare by creating an API token and pasting it into the project page. OAuth is not required.

## For users (in-app copy mirrors this)

1. Open [API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. **Create Token** → **Create Custom Token**
3. Permissions:
   - **Account** → **Cloudflare Pages** → **Edit**
   - **Account** → **Account Settings** → **Read**
4. Account resources: your account
5. Create → copy token → paste in FramerClone → **Connect Cloudflare**

Docs: [Create an API token](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)

## App endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/cloudflare/connect` | Body `{ "apiToken": "..." }` — verify, encrypt, store |
| `DELETE` | `/api/cloudflare/connect` | Clear stored token |
| `POST` | `/api/hosting/cloudflare/disconnect` | Same disconnect for UI |
| `GET` | `/api/hosting/status` | Connected? account name/id |

Token is stored encrypted on the user (`cloudflareToken`). Used on Sync when host target is Cloudflare.

## Security notes

- Prefer API Token over Global API Key
- Least privilege: only Pages Edit + Account Settings Read
- User can revoke the token anytime in Cloudflare dashboard
