import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

// Pooled URL over HTTP: suits serverless hosts (Netlify, Cloudflare) without a long-lived pool.
// no-store: results are cached by our "use cache" functions, not Next's fetch cache.
export const db = drizzle({ client: neon(process.env.DATABASE_URL!, { fetchOptions: { cache: "no-store" } }), schema, casing: "snake_case" });
