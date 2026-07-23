/**
 * Netlify API — create site + deploy static files via OAuth token.
 */

type NResult<T> = { success: true; result: T } | { success: false; error: string };

async function nFetch<T>(
  path: string,
  token: string,
  init?: RequestInit
): Promise<NResult<T>> {
  try {
    const res = await fetch(`https://api.netlify.com/api/v1${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.body && !(init.body instanceof FormData) && typeof init.body === "string"
          ? { "Content-Type": "application/json" }
          : {}),
        ...(init?.headers || {}),
      },
    });
    const text = await res.text();
    let data: unknown = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { message: text };
    }
    if (!res.ok) {
      const msg =
        (data as { message?: string })?.message ||
        (data as { error?: string })?.error ||
        `Netlify API ${res.status}`;
      return { success: false, error: msg };
    }
    return { success: true, result: data as T };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function netlifyUser(token: string) {
  return nFetch<{ id: string; full_name?: string; email?: string; slug?: string }>(
    "/user",
    token
  );
}

export function slugifyNetlifyName(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 52) || "framerclone-site"
  );
}

/**
 * Create (or reuse) a site and deploy files as a zip-like multipart deploy.
 * Uses the file digest deploy API when possible; falls back to simple create+deploy.
 */
export async function deployToNetlify(
  token: string,
  opts: {
    name: string;
    files: { path: string; content: Buffer }[];
    existingSiteId?: string | null;
  }
): Promise<
  NResult<{
    url: string;
    siteId: string;
    deployId: string;
  }>
> {
  const name = slugifyNetlifyName(opts.name);
  let siteId = opts.existingSiteId || null;
  let sslUrl: string | null = null;

  if (!siteId) {
    const created = await nFetch<{
      id: string;
      ssl_url?: string;
      url?: string;
      name: string;
    }>("/sites", token, {
      method: "POST",
      body: JSON.stringify({ name }),
    });

    if (created.success) {
      siteId = created.result.id;
      sslUrl = created.result.ssl_url || created.result.url || null;
    } else {
      // Name taken — try create without name (random) or list
      const fallback = await nFetch<{
        id: string;
        ssl_url?: string;
        url?: string;
        name: string;
      }>("/sites", token, {
        method: "POST",
        body: JSON.stringify({ name: `${name}-${Date.now().toString(36).slice(-4)}` }),
      });
      if (!fallback.success) return { success: false, error: created.error };
      siteId = fallback.result.id;
      sslUrl = fallback.result.ssl_url || fallback.result.url || null;
    }
  }

  // Ensure SPA redirects
  const files = [...opts.files];
  if (!files.some((f) => f.path.replace(/^\//, "") === "_redirects")) {
    files.push({
      path: "_redirects",
      content: Buffer.from("/*    /index.html   200\n", "utf-8"),
    });
  }

  // Create deploy with file digests (sha1)
  const { createHash } = await import("crypto");
  const filesMeta: Record<string, string> = {};
  const bySha = new Map<string, { path: string; content: Buffer }>();
  for (const f of files) {
    const path = "/" + f.path.replace(/^\//, "");
    const sha = createHash("sha1").update(f.content).digest("hex");
    filesMeta[path] = sha;
    bySha.set(sha, { path, content: f.content });
  }

  const deployCreate = await nFetch<{
    id: string;
    required?: string[];
    ssl_url?: string;
    deploy_ssl_url?: string;
    url?: string;
  }>(`/sites/${siteId}/deploys`, token, {
    method: "POST",
    body: JSON.stringify({ files: filesMeta }),
  });

  if (!deployCreate.success) return deployCreate;

  const required = deployCreate.result.required || [];
  for (const sha of required) {
    const file = bySha.get(sha);
    if (!file) continue;
    const putRes = await fetch(
      `https://api.netlify.com/api/v1/deploys/${deployCreate.result.id}/files${file.path}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/octet-stream",
        },
        body: new Uint8Array(file.content),
      }
    );
    if (!putRes.ok) {
      const t = await putRes.text();
      return {
        success: false,
        error: `Netlify file upload failed for ${file.path}: ${t || putRes.status}`,
      };
    }
  }

  const url =
    deployCreate.result.ssl_url ||
    deployCreate.result.deploy_ssl_url ||
    sslUrl ||
    deployCreate.result.url ||
    `https://${name}.netlify.app`;

  return {
    success: true,
    result: {
      url,
      siteId: siteId!,
      deployId: deployCreate.result.id,
    },
  };
}

export const NETLIFY_OAUTH = {
  authorize: "https://app.netlify.com/authorize",
  token: "https://api.netlify.com/oauth/token",
};
