/**
 * One codebase, two sites:
 *  - "catalog" (default): line drawings, admin enabled
 *  - "customer" (SITE_VARIANT=customer): product photos, no admin
 * Both read the same database, so products and edits appear on both.
 *
 * Images and PDFs live in Neon Object Storage when MEDIA_BASE_URL is set
 * (e.g. https://<branch>.storage.<region>.aws.neon.tech/nat-media); otherwise they're served
 * from public/media for local work.
 */
export const SITE_VARIANT: "catalog" | "customer" = process.env.SITE_VARIANT === "customer" ? "customer" : "catalog";

export const isCustomerSite = SITE_VARIANT === "customer";

const MEDIA_BASE = (process.env.MEDIA_BASE_URL ?? "").replace(/\/+$/, "");

/** Image URLs are stored as /media/p/... (line drawings); the customer site serves /media/photo/...
 * Both map onto the storage bucket when MEDIA_BASE_URL is set. */
export function media<T extends string | null | undefined>(url: T): T {
  if (!url) return url;
  let u: string = url;
  if (isCustomerSite) u = u.replace(/^\/media\/p\//, "/media/photo/");
  if (MEDIA_BASE && u.startsWith("/media/")) u = MEDIA_BASE + u.slice("/media".length);
  return u as T;
}

/** A downloadable catalogue PDF (public/<name> locally, catalogue/<name> in the bucket). */
export function catalogueFile(name: string) {
  return MEDIA_BASE ? `${MEDIA_BASE}/catalogue/${name}` : `/${name}`;
}
