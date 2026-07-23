"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Project {
  id: string;
  name: string;
  framerDomain: string;
  framerUrl: string;
  githubRepo: string;
  githubBranch: string;
  deployProvider: string;
  deployUrl: string | null;
  cloudflareProjectName: string | null;
  cloudflareDeployUrl: string | null;
  vercelProjectId: string | null;
  vercelDeployUrl: string | null;
  netlifySiteId: string | null;
  netlifyDeployUrl: string | null;
  lastDeployAt: string | null;
  status: string;
  lastSyncAt: string | null;
  lastContentHash: string | null;
  syncLogs: {
    id: string;
    status: string;
    changesDetected: boolean;
    filesChanged: number;
    commitSha: string | null;
    commitMessage: string | null;
    errorMessage: string | null;
    startedAt: string;
    completedAt: string | null;
  }[];
}

type HostTarget = "none" | "cloudflare" | "vercel" | "netlify";

interface HostingProviderStatus {
  id: HostTarget;
  name: string;
  recommended: boolean;
  freePlanNote: string;
  commercialOnFree: boolean;
  connectLabel: string;
  docsUrl: string;
  oauthConfigured: boolean;
  connected: boolean;
  accountName: string | null;
  accountId: string | null;
}

function ProjectDetailInner() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [hostTarget, setHostTarget] = useState<HostTarget>("none");
  const [syncResult, setSyncResult] = useState<{
    success: boolean;
    changesDetected?: boolean;
    message?: string;
    deployUrl?: string;
    domainSetup?: {
      message: string;
      steps: string[];
      dashboardUrl?: string;
    };
  } | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [hostingProviders, setHostingProviders] = useState<
    HostingProviderStatus[]
  >([]);
  const [hostingSummary, setHostingSummary] = useState("");
  const [hostError, setHostError] = useState("");

  const isFirstTime = !project?.lastSyncAt;
  const hasSuccessfulSync =
    project?.syncLogs.some((l) => l.status === "success" && l.commitSha) ?? false;

  useEffect(() => {
    fetchProject();
    fetchHostingStatus();
    if (searchParams.get("host") === "connected") {
      const p = searchParams.get("provider") || "cloudflare";
      setSyncResult({
        success: true,
        message: `${p} connected via SSO. Pick it as deploy target and click Sync to GitHub.`,
      });
      if (p === "cloudflare" || p === "vercel" || p === "netlify") {
        setHostTarget(p);
      }
      fetchHostingStatus();
    }
    if (searchParams.get("cf") === "connected") {
      setHostTarget("cloudflare");
      setSyncResult({
        success: true,
        message: "Cloudflare connected. Select it below and sync.",
      });
      fetchHostingStatus();
    }
    const err = searchParams.get("error");
    if (err?.startsWith("host_") || err?.startsWith("cf_")) {
      setHostError(searchParams.get("msg") || "Hosting connection failed");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!project || project.status !== "syncing") return;
    const interval = setInterval(() => {
      fetchProject();
    }, 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.status]);

  async function fetchProject() {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${id}`);
      if (res.ok) {
        const data = await res.json();
        setProject(data);
      } else {
        router.push("/dashboard");
      }
    } catch {
      router.push("/dashboard");
    }
    setLoading(false);
  }

  async function fetchHostingStatus() {
    try {
      const res = await fetch("/api/hosting/status");
      if (res.ok) {
        const data = await res.json();
        setHostingProviders(data.providers || []);
        setHostingSummary(data.summary || "");
        // Default target to connected recommended provider
        const cf = (data.providers || []).find(
          (p: HostingProviderStatus) => p.id === "cloudflare" && p.connected
        );
        if (cf) setHostTarget((t) => (t === "none" ? "cloudflare" : t));
      }
    } catch {
      /* ignore */
    }
  }

  function connectProvider(provider: HostTarget) {
    if (provider === "none") return;
    window.location.href = `/api/hosting/${provider}/auth?returnTo=/projects/${id}`;
  }

  async function disconnectProvider(provider: HostTarget) {
    if (provider === "none") return;
    if (!confirm(`Disconnect ${provider}?`)) return;
    await fetch(`/api/hosting/${provider}/disconnect`, { method: "POST" });
    if (hostTarget === provider) setHostTarget("none");
    await fetchHostingStatus();
  }

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    setHostError("");
    try {
      const res = await fetch(`/api/projects/${id}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostTarget }),
      });
      const data = await res.json();
      if (res.ok) {
        let message: string;
        if (data.hosting?.deployed && data.deployUrl) {
          message = data.changesDetected
            ? `Synced ${data.filesChanged} files to GitHub and deployed to ${data.hosting.provider}`
            : `No content changes — redeployed to ${data.hosting.provider}`;
        } else if (data.hosting?.deployed === false && data.hosting?.message) {
          message = data.changesDetected
            ? `Synced ${data.filesChanged} files to GitHub (${data.hosting.provider} skipped: ${data.hosting.message})`
            : "No changes detected";
        } else if (data.changesDetected) {
          message = `Synced ${data.filesChanged} files to GitHub`;
        } else {
          message = "No changes detected";
        }
        setSyncResult({
          success: true,
          changesDetected: data.changesDetected,
          message,
          deployUrl: data.deployUrl,
          domainSetup: data.domainSetup,
        });
        fetchProject();
      } else if (data.error === "hosting_required" || data.error === "cloudflare_required") {
        setHostError(data.message || "Connect a hosting provider first");
        setSyncResult({
          success: false,
          message: data.message || "Hosting provider not connected",
        });
      } else {
        setSyncResult({
          success: false,
          message: data.message || data.error || "Sync failed",
        });
      }
    } catch {
      setSyncResult({ success: false, message: "Sync failed" });
    }
    setSyncing(false);
  }

  async function handleRollback(commitSha: string) {
    if (!confirm(`Rollback to commit ${commitSha.slice(0, 7)}?`)) return;
    setRollingBack(true);
    setSyncResult(null);
    try {
      const res = await fetch(`/api/projects/${id}/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commitSha }),
      });
      const data = await res.json();
      if (res.ok) {
        setSyncResult({
          success: true,
          message: `Rolled back to ${commitSha.slice(0, 7)}`,
        });
        fetchProject();
      } else {
        setSyncResult({
          success: false,
          message: data.error || data.message || "Rollback failed",
        });
      }
    } catch {
      setSyncResult({ success: false, message: "Rollback failed" });
    }
    setRollingBack(false);
  }

  async function handleDelete() {
    if (!confirm("Are you sure you want to delete this project?")) return;
    setDeleteError("");
    try {
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/dashboard");
      } else {
        const data = await res.json().catch(() => ({}));
        setDeleteError(data.error || "Failed to delete project");
      }
    } catch {
      setDeleteError("Failed to delete project");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!project) return null;

  const githubUrl = `https://github.com/${project.githubRepo}`;
  const framerLink = project.framerUrl.startsWith("http")
    ? project.framerUrl
    : `https://${project.framerUrl}`;
  const liveUrl =
    project.cloudflareDeployUrl ||
    project.vercelDeployUrl ||
    project.netlifyDeployUrl ||
    project.deployUrl ||
    null;
  const busy = syncing || project.status === "syncing";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">{project.name}</h1>
          <p className="text-muted-foreground">
            {project.framerDomain} → {project.githubRepo}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={handleSync} disabled={busy}>
            {syncing || project.status === "syncing"
              ? "Syncing..."
              : "Sync to GitHub"}
          </Button>
          {hasSuccessfulSync && (
            <Button
              variant="outline"
              onClick={() => {
                const lastSuccess = project.syncLogs.find(
                  (l) =>
                    l.status === "success" &&
                    l.commitSha &&
                    l.commitSha !== project.syncLogs[0]?.commitSha
                );
                if (lastSuccess?.commitSha) {
                  handleRollback(lastSuccess.commitSha);
                } else {
                  alert("No previous successful commit to rollback to.");
                }
              }}
              disabled={rollingBack || busy}
            >
              {rollingBack ? "Rolling back..." : "Rollback"}
            </Button>
          )}
          <Button variant="destructive" onClick={handleDelete}>
            Delete
          </Button>
        </div>
      </div>

      {/* Hosting providers — SSO preferred */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Hosting (optional)</CardTitle>
          <CardDescription>
            Sync always updates GitHub. Optionally deploy the same export with
            one-click login (SSO) — no API keys needed for end users.
            {hostingSummary ? ` ${hostingSummary}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {(hostingProviders.length
              ? hostingProviders
              : [
                  {
                    id: "cloudflare" as HostTarget,
                    name: "Cloudflare Pages",
                    recommended: true,
                    freePlanNote:
                      "Free plan allows commercial projects. Recommended default.",
                    commercialOnFree: true,
                    connectLabel: "Connect Cloudflare",
                    docsUrl: "https://developers.cloudflare.com/pages/",
                    oauthConfigured: false,
                    connected: false,
                    accountName: null,
                    accountId: null,
                  },
                  {
                    id: "vercel" as HostTarget,
                    name: "Vercel",
                    recommended: false,
                    freePlanNote:
                      "Hobby free is personal/non-commercial only. Paid plan needed for commercial sites.",
                    commercialOnFree: false,
                    connectLabel: "Connect Vercel",
                    docsUrl: "https://vercel.com/docs/accounts/plans/hobby",
                    oauthConfigured: false,
                    connected: false,
                    accountName: null,
                    accountId: null,
                  },
                  {
                    id: "netlify" as HostTarget,
                    name: "Netlify",
                    recommended: false,
                    freePlanNote:
                      "Free tier is typically personal projects. Commercial sites usually need a paid plan.",
                    commercialOnFree: false,
                    connectLabel: "Connect Netlify",
                    docsUrl: "https://www.netlify.com/pricing/",
                    oauthConfigured: false,
                    connected: false,
                    accountName: null,
                    accountId: null,
                  },
                ]
            ).map((p) => (
              <div
                key={p.id}
                className="border border-border p-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{p.name}</span>
                      {p.recommended && (
                        <Badge variant="secondary">Recommended</Badge>
                      )}
                      <Badge variant={p.connected ? "secondary" : "outline"}>
                        {p.connected ? "Connected" : "Not connected"}
                      </Badge>
                      {!p.commercialOnFree && (
                        <Badge variant="outline">Free ≠ commercial</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {p.freePlanNote}
                    </p>
                    {p.connected && p.accountName && (
                      <p className="text-xs text-muted-foreground">
                        Account: {p.accountName}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {p.connected ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => disconnectProvider(p.id)}
                      >
                        Disconnect
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => connectProvider(p.id)}
                        disabled={!p.oauthConfigured}
                        title={
                          p.oauthConfigured
                            ? p.connectLabel
                            : "SSO not configured on server yet"
                        }
                      >
                        {p.oauthConfigured
                          ? p.connectLabel
                          : "SSO setup needed"}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2 border-t border-border pt-3">
            <Label>When I sync, also deploy to</Label>
            <select
              className="flex h-10 w-full border border-border bg-background px-3 py-2 text-sm"
              value={hostTarget}
              onChange={(e) => setHostTarget(e.target.value as HostTarget)}
            >
              <option value="none">GitHub only (no host deploy)</option>
              <option value="cloudflare">
                Cloudflare Pages (recommended — commercial OK on free)
              </option>
              <option value="vercel">
                Vercel (free = personal / non-commercial only)
              </option>
              <option value="netlify">
                Netlify (free = typically personal projects)
              </option>
            </select>
            <p className="text-xs text-muted-foreground">
              Connect the provider first with one-click SSO. Without a
              connection, Sync only updates GitHub. Custom domains are configured
              in the host dashboard after deploy.
            </p>
          </div>

          {hostError && (
            <p className="text-sm text-destructive">{hostError}</p>
          )}
        </CardContent>
      </Card>

      {deleteError && (
        <div className="rounded-lg border p-4 bg-destructive/10 border-destructive/20">
          <p className="text-sm font-medium text-destructive">Error: {deleteError}</p>
        </div>
      )}

      {syncResult && (
        <div
          className={`rounded-lg border p-4 space-y-2 ${
            syncResult.success
              ? syncResult.changesDetected === false
                ? "bg-blue-500/10 border-blue-500/20"
                : "bg-green-500/10 border-green-500/20"
              : "bg-destructive/10 border-destructive/20"
          }`}
        >
          <p className="text-sm font-medium">
            {syncResult.success ? "Success" : "Error"}: {syncResult.message}
          </p>
          {syncResult.deployUrl && (
            <a
              href={syncResult.deployUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-primary underline block"
            >
              Open live site → {syncResult.deployUrl}
            </a>
          )}
          {syncResult.domainSetup && (
            <div className="text-sm space-y-1 pt-2 border-t border-border/50">
              <p className="font-medium">{syncResult.domainSetup.message}</p>
              <ol className="list-decimal list-inside text-muted-foreground space-y-0.5">
                {syncResult.domainSetup.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
              {syncResult.domainSetup.dashboardUrl && (
                <a
                  href={syncResult.domainSetup.dashboardUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline inline-block mt-1"
                >
                  Open Cloudflare Pages project →
                </a>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <Badge
                variant={project.status === "error" ? "destructive" : "outline"}
              >
                {project.status}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Branch</span>
              <span>{project.githubBranch}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Deploy Provider</span>
              <span>{project.deployProvider}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Last Sync</span>
              <span>
                {project.lastSyncAt
                  ? new Date(project.lastSyncAt).toLocaleString()
                  : "Never"}
              </span>
            </div>
            {project.lastDeployAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last Deploy</span>
                <span>{new Date(project.lastDeployAt).toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t">
              <span className="text-muted-foreground">Framer Site</span>
              <a
                href={framerLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Open →
              </a>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">GitHub Repo</span>
              <a
                href={githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                View →
              </a>
            </div>
            {liveUrl && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Live URL</span>
                <a
                  href={liveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline truncate max-w-[200px]"
                >
                  {liveUrl.replace(/^https?:\/\//, "")}
                </a>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Links</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <a
              href={framerLink}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full"
            >
              <Button variant="outline" className="w-full justify-between">
                <span>Open Framer Site</span>
                <span>↗</span>
              </Button>
            </a>
            <a
              href={githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full"
            >
              <Button variant="outline" className="w-full justify-between">
                <span>View on GitHub</span>
                <span>↗</span>
              </Button>
            </a>
            {liveUrl && (
              <a
                href={liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full"
              >
                <Button variant="outline" className="w-full justify-between">
                  <span>Open Live Site</span>
                  <span>↗</span>
                </Button>
              </a>
            )}
            {project.syncLogs[0]?.commitSha && (
              <a
                href={`${githubUrl}/commit/${project.syncLogs[0].commitSha}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full"
              >
                <Button variant="outline" className="w-full justify-between">
                  <span>Latest Commit</span>
                  <span className="font-mono text-xs">
                    {project.syncLogs[0].commitSha.slice(0, 7)}
                  </span>
                </Button>
              </a>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sync History</CardTitle>
          <CardDescription>Recent sync attempts</CardDescription>
        </CardHeader>
        <CardContent>
          {project.syncLogs.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {isFirstTime
                ? "Click Sync to GitHub to export your Framer site. Connect Cloudflare above if you also want Pages deploys."
                : "No syncs yet."}
            </p>
          ) : (
            <div className="space-y-2">
              {project.syncLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between rounded border p-3 text-sm"
                >
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        variant={
                          log.status === "success"
                            ? "secondary"
                            : log.status === "error"
                            ? "destructive"
                            : "outline"
                        }
                      >
                        {log.status}
                      </Badge>
                      {log.changesDetected && (
                        <Badge variant="default">Changes</Badge>
                      )}
                      {log.commitMessage && (
                        <span className="text-muted-foreground truncate max-w-[240px]">
                          {log.commitMessage}
                        </span>
                      )}
                    </div>
                    <p className="text-muted-foreground">
                      {new Date(log.startedAt).toLocaleString()}
                      {log.filesChanged > 0 && ` · ${log.filesChanged} files`}
                    </p>
                    {log.commitSha && (
                      <a
                        href={`${githubUrl}/commit/${log.commitSha}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary font-mono hover:underline"
                      >
                        {log.commitSha.slice(0, 7)}
                      </a>
                    )}
                    {log.errorMessage && (
                      <p className="text-xs text-destructive">{log.errorMessage}</p>
                    )}
                  </div>
                  {log.status === "success" && log.commitSha && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRollback(log.commitSha!)}
                      disabled={rollingBack}
                      className="ml-2 shrink-0"
                    >
                      Rollback
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function ProjectDetail() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      }
    >
      <ProjectDetailInner />
    </Suspense>
  );
}
