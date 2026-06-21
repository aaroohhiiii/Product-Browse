-- Drop table if exists so this script is safe to re-run during development
DROP TABLE IF EXISTS products;

-- Create products table
-- id: BIGSERIAL gives us auto-incrementing integers. We use BIGINT not INT 
--     because with 200k+ rows and potential growth, INT (max ~2.1 billion) 
--     is fine but BIGINT is the safe habit.
-- name: product name, plain text
-- category: we store as plain VARCHAR not a foreign key to a categories table
--           to keep this simple. In production you'd normalize this.
-- price: NUMERIC(10,2) means up to 10 digits total, 2 after decimal. 
--        Never use FLOAT for money — floating point math causes rounding errors.
-- created_at / updated_at: stored as TIMESTAMPTZ (with timezone) not TIMESTAMP.
--        TIMESTAMPTZ stores in UTC internally and converts on read. 
--        Always use TIMESTAMPTZ in production to avoid timezone bugs.

CREATE TABLE products (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  price NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- INDEX 1: Compound index on (created_at DESC, id DESC)
-- This is the core pagination index. When we do cursor pagination with:
--   WHERE (created_at, id) < (cursor_time, cursor_id) ORDER BY created_at DESC, id DESC
-- Postgres uses this index to jump directly to the right row without scanning 
-- the whole table. Without this index, every page request would be a full table scan.
CREATE INDEX idx_products_created_at_id ON products (created_at DESC, id DESC);

-- INDEX 2: Compound index on (category, created_at DESC, id DESC)
-- When the user filters by category AND paginates, Postgres needs to find rows 
-- matching the category first, then apply the cursor. This index lets it do both 
-- in one index scan. Without this, Postgres would use the category filter OR the 
-- cursor index but not both efficiently.
CREATE INDEX idx_products_category_created_at_id ON products (category, created_at DESC, id DESC);
