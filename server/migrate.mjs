import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.mjs';

const directory = join(dirname(fileURLToPath(import.meta.url)), 'migrations');
const migrationFiles = (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort();

await pool.query(`
  create table if not exists schema_migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )
`);

for (const file of migrationFiles) {
  const existing = await pool.query('select 1 from schema_migrations where name = $1', [file]);
  if (existing.rowCount) continue;
  const sql = await readFile(join(directory, file), 'utf8');
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(sql);
    await client.query('insert into schema_migrations (name) values ($1)', [file]);
    await client.query('commit');
    console.log(`Applied migration ${file}`);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

await pool.end();
