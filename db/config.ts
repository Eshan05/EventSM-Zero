import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export const connectionString = process.env.DATABASE_URL || "postgres://user:password@host:port/db";
// For Neon, DATABASE_URL will look like: postgresql://neondb_owner:xxx@ep-xxx.aws.neon.tech/neondb?sslmode=require
export const pool = postgres(connectionString, { max: 1 });
export const db = drizzle(pool);