/**
 * Crawl Practika's public product pages (supplier import agreed with Practika).
 * The site renders client-side, so pages are loaded in headless Chromium
 * (`pnpm exec playwright-core install chromium-headless-shell` once).
 *
 * Output: ingest/.cache/web/practika/products.json (page text, section, subcategory, photo URLs)
 * and the photos in ingest/.cache/web/practika/img/. Photos are only used to draw our own
 * sketches; they are never published. Re-running skips products already fetched.
 *
 * Usage: pnpm crawl:practika
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

import { chromium, type Page } from "playwright-core";

const BASE = "https://www.practika.com";
const OUT = "ingest/.cache/web/practika";
const DELAY_MS = 800; // be polite: one page at a time with a pause

type Product = {
  url: string;
  name: string;
  unit: string; // top-level group, e.g. SEATING
  subcategory: string; // e.g. Office Chairs
  text: string;
  images: string[]; // local file names under img/
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const HEX_ID = /\/[0-9a-f]{24}(\?.*)?$/;
const DETAIL = /\/%E0%B8%A3%E0%B8%B2%E0%B8%A2%E0%B8%A5%E0%B8%B0%E0%B9%80%E0%B8%AD%E0%B8%B5%E0%B8%A2%E0%B8%94\/[^/]+:!/; // /รายละเอียด/<name>:!<id>
const NOT_CATALOGUE = /CONTACT_US|DOWNLOAD|%E0%B8%A3%E0%B8%B2%E0%B8%A2/;

async function open(page: Page, url: string, ready?: (text: string) => boolean) {
  for (let attempt = 1; ; attempt++) {
    try {
      if (ready) {
        // Product pages: continue once the spec text has rendered instead of waiting for every image.
        await page.goto(url, { waitUntil: "load", timeout: 90_000 });
        await page.waitForFunction(`(${ready.toString()})(document.body.innerText)`, undefined, { timeout: 30_000 }).catch(() => {});
        await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
      } else {
        await page.goto(url, { waitUntil: "networkidle", timeout: 90_000 });
        await page.waitForTimeout(1200);
      }
      return;
    } catch (e) {
      if (attempt >= 3) throw e;
      await sleep(3000 * attempt);
    }
  }
}

async function links(page: Page) {
  return page.$$eval("a[href]", (as) => as.map((a) => ({ href: (a as HTMLAnchorElement).href, text: (a as HTMLElement).innerText.trim() })));
}

async function main() {
  mkdirSync(`${OUT}/img`, { recursive: true });
  const file = `${OUT}/products.json`;
  const done: Product[] = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
  const seen = new Set(done.map((p) => p.url.split("?")[0]));

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  // 1. Product groups linked from the products landing page
  await open(page, `${BASE}/PRODUCTS/PRODUCTS`);
  const units = [...new Map(
    (await links(page))
      .filter((l) => HEX_ID.test(l.href) && !NOT_CATALOGUE.test(l.href))
      .map((l) => [l.href, decodeURIComponent(l.href.split("/")[3]).replace(/_Und_/g, " ").replace(/_Amp_/g, "&").replace(/_/g, " ").trim()]),
  )];
  console.log(`groups: ${units.map(([, n]) => n).join(", ")}`);

  // 2. Subcategories of each group, then every listing page of each subcategory
  const queue: { url: string; name: string; unit: string; subcategory: string }[] = [];
  for (const [unitUrl, unit] of units) {
    await open(page, unitUrl);
    await sleep(DELAY_MS);
    const unitLinks = await links(page);
    const subs = [...new Map(unitLinks.filter((l) => HEX_ID.test(l.href) && !NOT_CATALOGUE.test(l.href) && l.href !== unitUrl).map((l) => [l.href.split("?")[0], l]))].map(([, l]) => l);
    // Some groups list products directly instead of subcategories.
    const targets = subs.length ? subs : [{ href: unitUrl, text: unit }];
    for (const sub of targets) {
      const subName = decodeURIComponent(sub.href.split("/")[3]).replace(/_Und_/g, " ").replace(/_Amp_/g, "&").replace(/_/g, " ").replace(/\s+/g, " ").trim();
      for (let pg = 1; pg <= 30; pg++) {
        await open(page, pg === 1 ? sub.href : `${sub.href.split("?")[0]}?pg=${pg}`);
        await sleep(DELAY_MS);
        const found = (await links(page)).filter((l) => DETAIL.test(l.href) && l.text && !/DOWNLOAD/i.test(l.text));
        const fresh = found.filter((l) => !queue.some((q) => q.url.split("?")[0] === l.href.split("?")[0]));
        for (const l of fresh) queue.push({ url: l.href, name: l.text, unit, subcategory: subName });
        if (!fresh.length) break;
      }
      console.log(`  ${unit} / ${subName}: ${queue.filter((q) => q.subcategory === subName).length}`);
    }
  }
  console.log(`products found: ${queue.length}`);

  // 3. Each product page: text and photos (three tabs at a time)
  const todo = queue.filter((q) => !seen.has(q.url.split("?")[0]));
  const tabs = await Promise.all([1, 2, 3].map(() => browser.newPage({ viewport: { width: 1400, height: 900 } })));
  await Promise.all(tabs.map(async (tab) => {
    for (let item = todo.shift(); item; item = todo.shift()) {
      try {
        await fetchProduct(tab, item);
      } catch (e) {
        console.log(`  ✗ ${item.name}: ${(e as Error).message.split("\n")[0]}`);
      }
    }
  }));
  await browser.close();
  console.log(`saved ${done.length} products → ${file}`);

  async function fetchProduct(page: Page, item: (typeof queue)[number]) {
    await open(page, item.url, (t) => t.includes("เรื่องน่าสนใจ") || t.includes("Dimension"));
    await sleep(DELAY_MS);
    const { text, imgs } = await page.evaluate(() => ({
      text: document.body.innerText,
      imgs: [...document.querySelectorAll("img")]
        .filter((i) => i.naturalWidth >= 300 && i.naturalHeight >= 250)
        .map((i) => i.currentSrc || i.src)
        .filter((s) => /itopfile\.com\/ImageServer/.test(s) && !/Logo|facebook|igz|linez|ytz|tiktok|inz-|THREADS|PINTEREST/i.test(s)),
    }));
    const images: string[] = [];
    for (const src of [...new Set(imgs)]) {
      const name = createHash("sha1").update(src).digest("hex").slice(0, 16) + (src.match(/\.(jpe?g|png|webp)/i)?.[0] ?? ".jpg");
      if (!existsSync(`${OUT}/img/${name}`)) {
        const res = await fetch(src);
        if (!res.ok) continue;
        writeFileSync(`${OUT}/img/${name}`, Buffer.from(await res.arrayBuffer()));
      }
      images.push(name);
    }
    done.push({ ...item, text, images });
    seen.add(item.url.split("?")[0]);
    writeFileSync(file, JSON.stringify(done, null, 1)); // checkpoint after every product
    console.log(`  ✓ ${item.name} (${images.length} photos)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
