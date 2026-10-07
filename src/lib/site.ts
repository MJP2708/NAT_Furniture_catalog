/**
 * One codebase, two sites:
 *  - "catalog" (default): line drawings, admin enabled
 *  - "customer" (SITE_VARIANT=customer): product photos, no admin
 * Both read the same database, so products and edits appear on both.
 *
 * Images and catalogue PDFs live in the private Neon bucket and are served through the
 * site's own /media/[...path] route (public/media locally).
 */
export const SITE_VARIANT: "catalog" | "customer" = process.env.SITE_VARIANT === "customer" ? "customer" : "catalog";

export const isCustomerSite = SITE_VARIANT === "customer";

/** Image URLs are stored as /media/p/... (line drawings); the customer site serves /media/photo/... */
export function media<T extends string | null | undefined>(url: T): T {
  if (!url || !isCustomerSite) return url;
  return url.replace(/^\/media\/p\//, "/media/photo/") as T;
}

/** A downloadable catalogue PDF (bucket key catalogue/<name>). */
export function catalogueFile(name: string) {
  return `/media/catalogue/${name}`;
}

/**
 * The e-catalogue every download button links to: all categories, photos, links and bookmarks.
 * It ships with the site (public/catalogue); the older bucket PDFs redirect here (next.config.ts).
 */
export const E_CATALOGUE_PDF = "/catalogue/nat-furniture-e-catalogue-2026.pdf";
