import { getObject } from "@/lib/bucket";

/**
 * Images not shipped in public/media are read from the private storage bucket and served
 * with long-lived cache headers, so the CDN keeps them and the bucket is hit once per file.
 * (Files that exist in public/ are served directly by Next.js and never reach this route.)
 */
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  if (path.some((p) => p === ".." || p.startsWith("."))) return new Response("Not found", { status: 404 });
  const res = await getObject(path.join("/"));
  if (!res || !res.ok || !res.body) return new Response("Not found", { status: 404 });
  return new Response(res.body, {
    headers: {
      "Content-Type": res.headers.get("content-type") ?? "application/octet-stream",
      // images change only when the catalogue is rebuilt (rebuilds keep the same names, so 1 day + SWR)
      "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800",
    },
  });
}
