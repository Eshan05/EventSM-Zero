// Implements Zero's DBConnection and DBTransaction interfaces for Drizzle ORM.
// This allows @rocicorp/zero/pg's ZQLDatabase and PushProcessor to use your Drizzle instance.

import {
  type DBConnection,
  type DBTransaction,
  type Row, // Type representing a database row (object with string keys)
} from '@rocicorp/zero/pg'; // Adjust import based on actual package structure

// Import your Drizzle database instance and schema types
import { typedDb } from '@/lib/utils.server'; // Adjust path - assuming db instance is exported from config
// Import your Drizzle schema types if needed, though DB type might be sufficient
// import * as schemaTypes from '../db/schema';


// Define a type for the raw Drizzle transaction object
// This depends on the Drizzle driver you use (node-postgres, postgres-js, etc.)
// For drizzle-orm/postgres-js and drizzle-orm/node-postgres,
// the transaction object passed to the callback in `db.transaction`
// often has a similar structure. We need the raw client for `query`.
// Based on the Zero docs example, we need access to the underlying client.
// If using drizzle-orm/postgres-js: The tx object is `PostgresJsDatabase` with a `client` property.
// If using drizzle-orm/node-postgres: The tx object is `NodePgDatabase` with a `$client` property.
// Let's make it generic or adapt based on your actual driver. Assuming postgres-js for now.

import { NeonHttpDatabase } from 'drizzle-orm/neon-http';

// If using node-postgres:
// import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
// import type { PoolClient } from 'pg'; // From 'pg' package

// Type alias for the raw transaction object passed by Drizzle
type RawDrizzleTx = NeonHttpDatabase<typeof schema>; // Adjust based on your schema type
import * as schema from '@/db/schema';


// Implementation of Zero's DBConnection interface using your Drizzle DB instance
export class DrizzleZeroConnection implements DBConnection<RawDrizzleTx> {
  readonly drizzle: NeonHttpDatabase<typeof schema> | null = typedDb; // Your main Drizzle DB instance

  constructor(drizzle: NeonHttpDatabase<typeof schema> | null) {
    this.drizzle = drizzle;
  }

  // Zero's ZQLDatabase uses this `query` method for ZQL reads executed on the server.
  // It needs to return an array of Row objects.
  async query(sql: string, params: unknown[]): Promise<Row[]> {
    // Drizzle's instance itself (outside a transaction) can run queries.
    // This assumes `this.drizzle` has a way to run raw SQL.
    // Drizzle v0.30+ has `db.execute(sql)` which is better than accessing internal clients.
    // The `sql` template literal tag from drizzle-orm/sql is used for raw SQL.
    // However, Zero's `query` method provides a raw SQL string and parameters.
    // We need to adapt this to Drizzle's raw execution.

    // If Drizzle's DB object has a raw client access:
    // const rawClient = (this.drizzle as any).client; // For postgres-js
    // if (!rawClient) throw new Error("Could not access raw DB client from Drizzle instance.");
    // const result = await rawClient.query(sql, params);
    // return result.rows as Row[];

    // If Drizzle doesn't expose raw client easily outside transaction for `query`:
    // ZQLDatabase's `query` might only be used *within* a transaction context,
    // where DBTransaction's `query` is used. Let's assume that.
    // If ZQLDatabase *does* need a standalone query method, and Drizzle doesn't provide
    // a clean way other than inside `db.transaction`, this might be a limitation or require
    // a different approach (e.g., using the raw `postgres` or `pg` client directly for Zero).
    // Based on the docs, ZQLDatabase takes a DBConnection, and DBConnection has `query` and `transaction`.
    // Let's implement a minimal query here using Drizzle's execute if params work.
    // Drizzle's `sql` tag is for template literals. Passing raw string+params is different.
    // A safer fallback is to use the raw underlying driver client directly if possible.

    // --- Using underlying driver client (assuming postgres-js) ---
    // You might need to create a new client or pool connection just for this,
    // or access the underlying one if Drizzle exposes it.
    // For simplicity here, let's assume ZQLDatabase *primarily* uses the `DBTransaction.query`
    // within the transaction context. We'll make this throw as a placeholder,
    // indicating it might not be the primary path, or requires raw driver access.
    console.warn("DrizzleZeroConnection.query called - might not be the intended path for ZQLDatabase reads outside transaction.");
    // Access the raw postgres-js client pool if db.client is the pool
    // return await (this.drizzle.client as any).query(sql, params).then((res: any) => res.rows as Row[]);
    // Or if db is the client instance:
    // return await (this.drizzle as any).query(sql, params).then((res: any) => res.rows as Row[]);

    // Let's use the approach shown in the Zero docs example, accessing the client via the transaction:
    throw new Error("ZQLDatabase reads outside a transaction context via DBConnection.query are not directly supported by this Drizzle adapter implementation. Use DBTransaction.query within a transaction.");
  }

  // Zero's PushProcessor uses this `transaction` method to wrap its mutation execution.
  // Your job is to call Drizzle's transaction method and pass Zero's `fn` callback
  // Zero's `fn` will receive *your* wrapper around the Drizzle transaction object.
  async transaction<T>(
    fn: (tx: DBTransaction<RawDrizzleTx>) => Promise<T>,
  ): Promise<T> {
    // Use Drizzle's built-in transaction method
    // The callback receives Drizzle's transaction object (rawDrizzleTx)
    return this.drizzle!.transaction(async (rawDrizzleTx) => {
      // Wrap the raw Drizzle transaction object in your Zero DBTransaction implementation
      const zeroDbTx = new DrizzleZeroTransaction(rawDrizzleTx as unknown as RawDrizzleTx);
      // Call Zero's callback function, passing your wrapper
      return await fn(zeroDbTx);
    });
  }
}

// Implementation of Zero's DBTransaction interface using a Drizzle transaction object
export class DrizzleZeroTransaction implements DBTransaction<RawDrizzleTx> {
  // Stores the raw Drizzle transaction object
  readonly wrappedTransaction: RawDrizzleTx;

  constructor(drizzleTx: RawDrizzleTx) {
    this.wrappedTransaction = drizzleTx;
  }

  // Zero's ZQLDatabase uses this `query` method for ZQL reads executed *within* a server-side mutator.
  // This query runs using the wrapped Drizzle transaction.
  async query(sql: string, params: unknown[]): Promise<Row[]> {
    // Access the raw client from the Drizzle transaction object
    // This access method is driver-specific!
    // For postgres-js: the transaction object itself has a `client` property for the connection.
    const rawClient = (this.wrappedTransaction as any).client; // Assuming postgres-js driver structure

    if (!rawClient) {
      // Fallback or error if raw client isn't found as expected
      console.error("Could not access raw client from Drizzle transaction for Zero query.");
      throw new Error("Failed to execute ZQL query within Drizzle transaction.");
    }

    // Execute the raw SQL query using the underlying client within the transaction
    const result = await rawClient.query(sql, params);
    return result.rows as Row[]; // Return the rows as Zero's expected Row[] type
  }
}

// You can export an instance of the connection if helpful, but often it's created in the Push Endpoint handler.
// export const drizzleZeroConnection = new DrizzleZeroConnection(db);