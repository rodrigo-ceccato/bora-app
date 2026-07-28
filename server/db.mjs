import pg from 'pg';

const { Pool } = pg;

const connection = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.PGHOST || '127.0.0.1',
      port: Number(process.env.PGPORT || 5432),
      database: process.env.PGDATABASE || 'bora',
      user: process.env.PGUSER || 'bora',
      password: process.env.PGPASSWORD || 'bora'
    };

export const pool = new Pool({ ...connection, max: Number(process.env.DATABASE_POOL_SIZE || 10) });

export async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await callback(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
