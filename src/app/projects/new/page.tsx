"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function slugifyRepoName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "framer-site"
  );
}

export default function NewProject() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [repos, setRepos] = useState<{ full_name: string }[]>([]);
  const [creatingRepo, setCreatingRepo] = useState(false);
  const [newRepoName, setNewRepoName] = useState("");
  const [createPrivate, setCreatePrivate] = useState(false);
  const [repoCreatedMsg, setRepoCreatedMsg] = useState("");

  const [form, setForm] = useState({
    name: "",
    framerDomain: "",
    githubRepo: "",
    githubBranch: "main",
    deployProvider: "none",
  });

  async function fetchRepos() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/github/repos");
      const data = await res.json();
      if (res.ok) {
        setRepos(data);
      } else {
        setError(data.error || "Failed to fetch repos");
      }
    } catch {
      setError("Failed to fetch repos");
    }
    setLoading(false);
  }

  async function createRepoOneClick() {
    setCreatingRepo(true);
    setError("");
    setRepoCreatedMsg("");
    try {
      const name =
        newRepoName.trim() ||
        slugifyRepoName(form.name || form.framerDomain || "framer-site");
      const res = await fetch("/api/github/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: `FramerClone export: ${form.name || form.framerDomain}`,
          private: createPrivate,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || "Failed to create repo");
        setCreatingRepo(false);
        return;
      }
      const fullName = data.full_name as string;
      setForm((f) => ({ ...f, githubRepo: fullName }));
      setRepoCreatedMsg(`Created ${fullName}`);
      // refresh list
      setRepos((prev) =>
        prev.some((r) => r.full_name === fullName)
          ? prev
          : [{ full_name: fullName }, ...prev]
      );
    } catch {
      setError("Failed to create repo");
    }
    setCreatingRepo(false);
  }

  async function createProject() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        router.push(`/projects/${data.id}`);
      } else {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Failed to create project"
        );
      }
    } catch {
      setError("Failed to create project");
    }
    setLoading(false);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">New Project</h1>
        <p className="text-muted-foreground">
          Connect a Framer site → GitHub → host on Cloudflare
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Step {step} of 3</CardTitle>
          <CardDescription>
            {step === 1 && "Enter your Framer site details"}
            {step === 2 && "Create or pick a GitHub repository"}
            {step === 3 && "Deployment settings"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 1 && (
            <>
              <div className="space-y-2">
                <Label htmlFor="name">Project Name</Label>
                <Input
                  id="name"
                  placeholder="My Framer Site"
                  value={form.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setForm({ ...form, name });
                    if (!newRepoName) setNewRepoName(slugifyRepoName(name));
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="domain">Framer Domain</Label>
                <Input
                  id="domain"
                  placeholder="yoursite.framer.website"
                  value={form.framerDomain}
                  onChange={(e) =>
                    setForm({ ...form, framerDomain: e.target.value })
                  }
                />
              </div>
              <Button
                onClick={() => {
                  if (!newRepoName) {
                    setNewRepoName(
                      slugifyRepoName(form.name || form.framerDomain)
                    );
                  }
                  setStep(2);
                }}
                disabled={!form.name || !form.framerDomain}
              >
                Next
              </Button>
            </>
          )}

          {step === 2 && (
            <>
              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                <div>
                  <p className="font-medium text-sm">Create new repo (one click)</p>
                  <p className="text-xs text-muted-foreground">
                    Uses your GitHub login — no need to leave this page.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newRepo">Repo name</Label>
                  <Input
                    id="newRepo"
                    placeholder="my-framer-site"
                    value={newRepoName}
                    onChange={(e) => setNewRepoName(e.target.value)}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={createPrivate}
                    onChange={(e) => setCreatePrivate(e.target.checked)}
                  />
                  Private repository
                </label>
                <Button
                  onClick={createRepoOneClick}
                  disabled={creatingRepo || !newRepoName.trim()}
                >
                  {creatingRepo ? "Creating..." : "Create GitHub Repo"}
                </Button>
                {repoCreatedMsg && (
                  <p className="text-sm text-green-500">{repoCreatedMsg}</p>
                )}
              </div>

              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">or use existing</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Existing GitHub Repository</Label>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={fetchRepos} disabled={loading}>
                    {loading ? "Loading..." : "Fetch My Repos"}
                  </Button>
                </div>
                {repos.length > 0 && (
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.githubRepo}
                    onChange={(e) =>
                      setForm({ ...form, githubRepo: e.target.value })
                    }
                  >
                    <option value="">Select a repo...</option>
                    {repos.map((repo) => (
                      <option key={repo.full_name} value={repo.full_name}>
                        {repo.full_name}
                      </option>
                    ))}
                  </select>
                )}
                <Input
                  placeholder="or type: owner/repo-name"
                  value={form.githubRepo}
                  onChange={(e) =>
                    setForm({ ...form, githubRepo: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="branch">Branch</Label>
                <Input
                  id="branch"
                  value={form.githubBranch}
                  onChange={(e) =>
                    setForm({ ...form, githubBranch: e.target.value })
                  }
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button onClick={() => setStep(3)} disabled={!form.githubRepo}>
                  Next
                </Button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="space-y-2">
                <Label>Deploy Provider</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.deployProvider}
                  onChange={(e) =>
                    setForm({ ...form, deployProvider: e.target.value })
                  }
                >
                  <option value="none">GitHub only (default)</option>
                  <option value="cloudflare">
                    Cloudflare Pages (recommended — commercial OK on free)
                  </option>
                  <option value="self-hosted">Self-hosted</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  Sync always pushes to GitHub. On the project page, connect
                  Cloudflare with an API token if you also want a live Pages
                  deploy.
                </p>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(2)}>
                  Back
                </Button>
                <Button onClick={createProject} disabled={loading}>
                  {loading ? "Creating..." : "Create Project"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
