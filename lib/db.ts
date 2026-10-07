import { Pool, type PoolClient } from "pg";

let pool: Pool | undefined;

export function database(): Pool {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error("DATABASE_URL is not configured");
  pool ??= new Pool({ connectionString, max: 4, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 5_000 });
  return pool;
}

export async function transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
