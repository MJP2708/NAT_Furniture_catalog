import "server-only";

import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  ImageRun,
  type ISectionOptions,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import sharp from "sharp";

import type { getProduct } from "@/lib/catalog";
import { formatEnvelope, formatRange } from "@/lib/format";
import { type Lang, pick } from "@/lib/i18n";

type Product = NonNullable<Awaited<ReturnType<typeof getProduct>>>;

// Word on Windows and macOS both ship Tahoma with Thai; Arial for Latin text.
const FONT = { ascii: "Arial", hAnsi: "Arial", cs: "Tahoma", eastAsia: "Tahoma" };
const INK = "231F20";
const MUTED = "6F6C6A";
const ACCENT = "2B3990";
const RULE = "D6D4D1";
const PANEL = "F4F4F3";
// A4 portrait, 12 mm margins (twips: 1 mm = 56.7)
const PAGE_W = 11906;
const PAGE_H = 16838;
const MARGIN = 680;
const CONTENT_W = PAGE_W - 2 * MARGIN;

const L = {
  th: {
    title: "ใบรายละเอียดสินค้า",
    dims: "ขนาด (ซม.)",
    construction: "วัสดุและรายละเอียดการผลิต",
    features: "ลักษณะพิเศษ",
    about: "รายละเอียดสินค้า",
    overall: "ขนาดรวม",
    item: "รายการ",
    disclaimer: "ขนาดอ้างอิงจากแผ่นสเปกของผู้ผลิต อาจคลาดเคลื่อนเล็กน้อย วัสดุและสีอาจเปลี่ยนแปลงได้โดยไม่ต้องแจ้งให้ทราบล่วงหน้า",
    printed: "จัดทำเมื่อ",
    locale: "th-TH",
  },
  en: {
    title: "Specification sheet",
    dims: "Dimensions (cm)",
    construction: "Materials & construction",
    features: "Features",
    about: "About this product",
    overall: "Overall",
    item: "Item",
    disclaimer: "Sizes are from the manufacturer's specification sheet and may vary slightly. Materials and finishes may change without notice.",
    printed: "Prepared",
    locale: "en-GB",
  },
} as const;

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NO_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER };

/** Fetch a /media/... image through the site itself (public/ locally, storage in production) as PNG.
 * Going over HTTP keeps the server bundle from tracing every file under public/. */
