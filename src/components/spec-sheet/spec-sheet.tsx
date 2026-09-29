import QRCode from "qrcode";

import { getProduct } from "@/lib/catalog";
import { formatEnvelope, formatRange } from "@/lib/format";
import { type Lang, pick } from "@/lib/i18n";

import { SheetFit } from "./sheet-fit";

const siteHost = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
const SITE = siteHost ? `https://${siteHost}` : "http://localhost:3000";

type Product = NonNullable<Awaited<ReturnType<typeof getProduct>>>;

const L = {
  th: {
    title: "ใบรายละเอียดสินค้า",
    dims: "ขนาด",
    size: "รายการ",
    construction: "วัสดุและรายละเอียดการผลิต",
    features: "ลักษณะพิเศษ",
    about: "รายละเอียดสินค้า",
    note: "หมายเหตุ",
    overall: "ขนาดรวม",
    qr: "สแกนดูข้อมูลล่าสุด",
    disclaimer: "ขนาดอ้างอิงจากแผ่นสเปกของผู้ผลิต อาจคลาดเคลื่อนเล็กน้อย วัสดุและสีอาจเปลี่ยนแปลงได้โดยไม่ต้องแจ้งให้ทราบล่วงหน้า",
    printed: "พิมพ์เมื่อ",
    locale: "th-TH",
  },
  en: {
    title: "Specification sheet",
    dims: "Dimensions",
    size: "Item",
    construction: "Materials & construction",
    features: "Features",
    about: "About this product",
    note: "Note",
    overall: "Overall",
    qr: "Scan for the latest details",
    disclaimer: "Sizes are from the manufacturer's specification sheet and may vary slightly. Materials and finishes may change without notice.",
    printed: "Printed",
    locale: "en-GB",
  },
} as const;

const AXES = [
  ["w", "W"],
  ["d", "D"],
  ["h", "H"],
] as const;

function SectionTitle({ lang, en, th }: { lang: Lang; en: string; th: string }) {
  return (
    <div className="mb-[1.5mm] flex items-baseline gap-2 border-b border-ink pb-[1mm]">
      <span className="eyebrow fs-xs">{en}</span>
      {lang === "th" && <span className="fs-sm text-muted">{th}</span>}
    </div>
  );
}

