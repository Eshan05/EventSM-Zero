import type { DBConnection, DBTransaction, Row } from "@rocicorp/zero/pg";
import { type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
import * as globalSchemaDrizzle from '@/db/schema';
export type AppDrizzleNodePg = NodePgDatabase<typeof globalSchemaDrizzle>;

// Type for parameters accepted by pg.PoolClient.query
type PgQueryParams = (string | number | boolean | null | undefined | Buffer | Date)[];

// Type for the Drizzle transaction executor.
// This is the 'tx' passed to the callback in `db.transaction(async (tx) => {...})`
export type DrizzleNodePgTransaction = Parameters<
  Parameters<AppDrizzleNodePg["transaction"]>[0]
>[0];
// This DrizzleNodePgTransaction is itself a DrizzleDatabase instance, but scoped to the transaction.
// It will have access to the same query-building methods as your main `db` instance.

// The TWrappedTransaction for DBConnection and DBTransaction will be the PoolClient
// because Zero's PostgresJSConnection uses the raw postgres.js client as TWrappedTransaction.
// We aim to provide the raw pg.PoolClient for consistency if ZQLDatabase/ServerTransaction needs it.
// However, the Drizzle adapter in the blog post passes the DrizzleTransactionExecutor.
// Let's stick to the blog's pattern: TWrappedTransaction is DrizzleTransactionExecutor.

export class DrizzlePgConnection implements DBConnection<DrizzleNodePgTransaction> {
  readonly drizzle: AppDrizzleNodePg;
  readonly pool: Pool; // Keep a reference to the pool for non-transactional queries

  constructor(drizzleInstance: AppDrizzleNodePg, pgPool: Pool) {
    this.drizzle = drizzleInstance;
    this.pool = pgPool;
  }

  // `query` is used by ZQLDatabase for reads *outside* a Zero transaction.
  // This method needs to get a client from the pool, execute the query, and release the client.
  async query(sql: string, params: unknown[]): Promise<Row[]> {
    let client: PoolClient | undefined;
    try {
      client = await this.pool.connect(); // Acquire a client from the pool
      const result: QueryResult<QueryResultRow> = await client.query(sql, params as PgQueryParams);
      return result.rows as Row[]; // Assuming Row is compatible with QueryResultRow
    } catch (error) {
      console.error("DrizzlePgConnection.query - Error executing raw SQL:", error);
      throw error; // Re-throw the error to be handled by ZQLDatabase
    } finally {
      if (client) {
        client.release(); // Always release the client back to the pool
      }
    }
  }

  // `transaction` wraps Drizzle's transaction method.
  // The callback `fn` from Zero expects a `DBTransaction<DrizzleNodePgTransaction>`.
  transaction<T>(
    fn: (tx: DBTransaction<DrizzleNodePgTransaction>) => Promise<T>,
  ): Promise<T> {
    // Use Drizzle's transaction method.
    // The `drizzleTxExecutor` passed to the callback is Drizzle's transaction-scoped query executor.
    return this.drizzle.transaction(async (drizzleTxExecutor: DrizzleNodePgTransaction) => {
      // Create an instance of our ZeroDrizzlePgTransaction, wrapping Drizzle's transaction executor.
      const zeroDrizzleTx = new ZeroDrizzlePgTransaction(drizzleTxExecutor);
      // Call Zero's provided callback with our wrapper.
      return fn(zeroDrizzleTx);
    });
  }
}

export type DrizzleTransactionExecutor = Parameters<
  Parameters<AppDrizzleNodePg["transaction"]>[0]
>[0];

// Implements Zero's DBTransaction interface, wrapping Drizzle's transaction executor.
export class ZeroDrizzlePgTransaction implements DBTransaction<DrizzleNodePgTransaction> {
  // `wrappedTransaction` holds Drizzle's transaction executor.
  // This allows server-side mutators (if they get this `tx.dbTransaction.wrappedTransaction`)
  // to use Drizzle's typed query builder within the transaction.
  readonly wrappedTransaction: DrizzleNodePgTransaction;

  constructor(drizzleTxExecutor: DrizzleNodePgTransaction) {
    this.wrappedTransaction = drizzleTxExecutor;
  }

  // This `query` method is used by ZQL for reads *within* a server-side mutator
  // that is running inside this Zero-wrapped Drizzle transaction.
  // It must use the Drizzle transaction executor's context to run raw SQL.
  async query(sql: string, params: unknown[]): Promise<Row[]> {
    // The Drizzle transaction executor (`this.wrappedTransaction`) itself can execute queries.
    // To run raw SQL, we need to access its underlying PoolClient connection for that transaction.
    // Accessing `._.session.client` is an internal detail and fragile.
    // A better way, if Drizzle's transaction executor supports `execute(sql.raw(...))`, would be ideal.
    // Let's try to access the client more directly if possible, or use a documented raw SQL method.

    // Drizzle's transaction executor (NodePgDatabase) should have a `session` property
    // which then has a `client` (the PoolClient for this transaction).
    // WARNING: Accessing internal Drizzle properties like .session?.client is fragile and may break in future Drizzle versions.
    const currentTxClient = (this.wrappedTransaction as any).session?.client as PoolClient | undefined;

    if (!currentTxClient) {
      throw new Error(
        "ZeroDrizzlePgTransaction: Could not obtain pg.PoolClient from the Drizzle transaction executor. " +
        "Ensure the Drizzle transaction object structure is as expected."
      );
    }

    try {
      // Execute the raw SQL query using the PoolClient associated with this Drizzle transaction
      const result: QueryResult<QueryResultRow> = await currentTxClient.query(sql, params as PgQueryParams);
      return result.rows as Row[];
    } catch (error) {
      console.error("ZeroDrizzlePgTransaction.query - Error executing raw SQL within transaction:", error);
      throw error; // Re-throw to be handled by ZQLDatabase/PushProcessor
    }
  }
}