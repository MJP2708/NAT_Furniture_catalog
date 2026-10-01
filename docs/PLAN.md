# NAT Furniture — E-Catalog Plan

Status: **phases 1–4 partly done**. 1,750 products from 7 suppliers in Neon (PDF spec sheets + Practika website + Thai Taiyo catalogues); public site TH/EN with filters, spec pages and printable sheets; `/admin` editor; e-catalogue PDF. Next: photo search, dealer area.
Stack: Next.js (App Router, TypeScript) + Neon Postgres. **Constraint: no paid services for now.** Everything runs on free tiers or on our own machine.

## Decisions so far

| Topic | Decision |
|---|---|
| Brands | *(changed 2026-09-28)* Products are shown as NAT's catalog: supplier brands are hidden on public pages and kept in the database/admin. Never claim NAT manufactures them |
| Images | Line sketches generated from the supplier photos (`nat_ingest.sketch`), not the photos themselves. Exploded views later, per product |
| Editing | Specs are editable in `/admin`; edited products are skipped by future imports |
| Audience | **Both** the public and dealers/sales staff. Public catalog open to all; dealer area behind login |
| Language | **Thai first** (default `/`), English switchable (`/en`) |
| Paid services | None. Local OCR, a local/in-browser AI model, free-tier hosting |

---

## 1. What we're building

1. **Browse**: clear categories, filters, and product pages that put the spec sheet up front.
2. **Search by photo**: upload or take a photo → the matching product opens with its full specification, plus close alternatives.
3. **Search by text**: product code (`FG 1`, `PUMA-CN-R`), name, or Thai/English keywords.
4. **Dealer area** (login): extras for sales staff. See §4.3.

---

## 2. Source data audit (`/run/media/matthew/My Passport/Spec AI/SPEC PERFECT/`)

| Brand folder | Files | Notes |
|---|---|---|
| PERFECT | 372 PDF | Office (chairs, desks, storage, workstations) |
| mono | 470 PDF, 4 JPG | Office + sofas. Includes **price sheets** (`ราคาโปรโมชั่น…`, `ราคาตั้ง…`) |
| PATARA | 119 PDF, 8 JPG, 1 XLSX | Sofas, lounge, tables, bedding |
| MASS-MONO | 39 PDF, 8 JPG | Recliners, beds, sofas, home |
| mobelle | 7 PDF | Sofa beds, small living pieces |
| **Total** | **~1,007 PDF, 20 JPG, 1 XLSX** | |

**Format:** almost all are 1-page A4 spec sheets with the same layout: logo and company header, one or two product photos, then `label : value` rows: `ประเภทสินค้า` (type), `รหัสสินค้า` (code), `ขนาด` (W×D×H, sometimes several size sets), `รายละเอียดในการผลิต` (construction rows), `ลักษณะพิเศษ` (features), `หมายเหตุ` (tolerance).

**Problems the import has to handle:**
- **Corrupted Thai text layer.** Excel-exported PDFs map `า`→`ำ` ("ขนำด"); PScript ones drop tone marks ("เกาอี"). Digits and Latin text survive intact.
- **Mixed units** (cm, mm, one typo that says metres) and ranges (`สูง 43-76.5`). Normalize to mm with min/max.
- **Free-text product types**, hundreds of variants. These are mapped onto our category tree.
- **Variant families** (`PILOT-H/-M/-C`, `POF-A89 BLACK FRAME / WHITE FRAME…`, `TFP-1560M-HPL/-ML`). Grouped into one product with variants.
- **Duplicates** (`TESLA 1202-60(1).pdf`; `violet` and `MUNICH` appear under two brands; some JPGs are scans of spec sheets).
- **Multi-product PDFs** (`CARIVER TABLES.pdf` 16 pages, `CORON.pdf`, `CRN-1212.pdf` 7 pages…) and blank overflow pages.
- **4 scanned PDFs** (the price sheets) with no text layer.
- **Low-resolution photos** (about 350–1000 px, product on white). Fine for cards and photo search; weak for large zoom.

---

## 3. Free-only architecture

