"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function NewProject() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [repos, setRepos] = useState<{ full_name: string }[]>([]);

  const [form, setForm] = useState({
    name: "",
    framerDomain: "",
    githubRepo: "",
    githubBranch: "main",
    deployProvider: "none",
  });

  async function fetchRepos() {
    setLoading(true);
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
        setError(data.error || "Failed to create project");
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
        <p className="text-muted-foreground">Connect a Framer site to GitHub</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Step {step} of 3</CardTitle>
          <CardDescription>
            {step === 1 && "Enter your Framer site details"}
            {step === 2 && "Connect a GitHub repository"}
            {step === 3 && "Choose deployment settings"}
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
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="domain">Framer Domain</Label>
                <Input
                  id="domain"
                  placeholder="yoursite.framer.website"
                  value={form.framerDomain}
                  onChange={(e) => setForm({ ...form, framerDomain: e.target.value })}
                />
              </div>
              <Button onClick={() => setStep(2)} disabled={!form.name || !form.framerDomain}>
                Next
              </Button>
            </>
          )}

          {step === 2 && (
            <>
              <div className="space-y-2">
                <Label>GitHub Repository</Label>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={fetchRepos} disabled={loading}>
                    {loading ? "Loading..." : "Fetch My Repos"}
                  </Button>
                </div>
                {repos.length > 0 && (
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.githubRepo}
                    onChange={(e) => setForm({ ...form, githubRepo: e.target.value })}
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
                  onChange={(e) => setForm({ ...form, githubRepo: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="branch">Branch</Label>
                <Input
                  id="branch"
                  value={form.githubBranch}
                  onChange={(e) => setForm({ ...form, githubBranch: e.target.value })}
                />
              </div>
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
                  onChange={(e) => setForm({ ...form, deployProvider: e.target.value })}
                >
                  <option value="none">None (GitHub only)</option>
                  <option value="netlify">Netlify</option>
                  <option value="vercel">Vercel</option>
                  <option value="self-hosted">Self-hosted</option>
                </select>
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
