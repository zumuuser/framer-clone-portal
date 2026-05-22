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
  const [syncResult, setSyncResult] = useState<{
    success: boolean;
    changesDetected?: boolean;
    message?: string;
  } | null>(null);

  useEffect(() => {
    fetchProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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

  async function handleDelete() {
    if (!confirm("Are you sure you want to delete this project?")) return;
    try {
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      if (res.ok) router.push("/dashboard");
    } catch {}
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!project) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{project.name}</h1>
          <p className="text-muted-foreground">
            {project.framerDomain} → {project.githubRepo}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleSync} disabled={syncing || project.status === "syncing"}>
            {syncing || project.status === "syncing" ? "Syncing..." : "Check for Updates"}
          </Button>
          <Button variant="destructive" onClick={handleDelete}>
            Delete
          </Button>
        </div>
      </div>

      {syncResult && (
        <div
          className={`rounded-lg border p-4 ${
            syncResult.success
              ? syncResult.changesDetected
                ? "bg-green-500/10 border-green-500/20"
                : "bg-blue-500/10 border-blue-500/20"
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <iframe
              src={project.framerUrl}
              className="w-full h-64 rounded border"
              sandbox="allow-scripts allow-same-origin"
            />
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
            <p className="text-muted-foreground text-sm">No syncs yet</p>
          ) : (
            <div className="space-y-2">
              {project.syncLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between rounded border p-3 text-sm"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
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
                    </div>
                    <p className="text-muted-foreground">
                      {new Date(log.startedAt).toLocaleString()}
                      {log.filesChanged > 0 && ` · ${log.filesChanged} files`}
                    </p>
                    {log.commitSha && (
                      <p className="text-xs text-muted-foreground font-mono">
                        {log.commitSha.slice(0, 7)}
                      </p>
                    )}
                    {log.errorMessage && (
                      <p className="text-xs text-destructive">{log.errorMessage}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
