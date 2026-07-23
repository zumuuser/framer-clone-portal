"use client";

import Link from "next/link";
import { useSession, signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand-logo";

export default function Home() {
  const { data: session, status } = useSession();
  const isLoading = status === "loading";

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] text-center space-y-8">
      {/* Center brand mark — large, optimized WebP */}
      <BrandLogo width={420} priority className="mb-2" />

      <div className="space-y-4 max-w-2xl">
        <h1 className="text-5xl font-bold tracking-tight">
          Deploy Framer Sites Anywhere
        </h1>
        <p className="text-xl text-muted-foreground">
          Export your Framer websites to GitHub and deploy on Cloudflare, Netlify,
          Vercel, or self-hosted infrastructure. Track changes, rollback anytime,
          and own your code.
        </p>
      </div>
      <div className="flex gap-4">
        {isLoading ? (
          <div className="h-12 w-32 bg-muted animate-pulse" />
        ) : session ? (
          <>
            <Link href="/dashboard">
              <Button size="lg">Get Started</Button>
            </Link>
            <Link href="/dashboard">
              <Button size="lg" variant="outline">
                View Dashboard
              </Button>
            </Link>
          </>
        ) : (
          <>
            <Button size="lg" onClick={() => signIn("github")}>
              Get Started
            </Button>
            <Button size="lg" variant="outline" onClick={() => signIn("github")}>
              Sign In with GitHub
            </Button>
          </>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl w-full mt-12">
        <FeatureCard
          title="One-Click Export"
          description="Paste your Framer domain. We handle the rest — scraping, asset discovery, and code generation."
        />
        <FeatureCard
          title="GitHub Integration"
          description="Every export is a Git commit. Full version history, easy rollbacks, and familiar workflows."
        />
        <FeatureCard
          title="Auto-Deploy"
          description="Connect Cloudflare (recommended), Netlify, or Vercel. Own your code and ship anywhere."
        />
      </div>
    </div>
  );
}

function FeatureCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="border border-border bg-card p-6 text-left">
      <h3 className="font-semibold text-lg mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
