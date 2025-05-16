import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, type PoolClient } from 'pg';
import * as schema from './schema';

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set for TCP connection.");
}
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Add SSL configuration if required by Neon or your provider for TCP connections
  // Neon typically requires SSL. For local development, you might not need it.
  ssl: true,
  // idleTimeoutMillis: 30000,
  // connectionTimeoutMillis: 2000,
});

export const dbPg: NodePgDatabase<typeof schema> = drizzle(pool, { schema });
export type DBPgNode = typeof dbPg;
export { pool as pgPool };

export async function getPgClient(): Promise<PoolClient> {
  const client = await pool.connect();
  return client;
}