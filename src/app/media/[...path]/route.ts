import { getObject } from "@/lib/bucket";

// a 58 MB catalogue PDF on a slow phone connection takes minutes to stream
export const maxDuration = 300;

/** Passed through from the bucket so browsers see the size (progress bar) and can fetch ranges or resume. */
const PASS_THROUGH = ["content-length", "content-range", "etag", "last-modified"];

/**
 * Images not shipped in public/media are read from the private storage bucket and served
 * with long-lived cache headers, so the CDN keeps them and the bucket is hit once per file.
 * (Files that exist in public/ are served directly by Next.js and never reach this route.)
 * Range requests are forwarded, so PDF viewers (Safari on iPhone/iPad, Chrome) can open a large
 * catalogue page by page instead of waiting for the whole file.
 */
export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  if (path.some((p) => p === ".." || p.startsWith("."))) return new Response("Not found", { status: 404 });
  const range = req.headers.get("range");
  const res = await getObject(path.join("/"), range);
  if (res?.status === 416) {
    return new Response(null, { status: 416, headers: { "Content-Range": res.headers.get("content-range") ?? "" } });
  }
  if (!res || !res.ok || !res.body) return new Response("Not found", { status: 404 });
  const headers = new Headers({
    "Content-Type": res.headers.get("content-type") ?? "application/octet-stream",
    "Accept-Ranges": "bytes",
    // images change only when the catalogue is rebuilt (rebuilds keep the same names, so 1 day + SWR)
    "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800",
  });
  for (const h of PASS_THROUGH) {
    const v = res.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new Response(res.body, { status: res.status === 206 ? 206 : 200, headers });
}
