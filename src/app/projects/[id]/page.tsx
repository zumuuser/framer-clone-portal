"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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

export default function ProjectDetail() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    success: boolean;
    changesDetected?: boolean;
    message?: string;
  } | null>(null);
  const [deleteError, setDeleteError] = useState("");

  const isFirstTime = !project?.lastSyncAt;
  const hasSuccessfulSync = project?.syncLogs.some((l) => l.status === "success" && l.commitSha) ?? false;

  useEffect(() => {
    fetchProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Poll for sync status while syncing
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

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch(`/api/projects/${id}/sync`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setSyncResult({
          success: true,
          changesDetected: data.changesDetected,
          message: data.changesDetected
            ? `Synced ${data.filesChanged} files to GitHub`
            : "No changes detected",
        });
        fetchProject();
      } else {
        setSyncResult({
          success: false,
          message: data.error || data.message || "Sync failed",
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
  const framerLink = project.framerUrl.startsWith("http") ? project.framerUrl : `https://${project.framerUrl}`;

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
          <Button
            onClick={handleSync}
            disabled={syncing || project.status === "syncing"}
          >
            {syncing || project.status === "syncing"
              ? isFirstTime
                ? "Hosting..."
                : "Fetching..."
              : isFirstTime
              ? "Host"
              : "Fetch Updates"}
          </Button>
          {hasSuccessfulSync && (
            <Button
              variant="outline"
              onClick={() => {
                const lastSuccess = project.syncLogs.find((l) => l.status === "success" && l.commitSha && l.commitSha !== project.syncLogs[0]?.commitSha);
                if (lastSuccess?.commitSha) {
                  handleRollback(lastSuccess.commitSha);
                } else {
                  alert("No previous successful commit to rollback to.");
                }
              }}
              disabled={rollingBack || project.status === "syncing"}
            >
              {rollingBack ? "Rolling back..." : "Rollback"}
            </Button>
          )}
          <Button variant="destructive" onClick={handleDelete}>
            Delete
          </Button>
        </div>
      </div>

      {deleteError && (
        <div className="rounded-lg border p-4 bg-destructive/10 border-destructive/20">
          <p className="text-sm font-medium text-destructive">Error: {deleteError}</p>
        </div>
      )}

      {syncResult && (
        <div
          className={`rounded-lg border p-4 ${
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
              <Badge variant={project.status === "error" ? "destructive" : "outline"}>
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
                {project.lastSyncAt ? new Date(project.lastSyncAt).toLocaleString() : "Never"}
              </span>
            </div>
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
            {project.syncLogs[0]?.commitSha && (
              <a
                href={`${githubUrl}/commit/${project.syncLogs[0].commitSha}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full"
              >
                <Button variant="outline" className="w-full justify-between">
                  <span>Latest Commit</span>
                  <span className="font-mono text-xs">{project.syncLogs[0].commitSha.slice(0, 7)}</span>
                </Button>
              </a>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sync History</CardTitle>
          <CardDescription>Recent export attempts</CardDescription>
        </CardHeader>
        <CardContent>
          {project.syncLogs.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {isFirstTime
                ? "Click 'Host' to perform your first export."
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
                        <span className="text-muted-foreground truncate max-w-[200px]">
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
