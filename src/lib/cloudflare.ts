/**
 * Cloudflare API helpers — Pages Direct Upload + account ops.
 * Tokens are passed in (decrypted by caller); never log them.
 */

import { createHash } from "crypto";

export interface CfAccount {
  id: string;
  name: string;
}

export interface CfPagesProject {
  name: string;
  subdomain: string;
  created_on?: string;
}

export interface CfDeployment {
  id: string;
  url: string;
  environment: string;
  created_on?: string;
}

type CfResult<T> = { success: true; result: T } | { success: false; error: string };

async function cfFetch<T>(
  path: string,
  token: string,
  init?: RequestInit
): Promise<CfResult<T>> {
  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        ...(init?.headers || {}),
      },
    });
    const data = (await res.json()) as {
      success: boolean;
      result?: T;
      errors?: { message: string; code?: number }[];
    };
    if (!res.ok || !data.success) {
      const msg =
        data.errors?.map((e) => e.message).join("; ") ||
        `Cloudflare API ${res.status}`;
      return { success: false, error: msg };
    }
    return { success: true, result: data.result as T };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function listAccounts(token: string): Promise<CfResult<CfAccount[]>> {
  return cfFetch<CfAccount[]>("/accounts?per_page=50", token);
}

export async function verifyToken(token: string): Promise<CfResult<{ id: string; status: string }>> {
  return cfFetch<{ id: string; status: string }>("/user/tokens/verify", token);
}

export function slugifyProjectName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 58) || "framerclone-site";
}

export async function getOrCreatePagesProject(
  token: string,
  accountId: string,
  name: string
): Promise<CfResult<CfPagesProject>> {
  const existing = await cfFetch<CfPagesProject>(
    `/accounts/${accountId}/pages/projects/${encodeURIComponent(name)}`,
    token
  );
  if (existing.success) return existing;

  return cfFetch<CfPagesProject>(`/accounts/${accountId}/pages/projects`, token, {
    method: "POST",
    body: JSON.stringify({
      name,
      production_branch: "main",
    }),
  });
}

/** Pages Direct Upload uses first 32 chars of SHA-256 (same as Wrangler). */
function hashFileContents(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 32);
}

function normalizeAssetPath(path: string): string {
  const clean = path.replace(/^\//, "");
  return `/${clean}`;
}

/**
 * Deploy static files to Cloudflare Pages via Direct Upload.
 * Flow matches Wrangler: hash files → JWT upload-token → upload missing
 * assets → create deployment with manifest.
 * Files: { path, content } where path is relative (e.g. index.html).
 */
export async function deployPagesFiles(
  token: string,
  accountId: string,
  projectName: string,
  files: { path: string; content: Buffer }[]
): Promise<CfResult<CfDeployment>> {
  // SPA-friendly redirects for client-side routing
  const hasRedirects = files.some((f) => f.path.replace(/^\//, "") === "_redirects");
  const uploadFiles = [...files];
  if (!hasRedirects) {
    uploadFiles.push({
      path: "_redirects",
      content: Buffer.from("/*    /index.html   200\n", "utf-8"),
    });
  }

  // Build manifest: path -> content hash, and hash -> bytes
  const manifest: Record<string, string> = {};
  const byHash = new Map<string, Buffer>();

  for (const file of uploadFiles) {
    const path = normalizeAssetPath(file.path);
    const hash = hashFileContents(file.content);
    manifest[path] = hash;
    byHash.set(hash, file.content);
  }

  // 1) JWT used for the asset upload endpoints
  const tokenRes = await cfFetch<{ jwt: string }>(
    `/accounts/${accountId}/pages/projects/${encodeURIComponent(projectName)}/upload-token`,
    token,
    { method: "POST", body: JSON.stringify({}) }
  );
  if (!tokenRes.success) {
    return { success: false, error: `upload-token: ${tokenRes.error}` };
  }
  const jwt = tokenRes.result.jwt;

  // 2) Ask which hashes are already cached
  const allHashes = Array.from(byHash.keys());
  let missingHashes = allHashes;
  try {
    const checkRes = await fetch(
      "https://api.cloudflare.com/client/v4/pages/assets/check-missing",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ hashes: allHashes }),
      }
    );
    const checkData = (await checkRes.json()) as {
      success: boolean;
      result?: string[];
      errors?: { message: string }[];
    };
    if (checkRes.ok && checkData.success && Array.isArray(checkData.result)) {
      missingHashes = checkData.result;
    }
  } catch {
    // If check-missing fails, upload everything
    missingHashes = allHashes;
  }

  // 3) Upload missing files in batches (API prefers modest payload sizes)
  const BATCH = 50;
  for (let i = 0; i < missingHashes.length; i += BATCH) {
    const batch = missingHashes.slice(i, i + BATCH);
    if (batch.length === 0) continue;

    const form = new FormData();
    for (const hash of batch) {
      const buf = byHash.get(hash);
      if (!buf) continue;
      // Field name must be the content hash; body is the raw file bytes
      form.append(
        hash,
        new Blob([new Uint8Array(buf)]),
        hash
      );
    }

    const upRes = await fetch(
      "https://api.cloudflare.com/client/v4/pages/assets/upload",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
        body: form,
      }
    );
    const upData = (await upRes.json()) as {
      success: boolean;
      errors?: { message: string }[];
    };
    if (!upRes.ok || !upData.success) {
      const msg =
        upData.errors?.map((e) => e.message).join("; ") ||
        `asset upload failed (${upRes.status})`;
      return { success: false, error: msg };
    }
  }

  // 4) Upsert hashes so the deployment can reference them
  try {
    await fetch("https://api.cloudflare.com/client/v4/pages/assets/upsert-hashes", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ hashes: allHashes }),
    });
  } catch {
    // non-fatal on some accounts; deployment still usually works
  }

  // 5) Create deployment — API requires a "manifest" form field
  const deployForm = new FormData();
  deployForm.append("manifest", JSON.stringify(manifest));

  return cfFetch<CfDeployment>(
    `/accounts/${accountId}/pages/projects/${encodeURIComponent(projectName)}/deployments`,
    token,
    { method: "POST", body: deployForm }
  );
}