```
Browser ──────────────────────────────────────────────────────────────┐
  • Next.js pages (Server Components)                                  │
  • Photo search: CLIP image model runs IN THE BROWSER (transformers.js)│
      photo → embedding (512 numbers) ──► POST /api/visual-search ─────┤
                                                                       ▼
Next.js server (route handlers) ─────────────► Neon Postgres (free plan)
                                                 ├─ products / variants / specs
                                                 ├─ pgvector: image embeddings (HNSW)
                                                 ├─ pg_trgm: code + Thai text search
                                                 └─ Neon Auth: dealer logins
Product images ◄── free object storage (see 3.4)
Ingestion CLI (runs on our machine, free) ── PDFs → OCR + parsing → images + JSON → DB
```

**Libraries (all free and open source):** Next.js · TypeScript · Tailwind CSS v4 · shadcn/ui (restyled) · Drizzle ORM + `@neondatabase/serverless` · pgvector · `next-intl` · Zod · `sharp` · `@huggingface/transformers` (transformers.js) · Tesseract OCR · PyThaiNLP (dictionary repair).

### 3.1 Spec extraction: free, runs locally

Replaces the vision-LLM idea. Three signals, merged per field:

1. **PDF text layer** (`pdftotext -layout`): accurate for **codes, numbers, and English**, and it gives the `label : value` structure.
2. **Tesseract OCR with Thai** (`tha+eng`, 300 dpi render): gets the **Thai vowels right** where the text layer is broken. A test on `mobelle/LEONARD.pdf` read "ขนาด", "จาก", "สำหรับ" correctly. It made small errors on some words ("ลึก"→"AN", "และ"→"waz"), which the text layer has right.
3. **Thai dictionary repair** (PyThaiNLP): for each Thai word, choose between the text-layer and OCR versions (and `า`↔`ำ` swaps) by picking the spelling that is a real dictionary word. Labels come from a fixed known list (`ประเภทสินค้า`, `ขนาด`, `โครงขา`, …), so they're matched, not guessed.

