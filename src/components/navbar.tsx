"use client";

import Link from "next/link";
import { useSession, signIn, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function Navbar() {
  const { data: session, status } = useSession();

  return (
    <nav className="border-b border-border bg-card">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold tracking-tight">
          FramerClone
        </Link>
        <div className="flex items-center gap-4">
          {status === "loading" ? (
            <div className="h-8 w-20 bg-muted animate-pulse rounded" />
          ) : session ? (
            <>
              <Link href="/dashboard">
                <Button variant="ghost">Dashboard</Button>
              </Link>
              <div className="flex items-center gap-2">
                {session.user?.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={session.user.image}
                    alt={session.user.name || ""}
                    className="h-8 w-8 rounded-full"
                  />
                )}
                <Button variant="outline" size="sm" onClick={() => signOut()}>
                  Sign Out
                </Button>
              </div>
            </>
          ) : (
            <Button onClick={() => signIn("github")}>Sign In with GitHub</Button>
          )}
        </div>
      </div>
    </nav>
  );
}