async function loadImage(origin: string, url: string | undefined, maxPx: number) {
  if (!url) return null;
  const res = await fetch(new URL(url, origin)).catch(() => null);
  if (!res?.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  const img = sharp(buf).flatten({ background: "#ffffff" }).resize(maxPx, maxPx, { fit: "inside", withoutEnlargement: true });
  const { data, info } = await img.png().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

export async function buildSpecDocx(data: Product, lang: Lang, siteUrl: string): Promise<Buffer> {
  const l = L[lang];
  const { product: p, category, parent, images } = data;

  const type = pick(lang, p.typeTh ?? "", p.typeEn).value;
  const secondType = lang === "th" && p.typeEn && p.typeEn !== p.typeTh ? p.typeEn : null;
  const summary = pick(lang, p.summaryTh ?? "", p.summaryEn).value;
  const note = pick(lang, p.noteTh ?? "", p.noteEn).value;
  const sizes = p.sizes.filter((s) => s.mm && Object.keys(s.mm).length);
  const showDia = sizes.some((s) => s.mm!.dia);
  const specRows = p.specs.map((row) => ({
    label: pick(lang, row.label_th, row.label_en).value,
    sub: lang === "th" ? row.label_en : null,
    values: row.values_th.map((v, j) => pick(lang, v, row.values_en[j]).value),
  }));
  const features = p.featuresTh.map((f, i) => pick(lang, f, p.featuresEn[i]).value);

  // Keep it to one page: denser content gets smaller type and drawing.
  const weight =
    specRows.reduce((n, r) => n + 1 + r.values.join(" ").length / 90, 0) +
    sizes.length * 1.2 +
    features.length +
    summary.length / 110;
  const scale = weight > 34 ? 0.78 : weight > 24 ? 0.86 : weight > 16 ? 0.93 : 1;
  const pt = (n: number) => Math.round(n * scale * 2); // docx sizes are half-points
  const imgMax = Math.round((weight > 24 ? 230 : 300) * (scale > 0.9 ? 1 : 0.9));

  const run = (text: string, o: { size?: number; bold?: boolean; color?: string; caps?: boolean; spacing?: number } = {}) =>
    new TextRun({
      text,
      font: FONT,
      size: pt(o.size ?? 8.5),
      bold: o.bold,
      color: o.color ?? INK,
      allCaps: o.caps,
      characterSpacing: o.spacing,
    });
  const para = (children: TextRun[], o: { after?: number; before?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) =>
    new Paragraph({ children, spacing: { after: o.after ?? 0, before: o.before ?? 0, line: 276 }, alignment: o.align });
  const sectionTitle = (en: string, th: string) =>
    new Paragraph({
      children: [run(en, { size: 7, bold: true, caps: true, spacing: 30 }), ...(lang === "th" ? [run(`  ${th}`, { size: 7.5, color: MUTED })] : [])],
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: INK, space: 2 } },
      spacing: { before: Math.round(220 * scale), after: 80 },
    });
  const cell = (children: (Paragraph | Table)[], o: { width?: number; fill?: string; borders?: object; vAlign?: "top" | "center" | "bottom"; margins?: number } = {}) =>
    new TableCell({
      children,
      width: o.width ? { size: o.width, type: WidthType.DXA } : undefined,
      shading: o.fill ? { type: ShadingType.CLEAR, color: "auto", fill: o.fill } : undefined,
      borders: (o.borders as never) ?? NO_BORDERS,
      verticalAlign: o.vAlign,
      margins: { top: o.margins ?? 40, bottom: o.margins ?? 40, left: 60, right: 60 },
    });

  // ---- letterhead (the company letterhead image goes in the Word page header)
  const letterhead = await fetch(new URL("/brand/letterhead.jpg", siteUrl))
    .then((r) => (r.ok ? r.arrayBuffer() : null))
    .catch(() => null);
  const lhW = Math.round((CONTENT_W / 1440) * 96); // content width in px at 96 dpi
  const lhH = Math.round((lhW * 129) / 1044);
  const header = new Header({
    children: letterhead
      ? [new Paragraph({ children: [new ImageRun({ type: "jpg", data: Buffer.from(letterhead), transformation: { width: lhW, height: lhH } })] })]
      : [para([run("NAT FURNITURE CO., LTD.", { size: 12, bold: true })])],
  });
  const head = new Paragraph({
    children: [run("SPECIFICATION SHEET", { size: 7, bold: true, spacing: 30 }), ...(lang === "th" ? [run(`   ${l.title}`, { size: 7.5, color: MUTED })] : [])],
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: INK, space: 3 } },
  });

  // ---- title
  const catPath = [parent?.nameEn, category?.nameEn].filter(Boolean).join(" / ");
  const title = [
    ...(catPath ? [para([run(catPath, { size: 7, bold: true, caps: true, color: MUTED, spacing: 30 })], { before: 200 })] : []),
    para([run(p.code, { size: 24 })], { before: 40 }),
    ...(type ? [para([run(type, { size: 11 })])] : []),
    ...(secondType ? [para([run(secondType, { size: 8, color: MUTED })])] : []),
  ];

  // ---- drawing + dimensions
  const image = await loadImage(siteUrl, images[0]?.url, imgMax * 2);
  const leftW = Math.round(CONTENT_W * 0.5);
  const rightW = CONTENT_W - leftW;
  const imgW = image ? Math.min(imgMax, Math.round((imgMax * image.width) / Math.max(image.width, image.height))) : 0;
  const imgH = image ? Math.round((imgW * image.height) / image.width) : 0;
  const picture = image
    ? new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new ImageRun({ type: "png", data: image.data, transformation: { width: imgW, height: imgH } })],
      })
    : para([run("—", { color: MUTED })], { align: AlignmentType.CENTER });

  const axes = ["W", "D", "H", ...(showDia ? ["Ø"] : [])];
  const dimCellW = Math.round((rightW * 0.6) / axes.length);
  const labelW = rightW - dimCellW * axes.length;
  const rowBorder = { ...NO_BORDERS, top: { style: BorderStyle.SINGLE, size: 4, color: RULE } };
  const dimTable = sizes.length
    ? new Table({
        width: { size: rightW, type: WidthType.DXA },
        columnWidths: [labelW, ...axes.map(() => dimCellW)],
        layout: TableLayoutType.FIXED,
        borders: NO_BORDERS,
        rows: [
          new TableRow({
            children: [
              cell([para([run(sizes.length > 1 ? l.item : "", { size: 6.5, color: MUTED })])], { width: labelW }),
              ...axes.map((a) => cell([para([run(a, { size: 6.5, bold: true, color: MUTED })], { align: AlignmentType.RIGHT })], { width: dimCellW })),
            ],
          }),
          ...sizes.map(
            (s) =>
              new TableRow({
                children: [
                  cell(
                    [para([run(sizes.length > 1 ? pick(lang, s.label_th, s.label_en).value.replace(/^(ขนาด|Size)\s*/, "") || l.overall : "", { size: 7, color: MUTED })])],
                    { width: labelW, borders: rowBorder },
                  ),
                  ...(["w", "d", "h", ...(showDia ? ["dia" as const] : [])] as const).map((k) =>
                    cell([para([run(s.mm![k] ? formatRange(s.mm![k]!) : "–", { size: 10 })], { align: AlignmentType.RIGHT })], {
                      width: dimCellW,
                      borders: rowBorder,
                    }),
                  ),
                ],
              }),
          ),
        ],
      })
    : para([run("—", { color: MUTED })]);

  const rightCol = [
    sectionTitle("Dimensions (cm)", l.dims),
    dimTable,
    ...(sizes.length > 1 && formatEnvelope(p) ? [para([run(`${l.overall}: ${formatEnvelope(p)}`, { size: 7, color: MUTED })], { before: 80 })] : []),
    ...(note ? [para([run(note, { size: 6.5, color: MUTED })], { before: 100 })] : []),
  ];

  const media = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [leftW, rightW],
    layout: TableLayoutType.FIXED,
    borders: NO_BORDERS,
    rows: [
      new TableRow({
        children: [
          cell([picture], { width: leftW, fill: PANEL, vAlign: VerticalAlign.CENTER, margins: 160 }),
          cell(rightCol, { width: rightW, margins: 0 }),
        ],
      }),
    ],
  });

  // ---- materials & construction
  const specLabelW = Math.round(CONTENT_W * 0.28);
  const construction = specRows.length
    ? [
        sectionTitle("Materials & construction", l.construction),
        new Table({
          width: { size: CONTENT_W, type: WidthType.DXA },
          columnWidths: [specLabelW, CONTENT_W - specLabelW],
          layout: TableLayoutType.FIXED,
          borders: NO_BORDERS,
          rows: specRows.map(
            (r) =>
              new TableRow({
                cantSplit: true,
                children: [
                  cell(
                    [para([run(r.label, { size: 7.5, bold: true })]), ...(r.sub ? [para([run(r.sub, { size: 6, color: MUTED, caps: true })])] : [])],
                    { width: specLabelW, borders: { ...NO_BORDERS, bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE } } },
                  ),
                  cell(
                    r.values.map((v) => para([run(v, { size: 7.5 })])),
                    { width: CONTENT_W - specLabelW, borders: { ...NO_BORDERS, bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE } } },
                  ),
                ],
              }),
          ),
        }),
      ]
    : [];

  const featureBlock = features.length
    ? [
        sectionTitle("Features", l.features),
        ...features.map(
          (f) =>
            new Paragraph({
              numbering: { reference: "dash", level: 0 },
              children: [run(f, { size: 7.5 })],
              spacing: { after: 20 },
            }),
        ),
      ]
    : [];

  const about = summary
    ? [sectionTitle("About", l.about), ...summary.split("\n").map((s) => para([run(s, { size: 7.5 })], { after: 60 }))]
    : [];

  const printedOn = new Date().toLocaleDateString(l.locale, { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" });
  const pageUrl = `${siteUrl}${lang === "en" ? "/en" : ""}/p/${p.slug}`;
  const footer = new Footer({
    children: [
      new Paragraph({
        border: { top: { style: BorderStyle.SINGLE, size: 6, color: INK, space: 4 } },
        children: [run(l.disclaimer, { size: 6, color: MUTED })],
      }),
      new Paragraph({
        children: [
          run("NAT FURNITURE", { size: 6, bold: true, color: ACCENT, spacing: 20 }),
          run(`     ${pageUrl.replace(/^https?:\/\//, "")}     ${l.printed} ${printedOn}`, { size: 6, color: MUTED }),
        ],
      }),
    ],
  });

  const section: ISectionOptions = {
    properties: {
      page: {
        size: { width: PAGE_W, height: PAGE_H },
        // top margin leaves room for the letterhead in the page header
        margin: { top: MARGIN + 1250, bottom: MARGIN, left: MARGIN, right: MARGIN, header: 400, footer: 360 },
      },
    },
    headers: { default: header },
    footers: { default: footer },
    children: [head, ...title, new Paragraph({ spacing: { after: 120 }, children: [] }), media, ...construction, ...featureBlock, ...about],
  };

  const doc = new Document({
    creator: "NAT Furniture",
    title: `${p.code} – ${l.title}`,
    styles: { default: { document: { run: { font: FONT, size: pt(8.5), color: INK } } } },
    numbering: {
      config: [
        {
          reference: "dash",
          levels: [{ level: 0, format: LevelFormat.BULLET, text: "–", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 300, hanging: 200 } } } }],
        },
      ],
    },
    sections: [section],
  });
  return Packer.toBuffer(doc);
}
