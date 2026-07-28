import { chromium as playwright } from "playwright-core";
import { createServer } from "http";
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join, dirname, extname } from "path";
import { createHash } from "crypto";

export interface ScrapedFile {
  path: string;
  content: Buffer;
}

export interface ScrapeOptions {
  /** Rewrite absolute *.framer.website canonicals to this origin (e.g. https://keydispatchers.com). */
  canonicalOrigin?: string;
  /** Hard cap on HTML pages scraped (sitemap + link discovery). Default 200. */
  maxPages?: number;
}

export interface ScrapeResult {
  files: ScrapedFile[];
  contentHash: string;
}

const mimeTypes: Record<string, string> = {
  ".html": "text/html",
  ".htm": "text/html",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".txt": "text/plain",
  ".xml": "application/xml",
};

const ASSET_EXT = /\.(?:js|mjs|css|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|map|json|mp4|webm|pdf)$/i;

function computeHash(files: ScrapedFile[]): string {
  const hash = createHash("sha256");
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  for (const file of sorted) {
    hash.update(file.path);
    hash.update(file.content);
  }
  return hash.digest("hex");
}

function fixSrcset(html: string): string {
  return html.replace(
    /(\.(?:png|jpg|jpeg|gif|webp)) (\d+w)\?([^\s,]+) \2/g,
    "$1?$3 $2"
  );
}

function rewriteHtmlAssets(html: string, baseOrigin: string): string {
  const assetRe = new RegExp(
    `(["'(])${baseOrigin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(/[^"')\\s]+)`,
    "g"
  );
  return html.replace(assetRe, "$1$2");
}

/** Always emit clean-path.html (never extensionless HTML — Pages serves those as octet-stream). */
function htmlFileNameForPath(pathname: string): string {
  const clean = pathname.replace(/\/+$/, "") || "/";
  if (clean === "/") return "index.html";
  const stripped = clean.replace(/^\//, "");
  if (ASSET_EXT.test(stripped) || /\.html?$/i.test(stripped)) return stripped;
  return `${stripped}.html`;
}

function normalizePageKey(u: string): string {
  const p = new URL(u).pathname.replace(/\/+$/, "").replace(/\.+$/, "").toLowerCase();
  return p === "" ? "/" : p;
}

function rewriteCanonicals(html: string, pageUrl: string, canonicalOrigin?: string): string {
  if (!canonicalOrigin) return html;
  const origin = canonicalOrigin.replace(/\/+$/, "");
  const path = new URL(pageUrl).pathname.replace(/\/+$/, "") || "/";
  const canonicalHref = path === "/" ? `${origin}/` : `${origin}${path}`;

  if (/rel=["']canonical["']/i.test(html)) {
    return html.replace(
      /<link[^>]*rel=["']canonical["'][^>]*>/gi,
      `<link rel="canonical" href="${canonicalHref}">`
    );
  }
  return html.replace(
    /<\/head>/i,
    `<link rel="canonical" href="${canonicalHref}"></head>`
  );
}

function buildRobotsTxt(canonicalOrigin: string): string {
  const origin = canonicalOrigin.replace(/\/+$/, "");
  return `# Maximum openness — search + AI crawlers welcome.
User-agent: *
Allow: /

User-agent: Googlebot
Allow: /

User-agent: Bingbot
Allow: /

User-agent: GPTBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Applebot-Extended
Allow: /

User-agent: CCBot
Allow: /

User-agent: Meta-ExternalAgent
Allow: /

Sitemap: ${origin}/sitemap.xml
`;
}

function buildSitemapXml(canonicalOrigin: string, pageUrls: string[]): string {
  const origin = canonicalOrigin.replace(/\/+$/, "");
  const locs = pageUrls
    .map((u) => {
      const path = new URL(u).pathname.replace(/\/+$/, "") || "/";
      if (path === "/404") return null;
      const loc = path === "/" ? `${origin}/` : `${origin}${path}`;
      return `  <url><loc>${loc}</loc></url>`;
    })
    .filter(Boolean);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${locs.join("\n")}
</urlset>
`;
}

function buildHeadersFile(): string {
  return `# Cloudflare Pages headers — keep HTML/XML/text typed correctly.
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin

/robots.txt
  Content-Type: text/plain; charset=utf-8

/sitemap.xml
  Content-Type: application/xml; charset=utf-8

/*.html
  Content-Type: text/html; charset=utf-8
`;
}

function buildRedirectsFile(): string {
  // Intentionally NO /* → /index.html 200 SPA fallback (that causes soft-404s).
  // Cloudflare Pages serves 404.html automatically for missing paths when present.
  return `# Static site — missing paths must 404 (not soft-200 to homepage).
# Pretty URLs: Pages maps /pricing → /pricing.html automatically.
`;
}

async function startLocalServer(siteDir: string, port: number): Promise<ReturnType<typeof createServer>> {
  const server = createServer((req, res) => {
    let rel = decodeURIComponent(req.url || "/").split("?")[0];
    if (rel.endsWith("/")) rel += "index.html";
    let filePath = join(siteDir, rel);
    if (!existsSync(filePath) && !extname(filePath)) {
      const withHtml = filePath + ".html";
      if (existsSync(withHtml)) filePath = withHtml;
    }

    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext = extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(readFileSync(filePath));
  });

  return new Promise((resolve) => {
    server.listen(port, () => resolve(server));
  });
}

async function discoverUrlsFromSitemap(
  page: import("playwright-core").Page,
  baseOrigin: string
): Promise<string[]> {
  const candidates = [`${baseOrigin}/sitemap.xml`, `${baseOrigin}/sitemap_index.xml`];
  const found: string[] = [];
  for (const smUrl of candidates) {
    try {
      const res = await page.request.get(smUrl, { timeout: 10000 });
      if (!res.ok()) continue;
      const text = await res.text();
      if (!text.includes("<loc>")) continue;
      const locs = [...text.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map((m) => m[1].trim());
      for (const loc of locs) {
        try {
          const u = new URL(loc);
          if (u.origin === baseOrigin) found.push(u.toString());
        } catch {
          /* skip */
        }
      }
      if (found.length) break;
    } catch {
      /* try next */
    }
  }
  return found;
}