export async function SpecSheet({ data, lang, autoPrint }: { data: Product; lang: Lang; autoPrint: boolean }) {
  const l = L[lang];
  const { product: p, category, parent, images } = data;
  const url = `${SITE}${lang === "en" ? "/en" : ""}/p/${p.slug}`;
  const qr = await QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#231f20", light: "#ffffff" } });
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
  // Long tables flow into two columns; the auto-fit then only has to shrink a little.
  const specText = specRows.reduce((n, r) => n + r.label.length + r.values.join(" ").length, 0);
  const twoCols = specRows.length > 8 || specText > 900;
  const printedOn = new Date().toLocaleDateString(l.locale, { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" });
  const catPath = [parent?.nameEn, category?.nameEn].filter(Boolean).join(" / ");

  return (
    <article className="sheet shadow-[0_2px_24px_rgba(0,0,0,0.12)]">
      {/* Letterhead */}
      <header className="flex items-end justify-between border-b-2 border-ink pb-[2.5mm]">
        <div className="flex items-baseline gap-[3mm]">
          <span className="display text-[20pt] leading-none tracking-[0.32em]">NAT</span>
          <span className="eyebrow text-[6.5pt] text-muted">Furniture</span>
        </div>
        <div className="text-right">
          <div className="eyebrow text-[7pt]">Specification sheet</div>
          {lang === "th" && <div className="text-[7.5pt] text-muted">{l.title}</div>}
        </div>
      </header>

      <SheetFit autoPrint={autoPrint}>
        {/* Title block */}
        <section className="flex items-start justify-between gap-[6mm] pt-[4mm]">
          <div className="min-w-0">
            {catPath && <div className="eyebrow fs-xs text-muted">{catPath}</div>}
            <h1 className="display fs-code mt-[1mm] leading-none">{p.code}</h1>
            {type && <div className="fs-lg mt-[1.5mm]">{type}</div>}
            {secondType && <div className="fs-sm text-muted">{secondType}</div>}
          </div>
          <div className="flex shrink-0 items-center gap-[2.5mm]">
            <div className="fs-xs max-w-[26mm] text-right leading-snug text-muted">{l.qr}</div>
            <div className="h-[19mm] w-[19mm]" dangerouslySetInnerHTML={{ __html: qr }} />
          </div>
        </section>

        {/* Drawing + dimensions */}
        <section className="grid grid-cols-[1.12fr_1fr] gap-[6mm]">
          <div>
            <div className="drawing flex items-center justify-center rounded-tl-[8mm] bg-[#f4f4f3] p-[4mm]">
              {images[0] ? (
                // eslint-disable-next-line @next/next/no-img-element -- print sheet drawing
                <img src={images[0].url} alt={p.code} className="max-h-full max-w-full object-contain mix-blend-multiply" />
              ) : (
                <span className="fs-sm text-muted">—</span>
              )}
            </div>
            {images.length > 1 && (
              <div className="mt-[2mm] flex gap-[2mm]">
                {images.slice(1, 4).map((im) => (
                  <div key={im.id} className="drawing-sm flex flex-1 items-center justify-center bg-[#f4f4f3] p-[1.5mm]">
                    {/* eslint-disable-next-line @next/next/no-img-element -- print sheet drawing */}
                    <img src={im.url} alt="" className="max-h-full max-w-full object-contain mix-blend-multiply" />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="min-w-0">
            <SectionTitle lang={lang} en="Dimensions (cm)" th={l.dims} />
            {sizes.length ? (
              <table className="fs-md w-full border-collapse">
                <thead>
                  <tr className="fs-xs text-left text-muted">
                    <th className="py-[1mm] pr-[2mm] font-normal">{sizes.length > 1 ? l.size : ""}</th>
                    {AXES.map(([, k]) => (
                      <th key={k} className="eyebrow py-[1mm] text-right font-normal">
                        {k}
                      </th>
                    ))}
                    {showDia && <th className="eyebrow py-[1mm] text-right font-normal">Ø</th>}
                  </tr>
                </thead>
                <tbody>
                  {sizes.map((s, i) => (
                    <tr key={i} className="border-t border-line align-baseline">
                      <td className="fs-sm py-[1.4mm] pr-[2mm] text-muted">
                        {sizes.length > 1 ? pick(lang, s.label_th, s.label_en).value.replace(/^ขนาด\s*/, "").replace(/^Size\s*/, "") || l.overall : ""}
                      </td>
                      {AXES.map(([a]) => (
                        <td key={a} className="font-num fs-dim py-[1.4mm] pl-[2mm] text-right tabular-nums">
                          {s.mm![a] ? formatRange(s.mm![a]!) : "–"}
                        </td>
                      ))}
                      {showDia && (
                        <td className="font-num fs-dim py-[1.4mm] pl-[2mm] text-right tabular-nums">{s.mm!.dia ? formatRange(s.mm!.dia) : "–"}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="fs-sm text-muted">—</p>
            )}
            {sizes.length > 1 && formatEnvelope(p) && (
              <p className="font-num fs-sm mt-[2mm] text-muted">
                {l.overall}: {formatEnvelope(p)}
              </p>
            )}
            {note && <p className="fs-xs mt-[3mm] leading-snug text-muted">{note}</p>}

            {summary && (
              <div className="mt-[4mm]">
                <SectionTitle lang={lang} en="About" th={l.about} />
                <div className="fs-sm space-y-[1mm] leading-relaxed">
                  {summary.split("\n").map((para, i) => (
                    <p key={i}>{para}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Materials & construction */}
        {specRows.length > 0 && (
          <section>
            <SectionTitle lang={lang} en="Materials & construction" th={l.construction} />
            <div className={twoCols ? "spec-cols columns-2" : ""}>
              {specRows.map((row, i) => (
                <div key={i} className="spec-row grid grid-cols-[30%_1fr] gap-[2.5mm] border-b border-line py-[1.2mm]">
                  <div>
                    <div className="fs-sm font-medium leading-snug">{row.label}</div>
                    {row.sub && <div className="eyebrow fs-xs font-normal text-muted">{row.sub}</div>}
                  </div>
                  <div className="fs-sm leading-snug">
                    {row.values.map((v, j) => (
                      <p key={j}>{v}</p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {features.length > 0 && (
          <section>
            <SectionTitle lang={lang} en="Features" th={l.features} />
            <ul className={`fs-sm space-y-[0.8mm] ${features.length > 4 ? "columns-2 gap-[7mm]" : ""}`}>
              {features.map((f, i) => (
                <li key={i} className="flex gap-[2mm] break-inside-avoid">
                  <span className="mt-[1.7mm] h-px w-[3mm] shrink-0 bg-ink" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </SheetFit>

      {/* Footer */}
      <footer className="mt-[3mm] border-t border-ink pt-[2mm] text-[6.5pt] leading-snug text-muted">
        <p>{l.disclaimer}</p>
        <div className="mt-[1mm] grid grid-cols-[auto_1fr_auto] items-center gap-[5mm] whitespace-nowrap">
          <span className="eyebrow text-[6pt] text-accent">NAT Furniture</span>
          <span className="font-num truncate text-center">{url.replace(/^https?:\/\//, "")}</span>
          <span>
            {l.printed} {printedOn}
          </span>
        </div>
      </footer>
    </article>
  );
}
