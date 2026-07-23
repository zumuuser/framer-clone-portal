"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signIn, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { useTheme, type ThemeMode } from "@/components/theme-provider";
import { BrandLogo } from "@/components/brand-logo";

function ThemeCycleButton() {
  const { mode, setMode } = useTheme();
  const order: ThemeMode[] = ["system", "light", "dark"];
  const labels: Record<ThemeMode, string> = {
    system: "System",
    light: "Light",
    dark: "Dark",
  };
  const next = () => {
    const i = order.indexOf(mode);
    setMode(order[(i + 1) % order.length]);
  };
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={next}
      title={`Theme: ${labels[mode]} (click to cycle)`}
      className="text-muted-foreground"
    >
      {labels[mode]}
    </Button>
  );
}

export function Navbar() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const isHome = pathname === "/";

  return (
    <nav className="sticky top-0 z-40 border-b border-border bg-card/90 backdrop-blur-sm">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        {/* Logo only off-home — hero owns the mark on `/` */}
        <div className="flex min-w-0 items-center">
          {!isHome && (
            <Link
              href="/"
              className="block opacity-90 transition-opacity hover:opacity-100"
              aria-label="FramerClone home"
            >
              <BrandLogo width={118} align="start" className="!mx-0" />
            </Link>
          )}
        </div>

        <div className="flex items-center gap-3">
          <ThemeCycleButton />
          {status === "loading" ? (
            <div className="h-8 w-20 animate-pulse bg-muted" />
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
                    className="h-8 w-8 ring-1 ring-border"
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
