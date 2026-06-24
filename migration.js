const { Pool } = require('pg');
require('dotenv').config();

async function runMigration() {
  const isLocal = !process.env.DATABASE_URL || process.env.DATABASE_URL.includes('localhost') || process.env.DATABASE_URL.includes('127.0.0.1');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isLocal ? false : { rejectUnauthorized: false }
  });

  const client = await pool.connect();

  try {
    console.log('Starting schema migration...');

    // 1. Add search_vector column if it doesn't exist
    // Note: GENERATED ALWAYS AS column addition was added in Pg 12.
    // If we want to support any older postgres version or keep it safe, we can run it directly.
    console.log('Adding search_vector column if not exists...');
    await client.query(`
      ALTER TABLE products 
      ADD COLUMN IF NOT EXISTS search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', name)) STORED
    `);
    console.log('search_vector column verified.');

    // 2. Create index on search_vector
    console.log('Creating idx_products_search_vector index...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_products_search_vector ON products USING gin(search_vector)
    `);

    // 3. Create price sorting indexes
    console.log('Creating price and price+category indexes...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_products_price_asc_id ON products (price ASC, id ASC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_products_price_desc_id ON products (price DESC, id DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_products_category_price_asc_id ON products (category, price ASC, id ASC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_products_category_price_desc_id ON products (category, price DESC, id DESC)
    `);

    console.log('Migration completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
