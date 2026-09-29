import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Single shared admin password (ADMIN_PASSWORD) until staff accounts arrive with the dealer area.
 * The session cookie is "<expiry>.<hmac>", signed with the password itself, so changing the
 * password signs everyone out. With no ADMIN_PASSWORD set, admin is disabled.
 */
const COOKIE = "nat_admin";
const MAX_AGE_S = 60 * 60 * 12;

const secret = () => process.env.ADMIN_PASSWORD || null;

function sign(value: string, key: string) {
  return createHmac("sha256", key).update(value).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function passwordMatches(input: string) {
  const key = secret();
  // Compare HMACs so the check takes the same time whatever the input length.
  return !!key && safeEqual(sign(input, "pw"), sign(key, "pw"));
}

export async function startSession() {
  const key = secret()!;
  const exp = String(Date.now() + MAX_AGE_S * 1000);
  (await cookies()).set(COOKIE, `${exp}.${sign(exp, key)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_S,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export async function isAdmin() {
  const key = secret();
  const value = (await cookies()).get(COOKIE)?.value;
  if (!key || !value) return false;
  const [exp, mac] = value.split(".");
  return !!exp && !!mac && Number(exp) > Date.now() && safeEqual(mac, sign(exp, key));
}

/** Guard for admin pages and every admin Server Action (actions are reachable by direct POST). */
export async function requireAdmin() {
  if (!(await isAdmin())) redirect("/admin/login");
}
