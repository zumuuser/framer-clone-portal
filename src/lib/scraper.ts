import { chromium as playwright } from "playwright-core";
import { createServer } from "http";
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join, dirname, extname } from "path";
import { createHash } from "crypto";

export interface ScrapedFile {
  path: string;
  content: Buffer;
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
};

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
  // Rewrite absolute asset URLs to relative paths
  const assetRe = new RegExp(
    `(["'(])${baseOrigin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(/[^"')\\s]+)`,
    "g"
  );
  return html.replace(assetRe, "$1$2");
}

async function startLocalServer(siteDir: string, port: number): Promise<ReturnType<typeof createServer>> {
  const server = createServer((req, res) => {
    let rel = decodeURIComponent(req.url || "/").split("?")[0];
    if (rel.endsWith("/")) rel += "index.html";
    // Try adding .html for clean paths
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

export async function scrapeFramerSite(domain: string): Promise<ScrapeResult> {
  const url = domain.startsWith("http") ? domain : `https://${domain}`;
  const baseOrigin = new URL(url).origin;
  const workDir = join("/tmp", `scrape-${Date.now()}`);
  mkdirSync(workDir, { recursive: true });

  let browser;
  if (process.env.VERCEL) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const chromium = require("@sparticuz/chromium");
    if (typeof chromium.setGraphicsMode === 'function') {
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
    // 1. Navigate and wait for full hydration
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);

    // 2. Discover all pages
    const discoveredUrls = new Set<string>();
    discoveredUrls.add(url);

    const links = await page.evaluate((baseDomain) => {
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

    // 3. Scrape each page
    const pageFiles: ScrapedFile[] = [];
    const assetUrls = new Set<string>();
    const assetPathMap = new Map<string, string>(); // url -> local path

    for (const pageUrl of discoveredUrls) {
      await page.goto(pageUrl, { waitUntil: "networkidle" });
      await page.waitForTimeout(2000);

      const pathname = new URL(pageUrl).pathname;
      const fileName = pathname === "/"
        ? "index.html"
        : pathname.replace(/^\//, "").replace(/\/$/, "") + (pathname.includes(".") ? "" : ".html");
      const htmlPath = join(workDir, fileName);
      mkdirSync(dirname(htmlPath), { recursive: true });

      let html = await page.content();
      html = fixSrcset(html);

      // Extract asset URLs
      const pageAssets = await page.evaluate(() => {
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
          urls.push((l as HTMLLinkElement).href);
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
          if (u.origin === baseOrigin) {
            assetUrls.add(assetUrl);
            assetPathMap.set(assetUrl, u.pathname.replace(/^\//, ""));
          }
        } catch {}
      }

      // Rewrite HTML to use relative asset paths
      html = rewriteHtmlAssets(html, baseOrigin);

      writeFileSync(htmlPath, html, "utf-8");
      pageFiles.push({ path: fileName, content: Buffer.from(html, "utf-8") });
    }

    // 4. Download all discovered assets using request API (reliable for binary)
    const assetFiles: ScrapedFile[] = [];
    for (const assetUrl of assetUrls) {
      try {
        const response = await page.request.get(assetUrl);
        if (!response.ok()) {
          console.warn(`Asset download failed ${response.status()}: ${assetUrl}`);
          continue;
        }

        const buffer = await response.body();
        if (!buffer || buffer.length === 0) continue;

        const u = new URL(assetUrl);
        const assetPath = u.pathname.replace(/^\//, "");
        const assetFilePath = join(workDir, assetPath);
        mkdirSync(dirname(assetFilePath), { recursive: true });
        writeFileSync(assetFilePath, buffer);

        assetFiles.push({ path: assetPath, content: buffer });
      } catch (err) {
        console.warn(`Failed to download asset: ${assetUrl}`, err);
      }
    }

    await browser.close();

    // 5. Build final file list
    const allFiles: ScrapedFile[] = [...pageFiles, ...assetFiles];

    // 6. Cleanup temp dir
    rmSync(workDir, { recursive: true, force: true });

    return {
      files: allFiles,
      contentHash: computeHash(allFiles),
    };
  } catch (err) {
    try { await browser.close(); } catch {}
    rmSync(workDir, { recursive: true, force: true });
    throw err;
  }
}