Other steps:
- **Images:** PyMuPDF extracts the embedded photos (upright, in reading order; photos stored as strips are stitched back together). Logos are dropped by size and aspect ratio and by matching the known brand-logo hashes. Pillow trims borders and outputs WebP at 2 sizes (1200 px and 480 px).
- **Categories:** keyword rules on `ประเภทสินค้า` (e.g. contains `เก้าอี้สำนักงาน` + `พนักพิงสูง` → Office chairs / High-back). The rules file is editable and versioned.
- **Variants and duplicates:** grouped by code stem plus a check that images look alike (same embedding model as photo search).
- **Output:** `data/extracted/*.json` (reviewable in git) plus a **review report** (HTML) listing low-confidence fields, unmapped types, and duplicates. After review, the seed script upserts into Neon. Re-runnable and idempotent (keyed by brand + code).
- *Optional fallback for the hardest pages* (multi-product and scanned files): a local vision model through **Ollama** (already installed; free but slow on CPU, so only for the few files the rules can't handle), or manual entry through the admin page.

### 3.2 Photo search: free, CLIP in the browser

- **Model:** open-source CLIP (ViT-B/32, MIT licence; the benchmark will also try SigLIP-base and MobileCLIP) in ONNX format through **transformers.js**.
- **Index time (our machine):** the ingestion script embeds every product image with the same model in Node and stores the vectors in pgvector.
- **Query time (the visitor's browser):** the model is downloaded **only when the camera/upload button is tapped** (quantized, roughly 20–90 MB depending on the model; the browser caches it after the first use). The photo is embedded on the device, and only the 512 numbers are sent to our API. **No server cost, and the photo never leaves the user's phone.** WebGPU is used where available, with a WASM fallback.
- **Flow:** photo → optional crop ("which piece?") → `ORDER BY embedding <=> $q LIMIT 24` → collapsed to one result per product.
  - A confident top match (above a threshold tuned on real photos) → the **spec card** opens right away (photo, code, dimensions, materials, "View full spec").
  - Otherwise → "Closest matches" grid.
- **Benchmark before committing:** about 30 phone photos of real showroom pieces → measure top-1/top-5 accuracy for each candidate model, and pick the best size-vs-accuracy trade-off.
- Limitation: CLIP's text side is English-only, so "describe it in words" search uses normal text search, not CLIP.

### 3.3 English content: free

- **UI text:** fully translated by hand (a small set of strings).
- **Spec labels and common material terms:** a **TH→EN glossary** (~200–300 terms: `โครงขา`→Leg frame, `ฟองน้ำ`→foam, `หนังเทียม`→PU leather, …). The spec sheets repeat the same phrasing constantly, so the glossary covers most rows.
- **Remaining free text** (features, long notes): translated once with a **local Ollama model** (free, runs overnight on CPU), then spot-checked. Any field without an English version falls back to Thai with a small "TH" marker.

### 3.4 Hosting on free tiers

| Piece | Free option | Note |
|---|---|---|
| Database | Neon Free plan | 0.5 GB is plenty (~1k products; vectors ≈ 6 MB) |
| Dealer login | Neon Auth (included with Neon) | Email/password + invite-only dealer accounts |
| App hosting | Netlify free or Cloudflare (OpenNext); decided at deploy time | **Vercel Hobby forbids commercial use**, so it's avoided for production |
| Images | Cloudflare R2 free (10 GB, no egress fees) or Neon Object Storage if the free plan covers it | ~1k products × 2–3 photos × 3 sizes WebP ≈ 150–250 MB |

Development runs fully locally (`pnpm dev` against a Neon dev branch).

---

## 4. Information architecture

### 4.1 Category tree (finalized after extraction shows the real distribution)

- **สำนักงาน / Office**: Office chairs (high / mid / low back, mesh) · Visitor & stacking chairs · Desks & workstations (straight, L-shape, corner) · Executive desks · Meeting & conference tables · Multipurpose & folding tables · Storage (pedestals, cabinets, side-boards, lockers) · Counters & reception
- **ห้องนั่งเล่น / Living**: Sofas (1/2/3-seat, L-shape) · Sofa beds · Recliners · Armchairs & lounge · Coffee & side tables · Stools & ottomans
- **ห้องอาหาร / Dining**: Dining tables · Dining chairs · Bar stools
- **ห้องนอน / Bedroom**: Beds · Mattresses & bedding · Bedside & storage

**Facets:** brand · series · material (mesh, PU leather, fabric, melamine, HPL, steel, solid wood) · colour · W/D/H ranges · features (adjustable height, stackable, foldable, reclining, electric).

### 4.2 Sitemap (Thai at `/`, English at `/en/…`)

| Route | Purpose |
|---|---|
| `/` | Home: search bar with a camera button, space tiles, brand strip, featured series, new items |
| `/c/[...slug]` | Category listing: facets (drawer on mobile), sort, grid with a density toggle |
| `/p/[slug]` | Product: gallery, **spec block** (SVG dimension diagram + construction table), variants, similar items, printable spec sheet, share |
| `/search?q=` | Text/code search + facets |
| `/visual-search` | Camera/upload → crop → spec card + matches |
| `/brands`, `/brands/[brand]`, `/series/[series]` | Brand and series pages with brand logos |
| `/compare` | Up to 4 products side by side (phase 5) |
| `/dealer/*` | Dealer area (login) |
| `/admin/*` | Edit products, fix categories, review the import, manage dealer accounts |

### 4.3 Public vs dealer

| Feature | Public | Dealer |
|---|---|---|
| Browse, specs, photo search, printable spec sheet | ✓ | ✓ |
| "Ask about this product" (LINE / phone / form) | ✓ | — |
| Prices (dealer / showroom) | — | ✓ *(if approved; see open questions)* |
| Quote list: add items, set quantities, export PDF/Excel | — | ✓ |
| Download original spec PDFs in bulk | — | ✓ |

---

## 5. Data model (Drizzle, sketch)

```
brands(id, slug, name, logo_url)
categories(id, parent_id, slug, name_th, name_en, sort)
series(id, brand_id, slug, name)
products(id, brand_id, series_id, category_id, slug, code, name,
         type_raw_th, summary_th, summary_en, features jsonb,
         width_mm_min, width_mm_max, depth_mm_min, depth_mm_max, height_mm_min, height_mm_max,
         dimensions jsonb,        -- all size sets, e.g. {sofa:{…}, bed:{…}}
         specs jsonb,             -- [{label_th,label_en,value_th,value_en}]
         tolerance_note, source_file, extraction_confidence, status, created_at, updated_at)
product_variants(id, product_id, code, label, color, material, dims jsonb)
product_images(id, product_id, variant_id, url, width, height, role, sort, embedding vector(512))
product_tags(product_id, tag)
prices(variant_id, tier ['dealer','showroom'], amount_thb, valid_from)     -- dealer-only
quotes / quote_items                                                       -- dealer quote lists
```

Search: `pg_trgm` on code, name, and Thai text (handles `FG1`/`FG 1`/`fg-1`, and Thai, which Postgres full-text search can't segment well) plus a `tsvector` for the English fields.

---

## 6. Design direction ("NAT style")

References (Modernform, Perfect) are for **patterns only**.

- **Spec-first product pages.** The dimension diagram and material list sit beside the photo, not hidden in a tab.
- **Camera search is part of the main search bar.**
- Calm, gallery-like layout: warm off-white canvas, generous whitespace, uniform light product tiles (to blend with the white-background photos), restrained colour so the furniture leads. Brand logos appear as a quiet brand strip and on product pages, while NAT stays the main identity.
- **Thai-first typography:** e.g. *IBM Plex Sans Thai* / *Noto Sans Thai* (free, Google Fonts) for body and specs, with correct Thai line height (no clipped vowels or tone marks); a Latin display face for headings; tabular numerals for dimensions.
- Line-icon set for categories and facets; SVG W/D/H diagram generated from data for every product.
- **NAT tokens** (logo, colours, fonts) are CSS variables. If NAT has no brand guide, I'll propose 2–3 options on a style tile.

Before building pages: a **style tile + 3 key screens** (home, category, product/photo-search result) for sign-off.

---

## 7. Phases

| # | Phase | Output | Done when |
|---|---|---|---|
| 0 | **Data extraction** | OCR + parsing scripts, `data/extracted/*.json`, images, review report | ≥95% of spec PDFs have correct code + type + dims; flagged rows reviewed |
| 1 | **Foundation** | Next.js scaffold, Neon project + dev/prod branches, Drizzle schema + migrations, seed, image upload | Products queryable in Neon |
| 2 | **Design** | Style tile, tokens, 3 key screens | Signed off by NAT |
| 3 | **Browse** | Home, category tree, facets, product page, TH/EN, brand pages | Every product reachable in ≤3 clicks; Lighthouse ≥90 on mobile |
| 4 | **Search** | Text/code search, then in-browser photo search + model benchmark | Code search exact; photo search top-5 meets the target on the real-photo test set |
| 5 | **Dealer + extras** | Neon Auth login, quote list, printable spec sheets, compare, SEO, admin | — |

---

## 8. Still open

1. **Prices:** may dealers see the prices from the `mono` price sheets, and do other brands have price lists? (Default: no prices anywhere until confirmed.)
2. **Brand assets:** NAT logo, colours, fonts? Higher-resolution product photos or lifestyle shots?
3. **Showroom photos:** can someone take about 30 phone photos of real pieces for the photo-search benchmark?
4. **Updates:** who adds new products later: staff through `/admin`, or a developer re-running the import?
5. **Contact channel** for the public "Ask about this product" button: LINE OA, phone, email form?

### Running it
- `cd ingest && uv run python -m nat_ingest.build` → `data/extracted/{catalog,categories,brands}.json` + `public/media/`
- `pnpm db:migrate` (direct/unpooled URL) then `pnpm db:seed` (idempotent, keyed by slug)
- `pnpm dev`
- Web suppliers (imports agreed with each supplier; images are only used to draw our sketches):
  - Practika: `pnpm crawl:practika` (headless Chromium; `pnpm exec playwright-core install chromium-headless-shell` once) → `ingest/.cache/web/practika/`.
  - Thai Taiyo: catalogue PDFs from thaitaiyo.co.th in `ingest/.cache/web/thaitaiyo/pdf/`, then `cd ingest && uv run python -m nat_ingest.web_thaitaiyo ocr` (Tesseract eng+tha, models in `.cache/tessdata`). Products with an unreadable category are flagged `category-guessed` and hidden until reviewed in `/admin`; code-family guesses are flagged `category-from-code`.
  - Both are merged by `python -m nat_ingest.build`.
- English: every page exists under `/en`; untranslated Thai text shows with a small "TH" marker.
- Spec sheets: `/sheet/{th|en}/<slug>` is an exact one-page A4 sheet (letterhead, drawing, dimension table, materials, features, description, QR code to the live page). An auto-fit step scales type and drawing between 58% and 135% so every product fills exactly one page; "Save as PDF" in the print dialog gives the file (`?print=1` opens the dialog).
- Two sites from one codebase and database: the main catalogue (line drawings, `/admin`) and the customer site, built with `SITE_VARIANT=customer` (original product photos from `public/media/photo/`, photo edition `e-catalogue-photo.pdf`, `/admin` redirected away and admin actions refused). Deploy the customer site as a second Vercel project from the same repo with that variable set. Locally: `pnpm dev:customer`.
- NAT's own spec documents (Word .docx, `/run/media/matthew/My Passport/New folder`, override with `NAT_DOCS`) are imported by `nat_ingest.web_natdocs` as brand "nat" (1,065 products). 14 old `.doc` files are skipped (listed in `ingest/.cache/web/natdocs/skipped.json`).
- Images and catalogue PDFs live in Neon Object Storage, bucket `nat-media` (`cd ingest && uv run python -m nat_ingest.upload` syncs `public/media` and the PDFs; only changed files go up). The bucket is private; the site serves files through its `/media/[...path]` route using the `AWS_*` credentials (set them in each Vercel project).
- Photo search (`/visual-search`, camera icon in every search box): CLIP ViT-B/32 (q8) runs in the visitor's browser (≈90 MB once, then cached; WebGPU when a GPU adapter exists, else WebAssembly). Only the 512-number vector goes to `POST /api/visual-search`, which searches `product_images.embedding` (HNSW, cosine) and returns one result per product. After adding products/images run `pnpm embed:images` (embeds the product photos; only missing vectors). Held-out test on 120 unseen Practika photos: top-1 43%, top-5 62%, top-24 80% — still to benchmark on ~30 real showroom phone photos.
- Word spec sheet: `/sheet/{th|en}/<slug>/docx` builds an editable one-page A4 .docx on demand (docx + sharp; Tahoma/Arial so Thai renders in Word on Windows and macOS). Dense products get smaller type and drawing to stay on one page. Linked from the product page, the sheet page and the admin editor.
- Branding: the company letterhead (`public/brand/letterhead.jpg`) heads the PDF and Word spec sheets and the e-catalogue cover and back cover; the logo cropped from it (`public/brand/logo.png`, `components/logo.tsx`) replaces the text mark in the site header, footer and admin.
- Materials: case goods carry a main material, steel or wood (`products.material`, set on import by `lib/material.ts`; seating and sofas get none). Staff can change it in the admin editor. Category pages show material tabs (`/c/<slug>/<steel|wood>`), `/material/<steel|wood>` lists every steel or wooden product by category, and the home page has a "browse by material" section. `pnpm db:materials` recomputes the field for products nobody has edited.
- `pnpm catalog:pdf` → `public/media/catalogue/e-catalogue.pdf` and `e-catalogue-photo.pdf` (uploaded to storage) (exports published products from Neon, including admin edits, then lays out the PDF with PyMuPDF; fonts in `ingest/fonts/`, OFL). Re-run after edits and commit the PDF.
- Import sanity check: size lines with a wrong unit are rescaled and flagged `dims-fixed`; values still implausible are flagged `dims-suspect` for review in `/admin`.
- `/admin` (own layout, Thai): product list with filters (status, supplier, category, import warning, not-yet-checked), paging and bulk actions (category, publish/hide/review, mark checked); review queue grouped by import warning; editor with drawings (reorder/remove), source link, TH/EN preview and "save and next"; category names/order; add product (no image upload until object storage is chosen). Any staff change sets `edited_at`, which removes the product from the queue and protects it from re-imports; category names edited in admin are no longer overwritten by the seed.
- `/admin`: needs `ADMIN_PASSWORD` in `.env.local` and in the hosting env (unset = admin disabled). Saving sets `products.edited_at`, which makes `pnpm db:seed` leave that product (and its images) alone; clear `edited_at` to let the import overwrite it again.
- If pnpm downloads time out on this network: `NODE_OPTIONS=--dns-result-order=ipv4first pnpm install --fetch-timeout=900000`

### Setup needed on this machine (free)
- `sudo pacman -S tesseract-data-tha` (Thai OCR data)
- `pip install pythainlp` (Thai dictionary repair)
- A free Neon account/project. The Neon connector needs authorizing in Claude Code (`/mcp`), or a `DATABASE_URL` works too.
