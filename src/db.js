const { Pool } = require('pg');
require('dotenv').config();

// We use Pool instead of Client because a Pool keeps multiple DB connections open 
// and reuses them across requests. This is much faster than opening a new connection 
// every time, handles concurrent requests efficiently, and provides automatic reconnection.
const isLocal = !process.env.DATABASE_URL || process.env.DATABASE_URL.includes('localhost') || process.env.DATABASE_URL.includes('127.0.0.1');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false } // Required by Supabase, disabled for local
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};
