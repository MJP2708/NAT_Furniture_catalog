import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

// Pooled URL over HTTP: suits serverless hosts (Netlify, Cloudflare) without a long-lived pool.
export const db = drizzle({ client: neon(process.env.DATABASE_URL!), schema, casing: "snake_case" });
