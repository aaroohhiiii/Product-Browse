const { Pool } = require('pg')
require('dotenv').config()
const { faker } = require('@faker-js/faker')

// We define categories as a fixed array instead of random strings.
// This is intentional: having ~10 fixed categories means our category index 
// actually gets used. If every product had a unique category string, 
// the index would be useless because no category would have enough rows 
// to make an index scan worth it over a full table scan.
const CATEGORIES = [
  'Electronics', 'Clothing', 'Books', 'Home & Kitchen',
  'Sports', 'Toys', 'Beauty', 'Automotive', 'Garden', 'Food'
]

// Helper to pick a random item from an array
const randomItem = (arr) => arr[Math.floor(Math.random() * arr.length)]

// BATCH SIZE explanation:
// We insert 1000 rows per INSERT statement instead of one row at a time.
// A single INSERT with 1000 rows = 1 network round trip to the DB.
// 200,000 individual INSERTs = 200,000 network round trips.
// Even at 1ms per round trip that's 200 seconds vs ~2 seconds with batching.
const BATCH_SIZE = 1000
const TOTAL_PRODUCTS = 200000

// generateBatch(size):
// Generates `size` number of product objects in memory.
// We generate in memory first, then insert, rather than generating 
// and inserting one by one, so we can construct a single SQL statement 
// per batch with all values already ready.
// 
// created_at is randomized across the last 2 years so products have 
// varied timestamps — this makes pagination realistic. If all products 
// had the same created_at our cursor would be meaningless.
// 
// updated_at is set to same as created_at or slightly after — realistic 
// for a real product catalog.
function generateBatch(size) {
  return Array.from({ length: size }, () => {
    const createdAt = faker.date.past({ years: 2 })
    const updatedAt = faker.date.between({ from: createdAt, to: new Date() })
    return {
      name: faker.commerce.productName(),
      category: randomItem(CATEGORIES),
      price: faker.commerce.price({ min: 1, max: 10000, dec: 2 }),
      created_at: createdAt,
      updated_at: updatedAt
    }
  })
}

// insertBatch(client, batch):
// Takes an array of product objects and inserts them in ONE SQL statement.
// 
// We build the VALUES clause dynamically using parameterized queries ($1, $2...) 
// NOT string interpolation. String interpolation would open us to SQL injection.
// Even in a seed script it's good habit.
// 
// The flat() at the end flattens [[name,cat,price,c,u], [name,cat,price,c,u]...] 
// into a single array [name,cat,price,c,u,name,cat,price,c,u...] which is what 
// pg expects for parameterized values.
async function insertBatch(client, batch) {
  const values = []
  const placeholders = batch.map((_, i) => {
    const base = i * 5
    values.push(_.name, _.category, _.price, _.created_at, _.updated_at)
    return `($${base+1}, $${base+2}, $${base+3}, $${base+4}, $${base+5})`
  })

  const query = `
    INSERT INTO products (name, category, price, created_at, updated_at)
    VALUES ${placeholders.join(', ')}
  `
  await client.query(query, values)
}

// main():
// We use a single client (not pool) for the seed script because:
// - This is a one-time script, not a server handling concurrent requests
// - Using one client means all inserts go through one connection in sequence
// - We wrap everything in a transaction (BEGIN/COMMIT) so if the script 
//   crashes halfway, we don't end up with 100k products instead of 200k.
//   Either all 200k insert or none do.
async function main() {
  const isLocal = !process.env.DATABASE_URL || process.env.DATABASE_URL.includes('localhost') || process.env.DATABASE_URL.includes('127.0.0.1');
  const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    ssl: isLocal ? false : { rejectUnauthorized: false }
  })
  
  const client = await pool.connect()
  
  try {
    console.log('Starting seed...')
    await client.query('BEGIN')

    // Optional: clear existing data before seeding
    // so re-running the script doesn't double the rows
    await client.query('DELETE FROM products')
    console.log('Cleared existing products')

    const batches = TOTAL_PRODUCTS / BATCH_SIZE // = 200 batches of 1000
    
    for (let i = 0; i < batches; i++) {
      const batch = generateBatch(BATCH_SIZE)
      await insertBatch(client, batch)
      
      // Log progress every 10 batches (every 10,000 rows)
      if ((i + 1) % 10 === 0) {
        console.log(`Inserted ${(i + 1) * BATCH_SIZE} / ${TOTAL_PRODUCTS} products`)
      }
    }

    await client.query('COMMIT')
    console.log('Seed complete! 200,000 products inserted.')
  } catch (err) {
    // If anything fails, roll back the entire transaction
    // so the table stays clean
    await client.query('ROLLBACK')
    console.error('Seed failed, rolled back:', err)
  } finally {
    client.release()
    await pool.end()
  }
}

main()
