import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

const connectionString = process.env.SUPABASE_DB_URL;

if (!connectionString) {
  throw new Error(
    "Falta SUPABASE_DB_URL. Crea server/.env a partir de server/.env.example antes de iniciar la app."
  );
}

const shouldUseSsl = (process.env.SUPABASE_DB_SSL ?? "require") !== "disable";

export const pool = new Pool({
  connectionString,
  ssl: shouldUseSsl ? { rejectUnauthorized: false } : false
});

pool.on("error", (error) => {
  console.error("Error inesperado en el pool de Postgres:", error);
});

export async function query(text, params = []) {
  return pool.query(text, params);
}

export async function withTransaction(callback) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
