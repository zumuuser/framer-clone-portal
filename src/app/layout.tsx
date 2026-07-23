import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Navbar } from "@/components/navbar";
import { AtmosphereBg } from "@/components/atmosphere-bg";
import { BetaBanner } from "@/components/beta-banner";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
  weight: ["400", "500", "600", "700", "800"],
});

const siteUrl = "https://clone.webyverse.com";
const siteName = "FramerClone";
const siteTitle = "FramerClone — Deploy Framer Sites Anywhere";
const siteDescription =
  "Export Framer websites to GitHub and deploy on Cloudflare, Netlify, Vercel, or self-hosted. Own your code, track every sync, roll back anytime.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteTitle,
    template: `%s · ${siteName}`,
  },
  description: siteDescription,
  applicationName: siteName,
  authors: [{ name: "Webyverse", url: "https://webyverse.com" }],
  creator: "Webyverse",
  publisher: "Webyverse",
  keywords: [
    "Framer",
    "Framer export",
    "Framer to GitHub",
    "Cloudflare Pages",
    "static site deploy",
    "FramerClone",
    "self-host Framer",
  ],
  category: "technology",
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "32x32" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/favicon.ico"],
  },
  manifest: "/site.webmanifest",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName,
    title: siteTitle,
    description: siteDescription,
    images: [
      {
        url: "/og-preview.jpg",
        width: 1200,
        height: 630,
        alt: "FramerClone dark theme on a desktop monitor",
        type: "image/jpeg",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: ["/og-preview.jpg"],
  },
  other: {
    "theme-color": "#0a0a0a",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f5f2" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
};

/** Avoid flash of wrong theme before React hydrates */
const themeInitScript = `
(function(){
  try {
    var m = localStorage.getItem('framerclone-theme') || 'system';
    var d = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var r = m === 'system' ? (d ? 'dark' : 'light') : m;
    document.documentElement.classList.remove('light','dark');
    document.documentElement.classList.add(r);
    document.documentElement.style.colorScheme = r;
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className={`${bricolage.variable} ${bricolage.className} antialiased bg-background text-foreground min-h-screen`}
      >
        <AtmosphereBg />
        <Providers>
          <div className="relative z-10 min-h-screen">
            <Navbar />
            <main className="container mx-auto px-4 py-8">{children}</main>
            <BetaBanner />
          </div>
        </Providers>
      </body>
    </html>
  );
}
