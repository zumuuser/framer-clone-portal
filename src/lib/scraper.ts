import { chromium } from "playwright";
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
  screenshots: { live: Buffer; local: Buffer };
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
  // Fix malformed srcset: "image.png 512w?query=... 512w" -> "image.png?query=... 512w"
  return html.replace(
    /(\.(?:png|jpg|jpeg|gif|webp)) (\d+w)\?([^\s,]+) \2/g,
    "$1?$3 $2"
  );
}

async function startLocalServer(siteDir: string, port: number): Promise<ReturnType<typeof createServer>> {
  const server = createServer((req, res) => {
    let rel = decodeURIComponent(req.url || "/").split("?")[0];
    if (rel.endsWith("/")) rel += "index.html";
    const filePath = join(siteDir, rel);

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
  const workDir = join(process.cwd(), "tmp", `scrape-${Date.now()}`);
  mkdirSync(workDir, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    // 1. Navigate and wait for full hydration
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);

    // Capture live screenshot
    const liveScreenshot = await page.screenshot({ fullPage: true });

    // 2. Discover all pages (look for links to other pages on same domain)
    const discoveredUrls = new Set<string>();
    discoveredUrls.add(url);

    const links = await page.evaluate((baseDomain) => {
      const hrefs: string[] = [];
      document.querySelectorAll("a[href]").forEach((a) => {
        const href = (a as HTMLAnchorElement).href;
        try {
          const u = new URL(href);
          if (u.hostname === baseDomain && !u.hash) {
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
    const pageFiles: { path: string; content: Buffer }[] = [];
    const assetUrls = new Set<string>();

    for (const pageUrl of discoveredUrls) {
      await page.goto(pageUrl, { waitUntil: "networkidle" });
      await page.waitForTimeout(2000);

      const pathname = new URL(pageUrl).pathname;
      const fileName = pathname === "/" ? "index.html" : pathname.replace(/^\//, "").replace(/\/$/, ".html") + (pathname.includes(".") ? "" : ".html");
      const htmlPath = join(workDir, fileName);
      mkdirSync(dirname(htmlPath), { recursive: true });

      let html = await page.content();
      html = fixSrcset(html);

      // Extract asset URLs from this page
      const pageAssets = await page.evaluate(() => {
        const urls: string[] = [];
        // Images
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
        // Scripts
        document.querySelectorAll("script[src]").forEach((s) => {
          urls.push((s as HTMLScriptElement).src);
        });
        // Links (CSS, preloads)
        document.querySelectorAll("link[href]").forEach((l) => {
          urls.push((l as HTMLLinkElement).href);
        });
        // CSS background images and font-face URLs
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
          if (u.origin === new URL(url).origin) {
            assetUrls.add(assetUrl);
          }
        } catch {}
      }

      writeFileSync(htmlPath, html, "utf-8");
      pageFiles.push({ path: fileName, content: Buffer.from(html, "utf-8") });
    }

    // 4. Download all discovered assets
    const assetFiles: { path: string; content: Buffer }[] = [];
    for (const assetUrl of assetUrls) {
      try {
        const response = await page.goto(assetUrl, { waitUntil: "domcontentloaded" });
        if (!response) continue;

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

    // 5. Validate by serving locally and screenshotting
    const port = 9876 + Math.floor(Math.random() * 1000);
    const server = await startLocalServer(workDir, port);

    const validateBrowser = await chromium.launch();
    const validatePage = await validateBrowser.newPage({ viewport: { width: 1440, height: 900 } });
    await validatePage.goto(`http://localhost:${port}/`, { waitUntil: "networkidle" });
    await validatePage.waitForTimeout(3000);
    const localScreenshot = await validatePage.screenshot({ fullPage: true });
    await validateBrowser.close();
    server.close();

    // 6. Build final file list
    const allFiles: ScrapedFile[] = [...pageFiles, ...assetFiles];

    // 7. Cleanup temp dir
    rmSync(workDir, { recursive: true, force: true });

    return {
      files: allFiles,
      contentHash: computeHash(allFiles),
      screenshots: { live: liveScreenshot, local: Buffer.from(localScreenshot) },
    };
  } catch (err) {
    await browser.close();
    rmSync(workDir, { recursive: true, force: true });
    throw err;
  }
}
