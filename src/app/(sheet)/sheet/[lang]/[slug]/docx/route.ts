import { getProduct } from "@/lib/catalog";
import { buildSpecDocx } from "@/lib/spec-docx";

/** Word (.docx) version of the spec sheet: /sheet/{th|en}/<slug>/docx */
export async function GET(req: Request, { params }: { params: Promise<{ lang: string; slug: string }> }) {
  const { lang, slug } = await params;
  if (lang !== "th" && lang !== "en") return new Response("Not found", { status: 404 });
  const data = await getProduct(slug);
  if (!data) return new Response("Not found", { status: 404 });
  const site = new URL(req.url).origin;
  const buf = await buildSpecDocx(data, lang, site);
  const name = `${data.product.code.replace(/[^\p{L}\p{N}._-]+/gu, "-")}-spec-${lang}.docx`;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="spec-${lang}.docx"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "public, max-age=0, s-maxage=3600",
    },
  });
}
