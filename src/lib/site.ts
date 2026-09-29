/**
 * One codebase, two sites:
 *  - "catalog" (default): line drawings, admin enabled
 *  - "customer" (SITE_VARIANT=customer): coloured illustrations, no admin
 * Both read the same database, so products and edits appear on both.
 */
export const SITE_VARIANT: "catalog" | "customer" = process.env.SITE_VARIANT === "customer" ? "customer" : "catalog";

export const isCustomerSite = SITE_VARIANT === "customer";

/** Drawing URLs are stored as /media/p/...; the customer site serves the coloured set in /media/c/. */
export function media<T extends string | null | undefined>(url: T): T {
  if (!isCustomerSite || !url) return url;
  return url.replace(/^\/media\/p\//, "/media/c/") as T;
}
