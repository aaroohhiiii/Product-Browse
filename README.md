# ProductBrowse

A backend API for browsing 200,000 products with stable cursor-based pagination, dynamic sorting, prefix-aware full-text search, and category filtering. Built as a take-home assignment for CodeVector.

**Live URL:** https://product-browse.onrender.com

---

## The Core Problem

Standard offset pagination (`LIMIT 20 OFFSET 40000`) has two problems at scale:

1. **It gets slower the deeper you go.** Postgres scans and discards 40,000 rows before returning 20. On 200k rows this is measurably slow by page 500.

2. **It breaks when data changes.** If 50 new products are inserted while you're on page 3, everything shifts. You see duplicates or skip rows entirely.

This API uses cursor-based pagination to solve both. Each response returns a cursor pointing to the last item you saw. The next request picks up exactly from that position using an index scan, not a row count. New inserts never affect results you're already browsing.

---

## Tech Stack

- **Runtime:** Node.js + Express
- **Database:** PostgreSQL (hosted on Supabase)
- **Validation:** Zod
- **Protection:** Express-Rate-Limit
- **Testing:** Jest + Supertest
- **Deployed on:** Render

---

## Project Structure
/
├── src/
│   ├── index.js          # Express app entry point & rate limit setup
│   ├── db.js             # PostgreSQL connection pool
│   ├── routes/
│   │   └── products.js   # Pagination, filter, validation & search logic
│   └── utils/
│       └── cursor.js     # Dynamic Cursor encode/decode helpers
├── public/
│   └── index.html        # Frontend UI (vanilla JS + search/sort/categories integration)
├── tests/
│   └── products.test.js  # Jest + Supertest integration tests
├── schema.sql            # Table definition + core indexes
├── migration.js          # One-time migration script (sets up FTS column and indexes)
├── seed.js               # Generates and inserts 200k products
└── .env.example          # Environment variable template

---

## Running Locally

**1. Clone and install**
```bash
git clone https://github.com/aaroohhiiii/Product-Browse
cd Product-Browse
npm install
```

**2. Set up environment variables**
```bash
cp .env.example .env
```
Fill in your Supabase session pooler connection string:
`DATABASE_URL=postgresql://postgres.xxxx:password@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`

`PORT=3000`

**3. Run the schema**

Go to Supabase SQL editor, paste the contents of `schema.sql` and run it. This creates the products table and basic indexes.

**4. Run database migrations**
```bash
node migration.js
```
This automatically configures the PostgreSQL full-text search generated column, builds the GIN search index, and creates B-Tree indexes for price sorting.

**5. Seed the database**
```bash
npm run seed
```
Inserts 200,000 products in batches of 1,000. Takes under 60 seconds.

**6. Run the test suite**
```bash
npm run test
```
Runs the full suite of integration tests verifying pagination stability, category filtering, search keywords, price sorting, and request validation.

**7. Start the server**
```bash
npm run dev
```
Server runs at `http://localhost:3000`

---

## API Reference

### GET /api/health

Health check endpoint.

**Response**
```json
{
  "status": "ok"
}
```

### GET /api/products/categories

Fetch distinct list of categories. Cached in-memory for 10 minutes.

**Response**
```json
[
  "Automotive",
  "Beauty",
  "Books",
  "Clothing",
  "Electronics",
  "Food",
  "Garden",
  "Home & Kitchen",
  "Sports",
  "Toys"
]
```

### GET /api/products

Fetch a paginated list of products.

**Query Parameters**

| Parameter  | Type   | Required | Description |
|------------|--------|----------|-------------|
| limit      | number | No       | Products per page. Default 20, max 100. |
| cursor     | string | No       | Cursor from previous response. Omit for first page. |
| category   | string | No       | Filter by category name. |
| search     | string | No       | Search term. Supports prefix matching (e.g. `wood ch` matching `Wooden Chair`). |
| sort       | string | No       | Sort key. Choice of: `newest` (default), `price_asc` (price low-to-high), `price_desc` (price high-to-low). |

**Example Requests**

First page with price sorting:
`GET /api/products?limit=20&sort=price_asc`

With category & keyword search:
`GET /api/products?category=Electronics&search=smart`

Next page (paste cursor from previous response):
`GET /api/products?cursor=eyJzb3J0RmllbGQiOiJjcmVhdGVkX2F0Iiwic29ydFZhbHVlIjoiMjAyNC0wMy0xNVQxMDozMDowMC4wMDBaIiwiaWQiOjU0MzJ9`

---

## Key Design Decisions

**Dynamic Multi-Key Cursor pagination**

Using cursor pagination with sorting options means the pagination field changes depending on the sorting column (e.g., sorting by price uses `(price, id)` while sorting by date uses `(created_at, id)`). Our cursor encodes the active `sortField`, `sortValue`, and `id` tiebreaker. 

**Backward Compatibility**

The cursor decoder dynamically detects older pagination formats (which only contained `created_at` and `id`) and converts them on the fly. This prevents any broken user links or cached browser cursors when deploying updates.

**Request Validation**

Using Zod schemas ensures that incoming query arguments (like `limit` or `sort`) are type-checked and sanitized, blocking malformed input before hit requests reach the database layer.

**Rate Limiting**

Protected API endpoints using `express-rate-limit` capped at 100 requests per minute per IP to safeguard resources against excessive scrapers or DOS attempts.

**Prefix GIN Full-Text Search**

Utilizes PostgreSQL `tsvector` with a compiled generated column (`search_vector`) indexed via a GIN index. Search phrases are converted dynamically into prefix matching tsqueries (e.g., `term:*`) to achieve extremely fast substring results on 200,000 rows.

**Category caching**

Distinct categories are cached in memory for 10 minutes. Since product catalogs rarely add new categories in high frequencies, this completely removes database pressure on initial page loads.

**Decisions I Made Manually**

* **Frontend Cursor History Stack**: Cursor-based pagination is inherently forward-only. Instead of maintaining state on the server, I manually implemented a client-side stack (`pageHistory`) in the frontend. Cursors are pushed as the user moves forward and popped when going backward, keeping the server completely stateless.
* **Client-Side Search Debouncing**: To protect the database from query spam, I implemented a 300ms debounce wrapper on the search input, ensuring we only query the API after the user has finished typing.
* **Brutalist CSS Variables & Theme**: Swapped the UI to a crisp black-and-white theme using pure CSS variables. This allowed structural adjustments (like grid layouts) without installing frameworks, keeping files lightweight.
* **Zero-Dependency Cursors**: Used Node.js native `Buffer` class to handle base64 encoding and decoding of JSON cursors rather than using external packages, reducing the dependency footprint.

---

## Note on AI Usage

I used Claude to understand the underlying logic and significance of the architectural decisions (such as cursor-based pagination and optimal compound indexes) and to construct a scaffold prompt. I then used Antigravity to execute and write the actual implementation.

For instance, Claude helped reason through critical trade-offs:
* **Cursor Stability**: Understanding why cursor-based pagination is necessary to guarantee stable browsing when new products are dynamically inserted, preventing rows from shifting.
* **Leftmost Index Sorting**: Understanding why the compound database indexes need the `category` column on the leftmost side so Postgres can execute fast index-only scans for dynamic categories.

Antigravity was then used to fully execute the code changes, including:
* **Dynamic Cursors**: Implementing the dynamic cursor encoding/decoding system with backward compatibility.
* **Protection Middleware**: Configuring the Zod validation schemas and Express rate limiters.
* **Testing**: Setting up the Jest & Supertest integration suite to mathematically verify pagination consistency.

All comments in the code and design decisions reflect what I actually understand and verified.