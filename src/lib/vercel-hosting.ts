/**
 * Vercel REST API — create project + deploy static files via OAuth token.
 */

type VResult<T> = { success: true; result: T } | { success: false; error: string };

async function vFetch<T>(
  path: string,
  token: string,
  init?: RequestInit & { teamId?: string | null }
): Promise<VResult<T>> {
  try {
    const teamId = init?.teamId;
    const url = new URL(`https://api.vercel.com${path}`);
    if (teamId) url.searchParams.set("teamId", teamId);

    const { teamId: _t, ...rest } = init || {};
    const res = await fetch(url.toString(), {
      ...rest,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(rest.body && !(rest.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
        ...(rest.headers || {}),
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        (data as { error?: { message?: string } })?.error?.message ||
        (data as { message?: string })?.message ||
        `Vercel API ${res.status}`;
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

export async function vercelUser(token: string) {
  return vFetch<{ user: { id: string; username: string; name?: string } }>(
    "/v2/user",
    token
  );
}

export async function vercelTeams(token: string) {
  return vFetch<{ teams: { id: string; name: string; slug: string }[] }>(
    "/v2/teams",
    token
  );
}

export function slugifyVercelName(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 52) || "framerclone-site"
  );
}

/** Deploy static files as a Vercel deployment (no framework). */
export async function deployToVercel(
  token: string,
  opts: {
    name: string;
    files: { path: string; content: Buffer }[];
    teamId?: string | null;
    existingProjectId?: string | null;
  }
): Promise<
  VResult<{
    url: string;
    projectId: string;
    deploymentId: string;
  }>
> {
  const name = slugifyVercelName(opts.name);

  // Ensure project exists
  let projectId = opts.existingProjectId || null;
  if (!projectId) {
    const created = await vFetch<{ id: string; name: string }>(
      "/v10/projects",
      token,
      {
        method: "POST",
        teamId: opts.teamId,
        body: JSON.stringify({
          name,
          framework: null,
        }),
      }
    );
    if (created.success) {
      projectId = created.result.id;
    } else if (
      created.error.toLowerCase().includes("already") ||
      created.error.toLowerCase().includes("exist")
    ) {
      // fetch by name
      const list = await vFetch<{ projects?: { id: string; name: string }[] }>(
        `/v9/projects?search=${encodeURIComponent(name)}`,
        token,
        { teamId: opts.teamId }
      );
      const found = list.success
        ? list.result.projects?.find((p) => p.name === name)
        : null;
      if (found) projectId = found.id;
      else return { success: false, error: created.error };
    } else {
      return { success: false, error: created.error };
    }
  }

  // File upload format for v13 deployments: array of { file, data } base64
  const files = opts.files.map((f) => ({
    file: f.path.replace(/^\//, ""),
    data: f.content.toString("base64"),
    encoding: "base64" as const,
  }));

  // Add SPA rewrite if missing
  if (!files.some((f) => f.file === "vercel.json")) {
    files.push({
      file: "vercel.json",
      data: Buffer.from(
        JSON.stringify({
          rewrites: [{ source: "/(.*)", destination: "/index.html" }],
        }),
        "utf-8"
      ).toString("base64"),
      encoding: "base64",
    });
  }

  const deploy = await vFetch<{
    id: string;
    url: string;
    projectId?: string;
  }>("/v13/deployments", token, {
    method: "POST",
    teamId: opts.teamId,
    body: JSON.stringify({
      name,
      files,
      project: projectId || undefined,
      projectSettings: {
        framework: null,
      },
      target: "production",
    }),
  });

  if (!deploy.success) return deploy;

  const url = deploy.result.url.startsWith("http")
    ? deploy.result.url
    : `https://${deploy.result.url}`;

  return {
    success: true,
    result: {
      url,
      projectId: deploy.result.projectId || projectId || name,
      deploymentId: deploy.result.id,
    },
  };
}

export const VERCEL_OAUTH = {
  authorize: "https://vercel.com/oauth/authorize",
  token: "https://api.vercel.com/v2/oauth/access_token",
  // scopes for deploying
  scopes: "user:read project:read project:write deployment:read deployment:write",
};