/** OAuth endpoints for Cloudflare self-managed OAuth clients */
export const CF_OAUTH = {
  authorize: "https://dash.cloudflare.com/oauth2/auth",
  token: "https://dash.cloudflare.com/oauth2/token",
  // Pages write + account/user read for listing accounts and deploying
  scopes: ["account:read", "user:read", "pages:write", "offline_access"],
} as const;

export function cloudflareOAuthConfigured(): boolean {
  return !!(
    process.env.CLOUDFLARE_OAUTH_CLIENT_ID &&
    process.env.CLOUDFLARE_OAUTH_CLIENT_SECRET
  );
}

export function buildCloudflareAuthUrl(state: string, redirectUri: string): string {
  const clientId = process.env.CLOUDFLARE_OAUTH_CLIENT_ID!;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: CF_OAUTH.scopes.join(" "),
    state,
  });
  return `${CF_OAUTH.authorize}?${params.toString()}`;
}

export async function exchangeCloudflareCode(
  code: string,
  redirectUri: string
): Promise<
  CfResult<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
  }>
> {
  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: process.env.CLOUDFLARE_OAUTH_CLIENT_ID!,
      client_secret: process.env.CLOUDFLARE_OAUTH_CLIENT_SECRET!,
      code,
      redirect_uri: redirectUri,
    });
    const res = await fetch(CF_OAUTH.token, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      token_type?: string;
      error?: string;
      error_description?: string;
    };
    if (!res.ok || !data.access_token) {
      return {
        success: false,
        error: data.error_description || data.error || `Token exchange failed (${res.status})`,
      };
    }
    return {
      success: true,
      result: {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in,
        token_type: data.token_type,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function refreshCloudflareToken(
  refreshToken: string
): Promise<
  CfResult<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  }>
> {
  try {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.CLOUDFLARE_OAUTH_CLIENT_ID!,
      client_secret: process.env.CLOUDFLARE_OAUTH_CLIENT_SECRET!,
      refresh_token: refreshToken,
    });
    const res = await fetch(CF_OAUTH.token, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };
    if (!res.ok || !data.access_token) {
      return {
        success: false,
        error: data.error_description || data.error || "Refresh failed",
      };
    }
    return {
      success: true,
      result: {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
