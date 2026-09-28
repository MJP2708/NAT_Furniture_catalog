import { config } from "dotenv"; config({ path: ".env.local", quiet: true });
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL_UNPOOLED!);
const q = process.argv[2];
console.log(JSON.stringify(await sql.query(q), null, 0));
