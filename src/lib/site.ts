/**
 * One codebase, two sites:
 *  - "catalog" (default): line drawings, admin enabled
 *  - "customer" (SITE_VARIANT=customer): product photos, no admin
 * Both read the same database, so products and edits appear on both.
 */
export const SITE_VARIANT: "catalog" | "customer" = process.env.SITE_VARIANT === "customer" ? "customer" : "catalog";

export const isCustomerSite = SITE_VARIANT === "customer";

/** Image URLs are stored as /media/p/... (line drawings); the customer site serves the photos in /media/photo/. */
export function media<T extends string | null | undefined>(url: T): T {
  if (!isCustomerSite || !url) return url;
  return url.replace(/^\/media\/p\//, "/media/photo/") as T;
}