export async function scrapeFramerSite(
  domain: string,
  options: ScrapeOptions = {}
): Promise<ScrapeResult> {
  const url = domain.startsWith("http") ? domain : `https://${domain}`;
  const baseOrigin = new URL(url).origin;
  const maxPages = options.maxPages ?? 200;
  const workDir = join("/tmp", `scrape-${Date.now()}`);
  mkdirSync(workDir, { recursive: true });

  let browser;
  if (process.env.VERCEL) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const chromiumModule = require("@sparticuz/chromium");
    const chromium = chromiumModule.default ?? chromiumModule;
    if (typeof chromium.setGraphicsMode === "function") {
      chromium.setGraphicsMode(false);
    }
    browser = await playwright.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  } else {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { chromium: localChromium } = require("playwright");
      browser = await localChromium.launch();
    } catch {
      browser = await playwright.launch();
    }
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForTimeout(1500);

    const discoveredUrls = new Set<string>();
    discoveredUrls.add(url);

    // Prefer Framer's sitemap — captures full CMS/blog set that homepage links miss.
    for (const smUrl of await discoverUrlsFromSitemap(page, baseOrigin)) {
      discoveredUrls.add(smUrl);
    }

    const links = await page.evaluate((baseDomain: string) => {
      const hrefs: string[] = [];
      document.querySelectorAll("a[href]").forEach((a) => {
        const href = (a as HTMLAnchorElement).href;
        try {
          const u = new URL(href);
          if (u.hostname === baseDomain && !u.hash && !u.search) {
            hrefs.push(u.pathname);
          }
        } catch {}
      });
      return hrefs;
    }, new URL(url).hostname);

    for (const pathname of links) {
      discoveredUrls.add(new URL(pathname, url).toString());
    }

    const pageFiles: ScrapedFile[] = [];
    const assetUrls = new Set<string>();
    const scrapedPageUrls: string[] = [];

    const seenKeys = new Set<string>();
    const urlsToScrape: string[] = [];
    for (const u of discoveredUrls) {
      const key = normalizePageKey(u);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      urlsToScrape.push(u);
    }
    const queue = urlsToScrape.slice(0, maxPages);
    if (urlsToScrape.length > maxPages) {
      console.warn(
        `Page discovery found ${urlsToScrape.length} URLs; scraping first ${maxPages}. Raise maxPages if needed.`
      );
    }

    const scrapeOne = async (tab: import("playwright-core").Page, pageUrl: string) => {
      await tab.goto(pageUrl, { waitUntil: "networkidle", timeout: 15000 });
      await tab.waitForTimeout(1000);

      const fileName = htmlFileNameForPath(new URL(pageUrl).pathname);

      let html = await tab.content();
      html = fixSrcset(html);
      html = rewriteCanonicals(html, pageUrl, options.canonicalOrigin);

      const pageAssets = await tab.evaluate(() => {
        const urls: string[] = [];
        document.querySelectorAll("img[src], img[srcset]").forEach((img) => {
          urls.push((img as HTMLImageElement).src);
          const srcset = (img as HTMLImageElement).srcset;
          if (srcset) {
            srcset.split(",").forEach((s) => {
              const u = s.trim().split(" ")[0];
              if (u) urls.push(u);
            });
          }
        });
        document.querySelectorAll("script[src]").forEach((s) => {
          urls.push((s as HTMLScriptElement).src);
        });
        document.querySelectorAll("link[href]").forEach((l) => {
          const href = (l as HTMLLinkElement).href;
          try {
            if (/\.[a-z0-9]+$/i.test(new URL(href).pathname)) urls.push(href);
          } catch {}
        });
        for (const sheet of Array.from(document.styleSheets)) {
          try {
            for (const rule of Array.from(sheet.cssRules)) {
              const cssText = rule.cssText;
              const matches = cssText.match(/url\(["']?([^"')]+)["']?\)/g);
              if (matches) {
                matches.forEach((m) => {
                  const u = m.replace(/url\(["']?([^"')]+)["']?\)/, "$1");
                  urls.push(new URL(u, location.href).toString());
                });
              }
            }
          } catch {}
        }
        return urls;
      });

      for (const assetUrl of pageAssets) {
        try {
          const u = new URL(assetUrl);
          if (u.origin === baseOrigin && /\.[a-z0-9]+$/i.test(u.pathname)) {
            assetUrls.add(assetUrl);
          }
        } catch {}
      }

      html = rewriteHtmlAssets(html, baseOrigin);

      const htmlPath = join(workDir, fileName);
      mkdirSync(dirname(htmlPath), { recursive: true });
      writeFileSync(htmlPath, html, "utf-8");
      pageFiles.push({ path: fileName, content: Buffer.from(html, "utf-8") });
      scrapedPageUrls.push(pageUrl);
    };

    const CONCURRENCY = 4;
    let cursor = 0;
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        const tab = await context.newPage();
        try {
          while (cursor < queue.length) {
            const pageUrl = queue[cursor++];
            try {
              await scrapeOne(tab, pageUrl);
            } catch (pageErr) {
              console.warn(`Page scrape failed: ${pageUrl}`, pageErr);
            }
          }
        } finally {
          await tab.close();
        }
      })
    );

    const assetFiles: ScrapedFile[] = [];
    const assetUrlArray = Array.from(assetUrls);
    const BATCH_SIZE = 10;
    for (let i = 0; i < assetUrlArray.length; i += BATCH_SIZE) {
      const batch = assetUrlArray.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (assetUrl) => {
          const response = await page.request.get(assetUrl, { timeout: 8000 });
          if (!response.ok()) {
            console.warn(`Asset download failed ${response.status()}: ${assetUrl}`);
            return null;
          }
          const buffer = await response.body();
          if (!buffer || buffer.length === 0) return null;

          const u = new URL(assetUrl);
          const assetPath = u.pathname.replace(/^\//, "");
          const assetFilePath = join(workDir, assetPath);
          mkdirSync(dirname(assetFilePath), { recursive: true });
          writeFileSync(assetFilePath, buffer);
          return { path: assetPath, content: buffer } as ScrapedFile;
        })
      );
      for (const r of results) {
        if (r.status === "fulfilled" && r.value) {
          assetFiles.push(r.value);
        }
      }
    }

    await browser.close();

    const seoOrigin = options.canonicalOrigin || baseOrigin;
    const seoFiles: ScrapedFile[] = [
      {
        path: "robots.txt",
        content: Buffer.from(buildRobotsTxt(seoOrigin), "utf-8"),
      },
      {
        path: "sitemap.xml",
        content: Buffer.from(buildSitemapXml(seoOrigin, scrapedPageUrls), "utf-8"),
      },
      {
        path: "_headers",
        content: Buffer.from(buildHeadersFile(), "utf-8"),
      },
      {
        path: "_redirects",
        content: Buffer.from(buildRedirectsFile(), "utf-8"),
      },
    ];

    const allFiles: ScrapedFile[] = [...pageFiles, ...assetFiles, ...seoFiles];
    rmSync(workDir, { recursive: true, force: true });

    return {
      files: allFiles,
      contentHash: computeHash(allFiles),
    };
  } catch (err) {
    try {
      await browser.close();
    } catch {}
    rmSync(workDir, { recursive: true, force: true });
    throw err;
  }
}

// Keep local preview helper available for tests / future use
export { startLocalServer };
