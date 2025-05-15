import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import * as schema from '@/db/schema';
import { neon, NeonQueryFunction } from '@neondatabase/serverless';
import { drizzle, NeonHttpDatabase } from 'drizzle-orm/neon-http';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

let dbInstance: NeonHttpDatabase<typeof schema> | null = null;
let sqlInstance: NeonQueryFunction<boolean, boolean> | null = null;
// const sql = neon(process.env.DATABASE_URL!);
// const typedDb = drizzle(sql, { schema });

export function getDb(): NeonHttpDatabase<typeof schema> {
  if (dbInstance) return dbInstance;
  console.log(`[lib/utils.ts] DATABASE_URL (raw):`, process.env.DATABASE_URL);
  console.log(`[lib/utils.ts] NODE_ENV:`, process.env.NODE_ENV);
  console.log(`[lib/utils.ts] NEXT_RUNTIME:`, process.env.NEXT_RUNTIME);
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("[getDb] FATAL: DATABASE_URL is not defined when getDb() is called.");
    throw new Error("FATAL: Database connection string is not set.");
  }

  sqlInstance = neon(databaseUrl);
  dbInstance = drizzle(sqlInstance, { schema });
  console.log("[getDb] New DB instance created.");
  return dbInstance;
}
