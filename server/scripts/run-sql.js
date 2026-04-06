import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../lib/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const relativePath = process.argv[2];

if (!relativePath) {
  console.error("Debes indicar la ruta del archivo SQL. Ejemplo: node scripts/run-sql.js db/schema.sql");
  process.exit(1);
}

const absolutePath = path.resolve(__dirname, "..", relativePath);

try {
  const sql = await fs.readFile(absolutePath, "utf8");

  if (!sql.trim()) {
    throw new Error(`El archivo ${relativePath} esta vacio.`);
  }

  await pool.query(sql);
  console.log(`SQL ejecutado correctamente: ${relativePath}`);
} catch (error) {
  console.error(`No se pudo ejecutar ${relativePath}:`, error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
